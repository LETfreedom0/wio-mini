// 用假 ctx 录制绘制指令 → 生成 SVG → sharp 转 PNG，肉眼核对排版
// 运行：node .workbuddy/shared-check/render.mjs
import fs from 'fs'
import { buildShareModel } from './utils/shareCard.js'
import { drawShareCard, CARD_W, CARD_H, LAYOUT, segmentWidths, PALETTE } from './utils/shareCardArt.js'
import wioService from './utils/wioService.js'

class RecCtx {
  constructor() { this.ops = []; this._weight = 400; this._size = 16; this.textAlign = 'left'; this.textBaseline = 'middle'; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1 }
  set font(v) { const m = /(\d+)\s+(\d+)px/.exec(v); if (m) { this._weight = +m[1]; this._size = +m[2] } }
  get font() { return `${this._weight} ${this._size}px x` }
  measureText(s) { return { width: measure(String(s), this._size, this._weight) } }
  fillText(s, x, y) { this.ops.push({ type: 'text', text: String(s), x, y, size: this._size, weight: this._weight, align: this.textAlign, baseline: this.textBaseline, color: this.fillStyle }) }
  fillRect(x, y, w, h) { this.ops.push({ type: 'rect', x, y, w, h, color: this.fillStyle }) }
  beginPath() {} moveTo() {} lineTo() {} arc() {} closePath() {} stroke() {} save() {} restore() {} clip() {} drawImage() {} setTransform() {}
  fill() {}
  clearRect() {}
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

const scenarios = {
  zh: { lang: 'zh-CN', stats: { workingDays: 24, companyDays: 9, homeDays: 7, vacationDays: 2, weekendLeaves: 0, totalOvertime: 12 }, target: 30 },
  en: { lang: 'en-US', stats: { workingDays: 24, companyDays: 9, homeDays: 7, vacationDays: 2, weekendLeaves: 0, totalOvertime: 12 }, target: 30 },
  miss: { lang: 'zh-CN', stats: { workingDays: 22, companyDays: 4, homeDays: 12, weekendLeaves: 0, totalOvertime: 0 }, target: 40 }
}

for (const [key, sc] of Object.entries(scenarios)) {
  wioService.getMonthStats = () => ({ ...sc.stats })
  wioService.getTargetForMonth = () => sc.target
  const model = buildShareModel(sc.lang)
  const ctx = new RecCtx()
  drawShareCard(ctx, model, null)

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let body = `<rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" fill="${PALETTE.bg}"/>`

  // 构成条
  const days = model.bar.map(s => s.days)
  const widths = segmentWidths(days, LAYOUT.bar.w, LAYOUT.bar.gap)
  let bx = LAYOUT.bar.x
  model.bar.filter(s => s.days > 0).forEach((seg, i) => {
    body += `<rect x="${bx}" y="${LAYOUT.bar.y}" width="${widths[i]}" height="${LAYOUT.bar.h}" rx="${LAYOUT.bar.r}" fill="${seg.color}"/>`
    bx += widths[i] + LAYOUT.bar.gap
  })

  // 徽章
  const B = LAYOUT.badge
  const accent = model.achieved ? PALETTE.hero : PALETTE.miss
  body += `<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="${B.r}" fill="${PALETTE.bg}" stroke="${accent}" stroke-width="2"/>`

  // 二维码占位
  const Q = LAYOUT.qr
  body += `<rect x="${Q.x}" y="${Q.y}" width="${Q.size}" height="${Q.size}" rx="${Q.r}" fill="${PALETTE.qrBg}" stroke="${PALETTE.line}"/>`
  body += `<text x="${Q.x + Q.size / 2}" y="${Q.y + Q.size / 2}" font-size="26" fill="#C9C5B6" text-anchor="middle" dominant-baseline="central" font-family="Arial">WIO</text>`

  // 文字
  ctx.ops.forEach(op => {
    if (op.type === 'rect') {
      // 背景已在 body 开头手写过；drawShareCard 的 fillRect(0,0,W,H) 若再输出
      // 会排到徽章描边之后，把整卡描边盖掉（离线渲染图一直缺徽章框的原因）
      if (op.w === CARD_W && op.h === CARD_H) return
      body += `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${op.color}"/>`
      return
    }
    const anchor = op.align === 'right' ? 'end' : op.align === 'center' ? 'middle' : 'start'
    // alphabetic 基线的文字（大数字/百分号）不加 dominant-baseline，SVG 默认就是基线落点
    const dv = op.baseline === 'alphabetic' ? '' : ' dominant-baseline="central"'
    body += `<text x="${op.x}" y="${op.y}" font-size="${op.size}" font-weight="${op.weight}" fill="${op.color}" text-anchor="${anchor}"${dv} font-family="Arial, 'Microsoft YaHei', sans-serif">${esc(op.text)}</text>`
  })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">${body}</svg>`
  fs.writeFileSync(`${key}.svg`, svg)

  const sharp = (await import('sharp')).default
  await sharp(Buffer.from(svg)).png().toFile(`${key}.png`)
  console.log(`${key}.png 生成：${model.rate}% ${model.gapText} | ${model.cols.map(c => c.label + c.value).join(' ')}`)
}
