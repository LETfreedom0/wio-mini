// ============================================================
// 云函数: pay
// 微信小程序虚拟支付 · 道具直购（个人主体）
//
// action=create  下单：code 换 session_key → 生成 outTradeNo
//                → 拼 signData → 算 paySig（AppKey）/ signature（session_key）
// action=query   兜底查单：调 POST /xpay/query_order，status=2 视为已支付并补发货
// action=refund  发起退款（仅服务端/控制台）：POST /xpay/refund_order，异步，靠查单收敛
//
// 退款与权益：查单发现 status=5/8（已退款/退款完成）时，把该订单对应的
// subscription 置为 revoked —— 不收回就是「钱退了、会员照用」。
// 回收只改 status 不删记录，查询均按 status:'active' 过滤，改状态即失效。
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
const PLAN_DAYS = { month: 30, year: 366 }
const DAY_MS = 24 * 3600 * 1000

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

// cgi-bin/token 每取一次都会让上一个 token 失效，而云函数是多实例的，
// 只要别处再取一次（控制台调试、另一个函数、甚至另一台机器），本地缓存立刻变成废票，
// 表现为 query_order 报 invalid credential → 反查失败 → 付了钱也发不出货。
// stable_token 同一 appid 反复调用返回同一个 token，且可指定 force_refresh，是官方推荐做法。
const TOKEN_INVALID_CODES = [40001, 40014, 42001]

let memToken = { token: '', exp: 0 }

async function fetchAccessToken(forceRefresh) {
  const body = JSON.stringify({
    grant_type: 'client_credential',
    appid: APPID,
    secret: APP_SECRET,
    force_refresh: !!forceRefresh
  })
  const r = await httpsRequest('POST', 'https://api.weixin.qq.com/cgi-bin/stable_token', body)
  if (!r.access_token) throw new Error('access_token 获取失败: ' + JSON.stringify(r))
  return { token: r.access_token, exp: Date.now() + ((r.expires_in || 7200) - 300) * 1000 }
}

async function getAccessToken(forceRefresh) {
  if (!forceRefresh && memToken.token && Date.now() < memToken.exp) return memToken.token

  const col = db.collection('sys_cache')
  if (!forceRefresh) {
    try {
      const doc = await col.doc('wx_access_token').get()
      const d = doc && doc.data
      if (d && d.token && d.exp > Date.now() + 60000) {
        memToken = { token: d.token, exp: d.exp }
        return d.token
      }
    } catch (e) { /* 集合或文档不存在时忽略 */ }
  }

  const fresh = await fetchAccessToken(forceRefresh)
  memToken = fresh
  try {
    await col.doc('wx_access_token').set({ data: fresh })
  } catch (e) {
    try {
      await col.add({ data: { _id: 'wx_access_token', token: fresh.token, exp: fresh.exp } })
    } catch (e2) { /* 并发写入冲突可忽略 */ }
  }
  return fresh.token
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
      // 集合上残留了 wx_transaction_id 的唯一索引（历史遗留），空值只允许一条，
      // 不写就会导致「第二次购买必然写库失败」。写入平台单号满足唯一性。
      wx_transaction_id: key,
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

  const doQuery = async (forceRefresh) => {
    const token = await getAccessToken(forceRefresh)
    return httpsRequest(
      'POST',
      `https://api.weixin.qq.com/xpay/query_order?access_token=${token}&pay_sig=${paySig}`,
      bodyStr
    )
  }

  let r = await doQuery(false)
  // token 被别处刷新会返回 40001/40014/42001，清缓存强制刷新后重试一次即可恢复
  if (r && TOKEN_INVALID_CODES.indexOf(Number(r.errcode)) >= 0) {
    r = await doQuery(true)
  }

  if (r.errcode) {
    // 268490002「数据不存在」= 平台侧根本没有这笔单（例如下单就被 -15013 拦掉了），
    // 属于确定未支付，交给定时查单按过期清理，不要当成临时故障一直挂着
    if (Number(r.errcode) === 268490002) {
      return { ok: true, paid: false, status: -1, notFound: true }
    }
    return { ok: false, code: 'query_failed', message: r.errmsg || String(r.errcode) }
  }

  // status: 2 已支付待发货 / 4 已发货 / 5 已退款 / 7 退款失败 / 8 用户退款完成
  const st = r.order && Number(r.order.status)
  const wxOrderId = (r.order && r.order.wx_order_id) || ''

  // 已退款：标记订单 + 立刻收回这笔订单买的权益。
  // 不收回就是「钱退给用户、会员照用」，既亏钱，遇到投诉复核也说不清。
  if (st === 5 || st === 8) {
    const rv = await revokeByOrder(openid, order, wxOrderId)
    if (order.status !== 'refunded') {
      try {
        await db.collection('payment_orders').doc(order._id).update({
          data: {
            status: 'refunded',
            wx_order_id: wxOrderId,
            refunded_at: Date.now(),
            refund_check_at: Date.now()
          }
        })
      } catch (e) { /* 标记失败不影响权益回收 */ }
    }
    return { ok: true, paid: false, status: st, refunded: true, revoked: !!rv.revoked }
  }

  if (st !== 2 && st !== 4) return { ok: true, paid: false, status: st }

  const rec = await deliver(openid, order, wxOrderId)

  // 记一次核对时间：paysweep 据此轮转扫描，避免同一批订单被反复查
  try {
    await db.collection('payment_orders').doc(order._id).update({
      data: { refund_check_at: Date.now() }
    })
  } catch (e) { /* 只是巡检记录，失败不影响发货 */ }

  return { ok: true, paid: true, already: rec.already, plan: rec.plan, expiresAt: rec.expiresAt }
}

/**
 * 收回这笔订单带来的权益（退款时调用）。
 *
 * 语义：不删除 subscriptions 记录，只把 status 由 active 改成 revoked。
 * 理由：① 所有权益查询都按 status:'active' 过滤，改状态即失效；
 *       ② 留痕，方便对账、复购时解释「为什么之前是会员」。
 * 幂等：已经 revoked 的直接返回，重复推送不会报错。
 */
async function revokeByOrder(openid, order, wxOrderId) {
  const key = wxOrderId || order.wx_order_id || order.out_trade_no
  let sub = null
  try {
    sub = (await db.collection('subscriptions')
      .where({ openid, wx_order_id: key }).limit(1).get()).data[0]
  } catch (e) {
    return { revoked: false, reason: 'query_failed' }
  }
  if (!sub) return { revoked: false, reason: 'no_subscription' }
  if (sub.status === 'revoked') return { revoked: false, reason: 'already_revoked' }

  try {
    await db.collection('subscriptions').doc(sub._id).update({
      data: {
        status: 'revoked',
        revoked_at: Date.now(),
        refund_fee: Number(order.amount_fen || 0)
      }
    })
  } catch (e) {
    return { revoked: false, reason: 'update_failed' }
  }

  // 会员是「顺延」的：后买的订阅把有效期接在前一笔之后。
  // 只把这一笔置 revoked，后面那笔仍停在原到期日，等于白送这一笔的时长。
  // 所以把这笔之后的订阅整体前移同样的天数。
  const ownedDays = PLAN_DAYS[sub.plan] ||
    Math.max(1, Math.round((sub.expires_at - sub.started_at) / DAY_MS))
  try {
    await db.collection('subscriptions')
      .where({ openid, status: 'active', started_at: db.command.gt(sub.started_at) })
      .update({ data: { expires_at: db.command.inc(-ownedDays * DAY_MS) } })
  } catch (e) {
    // 补偿失败不影响主流程：这笔权益已经收回，只是后续顺延段可能多留几天
  }

  return { revoked: true, expiresAt: sub.expires_at, ownedDays }
}

/**
 * 发起退款（微信渠道）。
 *
 * 注意三点：
 *   1. 异步接口——这里只「启动任务」，最终是否退成功要靠 query_order 收敛；
 *   2. iOS 订单不允许开发者主动退，用户须自行去 App Store 申请，Apple 会走
 *      xpay_subscribe_ios_refund_query_notify 问询；调本接口会由平台报错返回；
 *   3. 只能在服务端/控制台调用（小程序端调用必带 OPENID，会被拒）。
 */
async function startRefund(order, refundFee, reason) {
  const refundOrderId = 'RF' + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase()
  const bodyStr = JSON.stringify({
    openid: order.openid,
    env: 0,
    order_id: order.out_trade_no,
    refund_order_id: refundOrderId,
    left_fee: Number(order.amount_fen || 0),
    refund_fee: refundFee,
    refund_reason: reason,
    req_from: 1
  })
  const paySig = hmacHex('/xpay/refund_order&' + bodyStr, APP_KEY)

  const doCall = async (forceRefresh) => {
    const token = await getAccessToken(forceRefresh)
    return httpsRequest(
      'POST',
      `https://api.weixin.qq.com/xpay/refund_order?access_token=${token}&pay_sig=${paySig}`,
      bodyStr
    )
  }

  let r = await doCall(false)
  if (r && TOKEN_INVALID_CODES.indexOf(Number(r.errcode)) >= 0) r = await doCall(true)

  const ok = !!(r && !r.errcode)
  try {
    await db.collection('payment_orders').doc(order._id).update({
      data: {
        refund_order_id: refundOrderId,
        refund_fee: refundFee,
        refund_status: ok ? 'pending' : 'failed',
        refund_started_at: Date.now()
      }
    })
  } catch (e) { /* 记录失败不影响已提交的退款任务 */ }

  return {
    ok,
    refundOrderId,
    errcode: (r && Number(r.errcode)) || 0,
    errmsg: (r && r.errmsg) || ''
  }
}

// ---------------- 主流程 ----------------

exports.main = async (event) => {
  // 部署自检：只回报配置是否齐全、凭证能否换取，绝不返回密钥本身。
  // 传 { action:'diag', code:'<wx.login 的 code>' } 可顺带验证 session_key。
  if (event && event.action === 'diag') {
    // 只允许服务端 / 云开发控制台调试：小程序端调用时 getWXContext 一定带 OPENID。
    // diag 会回报道具 ID、并触发 stable_token 拉取，不能被任意用户当免费探针刷。
    if (cloud.getWXContext().OPENID) {
      return { ok: false, code: 'forbidden', message: 'diag 仅限服务端调用' }
    }
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
    const wxOrderId = event.wxOrderId
    if (!openid || (!outTradeNo && !wxOrderId)) {
      return { ok: false, code: 'bad_request', message: '缺少 openid 与订单号' }
    }

    try {
      await ensureCollections()
      // 退款推送只带平台单号（WxOrderId），不带商户单号时按平台单号回查
      let order = null
      if (outTradeNo) {
        order = (await db.collection('payment_orders')
          .where({ openid, out_trade_no: outTradeNo }).limit(1).get()).data[0]
      }
      if (!order && wxOrderId) {
        order = (await db.collection('payment_orders')
          .where({ openid, wx_order_id: wxOrderId }).limit(1).get()).data[0]
      }
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

  // ---------- 退款问询取数（只读，供 xpaynotify 应答 iOS 问询） ----------
  // Apple 只给 3 秒应答窗口，所以这里不做任何写操作，只回订单的使用情况；
  // 返回值刻意不含 openid / 昵称等身份信息。
  if (event && event.action === 'refundinfo') {
    const ref = event.orderRef || ''
    if (!ref) return { ok: false, code: 'bad_request', message: '缺少订单号' }

    try {
      await ensureCollections()
      let order = (await db.collection('payment_orders')
        .where({ out_trade_no: ref }).limit(1).get()).data[0]
      if (!order) {
        order = (await db.collection('payment_orders')
          .where({ wx_order_id: ref }).limit(1).get()).data[0]
      }
      if (!order) return { ok: true, found: false }

      const sub = (await db.collection('subscriptions')
        .where({ wx_order_id: order.wx_order_id || order.out_trade_no }).limit(1).get()).data[0]
      const now = Date.now()
      // 已退款的订阅 expires_at 仍在，剩余天数要按状态判，否则退款后还报「剩余 N 天」
      const active = !!(sub && sub.status === 'active' && sub.expires_at > now)
      return {
        ok: true,
        found: true,
        plan: order.plan,
        status: order.status,
        delivered: !!sub,
        refunded: order.status === 'refunded' || !!(sub && sub.status === 'revoked'),
        remainDays: active ? Math.max(0, Math.ceil((sub.expires_at - now) / DAY_MS)) : 0,
        elapsedDays: sub ? Math.max(0, Math.floor((now - sub.started_at) / DAY_MS)) : 0,
        amountFen: Number(order.amount_fen || 0)
      }
    } catch (e) {
      return { ok: false, code: 'internal', message: String(e && e.message ? e.message : e) }
    }
  }

  // ---------- 退款（仅服务端 / 控制台，不开放用户自助） ----------
  // 小程序端调用一定带 OPENID，据此拒绝；CLI / 云函数间调用没有 OPENID。
  if (event && event.action === 'refund') {
    if (cloud.getWXContext().OPENID) {
      return { ok: false, code: 'forbidden', message: '退款仅限服务端调用' }
    }
    const outTradeNo = event.outTradeNo
    if (!outTradeNo) return { ok: false, code: 'bad_request', message: '缺少 outTradeNo' }

    try {
      await ensureCollections()
      const order = (await db.collection('payment_orders')
        .where({ out_trade_no: outTradeNo }).limit(1).get()).data[0]
      if (!order) return { ok: false, code: 'order_not_found' }
      if (order.status === 'refunded') return { ok: false, code: 'already_refunded', message: '这笔订单已经退过款' }
      // 退款是异步的：提交成功只代表任务启动，订单状态要等查单才变 refunded。
      // 不做这道拦截的话，重复点一次就会拿着新的 refund_order_id 再提交一遍。
      if (order.refund_status === 'pending') {
        return { ok: false, code: 'refund_pending', message: '退款处理中，等查单确认结果后再试' }
      }
      if (order.status !== 'paid') {
        return {
          ok: false,
          code: 'not_paid',
          message: '只有已支付的订单可以退款（当前状态 ' + order.status + '）'
        }
      }

      const amount = Number(order.amount_fen || 0)
      const refundFee = event.refundFee == null ? amount : Number(event.refundFee)
      if (!(refundFee > 0) || refundFee > amount) {
        return { ok: false, code: 'bad_fee', message: '退款金额须在 (0, ' + amount + '] 分之间' }
      }
      // 平台枚举：0 暂无 / 1 产品问题 / 2 售后问题 / 3 用户主动 / 4 价格问题 / 5 其他
      const reason = [0, 1, 2, 3, 4, 5].indexOf(Number(event.reason)) >= 0 ? Number(event.reason) : 3

      const r = await startRefund(order, refundFee, reason)
      return {
        ok: r.ok,
        refundOrderId: r.refundOrderId,
        refundFee,
        errcode: r.errcode,
        message: r.ok
          ? '已提交退款，等待平台处理（异步，几分钟内完成）'
          : (r.errmsg || '退款提交失败')
      }
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
