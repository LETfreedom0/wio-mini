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

fs.rmSync(here + '/.stats-entry.js', { force: true })
fs.rmSync(here + '/.stats-bundle.mjs', { force: true })

console.log(`\n${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
