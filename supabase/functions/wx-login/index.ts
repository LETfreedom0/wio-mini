// ============================================================
// Edge Function: wx-login
// 职责：code2session 换 openid → upsert 用户 → 下发会话 token
// 部署：supabase functions deploy wx-login --no-verify-jwt
// 密钥（supabase secrets set）：
//   WX_APPID / WX_SECRET / WIO_SESSION_SECRET
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WX_APPID = Deno.env.get('WX_APPID')!
const WX_SECRET = Deno.env.get('WX_SECRET')!
const SESSION_SECRET = Deno.env.get('WIO_SESSION_SECRET')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { code, nickname, avatarBase64 } = await req.json()
    if (!code) return json({ error: 'missing_code' }, 400)

    // 1. 微信 code2session（appsecret 只存在于服务端）
    const wxRes = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`,
    ).then((r) => r.json())

    if (!wxRes.openid) {
      return json({ error: 'wx_login_failed', detail: wxRes }, 401)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    })

    // 2. 建/查用户
    const { data: user, error: dbErr } = await admin
      .from('users')
      .upsert({ openid: wxRes.openid }, { onConflict: 'openid' })
      .select()
      .single()
    if (dbErr) return json({ error: 'db_error', detail: dbErr.message }, 500)

    // 3. 可选：首次登录顺带保存用户提交的昵称/头像
    //    （头像为 base64 的 png，写入 Storage 公开桶后存 URL）
    let avatarUrl = user.avatar_url
    if (avatarBase64) {
      const bytes = Uint8Array.from(atob(avatarBase64), (c) => c.charCodeAt(0))
      const path = `${user.id}/avatar.png`
      const { error: upErr } = await admin.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/png', upsert: true })
      if (!upErr) {
        avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
      }
    }
    if (nickname || avatarUrl !== user.avatar_url) {
      await admin
        .from('users')
        .update({ nickname: nickname ?? user.nickname, avatar_url: avatarUrl })
        .eq('id', user.id)
    }

    // 4. 查有效订阅
    const { data: sub } = await admin
      .from('subscriptions')
      .select('plan, expires_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 5. 下发无状态 token：{userId}.{hmac}
    const token = `${user.id}.${await hmacHex(user.id, SESSION_SECRET)}`

    return json({
      token,
      user: { id: user.id, nickname: nickname ?? user.nickname, avatarUrl },
      subscription: sub
        ? { plan: sub.plan, expiresAt: sub.expires_at }
        : null,
    })
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500)
  }
})
