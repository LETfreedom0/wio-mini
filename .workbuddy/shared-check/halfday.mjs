// 半天记录模型离线校验
// 运行：node .workbuddy/shared-check/halfday.mjs
//
// 四组断言：
//  A. 存储规整（老字符串兼容 / am===pm 规整为字符串 / 清除）
//  B. 单日折算（半天出勤开关 half / full 两种口径）
//  C. 月度端到端 + 与改动前版本的回归对比（无半天数据时结果必须完全一致）
//  D. 分享卡在小数天数下的展示
//
// 注：utils/ 下的副本需从项目根目录同步：
//   cp utils/{wioService,shareCard,shareCardArt,locales}.js .workbuddy/shared-check/utils/

import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

// 回归对比的基准写死为「半天功能上线前的最后一个提交」，不随 HEAD 漂移。
// 本地副本缺失时自动从 git 取，保证脚本换台机器也能跑。
const BASE_COMMIT = 'a4a29cc'
const oldFile = fileURLToPath(new URL('./utils/wioServiceOld.js', import.meta.url))
const rootDir = fileURLToPath(new URL('../../', import.meta.url))
if (!fs.existsSync(oldFile)) {
  fs.writeFileSync(oldFile, execSync(`git show ${BASE_COMMIT}:utils/wioService.js`, { cwd: rootDir }))
}

const store = {}
globalThis.uni = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: k => { delete store[k] },
  $emit: () => {},
  $on: () => {}
}

const S = await import('./utils/wioService.js')
const OLD = (await import('./utils/wioServiceOld.js')).default

let pass = 0
let fail = 0
function eq(label, actual, expect) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expect)
  if (a === e) { pass++; return }
  fail++
  console.log(`  ✗ ${label}\n      实际 ${a}\n      期望 ${e}`)
}
function near(label, actual, expect) {
  if (Math.abs(actual - expect) < 1e-9) { pass++; return }
  fail++
  console.log(`  ✗ ${label}\n      实际 ${actual}\n      期望 ${expect}`)
}

// ---------- A. 存储规整 ----------
console.log('A. 存储规整')
eq('老字符串 → 两段相同', S.parseDayParts('company'), { am: 'company', pm: 'company' })
eq('对象原样', S.parseDayParts({ am: 'company', pm: 'vacation' }), { am: 'company', pm: 'vacation' })
eq('空值', S.parseDayParts(null), { am: null, pm: null })
eq('两段相同 → 字符串', S.packDayParts('home', 'home'), 'home')
eq('两段不同 → 对象', S.packDayParts('company', 'vacation'), { am: 'company', pm: 'vacation' })
eq('全空 → null（等于清除）', S.packDayParts(null, null), null)
eq('单段保留', S.packDayParts('vacation', null), { am: 'vacation', pm: null })
eq('isSplitDay 整天=false', S.isSplitDay('company'), false)
eq('isSplitDay 半天=true', S.isSplitDay({ am: 'company', pm: 'vacation' }), true)

// ---------- B. 单日折算 ----------
console.log('B. 单日折算（half = 按半天，full = 视同一整天）')
const day = (raw, asFull) => S.evaluateDayParts(raw, { halfDayAsFull: !!asFull, isWorkingDay: true })
const pick = o => ({ c: o.company, h: o.home, d: o.deductible, lv: o.leaveTotal })

eq('整天公司 half', pick(day('company', false)), { c: 1, h: 0, d: 0, lv: 0 })
eq('整天公司 full', pick(day('company', true)), { c: 1, h: 0, d: 0, lv: 0 })
eq('上午公司+下午年假 half', pick(day({ am: 'company', pm: 'vacation' }, false)), { c: 0.5, h: 0, d: 0.5, lv: 0.5 })
eq('上午公司+下午年假 full', pick(day({ am: 'company', pm: 'vacation' }, true)), { c: 1, h: 0, d: 0, lv: 0.5 })
eq('上午年假+下午公司 full', pick(day({ am: 'vacation', pm: 'company' }, true)), { c: 1, h: 0, d: 0, lv: 0.5 })
eq('上午公司+下午居家 half', pick(day({ am: 'company', pm: 'home' }, false)), { c: 0.5, h: 0.5, d: 0, lv: 0 })
eq('上午公司+下午居家 full', pick(day({ am: 'company', pm: 'home' }, true)), { c: 1, h: 0.5, d: 0, lv: 0 })
eq('上午公司+下午未记录 full', pick(day({ am: 'company', pm: null }, true)), { c: 1, h: 0, d: 0, lv: 0 })
eq('整天年假（与开关无关）', pick(day('vacation', true)), { c: 0, h: 0, d: 1, lv: 1 })
eq('半天病假单独计 0.5', pick(day({ am: 'sick', pm: 'company' }, false)), { c: 0.5, h: 0, d: 0.5, lv: 0.5 })
// 非工作日：假期不扣分母，走 weekendLeave
const we = S.evaluateDayParts('vacation', { halfDayAsFull: false, isWorkingDay: false })
eq('非工作日假期不扣分母', { d: we.deductible, w: we.weekendLeave, lv: we.leaveTotal }, { d: 0, w: 1, lv: 1 })

// ---------- C1. 月度口径 ----------
console.log('C1. 月度口径（20 个工作日：10 天半天出勤+半天年假，5 天整天年假，5 天未记录）')
function monthStats(days, asFull) {
  // 复刻 getMonthStats 的逐日累加，只保留与率相关的字段
  let workingDays = 0, company = 0, home = 0, leave = 0, deductible = 0, weekendLeaves = 0
  days.forEach(d => {
    const ev = S.evaluateDayParts(d.raw, { halfDayAsFull: asFull, isWorkingDay: d.work })
    if (d.work) workingDays++
    company += ev.company
    home += ev.home
    leave += ev.leaveTotal
    deductible += ev.deductible
    weekendLeaves += ev.weekendLeave
  })
  return S.computeMonthlyReport(
    { workingDays, companyDays: company, homeDays: home, vacationDays: leave, weekendLeaves, deductibleLeave: deductible },
    50
  )
}
const days = []
for (let i = 0; i < 10; i++) days.push({ raw: { am: 'company', pm: 'vacation' }, work: true })
for (let i = 0; i < 5; i++) days.push({ raw: 'vacation', work: true })
for (let i = 0; i < 5; i++) days.push({ raw: null, work: true })

const half = monthStats(days, false)
eq('half：公司 5 天', half.company, 5)
near('half：分母 10（20 − 10 天假）', half.denominator, 10)
eq('half：率 50%', half.rate, 50)

const full = monthStats(days, true)
eq('full：公司 10 天', full.company, 10)
near('full：分母 15（整天假那 5 天才扣）', full.denominator, 15)
eq('full：率 67%', full.rate, 67)
// 关键：两种口径下率都不允许超过 100%
console.log(`  · half 率 ${half.rate}% / full 率 ${full.rate}%（均 ≤ 100%）`)
if (half.rate > 100 || full.rate > 100) { fail++; console.log('  ✗ 率超过 100%') } else pass++

// ---------- C2. 与改动前版本的回归对比 ----------
console.log('C2. 回归对比（无半天数据时，新旧实现必须逐字段一致）')
const STATUS = ['company', 'home', 'vacation', 'sick', 'birthday', 'unpaid', 'comp_off', 'exclude_wio']
const cases = []
// 1) 空数据
cases.push({})
// 2) 全月随机整天标记（用 2026-11，逐日确定性伪随机）
const seedDays = new Date(2026, 10, 0).getDate()
for (let round = 0; round < 6; round++) {
  const e = {}
  for (let d = 1; d <= seedDays; d++) {
    const r = (d * 7 + round * 13) % 11
    if (r < 6) e[`2026-11-${String(d).padStart(2, '0')}`] = STATUS[(d + round) % STATUS.length]
  }
  cases.push(e)
}
// 3) 周末/非工作日标记假期（验证 weekendLeaves 口径未回归）
cases.push({ '2026-11-07': 'vacation', '2026-11-08': 'sick', '2026-11-01': 'company' })

const FIELDS = ['companyDays', 'homeDays', 'vacationDays', 'birthdayDays', 'sickDays', 'unpaidDays',
  'compOffDays', 'publicDays', 'excludeWioDays', 'customLeaveDays', 'weekendLeaves',
  'totalRecorded', 'workingDays', 'totalOvertime']

cases.forEach((entries, i) => {
  store.wio_entries = JSON.stringify(entries)
  store.wio_settings = JSON.stringify({ targetPercentage: 40, halfDayAttendance: 'half' })
  const nw = S.default.getMonthStats(2026, 11)
  const od = OLD.getMonthStats(2026, 11)
  eq(`case${i} 月度统计一致`, FIELDS.map(f => nw[f]), FIELDS.map(f => od[f]))
  eq(`case${i} 展示口径一致`,
    S.computeMonthlyReport(nw, 40),
    S.computeMonthlyReport(od, 40))
  const ny = S.default.getYearStats(2026)
  const oy = OLD.getYearStats(2026)
  eq(`case${i} 年度假期一致`, [ny.vacationDaysUsed, ny.birthdayDaysUsed, ny.sickDaysUsed],
    [oy.vacationDaysUsed, oy.birthdayDaysUsed, oy.sickDaysUsed])
})

// ---------- C3. 半天数据的端到端 ----------
console.log('C3. 半天数据端到端（getMonthStats 真实调用）')
const mixed = {
  '2026-11-02': { am: 'company', pm: 'vacation' }, // 周一
  '2026-11-03': { am: 'vacation', pm: 'company' }, // 周二
  '2026-11-04': 'company',                          // 周三
  '2026-11-05': { am: 'company', pm: 'home' },      // 周四
  '2026-11-06': { am: 'vacation', pm: 'vacation' }  // 周五（两段相同，应规整为字符串）
}
store.wio_entries = JSON.stringify(mixed)
store.wio_settings = JSON.stringify({ targetPercentage: 40, halfDayAttendance: 'half' })
const s1 = S.default.getMonthStats(2026, 11)
eq('half：公司 2.5 天（0.5+0.5+1+0.5）', s1.companyDays, 2.5)
eq('half：居家 0.5 天', s1.homeDays, 0.5)
eq('half：年假 2 天（0.5+0.5+1）', s1.vacationDays, 2)
near('half：分母扣减 2', s1.deductibleLeave, 2)
eq('half：记录天数 5（半天也算一天记录）', s1.totalRecorded, 5)
eq('half：工作日 21（2026-11 全月）', s1.workingDays, 21)
eq('half：年度年假 2 天', S.default.getYearStats(2026).vacationDaysUsed, 2)
const r1 = S.computeMonthlyReport(s1, 40)
eq('half：率 13%（2.5 / (21−2)）', r1.rate, 13)

// 会员闸门：开关存了 'full'，但非会员读取要降级
store.wio_settings = JSON.stringify({ targetPercentage: 40, halfDayAttendance: 'full' })
delete store.wio_auth
eq('非会员读取降级为 half', S.default.getHalfDayAttendanceMode(), 'half')
eq('降级后仍按半天算（公司 2.5）', S.default.getMonthStats(2026, 11).companyDays, 2.5)

// mock 一个有效会员 → 开关生效，走完整统计链路
store.wio_auth = JSON.stringify({
  user: { openid: 'test-openid' },
  subscription: { plan: 'month', expiresAt: Date.now() + 86400000 }
})
eq('会员读取保留 full', S.default.getHalfDayAttendanceMode(), 'full')
const sFullStats = S.default.getMonthStats(2026, 11)
eq('full：公司 4 天（半天出勤各算 1 天）', sFullStats.companyDays, 4)
near('full：分母扣减 1（只剩整天假）', sFullStats.deductibleLeave, 1)
eq('full：居家仍按 0.5（不受开关影响）', sFullStats.homeDays, 0.5)
eq('full：年假仍按 0.5 折算（2 天）', sFullStats.vacationDays, 2)
const r2 = S.computeMonthlyReport(sFullStats, 40)
eq('full：率 20%（4 / (21−1)）', r2.rate, 20)
if (r2.rate > 100) { fail++; console.log('  ✗ full 口径率超过 100%：', r2.rate) } else pass++
// 会员过期后：已标的半天数据照常参与统计，只是口径回落半天
store.wio_auth = JSON.stringify({
  user: { openid: 'test-openid' },
  subscription: { plan: 'month', expiresAt: Date.now() - 86400000 }
})
eq('过期后口径回落 half', S.default.getHalfDayAttendanceMode(), 'half')
eq('过期后半天数据仍在（公司 2.5）', S.default.getMonthStats(2026, 11).companyDays, 2.5)
delete store.wio_auth

// ---------- C4. 写入闸门（会员 / 假期额度） ----------
console.log('C4. 写入闸门')
delete store.wio_auth
store.wio_settings = JSON.stringify({ targetPercentage: 40, vacationDays: 20, sickDays: 12 })
store.wio_entries = JSON.stringify({})
eq('非会员：整天标记免费放行', S.default.saveDayParts('2026-11-09', 'company', 'company'), true)
eq('非会员：拆半天被拦', S.default.saveDayParts('2026-11-09', 'company', 'vacation'), false)
eq('拦截后原数据未被改动', S.default.getDayParts('2026-11-09'), { am: 'company', pm: 'company' })

store.wio_auth = JSON.stringify({
  user: { openid: 'test-openid' },
  subscription: { plan: 'month', expiresAt: Date.now() + 86400000 }
})
eq('会员：拆半天放行', S.default.saveDayParts('2026-11-09', 'company', 'vacation'), true)
eq('会员：存成对象', S.default.getEntries()['2026-11-09'], { am: 'company', pm: 'vacation' })
eq('会员：顺手改回整天 → 规整为字符串', S.default.saveDayParts('2026-11-09', 'home', 'home') && S.default.getEntries()['2026-11-09'], 'home')
eq('清除：两段都空 → 删除记录', S.default.saveDayParts('2026-11-09', null, null) && (S.default.getEntries()['2026-11-09'] === undefined), true)

// 假期额度：年假 1 天
store.wio_entries = JSON.stringify({})
store.wio_settings = JSON.stringify({ targetPercentage: 40, vacationDays: 1, sickDays: 12 })
eq('额度内：整天年假放行', S.default.saveDayParts('2026-11-10', 'vacation', 'vacation'), true)
eq('额度满：再标整天年假被拦', S.default.saveDayParts('2026-11-11', 'vacation', 'vacation'), false)
eq('额度满：改已有那天为半天（占用减少）放行', S.default.saveDayParts('2026-11-10', 'vacation', 'company'), true)
eq('半天占 0.5 后剩 0.5：再标半天年假放行', S.default.saveDayParts('2026-11-11', 'vacation', 'company'), true)
eq('半天占满：再标半天年假被拦', S.default.saveDayParts('2026-11-12', 'vacation', 'company'), false)
delete store.wio_auth

// CSV 半天输出（恢复 mixed 数据）
store.wio_entries = JSON.stringify(mixed)
const csv = S.default.buildYearCsv(2026).split('\n').filter(l => l.indexOf('2026-11-02') === 0)[0]
console.log(`  · CSV 半天行：${csv}`)
if (csv && csv.indexOf('上午') !== -1 && csv.indexOf('下午') !== -1) pass++
else { fail++; console.log('  ✗ CSV 未标注上下午') }

// ---------- D. 分享卡（半天数据） ----------
console.log('D. 分享卡（半天数据的展示）')
const { buildShareModel } = await import('./utils/shareCard.js')
const mkModel = (mode) => {
  store.wio_entries = JSON.stringify(mixed)
  store.wio_settings = JSON.stringify({ targetPercentage: 40, halfDayAttendance: mode })
  store.wio_auth = mode === 'full'
    ? JSON.stringify({ user: { openid: 'o' }, subscription: { plan: 'month', expiresAt: Date.now() + 86400000 } })
    : ''
  return buildShareModel('zh-CN', 2026, 11)
}
for (const mode of ['half', 'full']) {
  const mo = mkModel(mode)
  const vals = mo.cols.map(c => c.value)
  console.log(`  · ${mode}：${mo.cols.map(c => `${c.label} ${c.value}${c.unit}`).join(' / ')}`)
  eq(`${mode}：列值无 NaN / undefined`, vals.every(v => v !== 'NaN' && v !== 'undefined' && v !== 'null'), true)
  eq(`${mode}：列值不含浮点尾巴`, vals.every(v => /^\d+(\.5)?$/.test(String(v))), true)
  eq(`${mode}：构成条四段非负`, mo.bar.length === 4 && mo.bar.every(b => b.days >= 0), true)
  eq(`${mode}：率在 0~100`, mo.rate >= 0 && mo.rate <= 100, true)
}
// 英文版同样校验一遍，避免文案里出现空占位
const moEn = (() => {
  store.wio_settings = JSON.stringify({ targetPercentage: 40, halfDayAttendance: 'half' })
  store.wio_auth = ''
  return buildShareModel('en-US', 2026, 11)
})()
eq('英文版列值正常', moEn.cols.every(c => /^\d+(\.5)?$/.test(String(c.value))), true)
eq('英文版标题无未替换占位', moEn.title.indexOf('{') === -1, true)
delete store.wio_auth

// ---------- E. 设置回写保护 ----------
console.log('E. 设置回写保护（非会员保存其它设置时不得抹掉 full）')
store.wio_settings = JSON.stringify({ targetPercentage: 40, halfDayAttendance: 'full' })
store.wio_auth = ''
const degraded = S.default.getSettings()
eq('E1 非会员读取降级为 half', degraded.halfDayAttendance, 'half')
S.default.saveSettings(Object.assign({}, degraded, { targetPercentage: 45 }))
eq('E2 存储里仍保留 full', JSON.parse(store.wio_settings).halfDayAttendance, 'full')
eq('E3 目标比例确实写入', JSON.parse(store.wio_settings).targetPercentage, 45)
eq('E4 重新开通后读回 full', S.default.getHalfDayAttendanceMode(), 'half') // 仍非会员，读的是降级值
store.wio_auth = JSON.stringify({ user: { openid: 'o' }, subscription: { plan: 'month', expiresAt: Date.now() + 86400000 } })
eq('E5 会员态读回 full', S.default.getHalfDayAttendanceMode(), 'full')
delete store.wio_auth

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
