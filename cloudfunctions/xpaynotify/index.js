// ============================================================
// 云函数: xpaynotify
// 接收微信虚拟支付「发货推送」xpay_goods_deliver_notify
//
// 公网地址：https://<env>.service.tcloudbase.com/xpaynotify
//   由 `tcb fn deploy xpaynotify --path /xpaynotify` 生成，
//   再填到 MP 后台 → 开发管理 → 消息推送（编码方式选明文模式）
//
// 设计要点：推送只是「通知」，不是发货依据。
//   谁拿到 outTradeNo 都能伪造一条推送，所以这里不直接写库，
//   而是回调 pay 云函数据 /xpay/query_order 向平台核实，
//   平台确认已支付才入账。伪造推送最多换来一次查单，拿不到会员。
//
// 平台要求：处理结果必须回
//   <xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>
// 返回非 0 平台会重试（最多 15 次），因此入账必须幂等。
// ============================================================

const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 可选：与 MP 后台「消息推送 → Token」一致时开启签名校验（更严格）
const TOKEN = process.env.XPAY_TOKEN || ''

const REPLY_OK = '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>'
const replyFail = (msg) =>
  `<xml><ErrCode>-1</ErrCode><ErrMsg><![CDATA[${String(msg || 'fail').slice(0, 200)}]]></ErrMsg></xml>`

/** 微信签名：sha1(sort([token, timestamp, nonce]).join('')) */
function signOk(q) {
  if (!TOKEN) return true            // 未配置 Token 时跳过（明文模式下仍可用，但建议配上）
  if (!q || !q.signature) return false
  const arr = [TOKEN, q.timestamp || '', q.nonce || ''].sort()
  const s = crypto.createHash('sha1').update(arr.join(''), 'utf8').digest('hex')
  return s === q.signature
}

/** 从 XML 里取标签文本，兼容 CDATA */
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))
  return m ? m[1].trim() : ''
}

async function handlePush(xml) {
  const event = tag(xml, 'Event')
  if (event !== 'xpay_goods_deliver_notify') {
    // 其他事件类型直接放行，避免平台反复重试
    return REPLY_OK
  }

  const openid = tag(xml, 'OpenId')
  const outTradeNo = tag(xml, 'OutTradeNo')
  const productId = tag(xml, 'ProductId')

  if (!openid || !outTradeNo) return replyFail('missing openid or outTradeNo')

  // 交给 pay 反查平台订单状态，确认已支付才发货
  const r = await cloud.callFunction({
    name: 'pay',
    data: { action: 'verify', openid, outTradeNo, productId }
  })
  const res = (r && r.result) || {}

  if (!res.ok) return replyFail(res.code || res.message || 'verify failed')
  if (!res.paid) return replyFail('not paid yet')   // 让平台重试，状态可能还没同步
  return REPLY_OK
}

exports.main = async (event) => {
  const q = (event && event.queryStringParameters) || {}

  // MP 后台「消息推送」保存 URL 时会先发一次 GET 校验：
  //   ?signature=..&timestamp=..&nonce=..&echostr=..
  // 必须原样回显 echostr（纯文本），否则后台保存不了这个地址。
  if (event && event.httpMethod === 'GET' && q.echostr) {
    if (!signOk(q)) {
      return { statusCode: 401, headers: { 'Content-Type': 'text/plain' }, body: 'invalid signature' }
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: String(q.echostr)
    }
  }

  // 推送请求：开了 Token 就校验签名，挡住伪造推送
  if (event && event.httpMethod === 'POST' && !signOk(q)) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'invalid signature' }
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
