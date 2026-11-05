// 统计页加班折线的纯计算校验：坐标必须有限、落在画布内，SVG 必须能被解析
// 运行：node .workbuddy/shared-check/stats-chart.mjs
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
  navigateBack() {}, switchTab() {}, showToast() {}, showModal() {}
}

const vue = fs.readFileSync(root + '/pages/stats/index.vue', 'utf8')
const script = vue.match(/<script>([\s\S]*?)<\/script>/)[1]
fs.writeFileSync(here + '/.stats-entry.js', script)
await esbuild.build({
  entryPoints: [here + '/.stats-entry.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: here + '/.stats-bundle.mjs',
  alias: { '@': root }, logLevel: 'silent'
})
const opts = (await import(pathToFileURL(here + '/.stats-bundle.mjs').href)).default

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg) } }

function inst(monthly) {
  const i = { ...opts.data.call({}) }
  i.annual = { ...i.annual, monthly }
  for (const [k, fn] of Object.entries(opts.methods)) i[k] = fn.bind(i)
  for (const [k, fn] of Object.entries(opts.computed)) {
    Object.defineProperty(i, k, { get: () => fn.call(i), configurable: true })
  }
  return i
}

const mk = arr => arr.map((h, idx) => ({ month: idx + 1, overtimeHours: h, companyDays: 0, workingDays: 20 }))

// 1) 全年无加班：不崩、不产生 NaN、峰值为空
{
  const i = inst(mk(new Array(12).fill(0)))
  ok(i.hasOt === false, '全 0 时应判为无加班')
  ok(i.otPeak === null, '无加班时不应有峰值标注')
  ok(/^url\("data:image\/svg\+xml/.test(i.otChartBg), 'data URI 前缀正确')
  ok(!/NaN|undefined/.test(decodeURIComponent(i.otChartBg)), 'SVG 里不能出现 NaN/undefined')
}

// 2) 正常数据：峰值取最大月，坐标在画布内
{
  const i = inst(mk([0, 2, 0, 9.5, 0, 0, 3, 0, 0, 1, 0, 4]))
  ok(i.hasOt === true, '有加班时应判为有')
  ok(i.otPeak.month === 4, `峰值应在 4 月，实际 ${i.otPeak.month}`)
  ok(i.otPeak.hours === 9.5, '峰值小时数不对')
  const left = parseFloat(i.otPeak.left)
  const top = parseFloat(i.otPeak.top)
  ok(left > 20 && left < 30, `4 月的位置应在画布左起 1/4 附近，实际 ${left}%`)
  ok(top >= 0 && top <= 100, `峰值纵向应在画布内，实际 ${top}%`)
  ok(!/NaN/.test(decodeURIComponent(i.otChartBg)), 'SVG 里不能出现 NaN')
  const svg = decodeURIComponent(i.otChartBg)
  ok((svg.match(/L/g) || []).length >= 12, '折线应有 11 段连线 + 面积收口')
  ok(svg.includes('stroke="#C08A2D"'), '折线颜色应为主金色')
}

// 3) 单月数据：峰值在 1 月，且线不会被除零打断
{
  const i = inst(mk([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
  ok(i.otPeak.month === 1, '峰值应在 1 月')
  ok(parseFloat(i.otPeak.left) < 10, '1 月应贴左边')
  ok(!/NaN/.test(decodeURIComponent(i.otChartBg)), 'SVG 里不能出现 NaN')
}

// 4) 首屏空态：annual 还没回来（monthly 为 undefined / 空数组 / 含 null 项）都不能崩。
//    真机上就是这里抛 Cannot read property 'x' of undefined，整页白掉
{
  const cases = [
    ['monthly 为 undefined', undefined],
    ['monthly 为空数组', []],
    ['monthly 只有 3 个月', mk([1, 2, 3])],
    ['monthly 含 null 项', [null, { month: 2, overtimeHours: 4 }]]
  ]
  for (const [label, monthly] of cases) {
    const i = inst(monthly)
    let bg = null
    let err = null
    try { bg = i.otChartBg } catch (e) { err = e }
    ok(!err, `${label} 时 otChartBg 不应抛异常${err ? '：' + err.message : ''}`)
    ok(typeof bg === 'string', `${label} 时应返回字符串`)
    ok(i.otSeries.length === 12, `${label} 时折线应补齐 12 个月，实际 ${i.otSeries.length}`)
    ok(!/NaN|undefined/.test(decodeURIComponent(bg)), `${label} 时 SVG 不能出现 NaN/undefined`)
  }
}

// 4) 12 个月等长输入不会越界（折线首尾都在画布内）
{
  const i = inst(mk(new Array(12).fill(1)))
  const first = i.otPoint(0, 1)
  const last = i.otPoint(11, 1)
  ok(first.x >= 0 && last.x <= 300, '首尾点必须在 viewBox 内')
  ok(first.y >= 0 && first.y <= 84, '纵坐标必须在 viewBox 内')
}

// 5) 自定义假期行文案
{
  const i = inst([])
  Object.defineProperty(i, 'i18n', {
    get: () => ({ profile: { statsCustomRange: '{n} 个工作日' } }),
    configurable: true
  })
  ok(i.customNum({ mode: 'day', used: 2, quota: 5 }) === '2 / 5', '按天假显示 已用/额度')
  ok(i.customNum({ mode: 'day', used: 2, quota: 0 }) === '2', '不限额度只显示已用')
  ok(i.customNum({ mode: 'range', days: 8 }) === '8 个工作日', '区间假显示工作日数')
  ok(i.customPct({ mode: 'day', used: 5, quota: 5 }) === 100, '用满时进度 100%')
  ok(i.customPct({ mode: 'day', used: 1, quota: 3 }) === 33, '进度按比例')
  ok(i.customPct({ mode: 'range', days: 8 }) === 100, '区间假整条填充')
}

// 6) 折线点选：标记跟到被点的月份，再点一次收回峰值
{
  const i = inst(mk([0, 2, 0, 9.5, 0, 0, 3, 0, 0, 1, 0, 4]))
  Object.defineProperty(i, 'i18n', {
    get: () => ({ profile: {
      statsOtPeak: '峰值在 {m} 月 · {n} 小时',
      statsOtPicked: '{m} 月 · 加班 {n} 小时 · 回司 {d} 天',
      statsOtEmpty: '今年还没有加班记录'
    } }),
    configurable: true
  })
  ok(i.activeOtMonth === -1, '默认不选中任何月份')
  ok(i.otMarker.month === 4, '未点选时标记停在峰值 4 月')
  ok(i.otFootText.indexOf('峰值') !== -1, '未点选时脚下是峰值文案')

  i.pickMonth(6) // 7 月，3 小时
  ok(i.activeOtMonth === 6, '点击后应记住选中月')
  ok(i.otMarker.month === 7 && i.otMarker.hours === 3, '标记应跟到 7 月并取该月时长')
  ok(i.otFootText.indexOf('7 月') !== -1, '脚下文案应换成 7 月明细')
  ok(i.otFootText.indexOf('3 小时') !== -1, '明细里要带该月加班时长')
  const left = parseFloat(i.otMarker.left)
  ok(left > 50 && left < 65, `7 月应落在画布中部偏右，实际 ${left}%`)

  i.pickMonth(6)
  ok(i.activeOtMonth === -1, '再点同一个月应取消选中')
  ok(i.otMarker.month === 4, '取消后标记回到峰值')

  i.pickMonth(0)
  ok(i.otMarker.hours === 0, '零加班的月份也要能点（不能返回 null）')
  ok(i.otMarker.top === '100.00%' || parseFloat(i.otMarker.top) > 90, '零值点应贴在基线附近')
}

fs.rmSync(here + '/.stats-entry.js', { force: true })
fs.rmSync(here + '/.stats-bundle.mjs', { force: true })

console.log(`\n${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
