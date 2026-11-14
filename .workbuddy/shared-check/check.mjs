// 分享卡离线校验：用假 ctx 记录每个 fillText 的位置，检查越界 / 重叠 / 断行
// 运行：node .workbuddy/shared-check/check.mjs
import { buildShareModel } from './utils/shareCard.js'
import { drawShareCard, CARD_W, CARD_H, LAYOUT_CALENDAR, LAYOUT_RECEIPT, STYLES } from './utils/shareCardArt.js'
import wioService from './utils/wioService.js'

// ---------- 假 canvas 上下文 ----------
class FakeCtx {
  constructor() {
    this.ops = []
    this.shapes = []
    this._weight = 400
    this._size = 16
    this._pts = []
    this.textAlign = 'left'
    this.textBaseline = 'alphabetic'
    this.lineWidth = 1
    this.fillStyle = '#000'
    this.strokeStyle = '#000'
  }
  set font(v) { const m = /(\d+)\s+(\d+)px/.exec(v); if (m) { this._weight = +m[1]; this._size = +m[2] } }
  get font() { return `${this._weight} ${this._size}px x` }
  measureText(s) { return { width: measure(String(s), this._size, this._weight) } }
  fillText(s, x, y) {
    this.ops.push({ text: String(s), x, y, size: this._size, align: this.textAlign, baseline: this.textBaseline, w: measure(String(s), this._size, this._weight) })
  }
  fillRect(x, y, w, h) { this.shapes.push({ x0: x, y0: y, x1: x + w, y1: y + h, fill: this.fillStyle }) }
  clearRect() {}
  beginPath() { this._pts = [] }
  moveTo(x, y) { this._pts.push([x, y]) }
  lineTo(x, y) { this._pts.push([x, y]) }
  arc(cx, cy, r) { this._pts.push([cx - r, cy - r], [cx + r, cy + r]) }
  closePath() {}
  fill() { this._commit('fill') }
  stroke() { this._commit('stroke') }
  _commit(kind) {
    if (!this._pts.length) return
    const xs = this._pts.map(p => p[0]), ys = this._pts.map(p => p[1])
    this.shapes.push({
      x0: Math.min(...xs), y0: Math.min(...ys),
      x1: Math.max(...xs), y1: Math.max(...ys),
      kind, stroke: this.strokeStyle
    })
  }
  setLineDash() {}
  save() {} restore() {} clip() {} drawImage() {} setTransform() {}
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
  // alphabetic 基线：数字字形几乎全在基线上方，cap≈0.72em，下延很小。
  // 这里必须用真实 cap 比例，用 0.8 会把大数字算高 20px，误报它顶到标题上。
  if (op.baseline === 'alphabetic') {
    return { x0, x1: x0 + op.w, y0: op.y - op.size * 0.72, y1: op.y + op.size * 0.03 }
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

for (const style of STYLES.map(s => s.key)) {
  for (const lang of ['zh-CN', 'en-US']) {
    for (const sc of scenarios) {
      wioService.getMonthStats = () => ({ ...sc.stats })
      wioService.getTargetForMonth = () => sc.target
      // 足迹版要按天摆格子：Node 里没有 uni，给一份稳定的假日历消掉噪音
      wioService.getEntries = () => {
        const today = new Date()
        const y = today.getFullYear(), m = today.getMonth() + 1
        const out = {}
        for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
          const wd = new Date(y, m - 1, d).getDay()
          if (wd === 0 || wd === 6) continue
          const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          out[ds] = d % 9 === 0 ? 'vacation' : d % 4 === 3 ? 'home' : 'company'
        }
        return out
      }
      wioService.isOfficialWorkingDay = dt => dt.getDay() !== 0 && dt.getDay() !== 6
      const model = buildShareModel(lang)
      const ctx = new FakeCtx()
      drawShareCard(ctx, model, null, style)

      // 1) 全部文字不出画布
      ctx.ops.forEach(op => {
        const b = bbox(op)
        if (b.x0 < 0 || b.x1 > CARD_W || b.y0 < 0 || b.y1 > CARD_H) {
          fail(`[${style}/${lang}/${sc.name}] 越界: "${op.text}" x[${b.x0.toFixed(0)},${b.x1.toFixed(0)}] y[${b.y0.toFixed(0)},${b.y1.toFixed(0)}]`)
        }
        if (b.x1 > 694 + 1) fail(`[${style}/${lang}/${sc.name}] 超过右边距: "${op.text}" 右缘 ${b.x1.toFixed(0)}`)
      })

      // 2) 文字之间不重叠
      for (let i = 0; i < ctx.ops.length; i++) {
        for (let j = i + 1; j < ctx.ops.length; j++) {
          const a = bbox(ctx.ops[i]), b = bbox(ctx.ops[j])
          const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
          const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
          if (ox > 1 && oy > 1) {
            fail(`[${style}/${lang}/${sc.name}] 重叠: "${ctx.ops[i].text}" × "${ctx.ops[j].text}" (${ox.toFixed(0)}×${oy.toFixed(0)}px)`)
          }
        }
      }

      // 3) 各样式专属：格阵不越界 / 收银条不压底部虚线
      if (style === 'calendar') {
        const g = LAYOUT_CALENDAR.grid
        const right = ctx.shapes
          .filter(s => s.y0 >= g.y - 1 && s.y1 <= g.y + g.h + 1 && s.x0 >= g.x - 1)
          .reduce((m, s) => Math.max(m, s.x1), 0)
        if (right > 694 + 1) fail(`[${style}/${lang}/${sc.name}] 格子阵越界: 最右 ${right.toFixed(1)}`)
        if (!ctx.shapes.some(s => s.y0 >= g.y - 1 && s.y1 <= g.y + g.h + 1)) {
          fail(`[${style}/${lang}/${sc.name}] 格子阵没画出来`)
        }
      } else {
        // 小票卡有票身（952 为底）；结算三版是整幅画布，按画布底算
        const bottomLimit = style === 'receipt'
          ? LAYOUT_RECEIPT.paper.y + LAYOUT_RECEIPT.paper.h
          : CARD_H - 4
        const maxBottom = ctx.ops.reduce((m, op) => Math.max(m, bbox(op).y1), 0)
        if (maxBottom > bottomLimit) {
          fail(`[${style}/${lang}/${sc.name}] 文字压到票底: 最低 ${maxBottom.toFixed(0)} > ${bottomLimit}`)
        }
      }

      console.log(`✓ ${style} / ${lang} / ${sc.name}: ${ctx.ops.length} 段文字, 构成 ${model.bar.filter(s => s.days > 0).map(s => s.days).join('/')} | ${model.rate}% | 列 ${model.cols.map(c => c.label + c.value).join(' ')}`)
    }
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
