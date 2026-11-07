// ============================================================
// 云同步 · 手动模式（本地优先）
//
// 设计前提（用户拍板）：同步必须是用户主动发起的动作。
// 后台偷偷同步 = 用户看不见发生了什么，出了问题无法归因，
// 所以这里不做任何自动推送、不做任何自动覆盖。
//
// 四个动作，方向和后果都只由用户点：
//   checkRemote()      只读：问云端有没有更新，不改任何本地数据
//   prepareUpload()    只读：拉云端算差异，给弹层展示「这次会发生什么」
//   uploadMerge()      上传：只把本机独有的记录补上去，云端独有的保留
//   uploadOverwrite()  上传：整份覆盖云端（明确告知会丢什么）
//   restoreFromCloud() 恢复：整份覆盖本机（覆盖前自动备份，可撤销）
//
// 差异怎么算：本机存一份「上次同步时的样子」= 基线（wio_sync_base）。
// 有了它才能区分「这条是我后来加的」和「这条是对方加的」，
// 否则只能靠存在性瞎猜。基线只在本机，不上传，不参与云函数结构。
//
// 原则：
// 1. localStorage（wio_settings/wio_entries/wio_overtime）永远是数据源
// 2. 没有任何后台定时器、没有 onLaunch/onHide 自动同步
// 3. 云函数仍是整包快照 + data_version 乐观锁，未改动
// ============================================================

import { callCloud, isCloudAvailable } from './cloud.js'
import { isLogin, updateCachedSubscription } from './auth.js'
import { APP_VERSION } from './appVersion.js'

const KEY_SYNC_STATE = 'wio_sync_state' // { dataVersion, lastSyncAt, dirty, remote* }
const KEY_BACKUP = 'wio_restore_backup' // 从云端恢复前的本机备份 { at, data }
const KEY_BASE = 'wio_sync_base'        // 上次同步成功时的样子 = 差异比对基线

// 最近一次 checkRemote 的原始响应，避免重复请求云端
let remoteCache = null

// ---------- 基础读写 ----------

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
      appVersion: APP_VERSION
    }
  }
}

/** 只取三份业务数据（不含 meta） */
function snapshotData() {
  const snap = buildSnapshot()
  return { settings: snap.settings, entries: snap.entries, overtime: snap.overtime }
}

/** 把一份内存里的数据打成云端快照（用于先推后落的合并上传） */
function snapshotOf(data) {
  const d = data || {}
  return {
    version: 1,
    settings: d.settings || {},
    entries: d.entries || {},
    overtime: d.overtime || {},
    meta: {
      savedAt: new Date().toISOString(),
      appVersion: APP_VERSION
    }
  }
}

/** 三份数据落到本地存储 */
function writeSnapshot(data) {
  const d = data || {}
  uni.setStorageSync('wio_settings', JSON.stringify(d.settings || {}))
  uni.setStorageSync('wio_entries', JSON.stringify(d.entries || {}))
  uni.setStorageSync('wio_overtime', JSON.stringify(d.overtime || {}))
}

function readBase() {
  try {
    const v = JSON.parse(uni.getStorageSync(KEY_BASE) || 'null')
    if (!v || v.__v !== 1) return null
    return v
  } catch (e) {
    return null
  }
}

function writeBase(data) {
  try {
    uni.setStorageSync(KEY_BASE, JSON.stringify({
      __v: 1,
      settings: (data && data.settings) || {},
      entries: (data && data.entries) || {},
      overtime: (data && data.overtime) || {}
    }))
  } catch (e) { /* 基线写不进去只影响差异精度，不阻断同步 */ }
}

/** 本机记录条数（打卡 + 加班） */
export function localCount() {
  return Object.keys(readKey('wio_entries')).length + Object.keys(readKey('wio_overtime')).length
}

function countOf(data) {
  if (!data) return 0
  return Object.keys(data.entries || {}).length + Object.keys(data.overtime || {}).length
}

// ---------- 变更标记 ----------
// wioService 的每个 saveXxx 都会调它。手动模式下它只负责记一笔
// 「本机相对上次同步有改动」，不再排队推送、不联网。

export function markDirty() {
  const s = getSyncState()
  if (!s.dirty) {
    s.dirty = true
    s.dirtySince = new Date().toISOString()
    setSyncState(s)
  }
}

// ---------- 差异计算 ----------

const ENTRY_STATUS = {
  company: '公司', home: '居家', vacation: '年假', birthday: '生日假',
  sick: '病假', unpaid: '无薪', comp_off: '调休', exclude_wio: '不计入'
}

/** 存储值 → 人话（半天 o 对象也要能读） */
export function entryText(v) {
  if (v === undefined || v === null || v === '') return '空'
  if (typeof v === 'string') {
    if (v.indexOf('custom:') === 0) return '自定义假'
    return ENTRY_STATUS[v] || v
  }
  if (typeof v === 'object') {
    const one = x => {
      if (!x) return '空'
      if (String(x).indexOf('custom:') === 0) return '自定义假'
      return ENTRY_STATUS[x] || x
    }
    return `${one(v.am)} / ${one(v.pm)}`
  }
  return String(v)
}

/**
 * 逐条对比 base / 本机 / 云端
 * @returns {object} 差异计划（供弹层展示 + 上传时使用）
 */
function diffPlan(base, local, cloud) {
  const plan = {
    toUpload: [],    // 本机有、云端没有 → 补上去
    toDownload: [],  // 云端有、本机从来没有 → 合并时补下来
    bothDiffer: [],  // 两边都有但值不同 → 上传方向下采用本机
    localDeleted: [],// 基线有、本机删了、云端还有 → 尊重删除
    cloudDeleted: [],// 基线有、云端删了、本机还有 → 本机为准，补回云端
    settingsDiffer: [],
    noBaseline: !base
  }

  ;['entries', 'overtime'].forEach(kind => {
    const b = (base && base[kind]) || {}
    const l = local[kind] || {}
    const c = (cloud && cloud[kind]) || {}
    const keys = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(c)])
    keys.forEach(k => {
      const hasB = Object.prototype.hasOwnProperty.call(b, k)
      const hasL = Object.prototype.hasOwnProperty.call(l, k)
      const hasC = Object.prototype.hasOwnProperty.call(c, k)
      const bv = b[k]
      const lv = l[k]
      const cv = c[k]
      if (hasL && hasC) {
        if (JSON.stringify(lv) !== JSON.stringify(cv)) {
          plan.bothDiffer.push({ kind, key: k, local: lv, cloud: cv })
        }
        return
      }
      if (hasL && !hasC) {
        if (hasB && JSON.stringify(bv) === JSON.stringify(lv)) {
          // 基线有、本机没改、云端没了 → 对方删的，本机为准推回去
          plan.cloudDeleted.push({ kind, key: k, value: lv })
        } else {
          plan.toUpload.push({ kind, key: k, value: lv })
        }
        return
      }
      if (!hasL && hasC) {
        if (hasB) {
          // 基线有、本机没了 → 本机删的，尊重删除
          plan.localDeleted.push({ kind, key: k, value: cv })
        } else {
          plan.toDownload.push({ kind, key: k, value: cv })
        }
      }
    })
  })

  // settings 只报到字段级，不逐条铺开
  const ls = local.settings || {}
  const cs = (cloud && cloud.settings) || {}
  const CONTAINER = ['halfFullDays', 'compOffRules', 'customMarks', 'touchedAt']
  const sk = new Set([...Object.keys(ls), ...Object.keys(cs)])
  sk.forEach(k => {
    if (CONTAINER.indexOf(k) >= 0 || k === 'customLeaves') {
      // 容器型字段：只要有一边多出键就算有差异
      const lv = ls[k]
      const cv = cs[k]
      if (JSON.stringify(lv) !== JSON.stringify(cv)) {
        if (k === 'customLeaves') {
          plan.settingsDiffer.push(k)
          return
        }
        const keys = Object.keys({ ...(lv || {}), ...(cv || {}) })
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]
          if (JSON.stringify((lv || {})[key]) !== JSON.stringify((cv || {})[key])) {
            plan.settingsDiffer.push(`${k}.${key}`)
            break
          }
        }
      }
      return
    }
    if (JSON.stringify(ls[k]) !== JSON.stringify(cs[k])) plan.settingsDiffer.push(k)
  })

  return plan
}

// ---------- 只读检查 ----------

/**
 * 问云端有没有更新。只写同步状态缓存，绝不动本地数据。
 * @returns {{ok:boolean, exists:boolean, localCount:number, remoteCount:number,
 *            remoteNewer:boolean, syncedTime:?string, reason?:string}}
 */
export async function checkRemote() {
  if (!isCloudAvailable() || !isLogin()) return { ok: false, reason: 'skip' }
  try {
    const res = await callCloud('sync', { action: 'pull' })
    remoteCache = res
    if (res.subscription) updateCachedSubscription(res.subscription)
    const s = getSyncState()
    const lc = localCount()
    const rc = res.exists ? countOf(res.data) : 0
    const newer = !!res.exists && (res.data_version || 0) > (s.dataVersion || 0)
    s.remoteExists = !!res.exists
    s.remoteVersion = res.data_version || 0
    s.remoteCount = rc
    s.remoteNewer = newer
    s.remoteSyncedTime = res.synced_time || null
    s.remoteCheckedAt = new Date().toISOString()
    setSyncState(s)
    return {
      ok: true,
      exists: !!res.exists,
      localCount: lc,
      remoteCount: rc,
      remoteNewer: newer,
      syncedTime: res.synced_time || null
    }
  } catch (e) {
    return { ok: false, reason: (e && e.code) || 'network' }
  }
}

/** 卡片渲染用：只读本地缓存，不发请求 */
export function getSyncSummary() {
  const s = getSyncState()
  return {
    lastSyncAt: s.lastSyncAt || null,
    localCount: localCount(),
    remoteCount: s.remoteCount || 0,
    remoteNewer: !!s.remoteNewer,
    remoteExists: !!s.remoteExists,
    remoteSyncedTime: s.remoteSyncedTime || null,
    checkedAt: s.remoteCheckedAt || null,
    dirty: !!s.dirty,
    canUndoRestore: hasRestoreBackup()
  }
}

export function getLastSyncTime() {
  return getSyncState().lastSyncAt || null
}

// ---------- 上传 ----------

/**
 * 第一步：拉云端 + 算差异，交给 UI 展示「这次会发生什么」
 * @returns {{ok:boolean, plan?:object, reason?:string}}
 */
export async function prepareUpload() {
  const r = await checkRemote()
  if (!r.ok) return r
  const res = remoteCache || {}
  const local = snapshotData()
  const cloud = res.exists ? (res.data || {}) : {}
  const plan = diffPlan(readBase(), local, cloud)
  plan.cloudVersion = res.data_version || 0
  plan.cloudExists = !!res.exists
  plan.cloudSyncedTime = res.synced_time || null
  plan.cloud = cloud
  plan.localCount = localCount()
  plan.cloudCount = countOf(cloud)
  return { ok: true, plan }
}

/**
 * 合并上传：本机为准，但云端独有的记录会一并补下来（不是删除就不该丢）。
 * 上传结束后两侧内容完全一致。
 */
export function mergeForUpload(base, local, cloud) {
  const out = { entries: {}, overtime: {} }

  ;['entries', 'overtime'].forEach(kind => {
    const b = (base && base[kind]) || {}
    const l = (local && local[kind]) || {}
    const c = (cloud && cloud[kind]) || {}
    const keys = new Set([...Object.keys(l), ...Object.keys(c)])
    keys.forEach(k => {
      const hasL = Object.prototype.hasOwnProperty.call(l, k)
      const hasC = Object.prototype.hasOwnProperty.call(c, k)
      const hasB = Object.prototype.hasOwnProperty.call(b, k)
      if (hasL) { out[kind][k] = l[k]; return }   // 本机有 → 本机赢
      if (hasB) return                             // 本机删过 → 保持删除
      if (hasC) out[kind][k] = c[k]                // 云端独有 → 补下来
    })
  })

  // settings：本机优先，容器型字段逐 key 合并
  const ls = (local && local.settings) || {}
  const cs = (cloud && cloud.settings) || {}
  const settings = { ...cs, ...ls }
  ;['halfFullDays', 'compOffRules', 'customMarks', 'touchedAt'].forEach(k => {
    settings[k] = { ...(cs[k] || {}), ...(ls[k] || {}) }
  })
  const byId = arr => {
    const m = {}
    if (Array.isArray(arr)) arr.forEach(x => { if (x && x.id) m[x.id] = x })
    return m
  }
  if (ls.customLeaves !== undefined || cs.customLeaves !== undefined) {
    const lmap = byId(ls.customLeaves)
    const cmap = byId(cs.customLeaves)
    const ids = new Set([...Object.keys(lmap), ...Object.keys(cmap)])
    settings.customLeaves = Object.keys(ids).map(id => lmap[id] || cmap[id])
  }
  out.settings = settings
  return out
}

/**
 * 补差异上传（推荐动作）
 * @param {object} plan prepareUpload 的产物
 */
export async function uploadMerge(plan) {
  if (!plan) return { ok: false, reason: 'no_plan' }
  const merged = mergeForUpload(readBase(), snapshotData(), plan.cloud || {})
  try {
    // 先推云端，成功了才落本地：推送失败（网络/版本变了）时
    // 本机必须保持原样，不能落一个「只合了一半」的中间态
    const res = await callCloud('sync', {
      action: 'push',
      data: snapshotOf(merged),
      client_updated_at: new Date().toISOString(),
      base_version: plan.cloudVersion || 0
    })
    writeSnapshot(merged)
    settleAfterSync(res)
    return { ok: true }
  } catch (e) {
    if (e && e.conflict) {
      // 检查期间云端又被别的设备改了：不要硬推，让用户重新看一次差异
      return { ok: false, reason: 'cloud_changed' }
    }
    return { ok: false, reason: (e && e.code) || 'network' }
  }
}

/** 整份覆盖云端（会丢掉云端独有的记录，必须二次确认） */
export async function uploadOverwrite(plan) {
  try {
    const res = await callCloud('sync', {
      action: 'push',
      data: buildSnapshot(),
      client_updated_at: new Date().toISOString(),
      base_version: (plan && plan.cloudVersion) || 0,
      force: true
    })
    settleAfterSync(res)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e && e.code) || 'network' }
  }
}

// ---------- 恢复 ----------

function hasRestoreBackup() {
  try {
    return !!uni.getStorageSync(KEY_BACKUP)
  } catch (e) {
    return false
  }
}

function backupLocal() {
  try {
    uni.setStorageSync(KEY_BACKUP, JSON.stringify({
      at: new Date().toISOString(),
      data: snapshotData()
    }))
  } catch (e) { /* 备份失败不阻断，但会提示用户 */ }
}

/** 从云端整份恢复本机（覆盖前自动备份） */
export async function restoreFromCloud() {
  const r = await checkRemote()
  if (!r.ok) return r
  const res = remoteCache || {}
  if (!res.exists) return { ok: false, reason: 'empty' }
  backupLocal()
  writeSnapshot(res.data || {})
  settleAfterSync(res)
  try { uni.$emit('wio:data-restored', {}) } catch (e) { /* ignore */ }
  return { ok: true, count: countOf(res.data) }
}

/** 撤销上一次「从云端恢复」：把备份写回本机并推上去 */
export async function undoRestore() {
  let b = null
  try {
    b = JSON.parse(uni.getStorageSync(KEY_BACKUP) || 'null')
  } catch (e) {
    b = null
  }
  if (!b || !b.data) return { ok: false, reason: 'no_backup' }
  writeSnapshot(b.data)
  try {
    const s = getSyncState()
    const res = await callCloud('sync', {
      action: 'push',
      data: buildSnapshot(),
      client_updated_at: new Date().toISOString(),
      base_version: s.dataVersion || 0,
      force: true
    })
    settleAfterSync(res)
    try { uni.removeStorageSync(KEY_BACKUP) } catch (e) { /* ignore */ }
    try { uni.$emit('wio:data-restored', {}) } catch (e) { /* ignore */ }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e && e.code) || 'network' }
  }
}

// ---------- 内部 ----------

/** 同步成功后：更新版本、基线、清脏标记 */
function settleAfterSync(res) {
  const s = getSyncState()
  s.dataVersion = res.data_version
  s.lastSyncAt = new Date().toISOString()
  s.dirty = false
  s.dirtySince = null
  s.remoteNewer = false
  s.remoteVersion = res.data_version
  s.remoteCount = localCount()
  s.remoteSyncedTime = res.synced_time || s.lastSyncAt
  s.remoteCheckedAt = s.lastSyncAt
  s.remoteExists = true
  setSyncState(s)
  writeBase(snapshotData())
  remoteCache = null
}
