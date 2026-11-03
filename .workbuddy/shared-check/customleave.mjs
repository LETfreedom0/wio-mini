// 自定义假期「按天取用」离线校验
// 运行：node .workbuddy/shared-check/customleave.mjs
//
// 九组断言：
//  A. 记录规整（老数据无 mode 默认 range / 脏数据丢弃 / 额度与规则默认值）
//  B. 区间命中（range 只认区间；day 绝不被当成整段休假）
//  C. 按天标记存储（写入 / 半天 / 清除 / 老字符串兼容 / 不能标到 range 假期上）
//  D. 额度用量（yearly vs total / 半天 0.5 / 不限额度 / 超额）
//  E. 月度统计端到端（range + day full + day 半天 + 周末 + entries 优先）
//  F. 删除假期连带清理标记 + 与改动前版本的回归对比
//  G. 表单日期条与扣减天数
//  H. 色板一致性（12 色去重 / 格式 / 预设色回落）
//  I. 半天额度（0.5 额度存得住 / 半天按 0.5 扣 / 额度 0 = 不限 / 1.5 额度）
//
// 注：utils/ 下的副本需从项目根目录同步：
//   cp utils/wioService.js .workbuddy/shared-check/utils/

import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const BASE_COMMIT = 'HEAD'
// 每次都强制重取：这个文件名与 halfday.mjs 用的 Old 副本不同，
// 若复用会被上一次的基准占坑，导致回归对比静默失效
const oldFile = fileURLToPath(new URL('./utils/wioServicePrev.js', import.meta.url))
const rootDir = fileURLToPath(new URL('../../', import.meta.url))
fs.writeFileSync(oldFile, execSync(`git show ${BASE_COMMIT}:utils/wioService.js`, { cwd: rootDir }))

const store = {}
globalThis.uni = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: k => { delete store[k] },
  $emit: () => {},
  $on: () => {}
}

const mod = await import('./utils/wioService.js')
const S = mod.default
const buildWeekStrip = mod.buildWeekStrip
const OLD = (await import('./utils/wioServicePrev.js')).default

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

// PRO 权益：trial 未过期即视为会员
const FUTURE = Date.now() + 86400000 * 30
store['wio_pro_trial'] = JSON.stringify({ expiresAt: FUTURE })

/** 直接铺一份 settings + entries，绕开 save 路径做题设 */
function seed({ leaves = [], marks = {}, entries = {}, settings = {} } = {}) {
  Object.keys(store).forEach(k => { if (k !== 'wio_pro_trial') delete store[k] })
  store['wio_pro_trial'] = JSON.stringify({ expiresAt: FUTURE })
  store['wio_settings'] = JSON.stringify({
    language: 'zh-CN',
    targetPercentage: 40,
    customLeaves: leaves,
    customMarks: marks,
    ...settings
  })
  store['wio_entries'] = JSON.stringify(entries)
}

const RANGE_LEAVE = { id: 'r1', name: '婚假', color: '#C25B6E', start: '2026-03-02', end: '2026-03-08' }
const DAY_LEAVE = { id: 'd1', name: '关爱假', color: '#A93B78', mode: 'day', quota: 5, quotaRule: 'yearly' }

// ---------- A. 记录规整 ----------
console.log('A. 记录规整')
seed({ leaves: [RANGE_LEAVE] })
eq('老数据无 mode → range', S.getCustomLeaves()[0].mode, 'range')
eq('range 保留起止', [S.getCustomLeaves()[0].start, S.getCustomLeaves()[0].end], ['2026-03-02', '2026-03-08'])

seed({ leaves: [{ id: 'x', name: '缺日期' }] })
eq('range 缺日期 → 丢弃', S.getCustomLeaves().length, 0)

seed({ leaves: [{ id: 'x', name: '倒序', start: '2026-03-08', end: '2026-03-02' }] })
eq('range 起止倒序 → 丢弃', S.getCustomLeaves().length, 0)

seed({ leaves: [{ id: 'd2', name: '无额度', mode: 'day' }] })
const d2 = S.getCustomLeaves()[0]
eq('day 无额度 → 0（不限）', d2.quota, 0)
eq('day 无规则 → yearly', d2.quotaRule, 'yearly')

seed({ leaves: [{ id: 'd3', name: '怪额度', mode: 'day', quota: -3, quotaRule: 'weird' }] })
eq('day 负额度 → 0', S.getCustomLeaves()[0].quota, 0)
eq('day 非法规则 → yearly', S.getCustomLeaves()[0].quotaRule, 'yearly')

seed({ leaves: [{ id: 'd4', name: '总量', mode: 'day', quota: 3, quotaRule: 'total' }] })
eq('day total 规则保留', S.getCustomLeaves()[0].quotaRule, 'total')

// ---------- B. 区间命中 ----------
console.log('B. 区间命中')
seed({ leaves: [RANGE_LEAVE, DAY_LEAVE], marks: { '2026-03-10': { id: 'd1', part: 'full' } } })
eq('区间内命中', (S.getCustomLeaveForDate('2026-03-05') || {}).id, 'r1')
eq('区间首日命中', (S.getCustomLeaveForDate('2026-03-02') || {}).id, 'r1')
eq('区间末日命中', (S.getCustomLeaveForDate('2026-03-08') || {}).id, 'r1')
eq('区间外不命中', S.getCustomLeaveForDate('2026-03-09'), null)
eq('day 假期永不被区间命中', S.getCustomLeaveForDate('2026-03-10'), null)
eq('非法日期返回 null', S.getCustomLeaveForDate('2026-3-5'), null)

// ---------- C. 按天标记存储 ----------
console.log('C. 按天标记存储')
seed({ leaves: [DAY_LEAVE] })
ok('标记整天', S.setCustomMark('2026-03-10', 'd1', 'full') === true)
eq('写入整天', S.getCustomMarks()['2026-03-10'], { id: 'd1', part: 'full' })
S.setCustomMark('2026-03-11', 'd1', 'am')
eq('写入上午', S.getCustomMarks()['2026-03-11'], { id: 'd1', part: 'am' })
S.setCustomMark('2026-03-12', 'd1', 'weird')
eq('非法 part → 整天', S.getCustomMarks()['2026-03-12'], { id: 'd1', part: 'full' })

eq('标记带出假期对象', (S.getCustomMarkForDate('2026-03-10') || {}).leave.name, '关爱假')
eq('未标记日返回 null', S.getCustomMarkForDate('2026-03-15'), null)

S.clearCustomMark('2026-03-10')
ok('清除后消失', !S.getCustomMarks()['2026-03-10'])

seed({ leaves: [RANGE_LEAVE] })
ok('不能把标记打到 range 假期上', S.setCustomMark('2026-03-05', 'r1', 'full') === false)

seed({ leaves: [DAY_LEAVE], marks: { '2026-03-20': 'd1' } })
eq('老字符串格式 → 整天', S.getCustomMarks()['2026-03-20'], { id: 'd1', part: 'full' })

// ---------- D. 额度用量 ----------
console.log('D. 额度用量')
seed({
  leaves: [{ id: 'd1', name: '关爱假', mode: 'day', quota: 5, quotaRule: 'yearly' }],
  marks: {
    '2026-03-10': { id: 'd1', part: 'full' },
    '2026-03-11': { id: 'd1', part: 'am' },
    '2025-12-30': { id: 'd1', part: 'full' }
  }
})
let u = S.getCustomLeaveUsage('d1')
eq('yearly 不含去年', u.used, 1.5)
eq('yearly 剩余', u.remaining, 3.5)
eq('yearly 未超额', u.over, 0)

seed({
  leaves: [{ id: 'd1', name: '关爱假', mode: 'day', quota: 5, quotaRule: 'total' }],
  marks: {
    '2026-03-10': { id: 'd1', part: 'full' },
    '2025-12-30': { id: 'd1', part: 'full' }
  }
})
u = S.getCustomLeaveUsage('d1')
eq('total 含去年', u.used, 2)
eq('total 剩余', u.remaining, 3)

seed({ leaves: [{ id: 'd1', name: '关爱假', mode: 'day', quota: 1, quotaRule: 'yearly' }], marks: { '2026-03-10': { id: 'd1', part: 'full' }, '2026-03-11': { id: 'd1', part: 'am' } } })
u = S.getCustomLeaveUsage('d1')
eq('超额不拦截，返回超量', u.over, 0.5)

seed({ leaves: [{ id: 'd1', name: '关爱假', mode: 'day', quota: 0 }], marks: { '2026-03-10': { id: 'd1', part: 'full' } } })
u = S.getCustomLeaveUsage('d1')
eq('额度留空 → unlimited', u.unlimited, true)
eq('额度留空仍统计已用', u.used, 1)

seed({ leaves: [RANGE_LEAVE] })
eq('range 假期没有额度概念', S.getCustomLeaveUsage('r1').unlimited, true)

// ---------- E. 月度统计端到端 ----------
console.log('E. 月度统计端到端')
seed({
  leaves: [RANGE_LEAVE, DAY_LEAVE],
  marks: {
    '2026-03-10': { id: 'd1', part: 'full' },
    '2026-03-11': { id: 'd1', part: 'am' },
    '2026-03-14': { id: 'd1', part: 'full' }
  }
})
let st = S.getMonthStats(2026, 3)
// 3/2–3/6 五个工作日 + 3/7、3/8 周末
eq('range 工作日 5 天 + 标记 1.5 天', st.customLeaveDays, 6.5)
eq('deductible = 5 + 1.5（周末不扣）', st.deductibleLeave, 6.5)
eq('周末标记计入 weekendLeaves（2 range + 1 mark）', st.weekendLeaves, 3)

seed({
  leaves: [DAY_LEAVE],
  marks: { '2026-03-10': { id: 'd1', part: 'full' } },
  entries: { '2026-03-10': 'company' }
})
st = S.getMonthStats(2026, 3)
eq('entries 优先于标记', st.customLeaveDays, 0)
eq('当天按出勤计', st.companyDays, 1)

seed({ leaves: [DAY_LEAVE], marks: { '2026-03-14': { id: 'd1', part: 'full' } } })
st = S.getMonthStats(2026, 3)
eq('只标周末 → 不扣分母', st.deductibleLeave, 0)
eq('只标周末 → 计入 weekendLeaves', st.weekendLeaves, 1)

seed({ leaves: [DAY_LEAVE], marks: { '2026-03-11': { id: 'd1', part: 'pm' } } })
st = S.getMonthStats(2026, 3)
eq('下午半天 → 扣 0.5', st.deductibleLeave, 0.5)
eq('下午半天 → 假期 0.5 天', st.customLeaveDays, 0.5)

// 率的上限：半天假时分母只减 0.5，率不会破 100
seed({ leaves: [DAY_LEAVE], marks: { '2026-03-11': { id: 'd1', part: 'am' } } })
const rep = S.getMonthlyReport(2026, 3)
eq('半天假时分母 = 工作日 − 0.5', rep.denominator, rep.workingDays - 0.5)

// ---------- F. 删除清理 + 回归 ----------
console.log('F. 删除清理 + 回归')
seed({
  leaves: [RANGE_LEAVE, DAY_LEAVE],
  marks: { '2026-03-10': { id: 'd1', part: 'full' }, '2026-03-11': { id: 'd1', part: 'am' } }
})
S.deleteCustomLeave('d1')
eq('删除假期后标记清空', Object.keys(S.getCustomMarks()).length, 0)
eq('删除假期后只剩另一个', S.getCustomLeaves().length, 1)

// 未使用自定义假期时，新旧实现必须逐字段一致
seed({
  entries: {
    '2026-03-02': 'company',
    '2026-03-03': 'home',
    '2026-03-04': { am: 'company', pm: 'vacation' },
    '2026-03-05': 'sick',
    '2026-03-07': 'company'
  }
})
const a = S.getMonthStats(2026, 3)
const b = OLD.getMonthStats(2026, 3)
eq('无自定义假期时统计完全一致', a, b)
const ra = S.getMonthlyReport(2026, 3)
const rb = OLD.getMonthlyReport(2026, 3)
eq('无自定义假期时月报完全一致', ra, rb)

// ---------- G. 表单日期条与扣减天数 ----------
console.log('G. 表单日期条与扣减天数')
eq('7 天逐日铺开、无折叠', buildWeekStrip('2026-03-02', '2026-03-08').map(d => d.day), [2, 3, 4, 5, 6, 7, 8])
eq('7 天没有空档格', buildWeekStrip('2026-03-02', '2026-03-08').some(d => d.gap), false)
const strip10 = buildWeekStrip('2026-10-12', '2026-10-21')
eq('10 天仍是 7 格', strip10.length, 7)
eq('10 天第 6 格是省略', strip10[5].gap, true)
eq('10 天末格是末日 21', strip10[6].day, 21)
eq('前 5 天是 12–16', strip10.slice(0, 5).map(d => d.day), [12, 13, 14, 15, 16])
eq('单日区间', buildWeekStrip('2026-03-02', '2026-03-02').length, 1)
eq('非法区间返回空', buildWeekStrip('2026-03-08', '2026-03-02').length, 0)
eq('周末标记正确', buildWeekStrip('2026-03-07', '2026-03-08').map(d => d.weekend), [true, true])
eq('末格星期正确（21 号周三）', strip10[6].weekday, '三')

// 扣减天数走 isOfficialWorkingDay，与统计口径一致
eq('普通一周扣 5 天', S.countDeductibleDays('2026-03-02', '2026-03-08'), 5)
eq('纯周末扣 0 天', S.countDeductibleDays('2026-03-07', '2026-03-08'), 0)
eq('国庆假期内扣 0 天', S.countDeductibleDays('2026-10-01', '2026-10-07'), 0)
// 10/10（周六）是国庆调休上班，但 compOffRules 默认只开春节，
// 所以按现有业务规则它不算工作日 —— 这里的期望值必须跟统计口径一致
eq('国庆后两天工作日、调休日不算', S.countDeductibleDays('2026-10-08', '2026-10-10'), 2)
eq('非法区间扣 0 天', S.countDeductibleDays('', ''), 0)

// ---------- H. 色板一致性 ----------
// 颜色区已改成色相条（任意色相可达），不再依赖色板顺序，
// 但色板仍是数据层契约：预设色、会员页列表、日历兜底都从这里取。
console.log('H. 色板一致性')
const palette = S.CUSTOM_LEAVE_COLORS
eq('色板 12 色', palette.length, 12)
eq('色板没有重复色', new Set(palette.map(c => c.toLowerCase())).size, palette.length)
ok('色板全是 #RRGGBB 大写', palette.every(c => /^#[0-9A-F]{6}$/.test(c)))
// 色相条存下来的色也是 #RRGGBB 大写（hslToHex 统一 upper），格式必须与色板一致
ok('色相条取色格式与色板一致', /^#[0-9A-F]{6}$/.test('#A33333'))
// 预设色必须落在色板内：点预设后若色值不在色板，日历兜底色与列表色会对不上
const presetColors = S.CUSTOM_LEAVE_PRESETS.range.concat(S.CUSTOM_LEAVE_PRESETS.day).map(p => p.color)
ok('预设色都在色板内', presetColors.every(c => palette.indexOf(c) !== -1))

// ---------- I. 半天额度 ----------
// 表单里额度可以给到 0.5（半天假），数据层要能存住、用量要按 0.5 扣。
console.log('I. 半天额度')
store['wio_pro_trial'] = JSON.stringify({ expiresAt: Date.now() + 86400000 * 3650 })
store['wio_settings'] = JSON.stringify({ language: 'zh-CN' })
S.saveCustomLeave({ name: '半天假', color: '#0E6E62', mode: 'day', quota: 0.5, quotaRule: 'yearly' })
const halfList = S.getCustomLeaves()
eq('半天额度存得住', halfList[0].quota, 0.5)
const halfId = halfList[0].id
S.setCustomMark('2026-03-10', halfId, 'am')
const halfUsage = S.getCustomLeaveUsage(halfId)
eq('半天假已用 0.5', halfUsage.used, 0.5)
eq('半天假用满', halfUsage.remaining, 0)
eq('半天假不超额', halfUsage.over, 0)
// 额度 0 = 不限
S.saveCustomLeave({ name: '不限假', color: '#0E6E62', mode: 'day', quota: 0, quotaRule: 'total' })
const unlimitedUsage = S.getCustomLeaveUsage(S.getCustomLeaves().find(l => l.name === '不限假').id)
eq('额度 0 是不限', unlimitedUsage.unlimited, true)
// 1.5 额度：半天 + 整天
S.saveCustomLeave({ name: '一天半', color: '#0E6E62', mode: 'day', quota: 1.5, quotaRule: 'total' })
eq('1.5 额度存得住', S.getCustomLeaves().find(l => l.name === '一天半').quota, 1.5)

// 非会员：条目与标记都拿不到（但存储保留）
store['wio_pro_trial'] = JSON.stringify({ expiresAt: 1 })
eq('非会员看不到假期', S.getCustomLeaves().length, 0)
eq('非会员看不到标记', Object.keys(S.getCustomMarks()).length, 0)
ok('非会员写不进标记', S.setCustomMark('2026-03-10', 'd1', 'full') === false)

console.log(`\n${fail === 0 ? '全部通过' : '有失败项'}：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
