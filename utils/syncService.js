// ============================================================
// 数据同步引擎 · 本地优先 + 快照镜像
//
// 原则：
// 1. localStorage（wio_settings/wio_entries/wio_overtime）永远是数据源
// 2. 云端 user_data.data 只存整包快照，data_version 乐观锁防乱序覆盖
// 3. 本地修改 → markDirty() → 防抖 3s 推送；App 切后台强制 flush
// 4. 双方都改过（409 冲突）→ uni.$emit('wio:sync-conflict') 交 UI 决断
// ============================================================

import { CLOUD } from './cloudConfig.js'
import { request, isLogin } from './auth.js'

const KEY_SYNC_STATE = 'wio_sync_state' // { dataVersion, dirty, lastSyncAt }
const KEY_BACKUP = 'wio_backup'         // 覆盖本地前的备份，防误恢复

let pushTimer = null
let pushing = false

// ---------- 本地状态 ----------

function getSyncState() {
  try {
    return JSON.parse(uni.getStorageSync(KEY_SYNC_STATE) || '{}')
  } catch (e) {
    return {}
  }
}

function setSyncState(state) {
  uni.setStorageSync(KEY_SYNC_STATE, JSON.stringify(state))
}

function readKey(key) {
  try {
    const raw = uni.getStorageSync(key)
    const val = raw ? JSON.parse(raw) : null
    return val == null ? {} : val
  } catch (e) {
    return {}
  }
}

/** 打包本地数据为云端快照 */
export function buildSnapshot() {
  return {
    version: 1,
    settings: readKey('wio_settings'),
    entries: readKey('wio_entries'),
    overtime: readKey('wio_overtime'),
    meta: {
      savedAt: new Date().toISOString(),
      appVersion: '1.1.0'
    }
  }
}

// ---------- 写入钩子（由 wioService 的 saveXxx 调用） ----------

/** 本地数据有变更：标记脏 + 安排防抖推送 */
export function markDirty() {
  if (!isLogin()) return
  const s = getSyncState()
  s.dirty = true
  setSyncState(s)
  schedulePush()
}

/** 防抖推送：3 秒内的连续修改合并为一次上传 */
export function schedulePush(delay = 3000) {
  if (!isLogin()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    push().catch(() => {})
  }, delay)
}

// ---------- 推送 ----------

/**
 * 推送本地快照到云端
 * @returns {{ok:boolean, conflict?:boolean, reason?:string}}
 */
export async function push(force = false) {
  if (!isLogin() || pushing) return { ok: false, reason: 'skip' }
  const s = getSyncState()
  if (!s.dirty && !force) return { ok: true, skipped: true }

  pushing = true
  try {
    const res = await request(CLOUD.EDGE.sync, {
      method: 'POST',
      data: {
        data: buildSnapshot(),
        client_updated_at: new Date().toISOString(),
        base_version: s.dataVersion || 0,
        force
      }
    })
    applyServerState(res)
    return { ok: true }
  } catch (e) {
    if (e && e.conflict) {
      // 双方都改过：交给 UI 弹冲突窗（设计稿第 10 屏）
      uni.$emit('wio:sync-conflict', {
        cloud: e.data,
        cloudVersion: e.data_version,
        syncedTime: e.synced_time
      })
      return { ok: false, conflict: true }
    }
    return { ok: false, reason: (e && e.error) || 'network' }
  } finally {
    pushing = false
  }
}

// ---------- 拉取 ----------

/**
 * App 启动时调用：拉云端比对合并
 * - 云端没数据（首次）→ 推本地上去
 * - 本地有脏数据 → 走 push（服务端判定是否冲突）
 * - 云端更新 → 备份本地后用云端覆盖
 */
export async function pull() {
  if (!isLogin()) return { ok: false, reason: 'not_login' }
  try {
    const res = await request(CLOUD.EDGE.sync, { method: 'GET' })
    if (res.subscription) {
      // 顺带刷新订阅缓存
      const session = getAuth()
      if (session) {
        session.subscription = res.subscription
        uni.setStorageSync('wio_auth', JSON.stringify(session))
      }
    }
    if (!res.exists) {
      const s = getSyncState()
      s.dirty = true
      setSyncState(s)
      return await push()
    }
    const s = getSyncState()
    if (s.dirty) {
      return await push()
    }
    if ((res.data_version || 0) > (s.dataVersion || 0)) {
      await applyCloud(res)
      return { ok: true, action: 'restored' }
    }
    return { ok: true, action: 'up-to-date' }
  } catch (e) {
    return { ok: false, reason: (e && e.error) || 'network' }
  }
}

/** 用云端快照覆盖本地（覆盖前先备份） */
export async function applyCloud(res) {
  try {
    uni.setStorageSync(KEY_BACKUP, JSON.stringify(buildSnapshot()))
  } catch (e) { /* 备份失败不阻断 */ }

  const d = res.data || {}
  if (d.settings) uni.setStorageSync('wio_settings', JSON.stringify(d.settings))
  if (d.entries) uni.setStorageSync('wio_entries', JSON.stringify(d.entries))
  if (d.overtime) uni.setStorageSync('wio_overtime', JSON.stringify(d.overtime))

  applyServerState(res)
  uni.$emit('wio:data-restored', {})
}

// ---------- 冲突解决（对应冲突弹窗的三个按钮） ----------

/**
 * @param {'local'|'cloud'} choice
 * @param {object} conflictInfo - wio:sync-conflict 事件携带的负载
 */
export async function resolveConflict(choice, conflictInfo) {
  if (choice === 'local') {
    // 用户选本机：以云端当前版本为 base 强推（覆盖云端）
    try {
      const res = await request(CLOUD.EDGE.sync, {
        method: 'POST',
        data: {
          data: buildSnapshot(),
          client_updated_at: new Date().toISOString(),
          base_version: (conflictInfo && conflictInfo.cloudVersion) || getSyncState().dataVersion || 0,
          force: true
        }
      })
      applyServerState(res)
      return { ok: true }
    } catch (e) {
      return { ok: false }
    }
  }
  // 用户选云端：覆盖本地
  try {
    await applyCloud({
      data: conflictInfo.cloud,
      data_version: conflictInfo.cloudVersion,
      synced_time: conflictInfo.syncedTime
    })
    return { ok: true }
  } catch (e) {
    return { ok: false }
  }
}

// ---------- 生命周期 ----------

/** App.onLaunch 调用 */
export function init() {
  if (!isLogin()) return Promise.resolve({ ok: false, reason: 'not_login' })
  return pull()
}

/** App.onHide 调用：切后台前把脏数据推上去 */
export function flush() {
  const s = getSyncState()
  if (!isLogin() || !s.dirty) return Promise.resolve({ ok: true })
  if (pushTimer) clearTimeout(pushTimer)
  return push(true)
}

/** 「立即同步」按钮：有脏数据推、否则拉一次 */
export async function syncNow() {
  const s = getSyncState()
  if (s.dirty) return push(true)
  return pull()
}

export function getLastSyncTime() {
  return getSyncState().lastSyncAt || null
}

// ---------- 内部 ----------

function applyServerState(res) {
  const s = getSyncState()
  s.dataVersion = res.data_version
  s.dirty = false
  s.lastSyncAt = new Date().toISOString()
  setSyncState(s)
}
