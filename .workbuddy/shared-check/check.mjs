// 分享卡离线校验：用假 ctx 记录每个 fillText 的位置，检查越界 / 重叠 / 断行
// 运行：node .workbuddy/shared-check/check.mjs
import { buildShareModel } from './utils/shareCard.js'
import { drawShareCard, CARD_W, CARD_H, LAYOUT, segmentWidths } from './utils/shareCardArt.js'
import wioService from './utils/wioService.js'

// ---------- 假 canvas 上下文 ----------
class FakeCtx {
  constructor() { this.ops = []; this._weight = 400; this._size = 16; this.textAlign = 'left'; this.textBaseline = 'alphabetic' }
  set font(v) { const m = /(\d+)\s+(\d+)px/.exec(v); if (m) { this._weight = +m[1]; this._size = +m[2] } }
  get font() { return `${this._weight} ${this._size}px x` }
  measureText(s) { return { width: measure(String(s), this._size, this._weight) } }
  fillText(s, x, y) {
    this.ops.push({ text: String(s), x, y, size: this._size, align: this.textAlign, baseline: this.textBaseline, w: measure(String(s), this._size, this._weight) })
  }
  fillRect() {}
  clearRect() {}
  beginPath() {} moveTo() {} lineTo() {} arc() {} closePath() {} fill() {} stroke() {} save() {} restore() {} clip() {} drawImage() {} setTransform() {}
}

function measure(s, size, weight) {
  const k = weight >= 700 ? 1.08 : weight >= 600 ? 1.04 : weight >= 500 ? 1.02 : 1
  let w = 0
  for (const ch of s) {
    if (/[\u4e00-\u9fa5]/.test(ch)) w += 1
    else if (/[0-9]/.test(ch)) w += 0.565
    else if (/[A-Z]/.test(ch)) w += 0.63
    else if (/[a-z]/.test(ch)) w += 0.52
    else if (ch === ' ') w += 0.27
    else if (ch === '%') w += 0.86
    else if (ch === '·') w += 0.3
    else w += 0.9
  }
  return w * size * k
}

function bbox(op) {
  const x0 = op.align === 'right' ? op.x - op.w : op.align === 'center' ? op.x - op.w / 2 : op.x
  // alphabetic 基线：字形几乎全在基线上方（数字 cap≈0.78em，下延≈0.04em）
  if (op.baseline === 'alphabetic') {
    return { x0, x1: x0 + op.w, y0: op.y - op.size * 0.8, y1: op.y + op.size * 0.06 }
  }
  return { x0, x1: x0 + op.w, y0: op.y - op.size * 0.55, y1: op.y + op.size * 0.55 }
}

// ---------- 场景 ----------
const scenarios = [
  { name: '常规·达标(年假2天,加班12h)', stats: { workingDays: 24, companyDays: 9, homeDays: 7, vacationDays: 2, totalOvertime: 12 }, target: 30 },
  { name: '未达标(无假期,无加班)', stats: { workingDays: 22, companyDays: 4, homeDays: 12, totalOvertime: 0 }, target: 40 },
  { name: '全月到公司(100%)', stats: { workingDays: 20, companyDays: 20, homeDays: 0, totalOvertime: 40 }, target: 40 },
  { name: '多假期混排', stats: { workingDays: 21, companyDays: 8, homeDays: 6, vacationDays: 2, sickDays: 1, compOffDays: 1, excludeWioDays: 1, customLeaveDays: 2, totalOvertime: 6 }, target: 35 },
  { name: '月初几乎空', stats: { workingDays: 22, companyDays: 1, homeDays: 0, totalOvertime: 1.5 }, target: 40 },
  { name: '周末标记假期(weekendLeaves)', stats: { workingDays: 20, companyDays: 10, homeDays: 5, vacationDays: 3, weekendLeaves: 1, totalOvertime: 8 }, target: 30 }
]

const problems = []
function fail(msg) { problems.push(msg) }

for (const lang of ['zh-CN', 'en-US']) {
  for (const sc of scenarios) {
    wioService.getMonthStats = () => ({ ...sc.stats })
    wioService.getTargetForMonth = () => sc.target
    const model = buildShareModel(lang)
    const ctx = new FakeCtx()
    drawShareCard(ctx, model, null)

    // 1) 全部文字不出画布
    ctx.ops.forEach(op => {
      const b = bbox(op)
      if (b.x0 < 0 || b.x1 > CARD_W || b.y0 < 0 || b.y1 > CARD_H) {
        fail(`[${lang}/${sc.name}] 越界: "${op.text}" x[${b.x0.toFixed(0)},${b.x1.toFixed(0)}] y[${b.y0.toFixed(0)},${b.y1.toFixed(0)}]`)
      }
      if (b.x1 > 694 + 1) fail(`[${lang}/${sc.name}] 超过右边距: "${op.text}" 右缘 ${b.x1.toFixed(0)}`)
    })

    // 2) 文字之间不重叠
    for (let i = 0; i < ctx.ops.length; i++) {
      for (let j = i + 1; j < ctx.ops.length; j++) {
        const a = bbox(ctx.ops[i]), b = bbox(ctx.ops[j])
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
        if (ox > 1 && oy > 1) {
          fail(`[${lang}/${sc.name}] 重叠: "${ctx.ops[i].text}" × "${ctx.ops[j].text}" (${ox.toFixed(0)}×${oy.toFixed(0)}px)`)
        }
      }
    }

    // 3) 数据列：标签不能压到下一列
    const cols = model.cols
    const step = LAYOUT.dataRow.w / cols.length
    const labels = ctx.ops.filter(o => o.y > LAYOUT.dataRow.labelY && o.y < LAYOUT.dataRow.labelY + LAYOUT.dataRow.labelH)
    labels.forEach((op, idx) => {
      if (idx < labels.length - 1 && bbox(op).x1 > LAYOUT.dataRow.x + idx * step + step - 4) {
        fail(`[${lang}/${sc.name}] 列标签超列宽: "${op.text}"`)
      }
    })

    // 4) 构成条：段宽合计不能超过轨道
    const widths = segmentWidths(model.bar.map(s => s.days), LAYOUT.bar.w, LAYOUT.bar.gap)
    if (widths.length) {
      const used = widths.reduce((a, b) => a + b, 0) + LAYOUT.bar.gap * (widths.length - 1)
      if (used > LAYOUT.bar.w + 0.5) fail(`[${lang}/${sc.name}] 构成条溢出: ${used.toFixed(1)} > ${LAYOUT.bar.w}`)
    }

    console.log(`✓ ${lang} / ${sc.name}: ${ctx.ops.length} 段文字, 构成 ${model.bar.filter(s => s.days > 0).map(s => s.days).join('/')} | ${model.rate}% | 列 ${cols.map(c => c.label + c.value).join(' ')}`)
  }
}

// ---------- 数据口径断言 ----------
wioService.getMonthStats = () => ({ workingDays: 24, companyDays: 9, homeDays: 7, vacationDays: 2, weekendLeaves: 0, totalOvertime: 12 })
wioService.getTargetForMonth = () => 30
const m1 = buildShareModel('zh-CN')
const cases = [
  ['率 = 公司 ÷ (工作日 − 休假)', m1.rate, Math.round(9 / 22 * 100)],
  ['剩余 = 工作日 − 公司 − 居家 − 休假', m1.report.rest, 6],
  ['加班天数换算 12h→1.5天', m1.report.otDays, 1.5],
  ['单假期 → 列名显示具体假期', m1.cols[2].label, '年假'],
  ['数据行为四列', m1.cols.length, 4]
]
cases.forEach(([name, actual, expect]) => {
  if (actual !== expect) fail(`口径错误: ${name} = ${actual}，应为 ${expect}`)
  else console.log(`✓ ${name} = ${actual}`)
})

// 多假期 → 列名回退「休假」
wioService.getMonthStats = () => ({ workingDays: 21, companyDays: 8, homeDays: 6, vacationDays: 2, sickDays: 1, weekendLeaves: 0 })
const m2 = buildShareModel('zh-CN')
if (m2.cols[2].label !== '休假') fail(`多假期列名应为「休假」，实际 ${m2.cols[2].label}`)
else console.log('✓ 多假期 → 列名回退「休假」')

// 无假期 → 三列；无加班 → 右侧隐藏
wioService.getMonthStats = () => ({ workingDays: 22, companyDays: 10, homeDays: 5, weekendLeaves: 0, totalOvertime: 0 })
const m3 = buildShareModel('en-US')
if (m3.cols.length !== 3) fail(`无假期应为三列，实际 ${m3.cols.length}`)
if (m3.hasOt) fail('无加班时 hasOt 应为 false')
console.log(`✓ 无假期三列: ${m3.cols.map(c => c.label).join(' / ')}，hasOt=${m3.hasOt}`)

console.log(problems.length ? `\n发现 ${problems.length} 处问题:\n` + problems.join('\n') : '\n全部通过')
