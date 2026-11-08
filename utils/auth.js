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
 * @param {object} [opts] { claimTrial } 是否尝试领取首次登录体验——
 *        只有用户主动登录时传 true；refreshSubscription 的静默刷新不传，
 *        避免每次进会员页都多查一次表
 * @returns {Promise<{user, subscription, trial}>}
 */
export async function login(profile = {}, opts = {}) {
  if (!isCloudAvailable()) {
    throw { error: 'cloud_unavailable', message: '云开发仅支持微信小程序端' }
  }
  const payload = { ...profile }
  if (opts.claimTrial) payload.claimTrial = true
  const res = await callCloud('login', payload)
  uni.setStorageSync(KEY_AUTH, JSON.stringify(res))
  notifyProChanged()
  return res
}

/**
 * 领取首次登录体验（7 天）
 * 与登录解耦：已登录但当年没领过的人也能补领（服务端按 openid 判重）。
 * @returns {Promise<{granted:boolean, days?:number, expiresAt?:number, reason?:string}>}
 */
export async function claimTrial() {
  if (!isCloudAvailable()) throw { code: 'cloud_unavailable', message: '云开发仅支持微信小程序端' }
  if (!isLogin()) throw { code: 'need_login', message: '请先登录' }
  const res = await callCloud('login', { claimTrial: true })
  uni.setStorageSync(KEY_AUTH, JSON.stringify(res))
  notifyProChanged()
  return res.trial || { granted: false, reason: 'unknown' }
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
  purgeLegacyStorage()
  notifyProChanged()
}

// ============================================================
// 兑换码 · 服务端核销
//
// 码表在云端数据库（redeem_codes），核销与发权益都在云函数 redeem 里，
// 前端只负责把用户输入送上去。权益落在 subscriptions 表——与虚拟支付
// 同一张表、同一套顺延规则，所以会员页不需要区分「买的」还是「兑的」。
//
// 旧的本地码表（REDEEM_CODES）与本地核销（写 wio_pro_trial）已删除：
// 码写在前端等于公开，清缓存还能重复领。
// ============================================================

/**
 * 清理 2.0.0 之前遗留的本地权益键。
 *
 * 旧版前端码表核销会往 wio_pro_trial 写一份订阅，那条通道已彻底移除
 * （权益只能由服务端 subscriptions 产生）。老用户机器上可能还躺着这条
 * 数据，启动时与退出登录时顺手清掉——虽然已经没人读它，但留着容易在
 * 排查「为什么我是会员」时误导人。
 */
export function purgeLegacyStorage() {
  try {
    uni.removeStorageSync('wio_pro_trial')
  } catch (e) {
    // 存储不可用时忽略
  }
}

/**
 * 核销兑换码（服务端）
 * @param {string} code 用户输入
 * @returns {Promise<{days:number, expiresAt:number, plan:string}>}
 * @throws {{code:string, message?:string}} code: bad_code / code_used / code_expired /
 *         code_exhausted / need_login / cloud_unavailable
 */
export async function redeemCode(code) {
  if (!isCloudAvailable()) throw { code: 'cloud_unavailable', message: '云开发仅支持微信小程序端' }
  if (!isLogin()) throw { code: 'need_login', message: '请先登录' }

  const res = await callCloud('redeem', { action: 'redeem', code: String(code || '') })
  // 权益已在服务端入账，这里把本地会话里的订阅镜像对齐一次
  await refreshSubscription()
  return res
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
