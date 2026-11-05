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

// ---- P3 换组：整圈循环，不卡组、不漏组（换组现在是动画，颜色在收缩点才落） ----
const sleep = ms => new Promise(r => setTimeout(r, ms))
{
  const i = newInst()
  i.form.color = '#0E6E62'
  i.syncPaletteToColor()
  const seen = new Set()
  for (let n = 0; n < PALETTES.length; n++) {
    seen.add(i.paletteIndex)
    i.refreshPalette()
    ok(i.morphing === true, `第 ${n + 1} 次换组应进入动画态`)
    await sleep(620)
  }
  ok(i.morphing === false, '动画结束后 morphing 应复位')
  ok(i.paletteIndex === 0, `转一圈应回到第 1 组，实际 index=${i.paletteIndex}`)
  ok(seen.size === PALETTES.length, `一圈应覆盖全部 ${PALETTES.length} 组，实际 ${seen.size}`)
  ok(i.paletteTurns === PALETTES.length, `旋转计数应累加 ${PALETTES.length}，实际 ${i.paletteTurns}`)
}

// ---- P3b 动画期间连点：只能前进一组，颜色不能被连点跳级 ----
{
  const i = newInst()
  i.form.color = '#0E6E62'
  i.syncPaletteToColor()
  const start = i.paletteIndex
  i.refreshPalette()
  i.refreshPalette()
  i.refreshPalette()
  await sleep(620)
  ok(i.paletteIndex === (start + 1) % PALETTES.length, `连点三下应只换一组，实际 ${i.paletteIndex}`)
  ok(i.paletteTurns === 1, `连点三下旋转计数应只加 1，实际 ${i.paletteTurns}`)
  // 动画期间点色块应被忽略
  const before = i.form.color
  i.refreshPalette()
  i.pickColor('#C25B6E')
  ok(i.form.color === before, '动画期间点色块应被忽略')
  await sleep(620)
}

// ---- P4 换组是整组换：四格必须等于该组的四色，不塞旧色凑数 ----
{
  const i = newInst()
  for (const c of ['#123456', '#ABCDEF', '#c25b6e', '#0e6e62']) {
    for (let g = 0; g < PALETTES.length; g++) {
      i.form.color = c
      i.paletteIndex = g
      const colors = cmp(i, 'paletteColors')
      ok(colors.length === 4, `色 ${c} 在第 ${g + 1} 组：格数变成 ${colors.length}`)
      ok(JSON.stringify(colors.map(up)) === JSON.stringify(PALETTES[g].map(up)),
        `第 ${g + 1} 组被旧色 ${c} 顶掉了格子`)
    }
  }
  // 换组后：四格全部来自新组，当前色可能不在其中（此时没有任何选中态，但颜色不变）
  const i2 = newInst()
  i2.form.color = '#123456' // 不在任何一组里
  i2.paletteIndex = 1
  const after = cmp(i2, 'paletteColors')
  ok(JSON.stringify(after.map(up)) === JSON.stringify(PALETTES[1].map(up)), '换组后四格应全是新组的色')
  ok(after.filter(x => ringOf(i2.swatchStyle(x)).length > 0).length === 0,
    '当前色不在新组时不应有选中态，也不应凭空塞一格')
  ok(i2.form.color === '#123456', '换组不能改掉当前颜色')
}

// ---- P5b 逐日条：勾选「跳过周末与公共假日」后，非工作日一律不着色 ----
{
  const S = wioService && (wioService.default || wioService)
  ok(!!S, '没拿到 wioService，逐日条断言失效')
  const i = newInst()
  i.form.start = '2026-09-28'
  i.form.end = '2026-10-04' // 周一 → 周日，中间跨国庆
  i.form.skipOffDays = true
  const strip = cmp(i, 'weekStrip')
  ok(strip.length === 7, `7 天区间应展开 7 格，实际 ${strip.length}`)
  strip.forEach(d => {
    const work = S.isOfficialWorkingDay(new Date(d.key + 'T00:00:00'))
    ok(d.off === !work, `${d.key} 的着色判定不对（工作日=${work}，off=${d.off}）`)
  })
  // 10/1 是周四且是法定假日：必须被当成「不着色」，否则只是周末逻辑没覆盖假日
  const nat = strip.find(d => d.key === '2026-10-01')
  ok(nat && nat.off === true, '法定假日（周四）也应不着色')
  ok(strip.filter(d => !d.off).length === 3, `9/28-9/30 三个工作日应着色，实际 ${strip.filter(d => !d.off).length}`)

  // 关掉开关：只有周末不着色，工作日的法定假日照常着色
  i.form.skipOffDays = false
  const strip2 = cmp(i, 'weekStrip')
  const nat2 = strip2.find(d => d.key === '2026-10-01')
  ok(nat2 && nat2.off === false, '关闭跳过后，工作日法定假日应照常着色')
  const sat = strip2.find(d => d.key === '2026-10-03')
  ok(sat && sat.off === true, '关闭跳过后周末仍不着色')
}

// ---- P5 预设色都能定位到含它的组（套预设后不能出现「无选中」） ----/ ---- P5 预设色都能定位到含它的组（套预设后不能出现「无选中」） ----
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

// ---- P8 色名 / 日历预览（按天面板新增的展示层） ----
{
  const i = newInst()
  i.settings = { language: 'zh-CN' }
  i.form.color = '#A93B78'
  ok(cmp(i, 'colorName') === '品红', `已知色应取中文名，实际 ${cmp(i, 'colorName')}`)
  i.form.color = '#a93b78'
  ok(cmp(i, 'colorName') === '品红', '大小写不同也应命中色名表')
  i.settings = { language: 'en-US' }
  ok(cmp(i, 'colorName') === 'Magenta', '英文环境应取英文名')
  i.settings = { language: 'zh-CN' }
  i.form.color = '#12A3E0'
  const guess = cmp(i, 'colorName')
  ok(/^[一-龥]+$/.test(guess), `未知色应回落到中文近似名，实际 ${guess}`)

  const days = cmp(i, 'previewDays')
  ok(days.length === 3, '预览应给出 3 天')
  const today = new Date()
  ok(days[0].day === today.getDate(), '预览首格应是今天')
  const d3 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
  ok(days[2].day === d3.getDate(), '预览末格应是后天')
  ok(days.every(d => typeof d.label === 'string' && d.label.length > 0), '每格都要有日期文案')

  i.form.color = '#0E6E62'
  ok(cmp(i, 'previewTint') === 'rgba(14,110,98,0.16)', `浅底应是 16% 同色，实际 ${cmp(i, 'previewTint')}`)
  i.form.color = 'oops'
  ok(cmp(i, 'previewTint').indexOf('rgba(') === 0, '异常色值也不能产出非法 CSS')

  // 预览文案内部走 this.i18n / this.previewDays，纯对象没有 Vue 的 getter，显式挂上
  const iv = newInst()
  iv.settings = { language: 'zh-CN' }
  iv.form.color = '#0E6E62'
  Object.defineProperty(iv, 'previewDays', { get: () => opts.computed.previewDays.call(iv), configurable: true })
  Object.defineProperty(iv, 'i18n', {
    get: () => ({ profile: { customPreviewWhole: '{d} 整天', customPreviewHalf: '{d} 只休上午' } }),
    configurable: true
  })
  ok(cmp(iv, 'previewWholeText').indexOf('整天') !== -1, '整天文案缺失')
  ok(cmp(iv, 'previewHalfText').indexOf('只休上午') !== -1, '半天文案缺失')
}

fs.rmSync(entry, { force: true })
fs.rmSync(bundle, { force: true })

console.log(fails.length ? `\n失败 ${fails.length} 条：\n- ` + fails.join('\n- ') : '')
console.log(`\n全部通过：${pass} 通过 / ${fails.length} 失败`)
process.exit(fails.length ? 1 : 0)
