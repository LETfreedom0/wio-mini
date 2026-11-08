// WIO 口径一致性校验（周末 / 区间假跳过 / 半天逐日 / 统计页数据）
// 运行：node .workbuddy/shared-check/wio-consistency.mjs
//
// 这组断言只锁「口径」：任何一条挂了，用户看到的比率或额度就是错的。

import fs from 'fs'
import { fileURLToPath } from 'url'

const rootDir = fileURLToPath(new URL('../../', import.meta.url))
// 与项目根保持同步（shared-check/utils 是副本）
for (const f of ['wioService.js', 'pro.js', 'auth.js', 'locales.js', 'holidays.js', 'syncService.js']) {
  fs.copyFileSync(rootDir + 'utils/' + f, fileURLToPath(new URL('./utils/' + f, import.meta.url)))
}

const store = {}
globalThis.uni = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: k => { delete store[k] },
  $emit: () => {},
  $on: () => {}
}

const mod = await import('./utils/wioService.js?t=' + Date.now())
const S = mod.default

let pass = 0
let fail = 0
function eq(label, actual, expect) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expect)
  if (a === e) { pass++; return }
  fail++
  console.log(`  ✗ ${label}\n      实际 ${a}\n      期望 ${e}`)
}
function ok(label, cond) {
  if (cond) { pass++; return }
  fail++
  console.log(`  ✗ ${label}`)
}

const FUTURE = Date.now() + 86400000 * 30
// PRO 唯一来源：会话里的云端订阅镜像（wio_pro_trial 通道已移除）
const PRO_KEY = 'wio_auth'
const proSession = exp => JSON.stringify({
  user: { openid: 'o_test', nickname: '', avatarFileID: '' },
  subscription: { plan: 'month', expiresAt: exp }
})
function seed({ leaves = [], marks = {}, entries = {}, overtime = {}, settings = {} } = {}) {
  Object.keys(store).forEach(k => { if (k !== PRO_KEY) delete store[k] })
  store[PRO_KEY] = proSession(FUTURE)
  store['wio_settings'] = JSON.stringify({
    language: 'zh-CN',
    targetPercentage: 40,
    vacationDays: 20,
    sickDays: 12,
    customLeaves: leaves,
    customMarks: marks,
    ...settings
  })
  store['wio_entries'] = JSON.stringify(entries)
  store['wio_overtime'] = JSON.stringify(overtime)
}

const DAY_LEAVE = { id: 'd1', name: '育儿假', color: '#A93B78', mode: 'day', quota: 5, quotaRule: 'yearly' }
// 2026-03：2 号周一 … 8 号周日
const BASE_ENTRIES = { '2026-03-02': 'company', '2026-03-03': 'company', '2026-03-04': 'company' }
const rateOf = () => S.getMonthlyReport(2026, 3).rate
const statsOf = () => S.getMonthStats(2026, 3)

// ---------- A. 周末标记不影响 WIO 比率 ----------
console.log('A. 周末标记不影响比率')
seed({ entries: BASE_ENTRIES })
const baseRate = rateOf()
eq('基线比率', baseRate, 14)

seed({ entries: { ...BASE_ENTRIES, '2026-03-07': 'vacation' } })
eq('周末标年假 → 比率不变', rateOf(), baseRate)

seed({ entries: { ...BASE_ENTRIES, '2026-03-07': 'home' } })
eq('周末标居家 → 比率不变', rateOf(), baseRate)

seed({ entries: { ...BASE_ENTRIES, '2026-03-07': 'custom:d1' }, leaves: [DAY_LEAVE] })
eq('周末标按天假 → 比率不变', rateOf(), baseRate)

seed({ entries: { ...BASE_ENTRIES, '2026-03-07': { am: 'company', pm: null } } })
eq('周末标半天公司 → 比率不变', rateOf(), baseRate)

seed({ entries: BASE_ENTRIES, leaves: [{ id: 'r1', name: '婚假', color: '#C25B6E', start: '2026-03-06', end: '2026-03-09' }] })
const rangeRate = rateOf()
eq('区间假跨周末 → 只扣 2 个工作日', statsOf().deductibleLeave, 2)
eq('区间假跨周末 → 周末不进假期天数', statsOf().customLeaveDays, 2)

// ---------- B. 周末标记不消耗额度 ----------
console.log('B. 周末标记不消耗额度')
seed({ entries: { '2026-03-07': 'vacation', '2026-03-08': 'vacation' } })
eq('周末标年假 → 已用 0', S.getYearStats(2026).vacationDaysUsed, 0)

seed({ entries: { '2026-03-07': 'sick' } })
eq('周末标病假 → 已用 0', S.getYearStats(2026).sickDaysUsed, 0)

seed({ entries: { '2026-03-07': 'custom:d1' }, leaves: [DAY_LEAVE] })
eq('周末标按天假 → 额度已用 0', S.getCustomLeaveUsage('d1').used, 0)

seed({ entries: { '2026-03-03': 'vacation' } })
eq('工作日标年假 → 照常扣 1', S.getYearStats(2026).vacationDaysUsed, 1)

seed({ entries: { '2026-03-02': 'custom:d1' }, marks: { '2026-03-07': { id: 'd1', part: 'full' } }, leaves: [DAY_LEAVE] })
eq('老 marks 的周末标记也不计额度', S.getCustomLeaveUsage('d1').used, 1)

// ---------- C. 区间假跳过周末与公共假期 ----------
console.log('C. 区间假 skipOffDays')
seed({ leaves: [{ id: 'r2', name: '婚假', color: '#C25B6E', start: '2026-03-06', end: '2026-03-09', skipOffDays: true }] })
eq('跳过模式：周六不命中', S.getCustomLeaveForDate('2026-03-07'), null)
eq('跳过模式：周日不命中', S.getCustomLeaveForDate('2026-03-08'), null)
ok('跳过模式：周五命中', !!S.getCustomLeaveForDate('2026-03-06'))
ok('跳过模式：周一命中', !!S.getCustomLeaveForDate('2026-03-09'))
eq('跳过模式：统计仍只算 2 个工作日', statsOf().customLeaveDays, 2)
eq('跳过模式：扣分母 2', statsOf().deductibleLeave, 2)

seed({ leaves: [{ id: 'r3', name: '婚假', color: '#C25B6E', start: '2026-03-06', end: '2026-03-09', skipOffDays: false }] })
ok('自然日模式：周六命中', !!S.getCustomLeaveForDate('2026-03-07'))
eq('自然日模式：假期天数仍只算工作日', statsOf().customLeaveDays, 2)
eq('自然日模式：周末落 weekendLeaves', statsOf().weekendLeaves, 2)

seed({ leaves: [{ id: 'r4', name: '旧数据', color: '#C25B6E', start: '2026-03-06', end: '2026-03-09' }] })
eq('老数据无 skipOffDays → 默认 false', S.getCustomLeaves()[0].skipOffDays, false)

const saved = S.saveCustomLeave({ name: '产假', start: '2026-03-06', end: '2026-03-09', skipOffDays: true, color: '#41598A' })
eq('写入端保留 skipOffDays', saved.skipOffDays, true)

// ---------- D. 半天计法逐日 ----------
console.log('D. 半天计法逐日')
seed({ entries: { '2026-03-03': { am: 'company', pm: 'sick' } } })
eq('默认按半天：公司 0.5', statsOf().companyDays, 0.5)
eq('默认按半天：扣 0.5 分母', statsOf().deductibleLeave, 0.5)

seed({ entries: { '2026-03-03': { am: 'company', pm: 'sick' } }, settings: { halfFullDays: { '2026-03-03': true } } })
eq('按一天：公司 1', statsOf().companyDays, 1)
eq('按一天：不再扣分母', statsOf().deductibleLeave, 0)
eq('按一天：病假仍记 0.5', statsOf().sickDays, 0.5)

seed({
  entries: { '2026-03-03': { am: 'company', pm: 'sick' }, '2026-03-04': { am: 'company', pm: 'sick' } },
  settings: { halfFullDays: { '2026-03-03': true } }
})
eq('逐日只影响当天：另一天仍是 0.5', statsOf().companyDays, 1.5)
eq('逐日只影响当天：另一天仍扣 0.5', statsOf().deductibleLeave, 0.5)

seed({ entries: { '2026-03-03': { am: 'company', pm: 'sick' } }, settings: { halfFullDays: { '2026-03-03': false }, halfDayAttendance: 'full' } })
eq('显式 false 盖掉老全局 full', statsOf().companyDays, 0.5)
seed({ entries: { '2026-03-03': { am: 'company', pm: 'sick' } }, settings: { halfDayAttendance: 'full' } })
eq('无逐日记录时继承老全局 full', statsOf().companyDays, 1)

seed({ entries: { '2026-03-03': { am: 'company', pm: 'sick' } } })
eq('setHalfFullDay 写入', S.setHalfFullDay('2026-03-03', true), true)
eq('写入后按一天算', statsOf().companyDays, 1)
eq('isHalfDayAsFullAttendance 读回', S.isHalfDayAsFullAttendance('2026-03-03'), true)
eq('其它日期不受影响', S.isHalfDayAsFullAttendance('2026-03-04'), false)

// ---------- E. 统计页数据 ----------
console.log('E. 统计页数据')
seed({
  entries: { '2026-03-02': 'company', '2026-05-06': 'company' },
  overtime: { '2026-03-02': 3, '2026-05-06': 5.5 },
  leaves: [DAY_LEAVE, { id: 'r1', name: '婚假', color: '#C25B6E', start: '2026-03-06', end: '2026-03-09' }],
  settings: {}
})
store['wio_entries'] = JSON.stringify({ '2026-03-02': 'company', '2026-05-06': 'company', '2026-03-09': 'custom:d1' })
const annual = S.getAnnualStats(2026)
eq('月度加班小时（3 月）', annual.monthly[2].overtimeHours, 3)
eq('月度加班小时（5 月）', annual.monthly[4].overtimeHours, 5.5)
eq('全年加班合计', annual.overtimeHours, 8.5)
eq('自定义假期条目数', annual.customLeaves.length, 2)
const dayRow = annual.customLeaves.find(l => l.mode === 'day')
eq('按天假额度', dayRow.quota, 5)
eq('按天假已用（3-09 是周一）', dayRow.used, 1)
const rangeRow = annual.customLeaves.find(l => l.mode === 'range')
eq('区间假按工作日计', rangeRow.days, 2)

console.log(`\n${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
