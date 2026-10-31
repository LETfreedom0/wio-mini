// ============================================================
// 云函数: paysweep（定时查单兜底）
//
// 为什么需要它：
//   前端 success 回调会丢（用户付款后直接杀掉微信）、发货推送也可能丢，
//   少了这一层，用户就是「钱付了、会员没到」，只能人工补。
//
// 做法：
//   定时扫 payment_orders 里停留超过 1 分钟的 pending 订单，
//   逐个回调 pay 的 verify 动作，由 pay 去 /xpay/query_order 向平台核实，
//   确认已支付就发货。全程幂等，重复扫描不会重复发货。
//
// 触发：config.json 里配 timer，每 5 分钟一次
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const PENDING_GRACE_MS = 60 * 1000        // 刚下单的先不扫，给前端确认留时间
const EXPIRE_AFTER_MS = 24 * 3600 * 1000  // 超过 24 小时仍未支付，标记 expired
const BATCH = 20

exports.main = async () => {
  const now = Date.now()
  const out = { scanned: 0, delivered: 0, stillPending: 0, expired: 0, failed: 0 }

  let orders = []
  try {
    const r = await db.collection('payment_orders')
      .where({ status: 'pending', created_at: _.lt(now - PENDING_GRACE_MS) })
      .orderBy('created_at', 'asc')
      .limit(BATCH)
      .get()
    orders = r.data || []
  } catch (e) {
    // 集合不存在等情况直接返回，不制造无意义的失败告警
    return { ok: true, skipped: String(e && e.message ? e.message : e) }
  }

  for (const order of orders) {
    out.scanned++
    let res = null
    try {
      const r = await cloud.callFunction({
        name: 'pay',
        data: {
          action: 'verify',
          openid: order.openid,
          outTradeNo: order.out_trade_no,
          productId: order.product_id
        }
      })
      res = (r && r.result) || null
    } catch (e) {
      out.failed++
      continue
    }

    if (res && res.ok && res.paid) {
      out.delivered++
      continue
    }

    // 平台明确说没付，且已经过了 24 小时：标记过期，避免脏数据一直堆积
    if (res && res.ok && !res.paid && now - order.created_at > EXPIRE_AFTER_MS) {
      try {
        await db.collection('payment_orders').doc(order._id).update({
          data: { status: 'expired', expired_at: now }
        })
        out.expired++
      } catch (e) {
        out.failed++
      }
      continue
    }

    out.stillPending++
  }

  return Object.assign({ ok: true }, out)
}
