// ============================================================
// 登录 · 会话管理（微信云开发版）
//
// 云函数 login 通过 getWXContext() 自动获取 openid——
// 无需 AppSecret、无需 code2session、无需自定义 token
// ============================================================

import { callCloud, isCloudAvailable } from './cloud.js'

const KEY_AUTH = 'wio_auth'

// 权益可能变化的时机统一广播，页面据此重算 isPro（口径见 utils/pro.js）
// 这里用字面量而非 import pro.js，避免 auth ↔ pro 循环依赖
const PRO_CHANGED_EVENT = 'wio:pro-changed'

function notifyProChanged() {
  try {
    uni.$emit(PRO_CHANGED_EVENT)
  } catch (e) {
    // 构建期无 uni 环境，忽略
  }
}

/**
 * 登录 / 刷新会话
 * @param {object} [profile] 可选的资料更新 { nickname, avatarFileID }
 * @returns {Promise<{user, subscription}>}
 */
export async function login(profile = {}) {
  if (!isCloudAvailable()) {
    throw { error: 'cloud_unavailable', message: '云开发仅支持微信小程序端' }
  }
  const res = await callCloud('login', profile)
  uni.setStorageSync(KEY_AUTH, JSON.stringify(res))
  notifyProChanged()
  return res
}

/** 获取当前会话 { user:{openid,nickname,avatarFileID}, subscription } */
export function getAuth() {
  try {
    const raw = uni.getStorageSync(KEY_AUTH)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

/**
 * 是否已登录
 * 注意：会话含 openid 即视为登录（openid 由云函数端鉴权，本地无法伪造价值）
 */
export function isLogin() {
  const session = getAuth()
  return !!(session && session.user && session.user.openid)
}

/** 更新本地缓存的用户资料 */
export function updateCachedUser(patch) {
  const session = getAuth()
  if (!session) return
  session.user = { ...(session.user || {}), ...patch }
  uni.setStorageSync(KEY_AUTH, JSON.stringify(session))
}

/** 更新本地缓存的订阅状态 */
export function updateCachedSubscription(sub) {
  const session = getAuth()
  if (!session) return
  session.subscription = sub
  uni.setStorageSync(KEY_AUTH, JSON.stringify(session))
  notifyProChanged()
}

/**
 * 从云端重新拉取订阅状态并写回本地会话（不动登录态与资料）。
 * 用途：付款在别处完成、定时查单补发货、或本地缓存落后于服务端时校正。
 * 订阅的真身在云端数据库，本地只是镜像，所以进会员页时对齐一次。
 */
export async function refreshSubscription() {
  if (!isCloudAvailable() || !isLogin()) return null
  try {
    const res = await callCloud('login', {})
    if (!res || res.ok === false) return null
    uni.setStorageSync(KEY_AUTH, JSON.stringify(res))
    notifyProChanged()
    return res.subscription || null
  } catch (e) {
    return null
  }
}

/**
 * 退出登录（只清本地会话与兑换码试用，云端数据保留）
 * 退出后必须立刻失去 PRO 权益：订阅在会话里、试用在本地，一并清掉，
 * 再广播一次让所有页面重算 isPro，避免残留「退了还能用」
 */
export function logout() {
  uni.removeStorageSync(KEY_AUTH)
  uni.removeStorageSync('wio_sync_state')
  uni.removeStorageSync(KEY_TRIAL)
  notifyProChanged()
}

// ============================================================
// 兑换码 · 本地试用订阅（测试用）
//
// 虚拟支付尚未接入前的过渡方案：兑换码在客户端本地核销，
// 写入一份本地试用订阅。接入虚拟支付后，可把 redeemCode()
// 换成调用 pay 云函数的 action=redeem 做服务端核销，
// isPro() 的消费端逻辑不用动。
// ============================================================

const KEY_TRIAL = 'wio_pro_trial'

/** 兑换码表：code → 有效天数（本地测试用，勿用于线上） */
const REDEEM_CODES = {
  'WIO-PRO-7': 7,
  'WIO-PRO-30': 30,
  'WIO-PRO-365': 365,
}

/** 读取本地试用订阅 { plan, source, redeemedAt, expiresAt } 或 null */
export function getTrial() {
  try {
    const raw = uni.getStorageSync(KEY_TRIAL)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

/** 本地试用订阅是否有效 */
export function isTrialActive() {
  const t = getTrial()
  return !!(t && t.expiresAt && t.expiresAt > Date.now())
}

/**
 * 核销兑换码（本地）
 * @param {string} code
 * @returns {boolean} 是否核销成功
 */
export function redeemCode(code) {
  const days = REDEEM_CODES[String(code || '').trim().toUpperCase()]
  if (!days) return false
  // 未过期的试用可叠加续期
  const prev = getTrial()
  const base = prev && prev.expiresAt > Date.now() ? prev.expiresAt : Date.now()
  const trial = {
    plan: 'trial',
    source: 'redeem',
    redeemedAt: Date.now(),
    expiresAt: base + days * 24 * 60 * 60 * 1000,
  }
  uni.setStorageSync(KEY_TRIAL, JSON.stringify(trial))
  notifyProChanged()
  return true
}

/**
 * 上传头像到云存储，返回 fileID（cloud://）
 * fileID 可直接用于 <image :src>，跨设备可用
 * @param {string} tempFilePath chooseAvatar 返回的临时路径
 */
export function uploadAvatar(tempFilePath) {
  if (!isCloudAvailable()) {
    return Promise.reject({ error: 'cloud_unavailable' })
  }
  const ext = (tempFilePath.split('.').pop() || 'png').toLowerCase()
  const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: (res) => resolve(res.fileID),
      fail: (err) => reject({ error: 'upload_failed', detail: err })
    })
  })
}
