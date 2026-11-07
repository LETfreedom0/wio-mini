// ============================================================
// 分享卡 · 样式「小票风」
//
// 记忆点：整张卡是一张打卡机吐出来的小票——上下打孔、虚线分段、
// 数据排成收银条（公司办公 …… 9 天）、状态是一枚盖上去的圆章。
// 群里刷到别人的仪表盘式战绩图时，一张小票最容易让人停下来看。
//
// 版式：外底 + 票身 → 打孔 → 票头 → 标题 → 虚线 → 大数字（居中）→
//       结论 + 圆章 → 虚线 → 收银条 → 虚线 → 二维码
// ============================================================

import {
  CARD_W, CARD_H, PALETTE as P,
  drawText, drawHeroNumber, drawQr, dashLine,
  fillRoundRect, strokeRoundRect, fillCircle, strokeCircle, setFont
} from './cardPaint.js'

export const LAYOUT_RECEIPT = {
  paper: { x: 75, y: 44, w: 600, h: 908, r: 22 },
  paperShadow: { dy: 8 },
  punch: { r: 8, gap: 28, from: 103, to: 663 },
  head: { x: 105, y: 100, w: 540, h: 30, size: 22, weight: 500, align: 'center' },
  title: { x: 105, y: 154, w: 540, h: 44, size: 36, weight: 700, align: 'center' },
  rule1: { y: 216 },
  hero: { cx: 375, top: 268, size: 230, maxW: 520, weight: 800 },
  gap: { x: 150, y: 496, w: 450, h: 38, size: 30, weight: 500, align: 'center' },
  stamp: { cx: 628, cy: 534, r: 52, inner: 40, size: 22 },
  rule2: { y: 572 },
  rows: { x1: 105, x2: 645, top: 604, h: 40, otExtra: 22, labelSize: 26, valueSize: 26, unitSize: 21 },
  rule3: { y: 820 },
  qr: { x: 120, y: 846, size: 86, r: 12 },
  footer1: { x: 228, y: 858, w: 420, h: 34, size: 24, weight: 500 },
  footer2: { x: 228, y: 894, w: 440, h: 30, size: 19, weight: 400 }
}

/**
 * @param {*} ctx Canvas 2D 上下文
 * @param {object} m  buildShareModel() 产出的文案与数值
 * @param {*} qrImage 已加载的二维码图片对象，可为 null
 */
export function drawReceiptCard(ctx, m, qrImage) {
  const L = LAYOUT_RECEIPT
  const accent = m.achieved ? P.hero : P.miss

  // ---- 外底 + 票身 ----
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = P.paperOuter
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  fillRoundRect(ctx, L.paper.x, L.paper.y + L.paperShadow.dy, L.paper.w, L.paper.h, L.paper.r, '#E3DCCB')
  fillRoundRect(ctx, L.paper.x, L.paper.y, L.paper.w, L.paper.h, L.paper.r, P.paper)

  // ---- 打孔：用外底色的圆「咬掉」票边 ----
  const punchY = [L.paper.y, L.paper.y + L.paper.h]
  punchY.forEach(cy => {
    for (let x = L.punch.from; x <= L.punch.to; x += L.punch.gap) {
      fillCircle(ctx, x, cy, L.punch.r, P.paperOuter)
    }
  })

  // ---- 票头 ----
  drawText(ctx, m.brand, L.head, { color: '#A09884', weight: 500 })
  drawText(ctx, m.title, L.title, { color: P.ink })
  dashLine(ctx, L.rows.x1, L.rule1.y, L.rows.x2, L.rule1.y, P.paperDashed, 3, 1, 11)

  // ---- 大数字：整串居中（数字宽度不定，% 跟着走）----
  drawCenteredHero(ctx, m, L.hero)

  // ---- 结论 ----
  drawText(ctx, m.gapText, L.gap, { color: P.gold })

  // ---- 状态章：压在第二条虚线上，像随手盖的 ----
  drawStamp(ctx, m.badgeText, L.stamp, accent)
  dashLine(ctx, L.rows.x1, L.rule2.y, L.rows.x2, L.rule2.y, P.paperDashed, 3, 1, 11)

  // ---- 收银条 ----
  const bottom = drawRows(ctx, m, L.rows)

  // ---- 底部虚线跟着内容走，别在数据少时留下大空洞 ----
  const rule3Y = Math.min(L.qr.y - 20, bottom + 26)
  dashLine(ctx, L.rows.x1, rule3Y, L.rows.x2, rule3Y, P.paperDashed, 3, 1, 11)

  // ---- 二维码 ----
  drawQr(ctx, qrImage, L.qr, m.qrPlaceholder || 'WIO')
  drawText(ctx, m.footer1, L.footer1, { color: P.ink })
  drawText(ctx, m.footer2, L.footer2, { color: P.muted })
}

function drawCenteredHero(ctx, m, box) {
  const str = String(m.rate)
  let size = box.size
  const pctRatio = 0.4
  // 先按最大尺寸量一遍，整串（数字 + 空隙 + 百分号）超宽就等比缩
  setFont(ctx, size, box.weight)
  let numW = ctx.measureText(str).width
  let pctSize = Math.round(size * pctRatio)
  setFont(ctx, pctSize, box.weight)
  let pctW = ctx.measureText('%').width
  const total = numW + 8 + pctW
  if (total > box.maxW) {
    size = Math.floor((size * box.maxW) / total)
    setFont(ctx, size, box.weight)
    numW = ctx.measureText(str).width
    pctSize = Math.round(size * pctRatio)
    setFont(ctx, pctSize, box.weight)
    pctW = ctx.measureText('%').width
  }
  const startX = box.cx - (numW + 8 + pctW) / 2
  drawHeroNumber(ctx, str, startX, box.top, size, box.maxW, { color: P.hero, weight: box.weight })
  drawPercentInline(ctx, startX + numW + 8, box.top, size, pctSize, P.hero)
}

/** 小票风的百分号与数字同顶（上标感弱一点，因为数字居中，飘起来会失衡）*/
function drawPercentInline(ctx, x, top, heroSize, pctSize, color) {
  setFont(ctx, pctSize, 800)
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('%', x, top + heroSize * 0.73 - pctSize * 0.02)
}

/**
 * 圆章：双环 + 文字。文字超宽时按空格断成两行并缩字号——
 * 英文「On target」比中文「已达标」长得多，不断行就会顶出内圈。
 */
function drawStamp(ctx, text, box, color) {
  strokeCircle(ctx, box.cx, box.cy, box.r, color, 3)
  strokeCircle(ctx, box.cx, box.cy, box.inner, color, 1.5)

  const clean = String(text || '').replace(/^[\s✓✔√]+/, '').trim()
  if (!clean) return
  const maxW = box.inner * 2 - 12
  const words = clean.split(/\s+/)
  let lines = [clean]
  let size = box.size

  setFont(ctx, size, 600)
  let w = ctx.measureText(clean).width
  if (w > maxW && words.length > 1) {
    lines = [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width))
    size = Math.max(14, Math.floor((size * maxW) / widest))
  } else if (w > maxW) {
    size = Math.max(14, Math.floor((size * maxW) / w))
  }

  setFont(ctx, size, 600)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (lines.length === 1) {
    ctx.fillText(lines[0], box.cx, box.cy)
  } else {
    const lh = size * 1.15
    ctx.fillText(lines[0], box.cx, box.cy - lh / 2)
    ctx.fillText(lines[1], box.cx, box.cy + lh / 2)
  }
}

/**
 * 收银条行：左标签 + 引导点线 + 右值（数字重、单位轻）。
 * 行数随数据变（有没有假期、有没有加班），返回最后一行的底线。
 */
function drawRows(ctx, m, box) {
  const rows = []
  ;(m.cols || []).forEach(c => {
    if (c.key === 'rest') return
    rows.push({ key: c.key, label: c.label, value: c.value, unit: c.unit })
  })
  if (m.hasOt) {
    rows.push({ key: 'ot', label: m.otCol, value: m.otValue, unit: m.otUnitHour, note: m.otLine2 })
  }
  const rest = (m.cols || []).find(c => c.key === 'rest')
  if (rest) rows.push({ key: 'rest', label: rest.label, value: rest.value, unit: rest.unit })

  let y = box.top
  rows.forEach(row => {
    const cy = y + box.h / 2
    const isRest = row.key === 'rest'
    const valueColor = isRest ? P.gold : P.ink

    // 左标签（drawText 返回缩字号后的真实宽度，点线的起点才不会算错）
    const labelW = drawText(ctx, row.label, {
      x: box.x1, y, w: 220, h: box.h, size: box.labelSize, weight: 400
    }, { color: P.label, maxWidth: 200, minSize: 18 })

    // 右值：单位先靠右，数字再往左贴
    const unitStr = String(row.unit || '')
    setFont(ctx, box.unitSize, 400)
    const unitW = ctx.measureText(unitStr).width
    ctx.fillStyle = P.muted
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(unitStr, box.x2, cy)

    setFont(ctx, box.valueSize, 700)
    const valueStr = String(row.value)
    const valueW = ctx.measureText(valueStr).width
    ctx.fillStyle = valueColor
    ctx.fillText(valueStr, box.x2 - unitW - 5, cy)

    // 引导点线：标签和数值之间铺满，两头各留 14
    const from = box.x1 + labelW + 16
    const to = box.x2 - unitW - valueW - 14
    if (to > from + 20) {
      dashLine(ctx, from, cy + 8, to, cy + 8, P.paperDashed, 2.5, 2, 9)
    }

    // 加班换算挂在这一行下面，不另起一行破坏节奏
    if (row.note) {
      drawText(ctx, row.note, {
        x: box.x1, y: y + box.h - 4, w: 260, h: 24, size: 21, weight: 400
      }, { color: P.gold })
      y += box.h + box.otExtra
    } else {
      y += box.h
    }
  })
  return y
}
