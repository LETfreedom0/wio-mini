// 首页「最近记录」文案离线校验：这里最容易把内部键直接印给用户看
// （custom:cl_xxx / overtime_record）。真身驱动，避免断言跟实现漂移。
// 运行：node .workbuddy/shared-check/home-labels.mjs

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const here = import.meta.dirname
const root = path.resolve(here, '../..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const day = 86400000
const store = {
  wio_auth: JSON.stringify({ user: { openid: 'test' }, subscription: { plan: 'monthly', expiresAt: Date.now() + 30 * day } }),
  wio_settings: JSON.stringify({
    language: 'zh-CN',
    customLeaves: [{ id: 'cl_test', name: '育儿假', color: '#A93B78', mode: 'day', quota: 5, quotaRule: 'yearly' }]
  }),
  wio_entries: JSON.stringify({
    '2026-11-04': 'custom:cl_test',
    '2026-11-03': 'overtime_record',
    '2026-11-02': { am: 'company', pm: 'custom:cl_test' },
    '2026-11-01': 'home'
  })
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

const i = newInst()
const i18n = i.i18n
i.buildRecentRecords()
const rows = i.recentRecords
const byDate = d => rows.find(r => r.dateLabel && r.dateLabel.indexOf(d) !== -1)

// --- H1 任何一行都不能把内部键漏给用户 ---
ok(rows.length === 3, `最近记录只取最近 3 条，实际 ${rows.length}`)
rows.forEach(r => {
  ok(!/custom:/.test(r.label), `标签里出现内部键 custom: → ${r.label}`)
  ok(!/overtime_record/.test(r.label), `标签里出现内部键 overtime_record → ${r.label}`)
  ok(!/^\[object/.test(r.label), `标签渲染成了对象 → ${r.label}`)
  ok(/^#[0-9A-Fa-f]{6}$/.test(r.color) || /^rgba?\(/.test(r.color), `颜色值异常 → ${r.color}`)
})

// --- H2 自定义按天假：显示假期名 + 用假期自己的颜色 ---
const r4 = byDate('11月4日')
ok(r4 && r4.label === '育儿假', `自定义假期应显示「育儿假」，实际 ${r4 && r4.label}`)
ok(r4 && r4.color.toUpperCase() === '#A93B78', `自定义假期应用假期色，实际 ${r4 && r4.color}`)
ok(r4 && /^rgba\(/.test(r4.bgColor), `自定义假期底色应现算 rgba，实际 ${r4 && r4.bgColor}`)

// --- H3 加班记录 & 普通状态 ---
const r3 = byDate('11月3日')
ok(r3 && r3.label === i18n.calendar.legends.overtime_record, `加班记录文案不对 → ${r3 && r3.label}`)
const homeMeta = i.statusMeta('home')
ok(homeMeta && homeMeta.label === i18n.home.workFromHome, `居家办公文案不对 → ${homeMeta && homeMeta.label}`)

// --- H4 半天 + 自定义混排 ---
const r2 = byDate('11月2日')
ok(r2 && r2.label.indexOf('育儿假') !== -1, `半天里的自定义假期没翻译 → ${r2 && r2.label}`)
ok(r2 && /公司|Office/.test(r2.label), `半天的公司段没翻译 → ${r2 && r2.label}`)

// --- H5 假期被删但标记还在（孤儿）：宁可显示占位符，也不泄露键名 ---
store.wio_settings = JSON.stringify({ language: 'zh-CN', customLeaves: [] })
const i2 = newInst()
i2.buildRecentRecords()
const orphan = i2.recentRecords.find(r => r.dateLabel.indexOf('11月4日') !== -1)
ok(orphan && orphan.label === '—', `孤儿标记应显示占位符，实际 ${orphan && orphan.label}`)

// --- H6 只标了假期、没打卡：最近记录也要跟着变 ---
// 之前数据源只有 entries，标完假回首页毫无变化，用户以为没保存
store.wio_settings = JSON.stringify({
  language: 'zh-CN',
  customLeaves: [
    { id: 'cl_day', name: '公益假', color: '#2F8F6E', mode: 'day', quota: 2, quotaRule: 'yearly' },
    { id: 'cl_range', name: '婚假', color: '#C25B6E', mode: 'range', start: '2026-11-06', end: '2026-11-12' }
  ],
  customMarks: { '2026-11-05': { id: 'cl_day', part: 'am' } }
})
store.wio_entries = JSON.stringify({ '2026-11-01': 'home' })
const i3 = newInst()
i3.buildRecentRecords()
const markRow = i3.recentRecords.find(r => r.dateLabel.indexOf('11月5日') !== -1)
ok(!!markRow, '按天标记的日期应出现在最近记录里')
ok(markRow && markRow.label.indexOf('公益假') !== -1, `标记应显示假期名，实际 ${markRow && markRow.label}`)
ok(markRow && markRow.label.indexOf('上午') !== -1, `半天标记应标出上午，实际 ${markRow && markRow.label}`)
ok(markRow && markRow.color === '#2F8F6E', `标记应用假期色，实际 ${markRow && markRow.color}`)

const rangeRow = i3.recentRecords.find(r => r.label.indexOf('婚假') !== -1)
ok(!!rangeRow, '区间假应出现在最近记录里')
ok(rangeRow && rangeRow.label.indexOf('至 11月12日') !== -1, `区间假应带结束日，实际 ${rangeRow && rangeRow.label}`)
ok(rangeRow && rangeRow.dateLabel.indexOf('11月6日') !== -1, `区间假按开始日记一条，实际 ${rangeRow && rangeRow.dateLabel}`)

// --- H7 同一天既打卡又标假：只出一条，且是打卡（与日历取色优先级一致） ---
store.wio_entries = JSON.stringify({ '2026-11-05': 'company', '2026-11-01': 'home' })
const i4 = newInst()
i4.buildRecentRecords()
const dup = i4.recentRecords.filter(r => r.dateLabel.indexOf('11月5日') !== -1)
ok(dup.length === 1, `同一天不该出现两条，实际 ${dup.length} 条`)
ok(dup[0] && dup[0].label === i4.i18n.home.workFromCompany, `应保留打卡那条，实际 ${dup[0] && dup[0].label}`)

fs.rmSync(entry, { force: true })
fs.rmSync(bundle, { force: true })
console.log(fails.length ? `\n失败 ${fails.length} 条：\n- ` + fails.join('\n- ') : '')
console.log(`\n全部通过：${pass} 通过 / ${fails.length} 失败`)
process.exit(fails.length ? 1 : 0)
