// ============================================================
// 云函数: pay
// 虚拟支付相关（骨架，开通虚拟支付后按官方文档补齐签名细节）
//
// action=create  生成拉起参数（signData / paySig）
// action=verify  客户端支付后回报，服务端调「查询订单」API 核实
//                再写订单 + 订阅——不信任客户端单方面声明
//
// 官方文档：
// https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/person.html
// ============================================================

const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const OFFER_ID = process.env.VIRTUAL_PAY_OFFER_ID || ''
const APP_KEY = process.env.VIRTUAL_PAY_APPKEY || ''
const ITEM = {
  month: process.env.VIRTUAL_PAY_ITEM_MONTH || '',
  year: process.env.VIRTUAL_PAY_ITEM_YEAR || ''
}
const PRICE_FEN = { month: 600, year: 4800 }
const PLAN_DAYS = { month: 31, year: 366 }

const crypto = require('crypto')
function hmacHex(msg, secret) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex')
}

/** 服务端查单（虚拟支付 query_order API，URL 以官方文档为准） */
function queryOrder(params) {
  return new Promise((resolve) => {
    // TODO: 开通虚拟支付后按官方文档实现：
    //   1. 拼接 query 参数并用 AppKey 计算 signature
    //   2. 请求微信虚拟支付服务端接口核验订单状态
    resolve({ paid: false, todo: 'not_implemented' })
  })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, code: 'no_openid', message: '无法获取用户身份' }

  try {
    // ---------- 生成支付参数 ----------
    if (event.action === 'create') {
      const plan = event.plan
      if (!ITEM[plan]) return { ok: false, code: 'invalid_plan', message: '未知套餐' }

      const outTradeNo = `WIO${Date.now()}${Math.floor(Math.random() * 1000)}`
      await db.collection('payment_orders').add({
        data: {
          openid: OPENID,
          plan,
          amount_fen: PRICE_FEN[plan],
          status: 'pending',
          out_trade_no: outTradeNo,
          created_at: Date.now()
        }
      })

      // TODO: 按官方文档拼 signData 并用 AppKey 签名
      const signData = JSON.stringify({
        OfferId: OFFER_ID,
        BuyQuantity: 1,
        Platform: 'android',
        ProductId: ITEM[plan],
        GoodsPrice: PRICE_FEN[plan],
        OutTradeNo: outTradeNo,
        OpenId: OPENID,
        Ts: Math.floor(Date.now() / 1000)
      })
      return {
        ok: true,
        mode: 'short_series_goods', // 以官方文档为准
        signData,
        paySig: hmacHex(signData, APP_KEY),
        outTradeNo
      }
    }

    // ---------- 支付结果核验 ----------
    if (event.action === 'verify') {
      const { outTradeNo, transactionId } = event
      const order = (await db.collection('payment_orders')
        .where({ openid: OPENID, out_trade_no: outTradeNo })
        .limit(1).get()).data[0]
      if (!order) return { ok: false, code: 'order_not_found' }

      // 服务端查单核实（绝不信任客户端声明）
      const check = await queryOrder({ outTradeNo, transactionId })
      if (!check.paid) return { ok: false, code: 'not_paid', detail: check }

      // 幂等：同一订单只入账一次
      const existed = (await db.collection('subscriptions')
        .where({ wx_transaction_id: transactionId }).limit(1).get()).data[0]
      if (existed) return { ok: true, already: true }

      // 在现有订阅到期时间上顺延
      const last = (await db.collection('subscriptions')
        .where({ openid: OPENID, status: 'active' })
        .orderBy('expires_at', 'desc').limit(1).get()).data[0]
      const base = last && last.expires_at > Date.now() ? last.expires_at : Date.now()
      const expiresAt = base + (PLAN_DAYS[order.plan] || 31) * 24 * 3600 * 1000

      await db.collection('payment_orders').doc(order._id).update({
        data: { status: 'paid', wx_transaction_id: transactionId, paid_at: Date.now() }
      })
      await db.collection('subscriptions').add({
        data: {
          openid: OPENID,
          plan: order.plan,
          status: 'active',
          wx_transaction_id: transactionId,
          started_at: Date.now(),
          expires_at: expiresAt
        }
      })
      return { ok: true, plan: order.plan, expiresAt }
    }

    return { ok: false, code: 'bad_action', message: '未知 action' }
  } catch (e) {
    return { ok: false, code: 'internal', message: String(e) }
  }
}
