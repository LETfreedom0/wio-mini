// ============================================================
// Edge Function: sync
// 职责：用户数据快照的推/拉 + 乐观锁冲突检测 + 订阅状态下发
// 部署：supabase functions deploy sync --no-verify-jwt
// 密钥：WIO_SESSION_SECRET（校验会话 token）
//
// GET  → { exists, data?, data_version?, synced_time?, subscription? }
// POST { data, client_updated_at, base_version, force? }
//   ├─ base_version == 服务端当前版本 → 接受，data_version+1
//   ├─ base_version 落后 且 force!=true → 409 { conflict, data, data_version }
//   └─ force=true → 强制覆盖（客户端冲突弹窗「使用本机」后调用）
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SESSION_SECRET = Deno.env.get('WIO_SESSION_SECRET')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function hmacHex(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 校验 Authorization: Bearer {userId}.{hmac} */
async function verifyToken(req: Request): Promise<string | null> {
  const authz = req.headers.get('Authorization') || ''
  const m = authz.match(/^Bearer (\S+)\.(\S+)$/)
  if (!m) return null
  const [, userId, sig] = m
  const expect = await hmacHex(userId, SESSION_SECRET)
  // 常量时间比较，防时序侧信道
  if (expect.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expect.length; i++) {
    diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i)
  }
  return diff === 0 ? userId : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const userId = await verifyToken(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const getSubscription = async () => {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('plan, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return sub ? { plan: sub.plan, expiresAt: sub.expires_at } : null
  }

  try {
    if (req.method === 'GET') {
      const { data: row } = await admin
        .from('user_data')
        .select('data, data_version, client_updated_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle()

      const subscription = await getSubscription()
      if (!row) return json({ exists: false, subscription })

      return json({
        exists: true,
        data: row.data,
        data_version: row.data_version,
        synced_time: row.client_updated_at || row.updated_at,
        subscription,
      })
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { data, client_updated_at, base_version, force } = body
      if (!data || typeof data !== 'object') {
        return json({ error: 'invalid_data' }, 400)
      }
      // 快照体量保护：>5MB 拒绝（正常永远到不了）
      if (JSON.stringify(data).length > 5 * 1024 * 1024) {
        return json({ error: 'payload_too_large' }, 413)
      }

      const { data: row } = await admin
        .from('user_data')
        .select('data, data_version')
        .eq('user_id', userId)
        .maybeSingle()
      const currentVersion = row?.data_version ?? 0

      // 乐观锁：客户端基于旧版本推送，说明两端都改过 → 冲突
      if (!force && (base_version ?? 0) !== currentVersion) {
        return json(
          {
            conflict: true,
            data: row?.data ?? null,
            data_version: currentVersion,
          },
          409,
        )
      }

      const nextVersion = currentVersion + 1
      const syncedAt = client_updated_at || new Date().toISOString()
      const { error: upErr } = await admin.from('user_data').upsert({
        user_id: userId,
        data,
        data_version: nextVersion,
        client_updated_at: syncedAt,
      })
      if (upErr) return json({ error: 'db_error', detail: upErr.message }, 500)

      return json({ data_version: nextVersion, synced_time: syncedAt })
    }

    return json({ error: 'method_not_allowed' }, 405)
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500)
  }
})
