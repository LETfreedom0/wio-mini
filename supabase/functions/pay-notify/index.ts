// ============================================================
// Edge Function: pay-notify
// 职责：接收微信虚拟支付回调 → 验签 → 写订单 + 订阅
// 部署：supabase functions deploy pay-notify --no-verify-jwt
//      并把函数 URL 填到微信后台「虚拟支付 → 支付回调配置」
// 密钥：VIRTUAL_PAY_APPKEY
//
// ⚠️ 验签逻辑为待验证骨架：接入时以官方文档的回调报文与
//    签名算法为准（HMAC-SHA256，字段按字典序拼接 + AppKey）
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_KEY = Deno.env.get('VIRTUAL_PAY_APPKEY')!

const PLAN_DAYS: Record<string, number> = { month: 31, year: 366 }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

/**
 * 回调验签（骨架）：微信回调报文携带 Signature 字段，
 * 按官方规则对报文字段字典序拼接后用 AppKey 计算 HMAC 比对。
 * TODO: 接入时按官方文档核对字段清单与拼接顺序
 */
async function verifyNotify(payload: Record<string, unknown>): Promise<boolean> {
  const given = payload['Signature']
  if (!given || typeof given !== 'string') return false
  const sorted = Object.keys(payload)
    .filter((k) => k !== 'Signature')
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join('&')
  const expect = await hmacHex(sorted, APP_KEY)
  return expect === given
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const payload = await req.json()

    // 1. 验签（失败直接忽略，防止伪造回调送会员）
    const ok = await verifyNotify(payload)
    if (!ok) return json({ code: 'FAIL', message: 'signature invalid' }, 401)

    const evt = payload['Event'] || payload['event'] || ''
    if (evt !== 'pay_done' && evt !== 'BeginDeduct') {
      // 只处理支付成功事件；退款/对账等事件按需扩展
      return json({ code: 'SUCCESS', message: 'ignored' })
    }

    const openid = String(payload['OpenId'] ?? '')
    const transactionId = String(payload['TransactionId'] ?? '')
    const outTradeNo = String(payload['OutTradeNo'] ?? '')
    const productId = String(payload['ProductId'] ?? '')

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    })

    // 2. 幂等：同一 TransactionId 只入账一次
    const { data: existed } = await admin
      .from('subscriptions')
      .select('id')
      .eq('wx_transaction_id', transactionId)
      .maybeSingle()
    if (existed) return json({ code: 'SUCCESS', message: 'duplicated' })

    // 3. 定位用户与订单
    const { data: user } = await admin
      .from('users')
      .select('id')
      .eq('openid', openid)
      .single()
    if (!user) return json({ code: 'FAIL', message: 'user not found' }, 404)

    const plan = productId.includes('month') ? 'month' : 'year'
    const days = PLAN_DAYS[plan] ?? 31

    // 4. 写订单流水 + 订阅（在现有订阅到期时间上顺延续费）
    const { data: lastSub } = await admin
      .from('subscriptions')
      .select('expires_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const base =
      lastSub && new Date(lastSub.expires_at) > new Date()
        ? new Date(lastSub.expires_at)
        : new Date()
    const expiresAt = new Date(base.getTime() + days * 24 * 3600 * 1000)

    await admin
      .from('payment_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), wx_transaction_id: transactionId, raw_payload: payload })
      .eq('out_trade_no', outTradeNo)

    await admin.from('subscriptions').insert({
      user_id: user.id,
      plan,
      status: 'active',
      wx_transaction_id: transactionId,
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })

    return json({ code: 'SUCCESS' })
  } catch (e) {
    return json({ code: 'FAIL', message: String(e) }, 500)
  }
})
