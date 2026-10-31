// ============================================================
// 虚拟支付 · 道具直购（前端封装）
//
// 职责边界：
//   前端只负责「拉起支付」——所有签名参数由云函数 pay 生成。
//   AppKey / AppSecret 只存在云函数环境变量里，任何情况下都不进前端。
//
// 流程：wx.login 取 code → 云函数下单（换 session_key 并签名）
//       → wx.requestVirtualPayment → 轮询云函数查单确认发货 → 写本地订阅
// ============================================================

import { callCloud, isCloudAvailable } from './cloud.js'
import { updateCachedSubscription, isLogin } from './auth.js'

const MIN_SDK = '2.19.2'      // requestVirtualPayment 起始基础库
const MIN_WX_IOS = '8.0.68'   // iOS 端微信最低版本

function compareVersion(v1, v2) {
  const a = String(v1).split('.').map(Number)
  const b = String(v2).split('.').map(Number)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

function sysInfo() {
  // #ifdef MP-WEIXIN
  try {
    return wx.getSystemInfoSync()
  } catch (e) {
    return {}
  }
  // #endif
  // #ifndef MP-WEIXIN
  return {}
  // #endif
}

/**
 * 当前环境能否拉起虚拟支付
 * @returns {{ok:boolean, reason?:'not_weixin'|'no_sdk'|'ios_version'|'base_lib'}}
 */
export function paySupported() {
  // #ifdef MP-WEIXIN
  if (typeof wx === 'undefined') return { ok: false, reason: 'not_weixin' }
  if (!(wx.canIUse && wx.canIUse('requestVirtualPayment'))) {
    const sdk = sysInfo().SDKVersion || '0.0.0'
    if (compareVersion(sdk, MIN_SDK) < 0) return { ok: false, reason: 'base_lib' }
  }
  const sys = sysInfo()
  if (String(sys.platform).toLowerCase() === 'ios') {
    if (compareVersion(sys.version || '0.0.0', MIN_WX_IOS) < 0) return { ok: false, reason: 'ios_version' }
  }
  return { ok: true }
  // #endif
  // #ifndef MP-WEIXIN
  return { ok: false, reason: 'not_weixin' }
  // #endif
}

function getLoginCode() {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    wx.login({
      success: (res) => {
        if (res && res.code) resolve(res.code)
        else reject({ code: 'login_failed', message: '未能获取登录凭证' })
      },
      fail: () => reject({ code: 'login_failed', message: '未能获取登录凭证' })
    })
    // #endif
    // #ifndef MP-WEIXIN
    reject({ code: 'not_weixin', message: '仅支持微信小程序' })
    // #endif
  })
}

function requestVirtualPayment(payData) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    wx.requestVirtualPayment({
      signData: payData.signData,
      paySig: payData.paySig,
      signature: payData.signature,
      mode: payData.mode || 'short_series_goods',
      success: (res) => resolve(res),
      fail: (err) => {
        const code = err && err.errCode
        // -2 用户取消；其余按失败处理，原始错误码随 signData 一起带出去便于排查
        reject({
          code: code === -2 ? 'cancelled' : 'pay_failed',
          errCode: code,
          message: (err && err.errMsg) || '',
          signData: payData.signData
        })
      }
    })
    // #endif
    // #ifndef MP-WEIXIN
    reject({ code: 'not_weixin', message: '仅支持微信小程序' })
    // #endif
  })
}

/** 支付成功后服务端发货是异步的（发货推送），这里轮询查单确认入账 */
async function waitForDeliver(outTradeNo, times = 6) {
  for (let i = 0; i < times; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200))
    try {
      const r = await callCloud('pay', { action: 'query', outTradeNo })
      if (r && r.ok && r.paid) return r
    } catch (e) {
      // 查单失败不阻断，继续重试
    }
  }
  return null
}

/**
 * 购买会员
 * @param {'month'|'year'} plan
 * @returns {Promise<{plan:string, expiresAt:number, pending?:boolean}>}
 * @throws {{code:string, message?:string}} code: not_login|cloud_unavailable|not_weixin|base_lib|ios_version|cancelled|pay_failed|not_configured|...
 */
export async function purchase(plan = 'year') {
  if (!isCloudAvailable()) throw { code: 'cloud_unavailable', message: '云端能力不可用' }
  if (!isLogin()) throw { code: 'not_login', message: '请先登录' }

  const sup = paySupported()
  if (!sup.ok) throw { code: sup.reason, message: '当前环境不支持虚拟支付' }

  const code = await getLoginCode()

  // 云函数下单（签名全部在服务端完成）
  const order = await callCloud('pay', { action: 'create', plan, code })
  // 云函数的所有失败都带 code，原样透传，否则 not_configured 会被吞成“下单失败”
  if (order && order.ok === false && order.code) {
    throw { code: order.code, message: order.message || order.code }
  }
  if (!order || !order.signData) throw { code: 'create_failed', message: '下单失败' }

  await requestVirtualPayment(order)

  // 支付已成功，等服务器确认发货；推送慢时给前端一个 pending 态
  const delivered = await waitForDeliver(order.outTradeNo)
  if (delivered && delivered.expiresAt) {
    updateCachedSubscription({ plan: delivered.plan || plan, expiresAt: delivered.expiresAt })
    return { plan: delivered.plan || plan, expiresAt: delivered.expiresAt }
  }

  // 钱已付、货未确认：不让用户重复付费，交给后台查单兜底
  return { plan, expiresAt: 0, pending: true, outTradeNo: order.outTradeNo }
}
