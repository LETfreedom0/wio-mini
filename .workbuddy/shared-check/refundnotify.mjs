// ============================================================
// 支付推送解析 · 离线验证
//
// 加载 cloudfunctions/xpaynotify/index.js 真实源码，用假 wx-server-sdk
// 顶替 cloud.callFunction，直接喂 XML 字符串，验证：
//   1. 发货推送解析出 OpenId / OutTradeNo / ProductId
//   2. 退款推送取的是 MchOrderId（官方结构里没有 OutTradeNo）
//   3. 退款推送缺字段时回执失败、让平台重试
//   4. iOS 退款问询：已用一段时间 → 拒绝并给出天数凭据
//   5. iOS 退款问询：未发货 / 查询异常 → 放过
//   6. 未知事件直接回 OK，避免平台无限重试
// ============================================================

import { createRequire } from 'module'
import Module from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FN_PATH = path.resolve(__dirname, '../../cloudfunctions/xpaynotify/index.js')

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`) }
}

// ---------- 假 cloud.callFunction ----------
let calls = []
let payReply = {}
let payThrows = false

const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'fake-env',
  init() {},
  async callFunction({ name, data }) {
    calls.push({ name, data })
    if (payThrows) throw new Error('network down')
    return { result: payReply }
  }
}

const requireCjs = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk
  return origLoad.call(this, request, parent, isMain)
}

delete process.env.XPAY_TOKEN
const notify = requireCjs(FN_PATH)
const main = notify.main

const xmlOf = (pairs) => {
  const body = Object.keys(pairs).map(k => `<${k}><![CDATA[${pairs[k]}]]></${k}>`).join('')
  return `<xml>${body}</xml>`
}

function reset() { calls = []; payReply = {}; payThrows = false }

async function run() {
  // ---------- 1. 发货推送 ----------
  reset()
  payReply = { ok: true, paid: true }
  let r = await main(xmlOf({
    Event: 'xpay_goods_deliver_notify',
    OpenId: 'o_user',
    OutTradeNo: 'WIO1',
    ProductId: 'wio_pro_month'
  }))
  console.log('1) 发货推送')
  ok(calls.length === 1 && calls[0].name === 'pay', '回调 pay 云函数')
  ok(calls[0].data.action === 'verify', '动作为 verify（不信任推送直接发货）')
  ok(calls[0].data.openid === 'o_user' && calls[0].data.outTradeNo === 'WIO1', 'openid / outTradeNo 解析正确')
  ok(calls[0].data.productId === 'wio_pro_month', '道具 ID 一并透传用于比对')
  ok(r.indexOf('<ErrCode>0</ErrCode>') >= 0, '回执成功')

  // ---------- 2. 退款推送 ----------
  reset()
  payReply = { ok: true, refunded: true }
  r = await main(xmlOf({
    Event: 'xpay_refund_notify',
    OpenId: 'o_user',
    MchOrderId: 'WIO1',
    WxOrderId: 'WX_WIO1',
    RefundFee: '600',
    RetCode: '0'
  }))
  console.log('2) 退款推送')
  ok(calls.length === 1, '回调了 pay')
  ok(calls[0].data.outTradeNo === 'WIO1', '商户单号取自 MchOrderId（官方结构无 OutTradeNo 字段）')
  ok(calls[0].data.wxOrderId === 'WX_WIO1', '平台单号一并带上，便于按平台单号回查')
  ok(r.indexOf('<ErrCode>0</ErrCode>') >= 0, '查单成功后回执成功')

  // ---------- 3. 退款推送缺字段 ----------
  reset()
  r = await main(xmlOf({ Event: 'xpay_refund_notify', OpenId: 'o_user' }))
  console.log('3) 退款推送缺订单号')
  ok(calls.length === 0, '缺少单据号时不查单')
  ok(r.indexOf('<ErrCode>-1</ErrCode>') >= 0, '回执失败，让平台重试')

  // ---------- 4. iOS 问询：使用了 10 天 ----------
  reset()
  payReply = { ok: true, found: true, delivered: true, refunded: false, elapsedDays: 10, remainDays: 20, plan: 'month' }
  r = await main(xmlOf({
    Event: 'xpay_subscribe_ios_refund_query_notify',
    OpenId: 'o_user',
    pay_order_id: 'WIO1',
    provide_status: '1'
  }))
  console.log('4) iOS 退款问询（已使用）')
  ok(calls.length === 1 && calls[0].data.action === 'refundinfo', '走只读取数，不产生写入')
  ok(/<result_code>1<\/result_code>/.test(r), '返回拒绝退款')
  ok(r.indexOf('已使用 10 天') >= 0 && r.indexOf('剩余 20 天') >= 0, '凭据写明已用时长与剩余', r)
  ok(/<evidence>[\s\S]+<\/evidence>/.test(r), 'evidence 非空（必填字段）')

  // ---------- 5. iOS 问询：未发货 ----------
  reset()
  payReply = { ok: true, found: true, delivered: false, refunded: false, elapsedDays: 0, remainDays: 0 }
  r = await main(xmlOf({ Event: 'xpay_subscribe_ios_refund_query_notify', pay_order_id: 'WIO2' }))
  console.log('5) iOS 退款问询（未发货）')
  ok(/<result_code>0<\/result_code>/.test(r), '未发货直接放过')

  // 刚开通也放过
  reset()
  payReply = { ok: true, found: true, delivered: true, refunded: false, elapsedDays: 1, remainDays: 29 }
  r = await main(xmlOf({ Event: 'xpay_subscribe_ios_refund_query_notify', pay_order_id: 'WIO3' }))
  ok(/<result_code>0<\/result_code>/.test(r), '刚开通 1 天放过，避免为几块钱吃差评')

  // ---------- 6. iOS 问询：查询异常 ----------
  reset()
  payThrows = true
  r = await main(xmlOf({ Event: 'xpay_subscribe_ios_refund_query_notify', pay_order_id: 'WIO4' }))
  console.log('6) iOS 退款问询（查询异常）')
  ok(/<result_code>0<\/result_code>/.test(r), '异常时默认放过，不比平台默认更苛刻')

  // ---------- 7. 未知事件 ----------
  reset()
  r = await main(xmlOf({ Event: 'xpay_complaint_notify', OpenId: 'o_user' }))
  console.log('7) 未知事件')
  ok(r.indexOf('<ErrCode>0</ErrCode>') >= 0, '回 OK，避免平台反复重试')
  ok(calls.length === 0, '不触发任何业务调用')

  console.log('')
  console.log(`通过 ${pass} 条，失败 ${fail} 条`)
  if (fail > 0) process.exitCode = 1
}

run().catch(e => {
  console.error('运行异常:', e)
  process.exitCode = 1
})
