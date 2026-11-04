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

fs.rmSync(entry, { force: true })
fs.rmSync(bundle, { force: true })
console.log(fails.length ? `\n失败 ${fails.length} 条：\n- ` + fails.join('\n- ') : '')
console.log(`\n全部通过：${pass} 通过 / ${fails.length} 失败`)
process.exit(fails.length ? 1 : 0)
