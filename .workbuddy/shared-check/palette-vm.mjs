// 配色组件离线校验：把 CustomLeaveSheet 的 <script> 真身抽出来打包，
// 直接驱动组件方法/computed，而不是照抄一份实现（照抄会跟实现漂移）。
// 运行：node .workbuddy/shared-check/palette-vm.mjs

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const here = import.meta.dirname
const root = path.resolve(here, '../..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

// ---- 0. 全局 uni mock（导入期会碰到 storage / haptic） ----
const store = {}
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

// ---- 1. 抽 script → esbuild 打包（@ 别名指项目根） ----
const vue = fs.readFileSync(path.join(root, 'components/CustomLeaveSheet.vue'), 'utf8')
const script = vue.match(/<script>([\s\S]*?)<\/script>/)[1]
const entry = path.join(here, '.tmp-sheet-entry.js')
const bundle = path.join(here, '.tmp-sheet-bundle.mjs')
fs.writeFileSync(entry, script)
try {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundle,
    alias: { '@': root },
    logLevel: 'silent'
  })
} catch (e) {
  console.error('打包失败：', e.message)
  process.exit(1)
}

const mod = await import(pathToFileURL(bundle).href)
const opts = mod.default
const wioService = (await import(pathToFileURL(path.join(root, 'utils/wioService.js')).href).catch(() => null)) || null

// ---- 2. 造一个最小实例 ----
function newInst() {
  const inst = { ...opts.data.call({}) }
  for (const [k, fn] of Object.entries(opts.methods || {})) inst[k] = fn.bind(inst)
  return inst
}
const cmp = (inst, k) => opts.computed[k].call(inst)

const PALETTES = (() => {
  const block = script.match(/const PALETTES = (\[[\s\S]*?\n\])/)[1]
  return eval(block)
})()

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }
const up = s => String(s).toUpperCase()
const ringOf = c => (String((c && c.boxShadow) || '').match(/#[0-9A-Fa-f]{6}/g) || [])
const selectedIn = colors => colors.filter(c => hexOf(c.shadow).length > 0)

// ---- P1 初始状态：默认色落在第一组，且被选中 ----
{
  const i = newInst()
  i.form.color = '#0E6E62'
  i.syncPaletteToColor()
  ok(i.paletteIndex === 0, `默认色应定位到第 1 组，实际 index=${i.paletteIndex}`)
  ok(i.paletteTurns === 0, '初始化应把旋转计数归零')
  const colors = cmp(i, 'paletteColors')
  ok(colors.length === 4, `应展示 4 格，实际 ${colors.length}`)
  const sel = colors.filter(c => ringOf(i.swatchStyle(c)).length > 0)
  ok(sel.length === 1, `选中态应恰好 1 个，实际 ${sel.length}`)
  ok(up(sel[0]) === '#0E6E62', `选中的应是当前色，实际 ${sel[0]}`)
}

// ---- P2 点色块：换色 + 选中态跟着走 ----
{
  const i = newInst()
  i.form.color = '#0E6E62'
  i.syncPaletteToColor()
  const target = PALETTES[0][2]
  i.pickColor(String(target).toLowerCase()) // 小写也要吃得下
  ok(up(i.form.color) === up(target), `pickColor 应写入 ${target}，实际 ${i.form.color}`)
  const colors = cmp(i, 'paletteColors')
  const sel = colors.filter(c => ringOf(i.swatchStyle(c)).length > 0)
  ok(sel.length === 1 && up(sel[0]) === up(target), '点完色块，选中态应移到新色上')
}

// ---- P3 换组：整圈循环，不卡组、不漏组 ----
{
  const i = newInst()
  i.form.color = '#0E6E62'
  i.syncPaletteToColor(0)
  const seen = new Set()
  for (let n = 0; n < PALETTES.length; n++) {
    seen.add(i.paletteIndex)
    i.refreshPalette()
  }
  ok(i.paletteIndex === 0, `转一圈应回到第 1 组，实际 index=${i.paletteIndex}`)
  ok(seen.size === PALETTES.length, `一圈应覆盖全部 ${PALETTES.length} 组，实际 ${seen.size}`)
  ok(i.paletteTurns === PALETTES.length, `旋转计数应累加 ${PALETTES.length}，实际 ${i.paletteTurns}`)
}

// ---- P4 选中色永远可见：任何历史色 × 任何组 都还在行内且有选中态 ----
{
  const i = newInst()
  const samples = ['#123456', '#ABCDEF', '#c25b6e', '#0e6e62']
  samples.forEach(c => {
    for (let g = 0; g < PALETTES.length; g++) {
      i.form.color = c
      i.paletteIndex = g
      const colors = cmp(i, 'paletteColors')
      ok(colors.length === 4, `色 ${c} 在第 ${g + 1} 组：格数变成 ${colors.length}`)
      ok(colors.map(up).indexOf(up(c)) !== -1, `色 ${c} 在第 ${g + 1} 组里从行内消失`)
      const sel = colors.filter(x => ringOf(i.swatchStyle(x)).length > 0)
      ok(sel.length === 1, `色 ${c} 在第 ${g + 1} 组：选中态 ${sel.length} 个`)
    }
  })
}

// ---- P5 预设色都能定位到含它的组（套预设后不能出现「无选中」） ----
{
  const presets = []
  for (const f of fs.readdirSync(path.join(root, 'utils'))) {
    if (f !== 'wioService.js') continue
    const s = fs.readFileSync(path.join(root, 'utils', f), 'utf8')
    const block = s.match(/CUSTOM_LEAVE_PRESETS:\s*\{[\s\S]*?\n  \}/)
    if (block) presets.push(...[...block[0].matchAll(/color:\s*'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1]))
  }
  ok(presets.length > 0, '没抽到预设色，断言失效')
  presets.forEach(c => {
    const i = newInst()
    i.form.color = c
    i.paletteIndex = 3 // 故意从一个不含它的组出发，验证 sync 会跳组
    i.syncPaletteToColor()
    const colors = cmp(i, 'paletteColors')
    ok(colors.map(up).indexOf(up(c)) !== -1, `预设色 ${c} 定位后仍不在行内`)
    const sel = colors.filter(x => ringOf(i.swatchStyle(x)).length > 0)
    ok(sel.length === 1 && up(sel[0]) === up(c), `预设色 ${c} 定位后选中态不对`)
  })
}

fs.rmSync(entry, { force: true })
fs.rmSync(bundle, { force: true })

console.log(fails.length ? `\n失败 ${fails.length} 条：\n- ` + fails.join('\n- ') : '')
console.log(`\n全部通过：${pass} 通过 / ${fails.length} 失败`)
process.exit(fails.length ? 1 : 0)
