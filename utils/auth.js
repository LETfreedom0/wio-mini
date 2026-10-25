// ============================================================
// 登录 · 会话管理（微信云开发版）
//
// 云函数 login 通过 getWXContext() 自动获取 openid——
// 无需 AppSecret、无需 code2session、无需自定义 token
// ============================================================

import { callCloud, isCloudAvailable } from './cloud.js'

const KEY_AUTH = 'wio_auth'

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
}

/** 退出登录（只清本地会话，云端数据保留） */
export function logout() {
  uni.removeStorageSync(KEY_AUTH)
  uni.removeStorageSync('wio_sync_state')
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
