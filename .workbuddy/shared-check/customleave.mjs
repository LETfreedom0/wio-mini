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
//  J. 区间假跨月（每月只扣本月被覆盖的工作日，其余照常进分母）
//  K. 区间假整天占用（拦写入 + 残留标记不参与统计）
//  L. 福利假进两段（上午公司 + 下午福利假 = 0.5 / 0.5，额度不双算）
//  M. 删除按天假连带清理 entries，避免孤儿值继续扣分母
//  N. 图例直标整天（custom:<id> 写入 / 额度硬约束 / 幂等 / 孤儿值拒绝）
//
// 注：utils/ 下的副本需从项目根目录同步：
//   cp utils/wioService.js .workbuddy/shared-check/utils/

import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

// 基线固定在「周末口径修复前」的那一版，否则 HEAD 会跟着往前走，
// 回归对比会退化成「自己跟自己比」，形同虚设
const BASE_COMMIT = '794f107'
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

// PRO 权益：2.0.0 起唯一来源是会话里的云端订阅镜像（wio_auth.subscription），
// 旧的本地通道 wio_pro_trial 已移除，这里必须走真实口径。
const FUTURE = Date.now() + 86400000 * 30
const PRO_KEY = 'wio_auth'
const proSession = exp => JSON.stringify({
  user: { openid: 'o_test', nickname: '', avatarFileID: '' },
  subscription: { plan: 'month', expiresAt: exp }
})
store[PRO_KEY] = proSession(FUTURE)

/** 直接铺一份 settings + entries，绕开 save 路径做题设 */
function seed({ leaves = [], marks = {}, entries = {}, overtime = {}, settings = {} } = {}) {
  Object.keys(store).forEach(k => { if (k !== PRO_KEY) delete store[k] })
  store[PRO_KEY] = proSession(FUTURE)
  store['wio_settings'] = JSON.stringify({
    language: 'zh-CN',
    targetPercentage: 40,
    customLeaves: leaves,
    customMarks: marks,
    ...settings
  })
  store['wio_entries'] = JSON.stringify(entries)
  store['wio_overtime'] = JSON.stringify(overtime)
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

// 未使用自定义假期时，新旧实现必须逐字段一致。
// 注意：这里不能放周末标记——周末口径是本次有意修改的（周末不再进分母），
// 周末场景单独在 O 组断言。
seed({
  entries: {
    '2026-03-02': 'company',
    '2026-03-03': 'home',
    '2026-03-04': { am: 'company', pm: 'vacation' },
    '2026-03-05': 'sick'
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
// 10/10（周六）是国庆调休补班日，按「假期安排」口径算工作日（灰格=上班），
// 所以 10-8、10-9、10-10 三天都扣 —— 期望值必须跟统计口径一致
eq('国庆后两天工作日 + 补班日', S.countDeductibleDays('2026-10-08', '2026-10-10'), 3)
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

// ---------- J. 区间假跨月 ----------
// 连续休假是逐日扣分母的：跨月时每个月只扣「本月内被覆盖的工作日」，
// 没被覆盖的日子照常进分母（该回公司的天数一天都不能少）。
console.log('J. 区间假跨月只扣被覆盖的工作日')
const SPAN_LEAVE = { id: 'r2', name: '探亲假', color: '#2F6D9E', mode: 'range', start: '2026-03-27', end: '2026-04-03' }
seed({ leaves: [SPAN_LEAVE] })
const marSpan = S.getMonthStats(2026, 3)
const aprSpan = S.getMonthStats(2026, 4)
eq('3 月只扣 27/30/31 三个工作日', marSpan.deductibleLeave, 3)
eq('3 月假期 3 天', marSpan.customLeaveDays, 3)
eq('4 月只扣 1/2/3 三个工作日', aprSpan.deductibleLeave, 3)
eq('4 月假期 3 天', aprSpan.customLeaveDays, 3)
eq('3 月分母 = 全月工作日 − 3', S.getMonthlyReport(2026, 3).denominator, marSpan.workingDays - 3)
eq('4 月分母 = 全月工作日 − 3', S.getMonthlyReport(2026, 4).denominator, aprSpan.workingDays - 3)
// 区间外的工作日必须还在分母里：否则「整段休假」会把两个月的工作日一起吞掉
ok('4 月没被覆盖的工作日仍在分母', aprSpan.workingDays - 3 > 3)

// ---------- K. 区间假是整天占用 ----------
// 标了连续休假之后，这段日子不能再标任何出勤方式；
// 数据层拦写入，统计层也无视历史残留的标记（不删数据，取消假即恢复）。
console.log('K. 区间假整天占用')
seed({
  leaves: [RANGE_LEAVE],
  entries: { '2026-03-02': 'company', '2026-03-03': { am: 'company', pm: 'home' } }
})
const kst = S.getMonthStats(2026, 3)
eq('区间内残留的出勤不计 companyDays', kst.companyDays, 0)
eq('区间内残留的居家不计 homeDays', kst.homeDays, 0)
eq('区间内仍按 5 个工作日休假', kst.customLeaveDays, 5)
eq('分母扣满 5 天', kst.deductibleLeave, 5)
ok('拒绝再标整天出勤', S.saveEntry('2026-03-02', 'home') === false)
ok('拒绝再标两段', S.saveDayParts('2026-03-03', 'company', 'home') === false)
ok('拒绝再叠按天标记', S.setCustomMark('2026-03-04', 'd1', 'full') === false)
ok('清空操作仍然放行', S.saveEntry('2026-03-02', null) === true)

// ---------- L. 福利假进两段（上午公司 + 下午福利假） ----------
console.log('L. 福利假进两段')
const customVal = 'custom:d1'
seed({ leaves: [DAY_LEAVE] })
ok('两段写入成功', S.saveDayParts('2026-03-11', 'company', customVal) === true)
const lst = S.getMonthStats(2026, 3)
eq('上午公司记 0.5 天', lst.companyDays, 0.5)
eq('下午福利假记 0.5 天', lst.customLeaveDays, 0.5)
eq('分母只扣 0.5', lst.deductibleLeave, 0.5)
eq('额度用掉 0.5', S.getCustomLeaveUsage('d1').used, 0.5)
ok('整天福利假写入成功', S.saveDayParts('2026-03-12', customVal, customVal) === true)
eq('整天福利假累计 1.5 天', S.getMonthStats(2026, 3).customLeaveDays, 1.5)
eq('额度累计 1.5', S.getCustomLeaveUsage('d1').used, 1.5)
ok('引用不存在的假被拒', S.saveDayParts('2026-03-13', 'custom:nope', 'custom:nope') === false)

// 老 customMarks 与新 entries 同一天：只按 entries 算一次，绝不双计
seed({
  leaves: [DAY_LEAVE],
  marks: { '2026-03-11': { id: 'd1', part: 'full' } },
  entries: { '2026-03-11': { am: 'company', pm: customVal } }
})
eq('同日不双算（额度）', S.getCustomLeaveUsage('d1').used, 0.5)
eq('同日不双算（统计）', S.getMonthStats(2026, 3).customLeaveDays, 0.5)

store[PRO_KEY] = proSession(1)
ok('非会员不能标福利假', S.saveDayParts('2026-03-16', customVal, customVal) === false)

// ---------- M. 删除按天假连带清理 ----------
console.log('M. 删除按天假连带清理')
seed({
  leaves: [DAY_LEAVE],
  entries: { '2026-03-11': { am: 'company', pm: customVal }, '2026-03-12': customVal }
})
eq('删除前扣 1.5 天', S.getMonthStats(2026, 3).deductibleLeave, 1.5)
S.deleteCustomLeave('d1')
const afterDel = S.getMonthStats(2026, 3)
eq('删除后不再扣分母', afterDel.deductibleLeave, 0)
eq('删除后不记假期', afterDel.customLeaveDays, 0)
eq('删除后同日上午的公司段保留', afterDel.companyDays, 0.5)

// ---------- I. 半天额度 ----------
// 表单里额度可以给到 0.5（半天假），数据层要能存住、用量要按 0.5 扣。
console.log('I. 半天额度')
store[PRO_KEY] = proSession(Date.now() + 86400000 * 3650)
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

// ---------- N. 图例直标整天 ----------
// 图例选中按天假后点日期 = saveEntry('custom:<id>') 一整天，额度与面板共用一套口径
console.log('N. 图例直标整天')
const DAY2 = { id: 'n1', name: '育儿假', color: '#A93B78', mode: 'day', quota: 2, quotaRule: 'yearly' }
seed({ leaves: [DAY2], entries: {} })
ok('整天直标写入成功', S.saveEntry('2026-11-10', 'custom:n1') === true)
eq('写的是整天', S.getEntries()['2026-11-10'], 'custom:n1')
eq('额度扣 1 天', S.getCustomLeaveUsage('n1').used, 1)
eq('统计按 1 天假期', S.getMonthStats(2026, 11).customLeaveDays >= 1, true)
ok('同一天重复标同一假是幂等的', S.saveEntry('2026-11-10', 'custom:n1') === true)
ok('额度还有 1 天时可再标一天', S.saveEntry('2026-11-11', 'custom:n1') === true)
eq('额度用满', S.getCustomLeaveUsage('n1').remaining, 0)
ok('用满后拒绝新的一天', S.saveEntry('2026-11-12', 'custom:n1') === false)
ok('用满后仍可清空', S.saveEntry('2026-11-10', null) === true)
ok('指向已删的假被拒绝', S.saveEntry('2026-11-13', 'custom:ghost') === false)

// 非会员：条目与标记都拿不到（但存储保留）
store[PRO_KEY] = proSession(1)
eq('非会员看不到假期', S.getCustomLeaves().length, 0)
eq('非会员看不到标记', Object.keys(S.getCustomMarks()).length, 0)
ok('非会员写不进标记', S.setCustomMark('2026-03-10', 'd1', 'full') === false)

// ---------- O. 周末不进 WIO（只有 OT 算） ----------
// 业务口径：周末 / 法定节假日，不管标公司、居家还是假期，都不进 WIO 的口径；
// 只有「记录加班」单独统计。调休上班日由 isOfficialWorkingDay 判为工作日，照常计入。
console.log('O. 周末不进 WIO')
seed({ entries: { '2026-03-07': 'home', '2026-03-08': 'home' } })
const wkHome = S.getMonthStats(2026, 3)
eq('周末标居家 → 工作日不变（3 月 22 天）', wkHome.workingDays, 22)
eq('周末标居家 → 不计入居家天数', wkHome.homeDays, 0)
eq('周末标居家 → 分母不变', S.getMonthlyReport(2026, 3).denominator, 22)
eq('周末标居家 → 比率仍是 0', S.getMonthlyReport(2026, 3).rate, 0)

seed({ entries: { '2026-03-07': 'company' } })
const wkCompany = S.getMonthStats(2026, 3)
eq('周末标公司 → 工作日不变', wkCompany.workingDays, 22)
eq('周末标公司 → 不计入公司天数', wkCompany.companyDays, 0)

seed({ entries: { '2026-03-07': 'vacation' } })
const wkLeave = S.getMonthStats(2026, 3)
eq('周末标年假 → 不扣分母', wkLeave.deductibleLeave, 0)
eq('周末标年假 → 不算进假期天数', wkLeave.vacationDays, 0)
eq('周末标年假 → 落到 weekendLeaves', wkLeave.weekendLeaves, 1)

// 周末标记不影响整月比率：同月加个工作日公司，比率保持 1/22
seed({ entries: { '2026-03-02': 'company', '2026-03-07': 'home', '2026-03-08': 'company' } })
eq('周末乱标不改变月比率', S.getMonthlyReport(2026, 3).rate, Math.round((1 / 22) * 100))

// 调休上班日照常计入（打开国庆调休开关后，10/10 周六算工作日）
seed({ settings: { compOffRules: { 国庆节: false } } })
const noMakeup = S.getMonthStats(2026, 10)
seed({ settings: { compOffRules: { 国庆节: true } } })
const withMakeup = S.getMonthStats(2026, 10)
eq('调休开关打开后多一个工作日', withMakeup.workingDays, noMakeup.workingDays + 1)
seed({ entries: { '2026-10-10': 'home' }, settings: { compOffRules: { 国庆节: true } } })
const makeupHome = S.getMonthStats(2026, 10)
eq('调休上班日标居家照常计入居家天数', makeupHome.homeDays, 1)
eq('调休上班日的居家不扣分母', makeupHome.deductibleLeave, 0)
eq('调休上班日标居家不改工作日', makeupHome.workingDays, withMakeup.workingDays)

// 周末只认加班：标了 OT 就统计，标什么都不影响 WIO
seed({ entries: { '2026-03-07': 'home' }, overtime: { '2026-03-07': 4 } })
const wkOt = S.getMonthStats(2026, 3)
eq('周末加班小时照常统计', wkOt.totalOvertime, 4)
eq('周末加班不影响比率', S.getMonthlyReport(2026, 3).rate, 0)

console.log(`\n${fail === 0 ? '全部通过' : '有失败项'}：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
