// 假期安排（逐日差量）：settings.holidayPlan 只存与国务院安排不同的天，
// 裁决统一在 getPublicHoliday() 单点完成——统计/日历/分享卡自动同口径。
// 背景：不跟国务院安排的公司（国庆只放 1~5、6/7 上班）此前只能靠
// 方案甲逐日覆盖标记；现在配置一次全局生效。
// 运行：node .workbuddy/shared-check/holiday-plan.mjs
import fs from 'fs'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const root = 'D:/work/wio-mini'
const here = root + '/.workbuddy/shared-check'
const require = createRequire(import.meta.url)
const esbuild = require(root + '/node_modules/esbuild')

const store = {}
globalThis.uni = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: k => { delete store[k] },
  $emit: () => {}, $on: () => {}, $off: () => {},
  showToast() {}, showModal() {}
}

fs.writeFileSync(here + '/.holplan-entry.js',
  'export { default } from "' + root + '/utils/wioService.js"\n' +
  'export * from "' + root + '/utils/wioService.js"')
await esbuild.build({
  entryPoints: [here + '/.holplan-entry.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: here + '/.holplan-bundle.mjs', logLevel: 'silent'
})
const wio = await import(pathToFileURL(here + '/.holplan-bundle.mjs').href)
const svc = wio.default

let pass = 0, fail = 0
const ok = (cond, msg, extra) => {
  if (cond) pass++
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')) }
}
const reset = () => { for (const k of Object.keys(store)) delete store[k] }
const setPlan = plan => {
  const s = JSON.parse(store['wio_settings'] || '{}')
  s.holidayPlan = plan
  store['wio_settings'] = JSON.stringify(s)
}
const getPlan = () => (JSON.parse(store['wio_settings'] || '{}').holidayPlan || {})
// 逐日求和：某月按 isOfficialWorkingDay 计的工作日数（动态期望值用）
const monthWorkdays = (y, m) => {
  const last = new Date(y, m, 0).getDate()
  let n = 0
  for (let d = 1; d <= last; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (svc.isOfficialWorkingDay(new Date(ds + 'T00:00:00'))) n++
  }
  return n
}

// ---------- 1) 无差量 = 现状完全不变 ----------
{
  reset()
  const s = svc.getMonthStats(2026, 10)
  ok(s.workingDays === 17, '无差量时 10 月分母仍是 17（22 工作日 − 放假日落工作日的 5 天）', s.workingDays)
  ok(svc.isOfficialWorkingDay(new Date('2026-10-06T00:00:00')) === false, '10-6 国务院放假 → 非工作日')
  ok(svc.isOfficialWorkingDay(new Date('2026-10-10T00:00:00')) === false, '10-10 补班日但国庆未启用调休 → 非工作日（老口径）')
  ok(svc.isOfficialWorkingDay(new Date('2026-02-14T00:00:00')) === true, '春节补班日默认启用调休 → 工作日（老口径）')
  ok(Object.keys(getPlan()).length === 0, '默认差量为空')
}

// ---------- 2) 核心场景：公司国庆休 1~5、上班 6/7 ----------
{
  reset()
  setPlan({ '2026-10-06': 'work', '2026-10-07': 'work' })
  const s = svc.getMonthStats(2026, 10)
  ok(s.workingDays === 19, '差量生效：10-6/7 改上班，分母 17→19', s.workingDays)
  ok(svc.isOfficialWorkingDay(new Date('2026-10-06T00:00:00')) === true, 'isOfficialWorkingDay 认差量：10-6 是工作日')
  const h = svc.getPublicHoliday('2026-10-06')
  ok(h && h.isOffDay === false && h.name === '国庆节', 'getPublicHoliday 裁决后 isOffDay=false、保留 name', h)
  const h2 = svc.getPublicHoliday('2026-10-01')
  ok(h2 && h2.isOffDay === true, '未命中差量的日子仍按国务院原始安排', h2)

  // 上班标出勤：正常计入（不再是覆盖标记的特殊路径）
  svc.saveEntry('2026-10-06', 'company')
  const s2 = svc.getMonthStats(2026, 10)
  ok(s2.companyDays === 1, '10-6 出勤计公司天数（工作日口径，无需覆盖标记）', s2.companyDays)
  ok(s2.workingDays === 19, '分母不变', s2.workingDays)
  const r = svc.getMonthlyReport(2026, 10)
  ok(r.rate === 5, '分享卡率按新分母：1/19 → 5%', r.rate)
}

// ---------- 3) 补班日改休：差量 'off' 覆盖 compOffRules ----------
{
  reset()
  const baseFeb = monthWorkdays(2026, 2)
  setPlan({ '2026-02-14': 'off', '2026-02-28': 'off' })
  ok(monthWorkdays(2026, 2) === baseFeb - 2,
    '春节两个补班日改休：差量优先于 compOffRules，2 月分母 −2',
    { baseFeb, now: monthWorkdays(2026, 2) })
  ok(svc.isOfficialWorkingDay(new Date('2026-02-14T00:00:00')) === false, '2026-02-14 不再是工作日')

  // 而国庆的补班日标 'work'：本来 rules 未启用、标 work 后计入
  setPlan({ '2026-10-10': 'work' })
  ok(svc.isOfficialWorkingDay(new Date('2026-10-10T00:00:00')) === true, '10-10 标上班 → 工作日（差量优先于未启用的 rules）')
}

// ---------- 4) getNextHoliday 认差量 ----------
{
  reset()
  const h0 = svc.getNextHoliday('2026-09-30')
  ok(h0 && h0.date === '2026-10-01', '默认：9-30 起下个假期是 10-1', h0)
  setPlan({ '2026-10-01': 'work', '2026-10-02': 'work' })
  const h1 = svc.getNextHoliday('2026-09-30')
  ok(h1 && h1.date === '2026-10-03', '10-1/10-2 改上班后，下个假期顺延到 10-3', h1)
}

// ---------- 5) toggleHolidayPlanDate：切换 / 回默认即删差量 ----------
{
  reset()
  // 10-6 国务院休 → 切一次变上班
  ok(svc.toggleHolidayPlanDate('2026-10-06') === 'work', '放假日切一次 → work')
  ok(getPlan()['2026-10-06'] === 'work', '差量已写入')
  // 再切一次回到默认 → 差量条目删除
  ok(svc.toggleHolidayPlanDate('2026-10-06') === null, '再切回默认 → 返回 null')
  ok(!('2026-10-06' in getPlan()), '回到默认不留差量（国务院数据更新不会被旧配置钉死）')
  // 春节补班日 2-14 默认上班 → 切一次变休
  ok(svc.toggleHolidayPlanDate('2026-02-14') === 'off', '补班日切一次 → off')
  // 非法定安排日不可切
  ok(svc.toggleHolidayPlanDate('2026-10-14') === null, '普通日切不动')
  ok(!('2026-10-14' in getPlan()), '普通日不产生差量')
}

// ---------- 6) getHolidayPlanDays / changedCount：条带数据源 ----------
{
  reset()
  setPlan({ '2026-10-06': 'work', '2026-10-07': 'work', '2026-10-10': 'off' })
  const strip = svc.getHolidayPlanDays('国庆节')
  ok(strip.length === 9, '国庆节条带 9 天（9-20 + 10-1~7 + 10-10），默认只取当前年', strip.length)
  ok(strip[0].date === '2026-09-20' && strip[strip.length - 1].date === '2026-10-10', '按日期升序')
  const byDate = Object.fromEntries(strip.map(d => [d.date, d]))
  ok(byDate['2026-10-06'].isOff === false && byDate['2026-10-06'].changed === true, '10-6 上班且 changed')
  ok(byDate['2026-10-01'].isOff === true && byDate['2026-10-01'].changed === false, '10-1 休且未改')
  ok(byDate['2026-10-10'].isOff === true && byDate['2026-10-10'].changed === true,
    '10-10 标 off：有效状态=休、相对国务院原始补班日（isOffDay=false）是真实差量 → changed')
  ok(svc.getHolidayPlanChangedCount('国庆节') === 3, '已调整天数 = 3', svc.getHolidayPlanChangedCount('国庆节'))
  ok(svc.getHolidayPlanChangedCount('春节') === 0, '未动过的节日 changedCount = 0')
  ok(strip.every(d => typeof d.wd === 'number' && d.weekday.length === 1), '条带带星期信息（UI 层做多语言）')
  // 显式传年份：2027 的同名节日
  const s27 = svc.getHolidayPlanDays('国庆节', 2027)
  ok(s27.length === 9 && s27[0].date === '2027-09-26', '2027 国庆条带独立（9-26 补班 + 10-1~7 + 10-9）',
    s27.map(d => d.date))
}

// ---------- 7) resetHolidayPlan：按节日重置 / 全部重置 ----------
{
  reset()
  setPlan({ '2026-10-06': 'work', '2026-10-07': 'work', '2026-02-14': 'off' })
  svc.resetHolidayPlan('国庆节')
  ok(!('2026-10-06' in getPlan()) && !('2026-10-07' in getPlan()), '按节日重置清掉国庆差量')
  ok(getPlan()['2026-02-14'] === 'off', '春节差量保留')
  svc.resetHolidayPlan()
  ok(Object.keys(getPlan()).length === 0, '全部重置清空')
}

// ---------- 8) 与方案甲覆盖标记共存 ----------
{
  reset()
  setPlan({ '2026-10-06': 'work' })           // 差量：10-6 是工作日
  svc.saveEntry('2026-10-07', 'vacation')      // 方案甲：10-7（国务院休）标年假 → 覆盖生效
  const s = svc.getMonthStats(2026, 10)
  ok(s.workingDays === 19, '差量 +1（10-6）与覆盖 +1（10-7）互不干扰 → 19', s.workingDays)
  ok(s.vacationDays === 1, '10-7 年假照常计入', s.vacationDays)
  // 差量已把 10-6 变成工作日：上面的 vacation 标记若落在 10-6 就只是普通工作日请假
  svc.saveEntry('2026-10-06', 'vacation')
  const s2 = svc.getMonthStats(2026, 10)
  ok(s2.workingDays === 19, '10-6 已是工作日：标年假走正常口径，分母不变', s2.workingDays)
  ok(s2.vacationDays === 2, '两天年假都计入', s2.vacationDays)
}

// ---------- 9) 脏值归一 ----------
{
  reset()
  store['wio_settings'] = JSON.stringify({ holidayPlan: ['bad'], targetPercentage: 40 })
  ok(Object.keys(svc.getSettings().holidayPlan).length === 0, '数组脏值归一成空对象')
  store['wio_settings'] = JSON.stringify({ holidayPlan: null })
  ok(svc.getSettings().holidayPlan && typeof svc.getSettings().holidayPlan === 'object', 'null 归一成空对象')
}

// ---------- 10) 2027 数据同口径 ----------
{
  reset()
  setPlan({ '2027-10-06': 'work', '2027-10-07': 'work' })
  ok(svc.isOfficialWorkingDay(new Date('2027-10-06T00:00:00')) === true, '2027 国庆差量同样生效')
  const s = svc.getMonthStats(2027, 10)
  ok(s.workingDays === monthWorkdays(2027, 10), '2027-10 分母与逐日求和一致', s.workingDays)
}

console.log(`\nholiday-plan: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
