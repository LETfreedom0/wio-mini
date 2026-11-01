// ============================================================
// 月度战绩分享卡 · 绘制层（纯函数，不含任何 uni / wx API）
//
// 坐标系与 Ardot 设计稿 1:1：750 × 1000（3:4），即设计稿像素直接当画布单位。
// 之所以把绘制和取数分开，是为了能在 Node 里离线校验布局（不依赖小程序环境）。
//
// 文本一律用 textBaseline='middle' 按「框的垂直中心」落笔：
// Figma 的 y 是文本框顶部，Canvas 的 y 是基线，直接用顶部会整体偏上；
// 用中点对齐可以绕开字体 ascent/descent 差异，中英文都不会飘。
// ============================================================

export const CARD_W = 750
export const CARD_H = 1000

const FONT_STACK = '-apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif'

export const PALETTE = {
  bg: '#FFFDF8',
  brand: '#A0A6AD',
  label: '#6B737B',
  hero: '#0E6E62',
  miss: '#B0503F',
  ink: '#15181C',
  muted: '#8A9099',
  gold: '#A87B1F',
  line: '#E7E3D8',
  barCompany: '#0E6E62',
  barHome: '#7FB3AA',
  barLeave: '#C9C5B6',
  barRest: '#E7E3D8',
  qrBg: '#F5F3EC'
}

// 设计稿坐标（与 Ardot 文件 742700538274468 的 V2b 帧一致）
export const LAYOUT = {
  brand: { x: 56, y: 52, w: 300, h: 38, size: 26, weight: 500 },
  month: { x: 538, y: 52, w: 156, h: 38, size: 26, weight: 500, align: 'right' },
  title: { x: 54, y: 136, w: 440, h: 42, size: 30, weight: 400 },
  hero: { x: 48, y: 172, w: 264, h: 340, size: 220, weight: 700 },
  percent: { size: 88, centerY: 315 },
  badge: { x: 500, y: 222, w: 196, h: 54, r: 27, size: 26 },
  otLine1: { x: 400, y: 352, w: 294, h: 44, size: 32, weight: 500, align: 'right' },
  otLine2: { x: 400, y: 408, w: 294, h: 34, size: 24, weight: 400, align: 'right' },
  gap: { x: 54, y: 470, w: 430, h: 42, size: 30, weight: 500 },
  section: { x: 54, y: 524, w: 520, h: 38, size: 26, weight: 400 },
  bar: { x: 56, y: 576, w: 638, h: 10, gap: 6, r: 5 },
  dataRow: {
    x: 54, w: 638, y: 622,
    valueH: 52, valueSize: 40,
    unitH: 34, unitSize: 26,
    labelY: 678, labelH: 36, labelSize: 26
  },
  divider: { x: 56, y: 760, w: 638, h: 1 },
  qr: { x: 56, y: 800, size: 118, r: 10 },
  footer1: { x: 200, y: 812, w: 460, h: 42, size: 28, weight: 500 },
  footer2: { x: 200, y: 860, w: 480, h: 38, size: 26, weight: 400 }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + rr)
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function setFont(ctx, size, weight) {
  ctx.font = `${weight || 400} ${size}px ${FONT_STACK}`
}

/**
 * 画一行文字。宽度超出 maxWidth 时等比缩字号（不低于 minSize），
 * 保证英文长词 / 三位数不会溢出到相邻元素上。
 */
function drawText(ctx, str, box, opts = {}) {
  if (str === undefined || str === null || str === '') return 0
  const text = String(str)
  const weight = opts.weight || box.weight || 400
  const maxWidth = opts.maxWidth || box.w
  let size = box.size
  setFont(ctx, size, weight)
  let width = ctx.measureText(text).width
  if (width > maxWidth && width > 0) {
    size = Math.max(opts.minSize || 16, Math.floor((size * maxWidth) / width))
    setFont(ctx, size, weight)
    width = ctx.measureText(text).width
  }
  ctx.fillStyle = opts.color
  ctx.textAlign = box.align === 'right' ? 'right' : box.align === 'center' ? 'center' : 'left'
  ctx.textBaseline = 'middle'
  const dx = box.align === 'right' ? box.x + box.w
    : box.align === 'center' ? box.x + box.w / 2
      : box.x
  ctx.fillText(text, dx, box.y + box.h / 2)
  return width
}

/** 构成条：按天数分配宽度，窄段有下限，缺口从最宽那段扣 */
export function segmentWidths(days, totalWidth, gap, minWidth = 6) {
  const list = days.filter(d => d > 0)
  if (!list.length) return []
  const total = list.reduce((a, b) => a + b, 0)
  const free = totalWidth - gap * (list.length - 1)
  const widths = list.map(d => (free * d) / total)
  let deficit = 0
  widths.forEach((w, i) => {
    if (w < minWidth) {
      deficit += minWidth - w
      widths[i] = minWidth
    }
  })
  if (deficit > 0) {
    let donor = 0
    widths.forEach((w, i) => { if (w > widths[donor]) donor = i })
    widths[donor] = Math.max(minWidth, widths[donor] - deficit)
  }
  return widths
}

function drawBar(ctx, segments, box) {
  const days = segments.map(s => s.days)
  const widths = segmentWidths(days, box.w, box.gap)
  if (!widths.length) return
  let x = box.x
  segments.filter(s => s.days > 0).forEach((seg, i) => {
    roundRect(ctx, x, box.y, widths[i], box.h, box.r)
    ctx.fillStyle = seg.color
    ctx.fill()
    x += widths[i] + box.gap
  })
}

function drawQr(ctx, qrImage, box, placeholderText) {
  if (qrImage) {
    ctx.save()
    roundRect(ctx, box.x, box.y, box.size, box.size, box.r)
    ctx.clip()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(box.x, box.y, box.size, box.size)
    ctx.drawImage(qrImage, box.x, box.y, box.size, box.size)
    ctx.restore()
  } else {
    // 小程序码拿不到（云函数未部署 / 未联网）：画同尺寸占位块，版面不塌
    roundRect(ctx, box.x, box.y, box.size, box.size, box.r)
    ctx.fillStyle = PALETTE.qrBg
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#C9C5B6'
    setFont(ctx, 26, 600)
    ctx.fillText(placeholderText, box.x + box.size / 2, box.y + box.size / 2)
  }
  roundRect(ctx, box.x, box.y, box.size, box.size, box.r)
  ctx.lineWidth = 1
  ctx.strokeStyle = PALETTE.line
  ctx.stroke()
}

/**
 * 主绘制入口
 * @param {*} ctx Canvas 2D 上下文
 * @param {object} m   buildShareModel() 产出的文案 + 数值
 * @param {*} qrImage  已 load 的二维码图片对象（canvas.createImage()），可为 null
 */
export function drawShareCard(ctx, m, qrImage) {
  const P = PALETTE
  const L = LAYOUT

  ctx.clearRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  drawText(ctx, m.brand, L.brand, { color: P.brand })
  drawText(ctx, m.monthText, L.month, { color: P.brand })
  drawText(ctx, m.title, L.title, { color: P.label })

  // ---- 大数字 + 百分号（百分号跟随数字宽度，不写死 x）----
  const heroStr = String(m.rate)
  setFont(ctx, L.hero.size, 700)
  let heroWidth = ctx.measureText(heroStr).width
  if (heroWidth > L.hero.w) {
    const s2 = Math.floor((L.hero.size * L.hero.w) / heroWidth)
    setFont(ctx, s2, 700)
    heroWidth = ctx.measureText(heroStr).width
  }
  ctx.fillStyle = P.hero
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(heroStr, L.hero.x, L.hero.y + L.hero.h / 2)

  setFont(ctx, L.percent.size, 700)
  const pctWidth = ctx.measureText('%').width
  const px = Math.min(L.hero.x + heroWidth + 8, L.badge.x - pctWidth - 20)
  ctx.fillText('%', px, L.percent.centerY)

  // ---- 状态徽章 ----
  const B = L.badge
  const accent = m.achieved ? P.hero : P.miss
  roundRect(ctx, B.x, B.y, B.w, B.h, B.r)
  ctx.fillStyle = P.bg
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = accent
  ctx.stroke()
  drawText(ctx, m.badgeText,
    { x: B.x, y: B.y, w: B.w, h: B.h, size: B.size, align: 'center' },
    { color: accent, maxWidth: B.w - 24 })

  // ---- 加班换算（右侧，加班为 0 时整块不画）----
  if (m.hasOt) {
    drawText(ctx, m.otLine1, L.otLine1, { color: P.ink })
    drawText(ctx, m.otLine2, L.otLine2, { color: P.gold })
  }

  // ---- 超标 / 还差 ----
  drawText(ctx, m.gapText, L.gap, { color: P.gold })

  // ---- 构成条 ----
  drawText(ctx, m.compositionText, L.section, { color: P.muted })
  drawBar(ctx, m.bar, L.bar)

  // ---- 数据行（列数随内容变化，等分 638）----
  const D = L.dataRow
  const cols = m.cols || []
  const step = cols.length ? D.w / cols.length : D.w
  cols.forEach((col, i) => {
    const x = D.x + i * step
    const valueColor = col.accent ? P.gold : P.ink
    setFont(ctx, D.valueSize, 700)
    const vw = ctx.measureText(String(col.value)).width
    setFont(ctx, D.valueSize, 700)
    ctx.fillStyle = valueColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(col.value), x, D.y + D.valueH / 2)

    drawText(ctx, col.unit,
      { x: x + vw + 6, y: D.y + 16, w: 60, h: D.unitH, size: D.unitSize },
      { color: P.muted })
    drawText(ctx, col.label,
      { x, y: D.labelY, w: step - 12, h: D.labelH, size: D.labelSize },
      { color: P.muted, minSize: 18 })
  })

  // ---- 分隔线 ----
  ctx.fillStyle = P.line
  ctx.fillRect(L.divider.x, L.divider.y, L.divider.w, L.divider.h)

  // ---- 二维码 + 说明 ----
  drawQr(ctx, qrImage, L.qr, m.qrPlaceholder || 'WIO')
  drawText(ctx, m.footer1, L.footer1, { color: P.ink })
  drawText(ctx, m.footer2, L.footer2, { color: P.muted })
}
