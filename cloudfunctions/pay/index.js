// ============================================================
// 云函数: pay
// 微信小程序虚拟支付 · 道具直购（个人主体）
//
// action=create  下单：code 换 session_key → 生成 outTradeNo
//                → 拼 signData → 算 paySig（AppKey）/ signature（session_key）
// action=query   兜底查单：调 POST /xpay/query_order，status=2 视为已支付并补发货
//
// 需配置的环境变量（云开发控制台 → 云函数 → pay → 配置 → 环境变量）：
//   VIRTUAL_PAY_APPKEY      现网 AppKey（虚拟支付 → 基本配置）
//   VIRTUAL_PAY_ITEM_MONTH  月卡道具 ProductId（虚拟支付 → 道具管理）
//   VIRTUAL_PAY_ITEM_YEAR   年卡道具 ProductId
//   WX_APP_SECRET           小程序 AppSecret（换 session_key 与 access_token）
//
// 安全：AppKey / AppSecret 只放云函数环境变量，绝不进前端代码。
//
// 参考：
// https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html
// https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html
// ============================================================

const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 微信云开发的集合必须先存在才能读写；首次调用时自动建，避免控制台漏建导致下单直接失败。
// 用实例级 Set 缓存，冷启动只付一次开销。
const ensured = new Set()
async function ensureCollections() {
  const need = ['payment_orders', 'subscriptions', 'sys_cache']
  for (const name of need) {
    if (ensured.has(name)) continue
    try {
      await db.createCollection(name)
    } catch (e) {
      // -501001 / 已存在 都会抛错，忽略即可
    }
    ensured.add(name)
  }
}

// AppID / OfferID 不是密钥，可明文写死
const APPID = 'wx9e594322f0cef94f'
const OFFER_ID = '1450683826'

const APP_KEY = process.env.VIRTUAL_PAY_APPKEY || ''
const APP_SECRET = process.env.WX_APP_SECRET || ''
const ITEM = {
  month: process.env.VIRTUAL_PAY_ITEM_MONTH || '',
  year: process.env.VIRTUAL_PAY_ITEM_YEAR || ''
}

// 金额单位一律「分」，与后台道具价格必须完全一致，否则报 -15013
const PRICE_FEN = { month: 600, year: 4800 }
const PLAN_DAYS = { month: 31, year: 366 }

// ---------------- 基础工具 ----------------

function hmacHex(msg, key) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex')
}

/**
 * 极简 HTTPS 请求。body 传字符串时原样发送——
 * 签名用的必须是同一个字符串，序列化两次不同就会报 -15006 paySig 错误。
 */
function httpsRequest(method, urlStr, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {}
    }
    if (bodyStr != null) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }
    const req = https.request(opts, (res) => {
      let buf = ''
      res.on('data', (d) => { buf += d })
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf))
        } catch (e) {
          resolve({ raw: buf })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr != null) req.write(bodyStr)
    req.end()
  })
}

// ---------------- access_token（带缓存，避免高频刷新被限） ----------------

let memToken = { token: '', exp: 0 }

async function getAccessToken() {
  if (memToken.token && Date.now() < memToken.exp) return memToken.token

  const col = db.collection('sys_cache')
  try {
    const doc = await col.doc('wx_access_token').get()
    const d = doc && doc.data
    if (d && d.token && d.exp > Date.now() + 60000) {
      memToken = { token: d.token, exp: d.exp }
      return d.token
    }
  } catch (e) { /* 集合或文档不存在时忽略 */ }

  const r = await httpsRequest(
    'GET',
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APP_SECRET}`
  )
  if (!r.access_token) throw new Error('access_token 获取失败: ' + JSON.stringify(r))

  const exp = Date.now() + (r.expires_in - 300) * 1000
  memToken = { token: r.access_token, exp }
  try {
    await col.doc('wx_access_token').set({ data: { token: r.access_token, exp } })
  } catch (e) {
    try {
      await col.add({ data: { _id: 'wx_access_token', token: r.access_token, exp } })
    } catch (e2) { /* 并发写入冲突可忽略 */ }
  }
  return r.access_token
}

/** 用 wx.login 的 code 换 session_key（用户态签名唯一来源） */
async function code2SessionKey(code) {
  if (!code) throw new Error('缺少 login code')
  const r = await httpsRequest(
    'GET',
    `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${APP_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  )
  if (!r.session_key) throw new Error('session_key 获取失败: ' + JSON.stringify(r))
  return r.session_key
}

// ---------------- 发货（幂等） ----------------

/**
 * 给用户入账。以平台单号 wxOrderId 做幂等，重复通知只发一次货。
 * 会员时长在现有有效期上顺延，不会覆盖。
 */
async function deliver(openid, order, wxOrderId) {
  const key = wxOrderId || order.out_trade_no

  const existed = (await db.collection('subscriptions')
    .where({ wx_order_id: key }).limit(1).get()).data[0]
  if (existed) return { already: true, plan: existed.plan, expiresAt: existed.expires_at }

  const last = (await db.collection('subscriptions')
    .where({ openid, status: 'active', expires_at: db.command.gt(Date.now()) })
    .orderBy('expires_at', 'desc').limit(1).get()).data[0]
  const base = last ? last.expires_at : Date.now()
  const expiresAt = base + (PLAN_DAYS[order.plan] || 31) * 24 * 3600 * 1000

  await db.collection('subscriptions').add({
    data: {
      openid,
      plan: order.plan,
      status: 'active',
      wx_order_id: key,
      out_trade_no: order.out_trade_no,
      started_at: Date.now(),
      expires_at: expiresAt
    }
  })
  await db.collection('payment_orders').doc(order._id).update({
    data: { status: 'paid', wx_order_id: key, paid_at: Date.now() }
  })
  return { already: false, plan: order.plan, expiresAt }
}

/**
 * 向平台反查订单状态，确认已支付才发货。
 * 唯一的发货依据：前端回调、推送通知都不可信，只有平台说付了才算。
 */
async function queryOrderAndDeliver(openid, order) {
  const bodyStr = JSON.stringify({ openid, env: 0, order_id: order.out_trade_no })
  const paySig = hmacHex('/xpay/query_order&' + bodyStr, APP_KEY)
  const token = await getAccessToken()
  const r = await httpsRequest(
    'POST',
    `https://api.weixin.qq.com/xpay/query_order?access_token=${token}&pay_sig=${paySig}`,
    bodyStr
  )

  if (r.errcode) return { ok: false, code: 'query_failed', message: r.errmsg || String(r.errcode) }

  // status: 2 已支付待发货 / 4 已发货 / 5 已退款 / 7 退款失败 / 8 用户退款完成
  const st = r.order && Number(r.order.status)
  if (st !== 2 && st !== 4) return { ok: true, paid: false, status: st }

  const wxOrderId = (r.order && r.order.wx_order_id) || ''
  const rec = await deliver(openid, order, wxOrderId)
  return { ok: true, paid: true, already: rec.already, plan: rec.plan, expiresAt: rec.expiresAt }
}

// ---------------- 主流程 ----------------

exports.main = async (event) => {
  // 部署自检：只回报配置是否齐全、凭证能否换取，绝不返回密钥本身。
  // 传 { action:'diag', code:'<wx.login 的 code>' } 可顺带验证 session_key。
  if (event && event.action === 'diag') {
    const r = {
      appKey: !!APP_KEY,
      appSecret: !!APP_SECRET,
      itemMonth: ITEM.month,
      itemYear: ITEM.year,
      accessToken: 'skip',
      sessionKey: 'skip'
    }
    try { await ensureCollections() } catch (e) { /* 忽略 */ }
    if (APP_SECRET) {
      try {
        r.accessToken = (await getAccessToken()) ? 'ok' : 'empty'
      } catch (e) {
        r.accessToken = 'fail: ' + (e && e.message ? e.message : e)
      }
    }
    if (event.code) {
      try {
        r.sessionKey = (await code2SessionKey(event.code)) ? 'ok' : 'empty'
      } catch (e) {
        r.sessionKey = 'fail: ' + (e && e.message ? e.message : e)
      }
    }
    return r
  }

  const missing = []
  if (!APP_KEY) missing.push('VIRTUAL_PAY_APPKEY')
  if (!APP_SECRET) missing.push('WX_APP_SECRET')
  if (!ITEM.month) missing.push('VIRTUAL_PAY_ITEM_MONTH')
  if (!ITEM.year) missing.push('VIRTUAL_PAY_ITEM_YEAR')
  if (missing.length) {
    return { ok: false, code: 'not_configured', message: '云函数环境变量缺失: ' + missing.join(', ') }
  }

  // ---------- 反查（服务端之间调用，不依赖调用者身份） ----------
  // 发货推送只是「通知」，不能作为发货依据：谁拿到 outTradeNo 都能伪造一条推送。
  // 所以一律拿 openid + outTradeNo 去 /xpay/query_order 问平台，确认真的付了才入账。
  if (event && event.action === 'verify') {
    const openid = event.openid
    const outTradeNo = event.outTradeNo
    if (!openid || !outTradeNo) return { ok: false, code: 'bad_request', message: '缺少 openid 或 outTradeNo' }

    try {
      await ensureCollections()
      const order = (await db.collection('payment_orders')
        .where({ openid, out_trade_no: outTradeNo }).limit(1).get()).data[0]
      if (!order) return { ok: false, code: 'order_not_found' }

      // 推送里带的道具必须与下单时一致，防止低价道具冒充
      if (event.productId && order.product_id && event.productId !== order.product_id) {
        return { ok: false, code: 'product_mismatch' }
      }
      return await queryOrderAndDeliver(openid, order)
    } catch (e) {
      return { ok: false, code: 'internal', message: String(e && e.message ? e.message : e) }
    }
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, code: 'no_openid', message: '无法获取用户身份' }

  try {
    await ensureCollections()

    // ---------- 下单 ----------
    if (event.action === 'create') {
      const plan = event.plan === 'month' ? 'month' : 'year'
      const productId = ITEM[plan]
      const priceFen = PRICE_FEN[plan]
      if (!productId) return { ok: false, code: 'no_product_id', message: '道具 ID 未配置' }

      const sessionKey = await code2SessionKey(event.code)

      // 8-32 位，数字/字母/_-|*@，不能以 _ 开头
      const outTradeNo = 'WIO' + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase()

      await db.collection('payment_orders').add({
        data: {
          openid: OPENID,
          plan,
          product_id: productId,
          amount_fen: priceFen,
          status: 'pending',
          out_trade_no: outTradeNo,
          created_at: Date.now()
        }
      })

      // 键顺序固定；这份字符串同时用于 paySig 与 signature，必须与前端 signData 完全一致
      const signData = JSON.stringify({
        offerId: OFFER_ID,
        buyQuantity: 1,
        env: 0,
        currencyType: 'CNY',
        productId,
        goodsPrice: priceFen,
        outTradeNo,
        attach: plan
      })

      return {
        ok: true,
        mode: 'short_series_goods',
        signData,
        // 支付签名：AppKey 对 "requestVirtualPayment&signData" 做 HMAC-SHA256
        paySig: hmacHex('requestVirtualPayment&' + signData, APP_KEY),
        // 用户态签名：session_key 对 signData 做 HMAC-SHA256
        signature: hmacHex(signData, sessionKey),
        outTradeNo,
        plan,
        amountFen: priceFen
      }
    }

    // ---------- 查单（前端支付成功后核对 / 兜底补发货） ----------
    if (event.action === 'query') {
      const outTradeNo = event.outTradeNo
      if (!outTradeNo) return { ok: false, code: 'bad_request', message: '缺少 outTradeNo' }

      const order = (await db.collection('payment_orders')
        .where({ openid: OPENID, out_trade_no: outTradeNo }).limit(1).get()).data[0]
      if (!order) return { ok: false, code: 'order_not_found' }

      // 已经入账就直接返回，省一次网络请求
      if (order.status === 'paid') {
        const sub = (await db.collection('subscriptions')
          .where({ out_trade_no: outTradeNo }).limit(1).get()).data[0]
        return { ok: true, paid: true, plan: order.plan, expiresAt: sub ? sub.expires_at : null }
      }

      return await queryOrderAndDeliver(OPENID, order)
    }

    return { ok: false, code: 'bad_action', message: '未知 action' }
  } catch (e) {
    return { ok: false, code: 'internal', message: String(e && e.message ? e.message : e) }
  }
}
