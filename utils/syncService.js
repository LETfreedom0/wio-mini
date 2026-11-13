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
import { t } from './locales.js'

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

/** 只取三份业务数据（不含 meta） */
function snapshotData() {
  return {
    settings: readKey('wio_settings'),
    entries: readKey('wio_entries'),
    overtime: readKey('wio_overtime')
  }
}

// ---------- 日期边界：只同步「今天含今天之前」 ----------
// 未来的标记是计划，不是事实：下次大概率还会改，上来下去只会把云端弄脏，
// 换设备恢复时还会把旧计划搬回来。所以同步视野里只留 <= 今天。

/** 三个按日期键的 settings 容器（customLeaves 是区间配置，不在此列） */
const DATE_MAPS = ['customMarks', 'halfFullDays', 'touchedAt']

// holidayPlan 也是按日期键，但它是**配置不是事实**：2027 年的假期安排现在就要能存、
// 能同步，所以不进 DATE_MAPS（不按今天裁剪），合并时按日期三向。

function todayStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 只保留 key <= today 的日期映射（'YYYY-MM-DD' 字典序即时间序） */
function pickPast(map, today) {
  const out = {}
  if (!map || typeof map !== 'object') return out
  Object.keys(map).forEach(k => {
    if (k <= today) out[k] = map[k]
  })
  return out
}

/**
 * 同步视野下的数据视图：砍掉所有未来的日期键。
 * 用于推送载荷、基线、差异比对、条数统计——四处必须同一个口径，
 * 否则会算出「云端删了、本机还有」这种假差异。
 */
export function historyData(data) {
  const d = data || {}
  const today = todayStr()
  const settings = { ...(d.settings || {}) }
  DATE_MAPS.forEach(k => {
    if (settings[k] !== undefined) settings[k] = pickPast(settings[k], today)
  })
  return {
    settings,
    entries: pickPast(d.entries, today),
    overtime: pickPast(d.overtime, today)
  }
}

/** historyData 的补集：只留 > 今天 的日期键（本机的计划数据） */
function futureOnly(data) {
  const d = data || {}
  const today = todayStr()
  const pickFuture = map => {
    const out = {}
    if (!map || typeof map !== 'object') return out
    Object.keys(map).forEach(k => { if (k > today) out[k] = map[k] })
    return out
  }
  const settings = {}
  DATE_MAPS.forEach(k => {
    if (d.settings && d.settings[k] !== undefined) settings[k] = pickFuture(d.settings[k])
  })
  return {
    settings,
    entries: pickFuture(d.entries),
    overtime: pickFuture(d.overtime)
  }
}

/** 恢复用：历史取云端，计划取本机 */
function mergeRestore(history, future) {
  const settings = { ...(history.settings || {}) }
  DATE_MAPS.forEach(k => {
    const a = settings[k]
    const b = future.settings[k]
    if (a !== undefined || b !== undefined) settings[k] = { ...(a || {}), ...(b || {}) }
  })
  return {
    settings,
    entries: { ...(history.entries || {}), ...(future.entries || {}) },
    overtime: { ...(history.overtime || {}), ...(future.overtime || {}) }
  }
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

/** 当前界面语言：清单文案要跟着切，不能把中文写死在同步层 */
function uiLang() {
  try {
    const st = JSON.parse(uni.getStorageSync('wio_settings') || '{}')
    return st.language === 'en-US' ? 'en-US' : 'zh-CN'
  } catch (e) { return 'zh-CN' }
}
const L = (key, lang) => t('profile.' + key, lang || uiLang())

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

/** 本机记录条数（打卡 + 加班，只算 <= 今天） */
export function localCount() {
  const h = historyData(snapshotData())
  return Object.keys(h.entries).length + Object.keys(h.overtime).length
}

function countOf(data) {
  if (!data) return 0
  const h = historyData(data)
  return Object.keys(h.entries).length + Object.keys(h.overtime).length
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
    toDownload: [],  // 云端有、本机从来没有 → 默认合并下来，可逐条丢弃
    bothDiffer: [],  // 两边都有但值不同 → 默认本机，可逐条改选云端
    localDeleted: [],// 基线有、本机删了、云端还有 → 尊重删除
    cloudDeleted: [],// 基线有、云端删了、本机还有 → 本机为准，补回云端
    settingsDiffer: [],
    noBaseline: !base
  }

  // cloudWins：这条记录以云端为准（用户在清单里勾的）。
  // 默认值就是「不改动时」的语义：云端独有的默认留着，两边打架的默认本机赢。
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
          plan.bothDiffer.push({ kind, key: k, local: lv, cloud: cv, cloudWins: false })
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
          plan.toDownload.push({ kind, key: k, value: cv, cloudWins: true })
        }
      }
    })
  })

  // ---------- settings ----------
  // 只报字段级差不够用：用户看不出「上传了什么假期」。
  // 这里给每条差异配一句人话 + 两边的值，清单可以直接逐行展示。
  const lang = uiLang()
  const ls = local.settings || {}
  const cs = (cloud && cloud.settings) || {}
  const bs = (base && base.settings) || {}
  plan.settingsDetail = []

  const pushDetail = (label, localText, cloudText) => {
    plan.settingsDiffer.push(label)
    plan.settingsDetail.push({ label, local: localText, cloud: cloudText })
  }

  const dayText = n => `${Number(n) || 0}${L('syncUnitDay', lang)}`
  const SCALAR = [
    ['vacationDays', 'syncSetVacation', dayText],
    ['sickDays', 'syncSetSick', dayText],
    ['targetPercentage', 'syncSetTarget', v => `${Number(v) || 0}%`],
    ['commuteMinutes', 'syncSetCommute', v => `${Number(v) || 0}${L('syncUnitMin', lang)}`],
    ['birthdayEnabled', 'syncSetBirthday', v => (v ? L('syncOn', lang) : L('syncOff', lang))],
    ['birthdayMonth', 'syncSetBirthdayMonth', v => (
      v === '' || v === undefined || v === null
        ? L('syncNotSet', lang)
        : `${v}${L('syncUnitMonth', lang)}`
    )],
    ['halfDayAttendance', 'syncSetHalfDay', v => (v === 'full' ? L('syncCalcFull', lang) : L('syncCalcHalf', lang))],
    ['language', 'syncSetLanguage', v => (v === 'en-US' ? 'English' : '中文')]
  ]
  SCALAR.forEach(pair => {
    const k = pair[0]
    if (JSON.stringify(ls[k]) !== JSON.stringify(cs[k])) {
      pushDetail(L(pair[1], lang), pair[2](ls[k]), pair[2](cs[k]))
    }
  })

  // 自定义假期：逐条比对，谁多谁少、额度改成多少，一眼能看到
  const mapById = arr => {
    const m = {}
    if (Array.isArray(arr)) arr.forEach(x => { if (x && x.id) m[x.id] = x })
    return m
  }
  const leaveText = lv => {
    if (!lv) return L('syncNone', lang)
    const n = Number(lv.quota)
    const q = n > 0
      ? (lv.quotaRule === 'total'
        ? L('syncQuotaTotal', lang).replace('{n}', n)
        : L('syncQuotaYear', lang).replace('{n}', n))
      : L('syncUnlimited', lang)
    return `${lv.mode === 'day' ? L('syncModeDay', lang) : L('syncModeRange', lang)} · ${q}`
  }
  const leaveLabel = name => L('syncSetLeave', lang).replace('{name}', name)
  const lmap = mapById(ls.customLeaves)
  const cmap = mapById(cs.customLeaves)
  const bmap = mapById(bs.customLeaves)
  const leaveIds = new Set([...Object.keys(lmap), ...Object.keys(cmap)])
  leaveIds.forEach(id => {
    const LV = lmap[id]
    const CV = cmap[id]
    const name = (LV && LV.name) || (CV && CV.name) || L('syncSetLeaveFallback', lang)
    if (LV && CV) {
      if (JSON.stringify(LV) !== JSON.stringify(CV)) pushDetail(leaveLabel(name), leaveText(LV), leaveText(CV))
      return
    }
    if (LV && !CV) {
      // 云端没有这个假：本机新增，上传后云端才有
      pushDetail(leaveLabel(name), leaveText(LV), L('syncNone', lang))
      return
    }
    if (!LV && CV) {
      if (bmap[id]) {
        // 基线有、本机删了 → 上传后云端也删掉
        pushDetail(leaveLabel(name), L('syncDeleted', lang), leaveText(CV))
      } else {
        // 云端独有 → 默认收下
        pushDetail(leaveLabel(name), L('syncNone', lang), leaveText(CV))
      }
    }
  })

  // 其它容器型字段：按「有几个键不同」报，touchedAt 是派生元数据不报
  const CONTAINER = [
    ['halfFullDays', 'syncSetHalfFull'],
    ['customMarks', 'syncSetMarks'],
    ['compOffRules', 'syncSetCompOff'],
    ['holidayPlan', 'syncSetHolidayPlan']
  ]
  CONTAINER.forEach(pair => {
    const k = pair[0]
    const lv = ls[k] || {}
    const cv = cs[k] || {}
    if (JSON.stringify(lv) === JSON.stringify(cv)) return
    const keys = Object.keys({ ...lv, ...cv })
    const diff = keys.filter(key => JSON.stringify(lv[key]) !== JSON.stringify(cv[key]))
    if (!diff.length) return
    pushDetail(
      L(pair[1], lang),
      L('syncItemsDiffer', lang).replace('{n}', diff.length),
      diff.slice(0, 3).join(lang === 'en-US' ? ', ' : '、')
    )
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
  // 比对口径：三边都只看 <= 今天，未来项不参与，
  // 否则会列出「将上传」却又不传的条目
  const local = historyData(snapshotData())
  const cloud = historyData(res.exists ? (res.data || {}) : {})
  const base = readBase()
  const plan = diffPlan(base ? historyData(base) : null, local, cloud)
  plan.cloudVersion = res.data_version || 0
  plan.cloudExists = !!res.exists
  plan.cloudSyncedTime = res.synced_time || null
  plan.cloud = cloud
  plan.localCount = localCount()
  plan.cloudCount = countOf(cloud)
  return { ok: true, plan }
}

/**
 * 合并上传：默认本机为准，云端独有的记录补下来。
 * cloudWins 是用户在清单里勾选的「以云端为准」的条目（'kind:key'），
 * 勾了就采用云端那份；云端独有但被取消勾选的，等于从云端删掉。
 */
export function mergeForUpload(base, local, cloud, cloudWins) {
  const out = { entries: {}, overtime: {} }
  const wins = {}
  ;(cloudWins || []).forEach(id => { wins[id] = true })

  ;['entries', 'overtime'].forEach(kind => {
    const b = (base && base[kind]) || {}
    const l = (local && local[kind]) || {}
    const c = (cloud && cloud[kind]) || {}
    const keys = new Set([...Object.keys(l), ...Object.keys(c)])
    keys.forEach(k => {
      const hasL = Object.prototype.hasOwnProperty.call(l, k)
      const hasC = Object.prototype.hasOwnProperty.call(c, k)
      const hasB = Object.prototype.hasOwnProperty.call(b, k)
      if (wins[`${kind}:${k}`]) {
        if (hasC) out[kind][k] = c[k]   // 用户选了云端 → 用云端那份
        return
      }
      if (hasL) { out[kind][k] = l[k]; return }   // 本机有 → 本机赢
      if (hasB) return                             // 本机删过 → 保持删除
      // 云端独有、且没被勾选 → 不带下来（推上去后云端这份就没了）
    })
  })

  // settings：本机优先，但「本机删掉的」要真的删掉，不能被云端那份补回来。
  // 单 key 三向：本机有 → 本机赢；基线有本机没了 → 尊重删除；否则（云端独有）→ 收下。
  const ls = (local && local.settings) || {}
  const cs = (cloud && cloud.settings) || {}
  const ss = (base && base.settings) || {}
  const settings = { ...cs, ...ls }

  const mergeKeyed = (b, l, c) => {
    const outMap = {}
    const keys = new Set([...Object.keys(l || {}), ...Object.keys(c || {})])
    keys.forEach(k => {
      const hasL = Object.prototype.hasOwnProperty.call(l || {}, k)
      const hasC = Object.prototype.hasOwnProperty.call(c || {}, k)
      const hasB = Object.prototype.hasOwnProperty.call(b || {}, k)
      if (hasL) { outMap[k] = l[k]; return }
      if (hasB) return          // 本机删过 → 保持删除
      if (hasC) outMap[k] = c[k]  // 云端独有 → 收下
    })
    return outMap
  }

  ;['halfFullDays', 'compOffRules', 'customMarks', 'touchedAt', 'holidayPlan'].forEach(k => {
    settings[k] = mergeKeyed(ss[k], ls[k], cs[k])
  })

  // 自定义假期是按 id 的数组，同样走三向；顺序沿用「本机的顺序 + 云端补进来的」
  const byId = arr => {
    const m = {}
    if (Array.isArray(arr)) arr.forEach(x => { if (x && x.id) m[x.id] = x })
    return m
  }
  if (ls.customLeaves !== undefined || cs.customLeaves !== undefined) {
    const lmap = byId(ls.customLeaves)
    const cmap = byId(cs.customLeaves)
    const bmap = byId(ss.customLeaves)
    const list = []
    const added = {}
    ;(Array.isArray(ls.customLeaves) ? ls.customLeaves : []).forEach(x => {
      if (!x || !x.id || added[x.id]) return
      list.push(x)
      added[x.id] = true
    })
    ;(Array.isArray(cs.customLeaves) ? cs.customLeaves : []).forEach(x => {
      if (!x || !x.id) return
      if (added[x.id]) return             // 本机也有 → 已按本机顺序收进 list
      if (bmap[x.id]) return              // 基线有、本机删了 → 不上云（云端这条会被删掉）
      list.push(x)                        // 云端独有 → 收下
      added[x.id] = true
    })
    settings.customLeaves = list
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
  // 勾选态 → 名单。toDownload 默认收下（除非被显式取消），
  // bothDiffer 默认本机赢（除非被显式勾成云端）
  const wins = []
  ;(plan.toDownload || []).forEach(it => {
    if (it.cloudWins !== false) wins.push(`${it.kind}:${it.key}`)
  })
  ;(plan.bothDiffer || []).forEach(it => {
    if (it.cloudWins) wins.push(`${it.kind}:${it.key}`)
  })
  const base = readBase()
  const merged = mergeForUpload(base ? historyData(base) : null, snapshotData(), plan.cloud || {}, wins)
  // 本次会从云端消失的条目：显式丢弃的云端独有 + 本机已删除的（云端跟着删）
  const droppedKeys = (plan.toDownload || [])
    .filter(it => it.cloudWins === false)
    .map(it => `${it.kind}:${it.key}`)
    .concat((plan.localDeleted || []).map(it => `${it.kind}:${it.key}`))
  const deleted = droppedKeys.length
  try {
    // 先推云端，成功了才落本地：推送失败（网络/版本变了）时
    // 本机必须保持原样，不能落一个「只合了一半」的中间态。
    // 载荷再砍一次未来：merged 里带着本机的未来计划是为了写回本地时不丢，
    // 但云端只该存确定发生过的数据。
    const res = await callCloud('sync', {
      action: 'push',
      data: snapshotOf(historyData(merged)),
      client_updated_at: new Date().toISOString(),
      base_version: plan.cloudVersion || 0
    })
    writeSnapshot(merged)
    settleAfterSync(res)
    // 回读一次云端，用「云端现在真实的条数」回报给用户。
    // 不做假设：推送返回成功不等于数据就长这样。
    let remoteCount = countOf(historyData(merged))
    // 推送返回成功 ≠ 云端真的长这样（历史上同一个 openid 可能有重复文档，
    // 写了一条、读的却是另一条）。回读一次，把「该删的还在」如实报出来，
    // 不让用户以为删掉了、过一阵又冒出来。
    let stuck = 0
    try {
      const after = await checkRemote()
      if (after && after.ok) {
        remoteCount = after.remoteCount
        const cl = (remoteCache && remoteCache.data) || {}
        const he = historyData(cl)
        stuck = droppedKeys.filter(k => {
          const [kind, ...rest] = k.split(':')
          const key = rest.join(':')
          return !!((he[kind] || {})[key] !== undefined)
        }).length
      }
    } catch (e) { /* 回读失败不影响上传结果 */ }
    return { ok: true, deleted, remoteCount, stuck }
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
      data: snapshotOf(historyData(snapshotData())),
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

/** 一条打卡值里引用的自定义假期 id（半天是 {am,pm}，也要挖出来） */
function collectLeaveIds(v, out) {
  if (typeof v === 'string') {
    if (v.indexOf('custom:') === 0) out.add(v.slice(7))
  } else if (v && typeof v === 'object') {
    if (v.am) collectLeaveIds(v.am, out)
    if (v.pm) collectLeaveIds(v.pm, out)
  }
}

/** 一份数据里被引用的自定义假期 id 集合 */
function customRefIds(data) {
  const ids = new Set()
  const d = data || {}
  Object.keys(d.entries || {}).forEach(k => collectLeaveIds(d.entries[k], ids))
  const marks = (d.settings || {}).customMarks || {}
  Object.keys(marks).forEach(k => {
    const m = marks[k]
    if (m && m.id) ids.add(m.id)
  })
  return ids
}

/**
 * 补回「被引用但没定义」的假期。
 * 云端历史上被旧客户端推过 customLeaves: [] 的快照，可 entries 里还留着
 * custom:<id>。恢复这种快照会让日历印出原始 id、统计还按假期扣天数，
 * 所以只要本机还留着定义，就跟着一起恢复。
 * @returns {number} 补回的假期个数
 */
function repairLeaveRefs(merged, localSettings) {
  const localLeaves = Array.isArray((localSettings || {}).customLeaves)
    ? localSettings.customLeaves
    : []
  if (!localLeaves.length) return 0
  const leaves = Array.isArray(merged.settings.customLeaves)
    ? merged.settings.customLeaves.slice()
    : []
  const have = new Set(leaves.map(l => l && l.id).filter(Boolean))
  let added = 0
  customRefIds(merged).forEach(id => {
    if (have.has(id)) return
    const def = localLeaves.find(l => l && l.id === id)
    if (def) { leaves.push(def); have.add(id); added++ }
  })
  if (added) merged.settings.customLeaves = leaves
  return added
}

const sameVal = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b)

/**
 * 恢复前后的差异回执：让 UI 能说「恢复了 12 条打卡」，而不是只报一句
 * 「已从云端恢复」——内容一样时那句成功提示会被当成「没反应」。
 */
function diffReceipt(before, after) {
  const b = { entries: before.entries || {}, overtime: before.overtime || {} }
  const a = { entries: after.entries || {}, overtime: after.overtime || {} }
  let entries = 0
  let overtime = 0
  let added = 0      // 本机没有、恢复后会新增的
  let removed = 0    // 本机有、恢复后会被删掉的（云端没有）
  let changed = 0    // 两边都有但内容不同，以云端为准
  const items = []   // 逐条明细，给确认层摆出来
  ;['entries', 'overtime'].forEach(k => {
    new Set([...Object.keys(b[k]), ...Object.keys(a[k])]).forEach(key => {
      if (sameVal(b[k][key], a[k][key])) return
      if (k === 'entries') entries++; else overtime++
      const inB = b[k][key] !== undefined
      const inA = a[k][key] !== undefined
      if (!inB) added++
      else if (!inA) removed++
      else changed++
      items.push({ kind: k, key, local: inB ? b[k][key] : null, cloud: inA ? a[k][key] : null })
    })
  })
  items.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
  const leavesOf = s => (Array.isArray((s || {}).customLeaves) ? s.customLeaves.length : 0)
  const leaves = leavesOf(after.settings)
  return {
    entries,
    overtime,
    added,
    removed,
    changed,
    items,
    leaves,
    leavesDelta: leaves - leavesOf(before.settings),
    total: entries + overtime
  }
}

/**
 * 「从云端恢复」的试算：只算不动。UI 拿它把「云端到底有什么、
 * 恢复会改掉什么」摆在确认框里，用户点确认才有意义——
 * 内容完全一致时直接拒绝弹确认，从根上消灭「点了没效果」。
 * 与 restoreFromCloud 共用 buildRestore，保证预览=实作。
 */
export async function previewRestore() {
  const r = await checkRemote()
  if (!r.ok) return r
  const res = remoteCache
  if (!res || !res.exists) return { ok: true, exists: false }
  const { merged, receipt, keptLeaves, cloudCounts, syncedTime, remoteCount } = buildRestore(res)
  return { ok: true, exists: true, receipt, keptLeaves, cloudCounts, syncedTime, remoteCount, merged }
}

/** 读 remoteCache，算出恢复后的完整数据与回执（不写任何存储） */
function buildRestore(res) {
  const before = snapshotData()
  // 只恢复「历史」：云端若还残留旧版本推上去的未来记录，不能搬回来当计划，
  // 那些多半已经过期或被本机重新规划过。本机的未来计划在覆盖中保留。
  const merged = mergeRestore(historyData(res.data || {}), futureOnly(before))
  const keptLeaves = repairLeaveRefs(merged, before.settings || {})
  const receipt = diffReceipt(before, merged)
  const d = res.data || {}
  const cloudCounts = {
    entries: Object.keys(d.entries || {}).length,
    overtime: Object.keys(d.overtime || {}).length,
    leaves: Array.isArray((d.settings || {}).customLeaves) ? d.settings.customLeaves.length : 0
  }
  return { merged, receipt, keptLeaves, cloudCounts, syncedTime: res.synced_time || null, remoteCount: countOf(res.data) }
}

/** 从云端整份恢复本机（覆盖前自动备份） */
export async function restoreFromCloud() {
  const r = await checkRemote()
  if (!r.ok) return r
  const res = remoteCache || {}
  if (!res.exists) return { ok: false, reason: 'empty' }
  const { merged, receipt, keptLeaves } = buildRestore(res)
  backupLocal()
  writeSnapshot(merged)
  settleAfterSync(res)
  try { uni.$emit('wio:data-restored', {}) } catch (e) { /* ignore */ }
  return { ok: true, count: countOf(res.data), receipt, keptLeaves }
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
      data: snapshotOf(historyData(snapshotData())),
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
  // 基线记「云端现在持有的那份」，同样砍掉未来，否则下次会算出假差异
  writeBase(historyData(snapshotData()))
  remoteCache = null
}
