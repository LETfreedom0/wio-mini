// 用假 ctx 录制绘制指令 → 生成 SVG → sharp 转 PNG，肉眼核对排版
// 两套卡面都渲染：calendar-zh / receipt-zh / calendar-miss / receipt-miss …
// 运行：node .workbuddy/shared-check/render.mjs
import fs from 'fs'
import { buildShareModel } from './utils/shareCard.js'
import { drawShareCard, CARD_W, CARD_H, STYLES } from './utils/shareCardArt.js'
import wioService from './utils/wioService.js'

class RecCtx {
  constructor() {
    this.ops = []
    this._weight = 400
    this._size = 16
    this._d = []
    this.textAlign = 'left'
    this.textBaseline = 'middle'
    this.fillStyle = '#000'
    this.strokeStyle = '#000'
    this.lineWidth = 1
    this.lineCap = 'butt'
    this._dash = []
  }
  set font(v) { const m = /(\d+)\s+(\d+)px/.exec(v); if (m) { this._weight = +m[1]; this._size = +m[2] } }
  get font() { return `${this._weight} ${this._size}px x` }
  measureText(s) { return { width: measure(String(s), this._size, this._weight) } }
  fillText(s, x, y) {
    this.ops.push({ type: 'text', text: String(s), x, y, size: this._size, weight: this._weight, align: this.textAlign, baseline: this.textBaseline, color: this.fillStyle })
  }
  fillRect(x, y, w, h) { this.ops.push({ type: 'rect', x, y, w, h, color: this.fillStyle }) }
  clearRect() {}
  setLineDash(arr) { this._dash = arr || [] }
  beginPath() { this._d = [] }
  moveTo(x, y) { this._d.push(`M${r(x)} ${r(y)}`) }
  lineTo(x, y) { this._d.push(`L${r(x)} ${r(y)}`) }
  arc(cx, cy, rad, a0, a1) {
    const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6
    const sx = cx + rad * Math.cos(a0), sy = cy + rad * Math.sin(a0)
    if (this._d.length) this._d.push(`L${r(sx)} ${r(sy)}`)
    else this._d.push(`M${r(sx)} ${r(sy)}`)
    if (full) {
      // 整圆：SVG 的单条 A 命令画不出 360°，拆成两个半圆
      const mx = cx + rad * Math.cos(a0 + Math.PI), my = cy + rad * Math.sin(a0 + Math.PI)
      this._d.push(`A${r(rad)} ${r(rad)} 0 0 1 ${r(mx)} ${r(my)}`)
      this._d.push(`A${r(rad)} ${r(rad)} 0 0 1 ${r(sx)} ${r(sy)}`)
      return
    }
    const ex = cx + rad * Math.cos(a1), ey = cy + rad * Math.sin(a1)
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
    const sweep = a1 > a0 ? 1 : 0
    this._d.push(`A${r(rad)} ${r(rad)} 0 ${large} ${sweep} ${r(ex)} ${r(ey)}`)
  }
  closePath() { this._d.push('Z') }
  fill() {
    if (!this._d.length) return
    this.ops.push({ type: 'path', d: this._d.join(' '), fill: this.fillStyle, stroke: null })
  }
  stroke() {
    if (!this._d.length) return
    this.ops.push({
      type: 'path', d: this._d.join(' '), fill: null,
      stroke: this.strokeStyle, width: this.lineWidth,
      dash: this._dash.slice(), cap: this.lineCap
    })
  }
  save() {} restore() {} clip() {} drawImage() {} setTransform() {}
}

function r(n) { return Math.round(n * 100) / 100 }

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

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const scenarios = {
  zh: { lang: 'zh-CN', stats: { workingDays: 24, companyDays: 9, homeDays: 7, vacationDays: 2, weekendLeaves: 0, totalOvertime: 12 }, target: 30 },
  en: { lang: 'en-US', stats: { workingDays: 24, companyDays: 9, homeDays: 7, vacationDays: 2, weekendLeaves: 0, totalOvertime: 12 }, target: 30 },
  miss: { lang: 'zh-CN', stats: { workingDays: 22, companyDays: 4, homeDays: 12, weekendLeaves: 0, totalOvertime: 0 }, target: 40 }
}

const sharp = (await import('sharp')).default

for (const style of STYLES.map(s => s.key)) {
  for (const [key, sc] of Object.entries(scenarios)) {
    wioService.getMonthStats = () => ({ ...sc.stats })
    wioService.getTargetForMonth = () => sc.target
    const model = buildShareModel(sc.lang)
    const ctx = new RecCtx()
    drawShareCard(ctx, model, null, style)

    let body = ''
    ctx.ops.forEach(op => {
      if (op.type === 'rect') {
        body += `<rect x="${r(op.x)}" y="${r(op.y)}" width="${r(op.w)}" height="${r(op.h)}" fill="${op.color}"/>`
        return
      }
      if (op.type === 'path') {
        const fill = op.fill ? ` fill="${op.fill}"` : ' fill="none"'
        const stroke = op.stroke
          ? ` stroke="${op.stroke}" stroke-width="${op.width}"` +
            (op.dash && op.dash.length ? ` stroke-dasharray="${op.dash.join(' ')}"` : '') +
            (op.cap && op.cap !== 'butt' ? ` stroke-linecap="${op.cap}"` : '')
          : ''
        body += `<path d="${op.d}"${fill}${stroke}/>`
        return
      }
      const anchor = op.align === 'right' ? 'end' : op.align === 'center' ? 'middle' : 'start'
      // alphabetic 基线的文字（大数字 / 百分号）不加 dominant-baseline，SVG 默认就是基线落点
      const dv = op.baseline === 'alphabetic' ? '' : ' dominant-baseline="central"'
      body += `<text x="${r(op.x)}" y="${r(op.y)}" font-size="${op.size}" font-weight="${op.weight}" fill="${op.color}" text-anchor="${anchor}"${dv} font-family="PingFang SC, 'Microsoft YaHei', Arial, sans-serif">${esc(op.text)}</text>`
    })

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">${body}</svg>`
    const name = `${style}-${key}`
    fs.writeFileSync(`${name}.svg`, svg)
    await sharp(Buffer.from(svg)).png().toFile(`${name}.png`)
    console.log(`${name}.png 生成：${model.rate}% ${model.gapText} | ${model.cols.map(c => c.label + c.value).join(' ')}`)
  }
}
