// ============================================================
// 升级兼容性校验：2.0.0 能否正确读到旧版本留在本机的数据
//
// 为什么要有这个：老用户手机里躺着的是旧版本写进去的数据，升级不是空库。
// 这里不「照抄一份旧逻辑」来比对（那只能验证我的想象），而是直接加载
// shared-check/utils/ 下的旧版本真实实现，让它自己写数据，再让当前
// utils/wioService.js 去读。
//
// 两个旧快照分别代表不同代际，检查重点不同：
//   wioServiceOld.js  (745 行) —— 很早的版本，自定义假期刚上线
//   wioServicePrev.js (1314 行) —— 紧邻 2.0.0 的上一版，用户最可能停在这里
//
// 覆盖两个方向：
//   正向：旧版写 → 新版读（用户升级，一条都不能丢）
//   反向：新版写 → 旧版读（审核回滚、多端混用，至少不能崩）
//
// 运行：node .workbuddy/shared-check/compat.mjs
// ============================================================

import path from 'path'
import { pathToFileURL } from 'url'

const here = import.meta.dirname
const root = path.resolve(here, '../..')
const load = (p) => import(pathToFileURL(p).href)

const store = {}
globalThis.uni = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  showToast: () => {},
  showModal: () => {},
  vibrateShort: () => {},
  $emit: () => {},
  $on: () => {},
  $off: () => {}
}

let pass = 0
let fail = 0
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓ ' + msg) }
  else {
    fail++
    console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}
function section(t) { console.log('\n' + t) }

const oldSvc = (await load(path.join(here, 'utils/wioServiceOld.js'))).default
const prevSvc = (await load(path.join(here, 'utils/wioServicePrev.js'))).default
const newSvc = (await load(path.join(root, 'utils/wioService.js'))).default
const proMod = await load(path.join(root, 'utils/pro.js'))

// ---------- 一份 1.x 用户数据（会话用 snake_case + ISO 字符串，最恶劣的老形态）----------
const MONTH = '2026-09'
const PATTERN = ['company', 'company', 'company', 'home', 'company', 'vacation', 'company', 'home']

function resetStore() {
  Object.keys(store).forEach((k) => delete store[k])
  store['wio_auth'] = JSON.stringify({
    user: { openid: 'o_old_user', nickname: '老用户', avatarFileID: 'cloud://a.png' },
    subscription: { plan: 'year', expires_at: '2027-03-01T00:00:00.000Z' }
  })
}

function seed(svc) {
  const dates = []
  for (let d = 1; d <= 30; d++) {
    const ds = `${MONTH}-${String(d).padStart(2, '0')}`
    if (newSvc.isOfficialWorkingDay(new Date(ds + 'T00:00:00'))) dates.push(ds)
  }
  dates.forEach((d, i) => svc.saveEntry(d, PATTERN[i % PATTERN.length]))
  svc.saveOvertimeEntry(dates[0], 2)
  svc.saveOvertimeEntry(dates[2], 1.5)

  // 老设置：没有 customMarks / cardStyle / commuteMinutes / halfFullDays 这些新键
  store['wio_settings'] = JSON.stringify({
    username: '老用户',
    targetPercentage: 45,
    vacationDays: 20,
    sickDays: 12,
    language: 'zh-CN',
    birthdayEnabled: true,
    birthdayMonth: '03',
    autoSync: true,
    // 老自定义假期：没有 mode，没有 skipOffDays
    customLeaves: [
      { id: 'cl_a', name: '育儿假', color: '#C4794B', start: '2026-09-10', end: '2026-09-12' },
      { id: 'cl_b', name: '婚假', start: '2026-09-21', end: '2026-09-22' }
    ]
  })
  return { entries: svc.getEntries(), overtime: svc.getOvertimeEntries() }
}

/** 与具体快照无关的通用检查：数据本身一条没丢 */
function checkIntegrity(wrote) {
  const newEntries = newSvc.getEntries()
  ok(Object.keys(newEntries).length === Object.keys(wrote.entries).length,
    `打卡记录条数一致（${Object.keys(wrote.entries).length} 条）`,
    { old: Object.keys(wrote.entries).length, new: Object.keys(newEntries).length })

  let sameStatus = true
  Object.keys(wrote.entries).forEach((d) => {
    if (newEntries[d] !== wrote.entries[d]) sameStatus = false
  })
  ok(sameStatus, '每条记录的状态与旧版读到的一致')
  ok(Object.keys(newSvc.getOvertimeEntries()).length === Object.keys(wrote.overtime).length,
    `加班记录条数一致（${Object.keys(wrote.overtime).length} 条）`)

  const s = newSvc.getSettings()
  ok(s.targetPercentage === 45, '目标比例保留 45%', s.targetPercentage)
  ok(s.birthdayEnabled === true && s.birthdayMonth === '03', '生日假配置保留')
  ok(s.commuteMinutes === 90, '新字段 commuteMinutes 补上默认值', s.commuteMinutes)
  ok(s.cardStyle === 'calendar', '新字段 cardStyle 补上默认值', s.cardStyle)
  ok(s.halfFullDays && typeof s.halfFullDays === 'object', '新字段 halfFullDays 补上空对象')
  ok(JSON.stringify(newSvc.getCustomMarks()) === '{}', '没有 customMarks 键时不报错，按天标记读成空表')
  ok(s.customLeaves.length === 2, '自定义假期两条都还在', s.customLeaves.length)

  const leaves = newSvc.getCustomLeaves()
  ok(leaves.length === 2, '两条假期都能被读出（PRO 有效）', leaves.length)
  ok(leaves.every((l) => l.mode === 'range'), '老条目无 mode → 一律归为 range（零迁移）', leaves.map((l) => l.mode))
  ok(leaves[0].name === '育儿假' && leaves[0].start === '2026-09-10' && leaves[0].end === '2026-09-12',
    '区间、名称、颜色原样保留', leaves[0])
  ok(leaves[1].color === '#0E6E62', '老条目没存颜色 → 用默认墨绿', leaves[1].color)
  ok(leaves.every((l) => l.skipOffDays === false), '新字段 skipOffDays 默认 false')

  let csvOk = true
  try { newSvc.buildYearCsv(2026) } catch (e) { csvOk = false }
  ok(csvOk, '年度 CSV 导出不抛错')

  ok(proMod.isProUser() === true, '老会话里的 snake_case expires_at 能判出 PRO（不会升级就掉会员）')
  ok(proMod.getProState().plan === 'year', '订阅计划名读得到', proMod.getProState().plan)
}

function statsOf(m) {
  return {
    companyDays: m.companyDays, homeDays: m.homeDays, workingDays: m.workingDays,
    vacationDays: m.vacationDays, totalRecorded: m.totalRecorded, customLeaveDays: m.customLeaveDays
  }
}

// ============================================================
section('A1. 正向：最老的快照（745 行）写 → 新版读')
// ============================================================
resetStore()
const wroteA1 = seed(oldSvc)
checkIntegrity(wroteA1)
{
  const o = statsOf(oldSvc.getMonthStats(2026, 9))
  const n = statsOf(newSvc.getMonthStats(2026, 9))
  console.log('    旧代口径:', JSON.stringify(o))
  console.log('    当前口径:', JSON.stringify(n))
  const oy = oldSvc.getYearStats(2026)
  const ny = newSvc.getYearStats(2026)
  ok(ny.companyDays === oy.companyDays, '年度公司天数与旧代一致', { old: oy.companyDays, new: ny.companyDays })
  // 注：这一代统计区间假时「出勤与假期两边都算」，当前版本是区间假覆盖当日记录。
  // 差异只出现在「既有区间假、又在那几天打了卡」的数据上，属纠错而非丢数据，
  // 故只记录数值不判失败；真实用户路径由 A2 验证。
}

// ============================================================
section('A2. 正向：紧邻上一版（1314 行）写 → 新版读')
// ============================================================
resetStore()
const wroteA2 = seed(prevSvc)
checkIntegrity(wroteA2)
{
  const o = statsOf(prevSvc.getMonthStats(2026, 9))
  const n = statsOf(newSvc.getMonthStats(2026, 9))
  console.log('    上一版口径:', JSON.stringify(o))
  console.log('    当前口径  :', JSON.stringify(n))
  ok(n.companyDays === o.companyDays, '本月公司天数与上一版一致', { old: o.companyDays, new: n.companyDays })
  ok(n.homeDays === o.homeDays, '本月居家天数与上一版一致', { old: o.homeDays, new: n.homeDays })
  ok(n.vacationDays === o.vacationDays, '本月年假天数与上一版一致', { old: o.vacationDays, new: n.vacationDays })
  ok(n.workingDays === o.workingDays, '本月应出勤天数与上一版一致', { old: o.workingDays, new: n.workingDays })
  ok(n.totalRecorded === o.totalRecorded, '本月记录条数与上一版一致', { old: o.totalRecorded, new: n.totalRecorded })
  ok(n.customLeaveDays === o.customLeaveDays, '本月自定义假期天数与上一版一致',
    { old: o.customLeaveDays, new: n.customLeaveDays })

  const oy = prevSvc.getYearStats(2026)
  const ny = newSvc.getYearStats(2026)
  ok(ny.companyDays === oy.companyDays, '年度公司天数与上一版一致', { old: oy.companyDays, new: ny.companyDays })
}

// ============================================================
section('B. 反向：新版写 → 上一版读（回滚 / 多端混用不能崩）')
// ============================================================
newSvc.saveEntry('2026-09-15', 'company')
newSvc.saveEntry('2026-09-16', { am: 'company', pm: 'home' })
const rawSplit = JSON.parse(store['wio_entries'])['2026-09-16']
ok(rawSplit && typeof rawSplit === 'object' && rawSplit.am === 'company' && rawSplit.pm === 'home',
  '半天存成 { am, pm } 对象', rawSplit)

let prevReadOk = true
try {
  prevSvc.getEntryForDate('2026-09-16')
  prevSvc.getMonthStats(2026, 9)
} catch (e) { prevReadOk = false }
ok(prevReadOk, '上一版读到对象形态的 entries 不抛错')
ok(JSON.stringify(newSvc.getEntryForDate('2026-09-15')) === JSON.stringify(prevSvc.getEntryForDate('2026-09-15')),
  '同一天两版读到的值相同')

const before = JSON.stringify(prevSvc.getEntries())
newSvc.saveCustomLeave({ id: 'cl_c', name: '调休额度', mode: 'day', quota: 3, quotaRule: 'yearly' })
newSvc.setCustomMark('2026-09-18', 'cl_c', 'full')
ok(before === JSON.stringify(prevSvc.getEntries()), '新版写按天假期/标记后，上一版读到的 entries 未被动过')
ok(prevSvc.getCustomLeaves().length === 3,
  '上一版读到 3 条（含新版新增的按天型），不报错也不丢老的两条', prevSvc.getCustomLeaves().length)

// ============================================================
section('C. 权益：2.0.0 唯一真正的断点')
// ============================================================
resetStore()
store['wio_auth'] = JSON.stringify({ user: { openid: 'o_old_user' } })
store['wio_pro_trial'] = JSON.stringify({
  plan: 'code', expiresAt: Date.now() + 30 * 86400000, code: 'WIO-OLD-CODE'
})
ok(proMod.isProUser() === false,
  '只有本机 wio_pro_trial 的老用户，升级后 PRO 判定为 false（旧前端码表通道已删除，预期行为）')

store['wio_auth'] = JSON.stringify({
  user: { openid: 'o_old_user' },
  subscription: { plan: 'code', expiresAt: Date.now() + 30 * 86400000 }
})
ok(proMod.isProUser() === true, '权益已在云端 subscriptions 的用户，升级后照常是 PRO')

// 清理遗留键时不能碰到业务数据：先放两条业务数据，清完必须还在
store['wio_entries'] = JSON.stringify({ '2026-09-01': 'company' })
store['wio_settings'] = JSON.stringify({ targetPercentage: 45 })
const { purgeLegacyStorage } = await load(path.join(root, 'utils/auth.js'))
purgeLegacyStorage()
ok(!('wio_pro_trial' in store), 'purgeLegacyStorage 清掉 wio_pro_trial')
ok(!!store['wio_entries'] && !!store['wio_settings'], '清理时没有误删打卡与设置')

console.log('\n' + '─'.repeat(52))
console.log(`通过 ${pass} 条，失败 ${fail} 条`)
if (fail > 0) process.exit(1)
