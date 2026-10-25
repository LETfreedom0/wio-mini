// ============================================================
// 微信登录 · 会话管理
// 流程：uni.login 拿 code → 服务端 wx-login（code2session + 建用户）
//      → 返回 { token, user, subscription } → 本地存 wio_auth
// token 形如 "{userId}.{hmac签名}"，无状态，服务端可验证
// ============================================================

import { CLOUD } from './cloudConfig.js'

const KEY_AUTH = 'wio_auth'

/**
 * 通用请求封装：自动带会话 token，统一错误处理
 * 服务端返回 4xx/5xx 时 reject(res.data)，业务码可从 e.conflict 等字段判断
 */
export function request(path, { method = 'GET', data, auth = true } = {}) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    if (auth) {
      const session = getAuth()
      if (session && session.token) {
        header.Authorization = `Bearer ${session.token}`
      }
    }
    uni.request({
      url: CLOUD.SUPABASE_URL + path,
      method,
      data,
      header,
      timeout: 15000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(res.data || { error: 'http_' + res.statusCode })
        }
      },
      fail: (err) => reject({ error: 'network', detail: err })
    })
  })
}

/** 拉起微信登录（授权弹层的「授权并登录」按钮调用） */
export function login() {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: async ({ code }) => {
        try {
          const res = await request(CLOUD.EDGE.login, {
            method: 'POST',
            data: { code },
            auth: false
          })
          uni.setStorageSync(KEY_AUTH, JSON.stringify(res))
          resolve(res)
        } catch (e) {
          reject(e)
        }
      },
      fail: (err) => reject({ error: 'uni_login_failed', detail: err })
    })
  })
}

/** 获取当前会话 { token, user:{id,nickname,avatarUrl}, subscription } */
export function getAuth() {
  try {
    const raw = uni.getStorageSync(KEY_AUTH)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

export function isLogin() {
  const session = getAuth()
  return !!(session && session.token)
}

/** 更新本地缓存的用户资料（改昵称/头像后调用） */
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
