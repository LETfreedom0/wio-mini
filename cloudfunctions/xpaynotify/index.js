// ============================================================
// 云函数: xpaynotify
// 接收微信虚拟支付「发货推送」xpay_goods_deliver_notify
//
// 部署方式：云开发控制台 → 云函数 → xpaynotify → 「HTTP 访问服务」
//   给它一条公网路径（形如 https://<env>.service.tcloudbase.com/xpaynotify）
//   再把这个地址填到 MP 后台 → 开发与服务 → 开发管理 → 消息推送
//   （消息推送地址全局只有一个，配置前确认没被其他业务占用）
//
// 平台推送 XML，必须返回：
//   <xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>
// 返回非 0 平台会重试，最多 15 次 —— 因此发货必须幂等。
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 集合不存在时读写会直接报错，首次触发时自动补建（实例内只做一次）
let ensured = false
async function ensureCollections() {
  if (ensured) return
  for (const name of ['payment_orders', 'subscriptions']) {
    try {
      await db.createCollection(name)
    } catch (e) { /* 已存在 */ }
  }
  ensured = true
}

const PLAN_DAYS = { month: 31, year: 366 }

const REPLY_OK = '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>'
const replyFail = (msg) =>
  `<xml><ErrCode>-1</ErrCode><ErrMsg><![CDATA[${String(msg || 'fail').slice(0, 200)}]]></ErrMsg></xml>`

/** 从 XML 里取标签文本，兼容 CDATA */
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))
  return m ? m[1].trim() : ''
}

/**
 * 幂等发货：以平台单号 wx_order_id 去重，重复推送只入账一次。
 * 会员时长在现有有效期上顺延。
 */
async function deliver(openid, order, wxOrderId) {
  const key = wxOrderId || order.out_trade_no

  const existed = (await db.collection('subscriptions')
    .where({ wx_order_id: key }).limit(1).get()).data[0]
  if (existed) return { already: true }

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
  return { already: false, expiresAt }
}

async function handlePush(xml) {
  const event = tag(xml, 'Event')
  if (event !== 'xpay_goods_deliver_notify') {
    // 其他事件类型直接放行，避免平台重试
    return REPLY_OK
  }

  const openid = tag(xml, 'OpenId')
  const outTradeNo = tag(xml, 'OutTradeNo')
  const wxOrderId = tag(xml, 'MchOrderNo')   // WeChatPayInfo.MchOrderNo = 平台单号
  const productId = tag(xml, 'ProductId')

  if (!openid || !outTradeNo) return replyFail('missing openid or outTradeNo')

  await ensureCollections()

  const order = (await db.collection('payment_orders')
    .where({ openid, out_trade_no: outTradeNo }).limit(1).get()).data[0]
  if (!order) return replyFail('order not found')

  // 顺手校验道具 ID，防止低价道具冒充高价值套餐
  if (productId && order.product_id && productId !== order.product_id) {
    return replyFail('product mismatch')
  }

  await deliver(openid, order, wxOrderId)
  return REPLY_OK
}

exports.main = async (event) => {
  const q = (event && event.queryStringParameters) || {}

  // MP 后台「消息推送」保存 URL 时会先发一次 GET 校验：
  //   ?signature=..&timestamp=..&nonce=..&echostr=..
  // 必须原样回显 echostr（纯文本），否则后台保存不了这个地址。
  if (event && event.httpMethod === 'GET' && q.echostr) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: String(q.echostr)
    }
  }

  // HTTP 访问服务触发时 body 在 event.body；普通调用时直接是字符串
  let raw = ''
  if (event && typeof event.body === 'string') {
    raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  } else if (typeof event === 'string') {
    raw = event
  } else if (event && typeof event.xml === 'string') {
    raw = event.xml
  }

  // 微信侧有「安全模式」等格式，这里只处理明文 XML；遇到加密体直接返回成功避免无限重试
  if (!raw || raw.indexOf('<xml') < 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/xml' }, body: REPLY_OK }
  }

  let body
  try {
    body = await handlePush(raw)
  } catch (e) {
    body = replyFail(e && e.message)
  }

  // HTTP 访问服务需要显式返回结构；云函数直调则返回字符串
  if (event && typeof event.body === 'string') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/xml' }, body }
  }
  return body
}
