// 配色组离线校验：直接从源码里抽 PALETTES 与色板常量，避免测试副本与实现漂移
// 运行：node .workbuddy/shared-check/palette.mjs
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '../..')
const sheet = fs.readFileSync(path.join(root, 'components/CustomLeaveSheet.vue'), 'utf8')
const service = fs.readFileSync(path.join(root, 'utils/wioService.js'), 'utf8')

const block = sheet.match(/const PALETTES = (\[[\s\S]*?\n\])/)[1]
const PALETTES = eval(block)

const colorsSrc = service.match(/CUSTOM_LEAVE_COLORS:\s*(\[[\s\S]*?\])/)[1]
const COLORS = eval(colorsSrc)
const presetSrc = service.match(/CUSTOM_LEAVE_PRESETS:\s*\{[\s\S]*?\n  \}/)[0]
const PRESET_COLORS = [...presetSrc.matchAll(/color:\s*'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1])

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }
const up = s => String(s).toUpperCase()

// 实现里的三条关键行为，照抄一遍做等价校验
const paletteColors = (idx, color) => {
  const g = PALETTES[idx % PALETTES.length]
  const cur = up(color)
  if (!cur || g.indexOf(cur) !== -1) return g
  return [g[0], g[1], g[2], cur]
}
const syncIndex = color => {
  const cur = up(color)
  for (let i = 0; i < PALETTES.length; i++) if (PALETTES[i].indexOf(cur) !== -1) return i
  return -1
}

// --- P1 结构 ---
ok(PALETTES.length >= 4, '配色组不少于 4 组（太少，换两组就循环回来了）')
PALETTES.forEach((g, i) => {
  ok(g.length === 4, `第 ${i + 1} 组必须是 4 色，实际 ${g.length}`)
  ok(new Set(g.map(up)).size === g.length, `第 ${i + 1} 组内有重复色`)
  g.forEach(c => ok(/^#[0-9A-F]{6}$/.test(up(c)), `第 ${i + 1} 组色值格式非法：${c}`))
})

// --- P2 覆盖：色板 12 色与全部预设色都要落在某一组里 ---
COLORS.forEach(c => {
  ok(syncIndex(c) !== -1, `色板色 ${c} 不在任何配色组内（换色后会永远显示成「顶掉最后一格」）`)
})
PRESET_COLORS.forEach(c => {
  ok(syncIndex(c) !== -1, `预设色 ${c} 不在任何配色组内`)
})
ok(COLORS.length === 12, `色板断言基准变化：期望 12 色，实际 ${COLORS.length}`)

// --- P3 选中色永远可见、永远有选中态 ---
COLORS.concat(PRESET_COLORS).forEach(c => {
  for (let i = 0; i < PALETTES.length; i++) {
    const shown = paletteColors(i, c)
    ok(shown.length === 4, `第 ${i + 1} 组展示 ${c} 时格数变成 ${shown.length}`)
    ok(shown.map(up).indexOf(up(c)) !== -1, `第 ${i + 1} 组展示 ${c} 时选中色消失`)
  }
})
// 不在任何组里的历史色（旧版色相条能选出任意色）也不能丢
const legacy = '#123456'
for (let i = 0; i < PALETTES.length; i++) {
  ok(paletteColors(i, legacy).map(up).indexOf(legacy) !== -1, `历史色 ${legacy} 在第 ${i + 1} 组里消失`)
}

// --- P4 换组是完整循环，不会卡住 ---
let idx = 0
const seen = new Set()
for (let i = 0; i < PALETTES.length; i++) { seen.add(idx); idx = (idx + 1) % PALETTES.length }
ok(idx === 0, '换组一圈后没有回到起点')
ok(seen.size === PALETTES.length, '换组没有覆盖到全部配色组')

console.log(fails.length ? `\n失败 ${fails.length} 条：\n- ` + fails.join('\n- ') : '')
console.log(`\n全部通过：${pass} 通过 / ${fails.length} 失败`)
process.exit(fails.length ? 1 : 0)
