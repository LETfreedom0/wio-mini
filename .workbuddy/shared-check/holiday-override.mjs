// 法定放假日上的显式标记 = 用户覆盖（方案甲，无弹窗）：标记即生效，以标记为准
// 背景：不跟国务院安排的公司（国庆只放 1~5、6/7 上班）在这天标年假，
// 旧口径全部落进 weekendLeaves——日历说「你休了」、统计说「没这回事」。
// 运行：node .workbuddy/shared-check/holiday-override.mjs
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

fs.writeFileSync(here + '/.holov-entry.js',
  'export { default } from "' + root + '/utils/wioService.js"\n' +
  'export * from "' + root + '/utils/wioService.js"')
await esbuild.build({
  entryPoints: [here + '/.holov-entry.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: here + '/.holov-bundle.mjs', logLevel: 'silent'
})
const wio = await import(pathToFileURL(here + '/.holov-bundle.mjs').href)
const svc = wio.default
const { isOffDayOverride } = wio

let pass = 0, fail = 0
const ok = (cond, msg, extra) => {
  if (cond) pass++
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')) }
}
const reset = () => { for (const k of Object.keys(store)) delete store[k] }

// ---------- 1) 主场景：2026 国庆，公司休 1~5、上班 6/7 ----------
// 官方：休 1~7、补班 9-20 / 10-10；compOffRules 国庆默认关 → 两个补班日都是普通周末
{
  reset()
  svc.saveEntry('2026-10-06', 'vacation')                          // 覆盖：整天天假
  svc.saveEntry('2026-10-07', { am: 'company', pm: 'vacation' })   // 覆盖：半天出勤半天假
  svc.saveEntry('2026-10-14', 'company')                           // 普通工作日出勤
  svc.saveEntry('2026-10-17', 'vacation')                          // 周六标假 → 不计数
  svc.saveEntry('2026-10-10', 'vacation')                          // 官方补班日但开关关 → 不计数

  const s = svc.getMonthStats(2026, 10)
  // 基础工作日：10 月 22 个工作日 − 放假日落工作日的 5 天（1/2/5/6/7）= 17，+ 覆盖 2 天
  ok(s.workingDays === 19, '分母 = 基础 17 + 覆盖 2 = 19', s.workingDays)
  ok(s.companyDays === 1.5, '公司天数 = 10-14 整天 + 10-7 半天 = 1.5', s.companyDays)
  ok(s.vacationDays === 1.5, '年假计入 10-6 整天 + 10-7 半天 = 1.5', s.vacationDays)
  ok(s.deductibleLeave === 1.5, '分母扣减与年假一致', s.deductibleLeave)
  ok(s.weekendLeaves === 2, '周六(10-17)与未启用补班的 10-10 仍落 weekendLeaves', s.weekendLeaves)
  ok(svc.getYearStats(2026).vacationDaysUsed === 1.5, '年度已用年额与月统计同口径',
    svc.getYearStats(2026).vacationDaysUsed)
}

// ---------- 2) 无标记的假期 = 老口径完全不变 ----------
{
  reset()
  const s = svc.getMonthStats(2026, 10)
  ok(s.workingDays === 17, '没有任何标记时 10 月分母仍是 17', s.workingDays)
  ok(s.vacationDays === 0, '不会凭空多出假期', s.vacationDays)

  // 清除覆盖标记后恢复假日口径
  svc.saveEntry('2026-10-06', 'vacation')
  svc.saveEntry('2026-10-06', null)
  const s2 = svc.getMonthStats(2026, 10)
  ok(s2.workingDays === 17, '清掉标记立即恢复假日口径（覆盖可逆）', s2.workingDays)
}

// ---------- 3) isOffDayOverride 纯函数边界 ----------
{
  ok(isOffDayOverride(null, 'vacation') === false, '非节假日不触发')
  ok(isOffDayOverride({ name: '国庆节', date: '2026-10-06', isOffDay: false }, 'company') === false,
    '调休上班日（isOffDay=false）不触发——它本来就是工作日')
  ok(isOffDayOverride({ name: '国庆节', date: '2026-10-06', isOffDay: true }, null) === false, '无标记不触发')
  ok(isOffDayOverride({ name: '国庆节', date: '2026-10-06', isOffDay: true }, 'vacation') === true,
    '老的单状态写法可触发')
  ok(isOffDayOverride({ name: '国庆节', date: '2026-10-06', isOffDay: true }, { am: 'company', pm: null }) === true,
    '半天标记即可触发')
  ok(isOffDayOverride({ name: '国庆节', date: '2026-10-06', isOffDay: true }, { am: null, pm: null }) === false,
    '空两段不触发')
}

// ---------- 4) PRO 场景：customMarks 不覆盖、区间假优先、自定义段覆盖 ----------
{
  reset()
  // 伪造 PRO：权益唯一来源 wio_auth.subscription
  store['wio_auth'] = JSON.stringify({ user: { openid: 'ov_test' }, subscription: { plan: 'month', expiresAt: Date.now() + 30 * 86400000 } })
  // 按天自定义标记落在法定放假日：不触发覆盖
  store['wio_settings'] = JSON.stringify({
    customLeaves: [
      { id: 'cl_day', name: '调休额度', mode: 'day', quota: 3, color: '#0E6E62' },
      { id: 'cl_rng', name: '假期一天', mode: 'range', start: '2026-10-06', end: '2026-10-06', color: '#A9761F' }
    ],
    customMarks: { '2026-10-06': { id: 'cl_day', part: 'full' } }
  })
  // 区间假盖住 10-6，底下残留出勤标记：整天占用优先，不触发覆盖
  svc.saveEntry('2026-10-06', 'vacation')

  const s = svc.getMonthStats(2026, 10)
  ok(s.workingDays === 17, 'customMarks 与残留标记都不触发覆盖，分母不变', s.workingDays)
  ok(s.weekendLeaves === 1, '10-6 落 weekendLeaves（区间假整天占用优先）', s.weekendLeaves)
  ok(s.customLeaveDays === 0, '区间假只盖放假日，一个工作日都不扣', s.customLeaveDays)

  // 区间假落在工作日：语义不变（与覆盖无关）
  store['wio_settings'] = JSON.stringify({
    customLeaves: [
      { id: 'cl_day', name: '调休额度', mode: 'day', quota: 3, color: '#0E6E62' },
      { id: 'cl_rng', name: '连休两天', mode: 'range', start: '2026-10-13', end: '2026-10-14', color: '#A9761F' }
    ]
  })
  const s0 = svc.getMonthStats(2026, 10)
  ok(s0.customLeaveDays === 2, '区间假在工作日照常扣 2 天（口径未动）', s0.customLeaveDays)

  // 自定义段 entries 覆盖：上午公司 + 下午自定义假，落在法定放假日 → 覆盖生效
  store['wio_settings'] = JSON.stringify({
    customLeaves: [{ id: 'cl_day', name: '调休额度', mode: 'day', quota: 3, color: '#0E6E62' }]
  })
  svc.saveEntry('2026-10-06', { am: 'company', pm: 'custom:cl_day' })
  const s2 = svc.getMonthStats(2026, 10)
  ok(s2.workingDays === 18, '自定义段标记同样触发覆盖，分母 +1', s2.workingDays)
  ok(s2.companyDays === 0.5, '上午出勤计 0.5', s2.companyDays)
  ok(s2.customLeaveDays === 0.5, '下午自定义假计 0.5', s2.customLeaveDays)
  const u = svc.getCustomLeaveUsage('cl_day')
  ok(u.used === 0.5, 'getCustomLeaveUsage 与月统计同口径（覆盖日计入额度）', u.used)
}

// ---------- 5) 覆盖日标出勤：计公司天数、进分母、进分享卡率 ----------
{
  reset()
  svc.saveEntry('2026-10-06', 'company')
  svc.saveEntry('2026-10-07', 'company')
  const s = svc.getMonthStats(2026, 10)
  ok(s.workingDays === 19, '两天都覆盖，分母 17→19', s.workingDays)
  ok(s.companyDays === 2, '出勤计入公司天数', s.companyDays)
  const r = svc.getMonthlyReport(2026, 10)
  ok(r.rate === 11, '分享卡 / 首页率卡按新分母算：2/19 → 11%', r.rate)
}

console.log(`\nholiday-override: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
