// ============================================================
// 云开发调用封装
// - 仅微信小程序端可用；H5 端优雅降级（云端功能整体不可用）
// - callCloud(name, data)：调用云函数并取回 result
// ============================================================

import { CLOUD } from './cloudConfig.js'

let inited = false

/** 云开发是否可用（仅微信小程序端） */
export function isCloudAvailable() {
  // #ifdef MP-WEIXIN
  return typeof wx !== 'undefined' && !!wx.cloud
  // #endif
  // #ifndef MP-WEIXIN
  return false
  // #endif
}

/** 初始化云开发（App.onLaunch 调用一次） */
export function initCloud() {
  // #ifdef MP-WEIXIN
  try {
    if (typeof wx !== 'undefined' && wx.cloud && !inited) {
      const env = CLOUD.CLOUDBASE_ENV && !CLOUD.CLOUDBASE_ENV.startsWith('YOUR_')
        ? CLOUD.CLOUDBASE_ENV
        : undefined // 未填环境 ID 时用默认环境
      wx.cloud.init({ env, traceUser: true })
      inited = true
    }
  } catch (e) {
    console.error('wx.cloud.init failed', e)
  }
  // #endif
}

/**
 * 调用云函数
 * @returns {Promise<object>} 云函数返回值
 * @rejects {error:'cloud_unavailable'|{code, message}} 
 */
export function callCloud(name, data = {}) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    if (typeof wx === 'undefined' || !wx.cloud) {
      reject({ error: 'cloud_unavailable' })
      return
    }
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const r = res.result
        if (r && r.ok === false) {
          reject(r) // 云函数业务错误：{ok:false, code, message, ...payload}
        } else {
          resolve(r)
        }
      },
      fail: (err) => reject({ error: 'cloud_call_failed', detail: err })
    })
    // #endif
    // #ifndef MP-WEIXIN
    reject({ error: 'cloud_unavailable' })
    // #endif
  })
}
