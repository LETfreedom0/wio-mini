// ============================================================
// 分享卡 · 公共绘图原语
//
// 卡面有两套样式（日历风 / 小票风），排版完全不同，但都建在同一层原语上：
// 圆角矩形、文字（含自动缩字号）、二维码、构成条分段。
// 这一层不含任何样式判断，样式模块只描述「画在哪、画多大」。
//
// 坐标与设计稿 1:1：750 × 1000，设计稿像素直接当画布单位。
// 纯函数，不依赖 uni / wx，可在 Node 里离线跑（断言与预览都靠这一点）。
// ============================================================

export const CARD_W = 750
export const CARD_H = 1000

export const FONT_STACK = '-apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif'

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
  // 日历格里「居家」要比构成条里更浅一档：格子小，同色会糊成一片
  gridHome: '#5FA89E',
  gridLeave: '#C08A2D',
  gridEmpty: '#F7F4EC',
  gridEmptyLine: '#D8D2C4',
  // 小票风的外底色与票身
  paper: '#FFFDF6',
  paperOuter: '#EAE4D8',
  paperDashed: '#D8D2C4',
  qrBg: '#F5F3EC'
}

/** 数字字形高占字号的实测比例：各平台字体稳定在 0.72~0.75，取中位 0.73 */
export const CAP_RATIO = 0.73

export function roundRect(ctx, x, y, w, h, r) {
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

export function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

export function strokeRoundRect(ctx, x, y, w, h, r, color, lineWidth) {
  roundRect(ctx, x, y, w, h, r)
  ctx.lineWidth = lineWidth || 1
  ctx.strokeStyle = color
  ctx.stroke()
}

export function fillCircle(ctx, cx, cy, r, color) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

export function strokeCircle(ctx, cx, cy, r, color, lineWidth) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = lineWidth || 1
  ctx.strokeStyle = color
  ctx.stroke()
}

/**
 * 虚线。微信 canvas 2d 支持 setLineDash，但旧基础库 / 部分安卓机缺失，
 * 缺了就退回实线——宁可少一点票根感，也不能让整张卡画不出来。
 */
export function dashLine(ctx, x1, y1, x2, y2, color, lineWidth, dash, gap) {
  ctx.beginPath()
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([dash, gap])
  }
  ctx.lineWidth = lineWidth || 1
  ctx.strokeStyle = color
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([])
}

export function setFont(ctx, size, weight) {
  ctx.font = `${weight || 400} ${size}px ${FONT_STACK}`
}

/**
 * 画一行文字。宽度超出 maxWidth 时等比缩字号（不低于 minSize），
 * 保证英文长词 / 三位数不会溢出到相邻元素上。
 * box.y 是「框顶」，用 middle 落笔——中文行高差异大，只有中点对齐才稳。
 */
export function drawText(ctx, str, box, opts = {}) {
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

/**
 * 特大数字：按 alphabetic 基线落笔。
 *
 * 千万不要用 middle 画大数字——微信 canvas 的 middle 相对字形中心有约
 * 0.12em 的平台偏移（iOS / 安卓 / 开发者工具各不相同），260px 的字就是
 * 30px 错位，真机实测字形顶会跑到目标上方 38px。
 * 数字字形高（capHeight）各平台都稳定在 0.72~0.75em，用基线定位误差 ≤4px。
 *
 * @param {number} top 期望的字形顶边 y
 * @param {number} maxW 可用宽度，超出等比缩字号
 * @returns {{size:number, width:number}} 实际字号与宽度
 */
export function drawHeroNumber(ctx, str, x, top, size, maxW, opts = {}) {
  let s = size
  setFont(ctx, s, opts.weight || 700)
  let width = ctx.measureText(String(str)).width
  if (width > maxW) {
    s = Math.floor((s * maxW) / width)
    setFont(ctx, s, opts.weight || 700)
    width = ctx.measureText(String(str)).width
  }
  ctx.fillStyle = opts.color
  ctx.textAlign = opts.align || 'left'
  ctx.textBaseline = 'alphabetic'
  const dx = opts.align === 'right' ? x
    : opts.align === 'center' ? x
      : x
  ctx.fillText(String(str), dx, top + s * CAP_RATIO)
  return { size: s, width }
}

/** 百分号：跟随数字字号等比缩放，顶边比数字低 topRatio 个字高，保留上标感 */
export function drawPercent(ctx, x, top, heroSize, ratio, topRatio, color) {
  const s = Math.round(heroSize * ratio)
  setFont(ctx, s, 700)
  const w = ctx.measureText('%').width
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('%', x, top + heroSize * topRatio + s * CAP_RATIO)
  return w
}

export function drawQr(ctx, qrImage, box, placeholderText) {
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
    fillRoundRect(ctx, box.x, box.y, box.size, box.size, box.r, PALETTE.qrBg)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#C9C5B6'
    setFont(ctx, Math.round(box.size * 0.22), 600)
    ctx.fillText(placeholderText, box.x + box.size / 2, box.y + box.size / 2)
  }
  strokeRoundRect(ctx, box.x, box.y, box.size, box.size, box.r, PALETTE.line, 1)
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

/**
 * 把构成条的四段天数摊开成一天一格的序列。
 * 两种样式共用：日历风直接画格子，小票风用来算「剩余」格。
 * @returns {Array<{key:string, color:string}>} 长度 = 总工作日数
 */
export function expandDays(segments, colors) {
  const out = []
  segments.forEach(seg => {
    const n = Math.max(0, Math.round(Number(seg.days) || 0))
    for (let i = 0; i < n; i++) {
      out.push({ key: seg.key, color: colors[seg.key] || seg.color })
    }
  })
  return out
}
