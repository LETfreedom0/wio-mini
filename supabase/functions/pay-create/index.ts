// ============================================================
// Edge Function: pay-create
// 职责：为已登录用户生成虚拟支付拉起参数（signData / paySig）
// 部署：supabase functions deploy pay-create --no-verify-jwt
// 密钥：WIO_SESSION_SECRET / VIRTUAL_PAY_OFFER_ID / VIRTUAL_PAY_APPKEY
//
// ⚠️ 接入前置：微信后台「虚拟支付」开通后，按官方文档
//    https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/person.html
//    核对签名算法与字段名后再启用（当前为待验证骨架）
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SESSION_SECRET = Deno.env.get('WIO_SESSION_SECRET')!
const OFFER_ID = Deno.env.get('VIRTUAL_PAY_OFFER_ID')!
const APP_KEY = Deno.env.get('VIRTUAL_PAY_APPKEY')!

const PLAN_ITEM: Record<string, string> = {
  month: Deno.env.get('VIRTUAL_PAY_ITEM_MONTH')!,
  year: Deno.env.get('VIRTUAL_PAY_ITEM_YEAR')!,
}
const PLAN_PRICE_FEN: Record<string, number> = { month: 600, year: 4800 }

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

async function verifyToken(req: Request): Promise<string | null> {
  const authz = req.headers.get('Authorization') || ''
  const m = authz.match(/^Bearer (\S+)\.(\S+)$/)
  if (!m) return null
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(m[1]))
  const expect = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expect === m[2] ? m[1] : null
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

  const userId = await verifyToken(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { plan, env = 0 } = await req.json() // env: 0现网 1沙箱
    if (!PLAN_ITEM[plan]) return json({ error: 'invalid_plan' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    })

    // 本地订单流水（pending），TransactionId 由回调补全
    const outTradeNo = `WIO${Date.now()}${Math.floor(Math.random() * 1000)}`
    await admin.from('payment_orders').insert({
      user_id: userId,
      plan,
      amount_fen: PLAN_PRICE_FEN[plan],
      status: 'pending',
      offer_id: OFFER_ID,
      out_trade_no: outTradeNo,
      wx_env: env,
    })

    // ---- 签名参数（按官方文档核对字段名与拼接顺序）----
    const signData = JSON.stringify({
      OfferId: OFFER_ID,
      BuyQuantity: 1,
      Env: env,
      Platform: 'android', // iOS 由客户端 Platform 自动区分，见文档
      ProductId: PLAN_ITEM[plan],
      GoodsPrice: PLAN_PRICE_FEN[plan],
      OutTradeNo: outTradeNo,
      OpenId: (await admin.from('users').select('openid').eq('id', userId).single()).data!.openid,
      Ts: Math.floor(Date.now() / 1000),
    })
    const paySig = await hmacHex(signData, APP_KEY)

    return json({
      mode: 'short_series_goods', // 按文档选择 mode
      signData,
      paySig,
      offerId: OFFER_ID,
      outTradeNo,
    })
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500)
  }
})
