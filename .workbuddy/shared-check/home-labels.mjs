// 首页「年进度 + 下个假期」卡片离线校验：年进度拆段精度、下个假期查询、
// 文案不落内部键。真身驱动，避免断言跟实现漂移。
// 运行：node .workbuddy/shared-check/home-labels.mjs

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const here = import.meta.dirname
const root = path.resolve(here, '../..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const store = {
  wio_auth: JSON.stringify({ user: { openid: 'test' }, subscription: { plan: 'monthly', expiresAt: Date.now() + 86400000 * 30 } }),
  wio_settings: JSON.stringify({ language: 'zh-CN' })
}
globalThis.uni = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: k => { delete store[k] },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  showToast: () => {},
  showModal: () => {},
  vibrateShort: () => {},
  $emit: () => {},
  $on: () => {},
  $off: () => {}
}

const vue = fs.readFileSync(path.join(root, 'components/HomeView.vue'), 'utf8')
const script = vue.match(/<script>([\s\S]*?)<\/script>/)[1]
const entry = path.join(here, '.tmp-home-entry.js')
const bundle = path.join(here, '.tmp-home-bundle.mjs')
fs.writeFileSync(entry, script)
await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
  outfile: bundle, alias: { '@': root }, logLevel: 'silent'
})
const opts = (await import(pathToFileURL(bundle).href)).default

function newInst() {
  const inst = { ...opts.data.call({}) }
  inst.settings = { language: 'zh-CN' }
  for (const [k, fn] of Object.entries(opts.methods || {})) inst[k] = fn.bind(inst)
  for (const [k, fn] of Object.entries(opts.computed || {})) {
    Object.defineProperty(inst, k, { get: fn, configurable: true })
  }
  return inst
}

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }

// --- Y1 年进度拆段：main 4 位小数 + tail 4 位小数 ---
const i = newInst()
{
  // 2026 年 7 月 2 日 18:00：182.75 / 365 ≈ 50.0685%（非整点，防巧合命中）
  const t = new Date(2026, 6, 2, 18, 0, 0)
  const p = i.yearProgressOf(t)
  ok(p.main === '50.0684', `main 应是 50.0684（182.75/365 截断 4 位），实际 ${p.main}`)
  ok(/^\d{4}$/.test(p.tail), `tail 应是 4 位数字，实际 ${p.tail}`)
  ok(/%$/.test(p.pctWidth) && p.pctWidth.indexOf('NaN') === -1, `pctWidth 应以 % 结尾且无 NaN，实际 ${p.pctWidth}`)
}
{
  // 年初 1 月 1 日 0 点（毫秒级）：约等于 0.0000
  const p = i.yearProgressOf(new Date(2026, 0, 1, 0, 0, 0, 300))
  ok(/^0\.0000$/.test(p.main), `年初应约 0.0000，实际 ${p.main}`)
}
{
  // 年末 12 月 31 日 23:59 也不能超过 100：toFixed 进位要被钳住
  const p = i.yearProgressOf(new Date(2026, 11, 31, 23, 59, 59, 999))
  ok(parseFloat(p.main) <= 100, `年末不得超 100，实际 ${p.main}`)
  ok(p.pctWidth.indexOf('NaN') === -1, 'pctWidth 不得出现 NaN')
}

// --- Y2 holidayText computed：依赖 todayStr，联动 wioService.getNextHoliday ---
{
  const svc = (await import(pathToFileURL(path.join(here, 'utils/wioService.js')).href)).default
  const inst = newInst()
  // 12月30日 → 下一个假期是跨年的 2027 元旦，还差 2 天（假日表必须能跨年，否则年底全是「已结束」）
  inst.todayStr = '2026-12-30'
  const h = inst.holidayText
  ok(h && h.name === '元旦', `12月30日应是元旦，实际 ${h && h.name}`)
  ok(h && h.ongoing === false && /2/.test(h.gap), `应显示还有 2 天，实际 ${h && h.gap}`)
  ok(svc.getNextHoliday('2026-12-30').date === '2027-01-01', '服务层应命中 2027-01-01')
}
{
  const inst = newInst()
  // 元旦首日：显示「正在放假」
  inst.todayStr = '2027-01-01'
  const h = inst.holidayText
  ok(h && h.ongoing === true, `元旦首日应显示正在放假，实际 ${h && h.gap}`)
  ok(h && h.name === '元旦', `名称应为元旦，实际 ${h && h.name}`)
}

// --- Y3 下个假期的天数口径：目标日 - 起始日 ---
{
  const svc = (await import(pathToFileURL(path.join(here, 'utils/wioService.js')).href)).default
  const h = svc.getNextHoliday('2026-11-05')
  ok(h && h.name === '元旦' && h.date === '2027-01-01', `11月5日的下个假期应是 2027 元旦，实际 ${h && h.date}`)
  ok(h && h.days === 57, `11月5日→1月1日应差 57 天，实际 ${h && h.days}`)
  // 假期内再查：仍是同一个假期（不含已过去的日子）天数不回撤
  const mid = svc.getNextHoliday('2026-01-02')
  ok(mid && mid.name === '元旦' && mid.date === '2026-01-02' && mid.days === 0, '元旦次日应 days=0')
  // 边界：格式不合法要返回 null，而不是抛错
  ok(svc.getNextHoliday('bad-date') === null, '非法日期应返回 null')
}

// --- Y4 状态文案不落内部键（原有防线保留） ---
{
  store.wio_settings = JSON.stringify({
    language: 'zh-CN',
    customLeaves: [{ id: 'cl_test', name: '育儿假', color: '#A93B78', mode: 'day', quota: 5, quotaRule: 'yearly' }]
  })
  const inst = newInst()
  const meta = inst.statusMeta('custom:cl_test')
  ok(meta && meta.label === '育儿假', `自定义假期应显示名字，实际 ${meta && meta.label}`)
  ok(meta && /^rgba\(/.test(meta.bg), `自定义假期底色应现算 rgba`)
  const orphan = inst.statusMeta('custom:gone')
  ok(orphan && orphan.label === '—', `孤儿标记应显示占位符，实际 ${orphan && orphan.label}`)
  const home = inst.statusMeta('home')
  ok(home && home.label === inst.i18n.home.workFromHome, '居家办公文案不对')
}

fs.rmSync(entry, { force: true })
fs.rmSync(bundle, { force: true })
console.log(fails.length ? `\n失败 ${fails.length} 条：\n- ` + fails.join('\n- ') : '')
console.log(`\n全部通过：${pass} 通过 / ${fails.length} 失败`)
process.exit(fails.length ? 1 : 0)
