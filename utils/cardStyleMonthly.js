// ============================================================
// 分享卡 · 月度结算卡三版
//
// 三张卡解决的是同一个问题的三个侧面：
//   settle    结算单 —— 信息最全，像一张真的对账单（适合自己看）
//   seal      达标印章 —— 一枚盖上去的章，分享欲最强（只有达标的人愿意晒）
//   footprint 月度足迹 —— 一个月 31 格怎么过的，未达标也愿意发
//
// 共用一套印刷品语言：纸底 + 衬线数字 + 字距标题 + 一个二维码。
// 二维码不做副券，各自编进版式：结算单是验真栏、印章在落款处、足迹在统计尾端。
//
// 坐标按 750 × 1000 设计稿写死，与另外两套样式同尺寸，导出即用。
// ============================================================

import {
  CARD_W, CARD_H, CAP_RATIO,
  drawText, drawHeroNumber, drawQr, drawTrackingText,
  fillRoundRect, strokeCircle, setFont, setSerifFont
} from './cardPaint.js'

const PAPER = '#FBF8F0'
const INK = '#16352E'
const LABEL = '#2E544C'
const MUTED = '#A39B8B'
const GOLD = '#BC8F4C'
const GREEN = '#22685A'
const GREEN_DEEP = '#1B6B5E'
const RULE = '#E2DCCB'
const CREAM = '#F8F4E6'
const SEAL_GOLD = '#D8B77E'
// 未达标时印章版换红棕底：墨绿底配「未达标」三个字，看着像在讽刺人
const OFF_RED = '#8E4A3E'

const X = 70
const W = 610

const CELL_COLOR = {
  company: '#22685A',
  home: '#E5E1D3',
  leave: '#F0CDC6',
  rest: '#F2EFE4',
  off: '#F7F4EB'
}

// ------------------------------------------------------------
// A · 结算单
// 版式：年月 → STATEMENT → 大数字 → 回公司率 → 细线 → 三行明细
//       → 目标行（左）+ 二维码（右，原来的图形位）
// ------------------------------------------------------------
export const LAYOUT_SETTLE = {
  year: { x: X, y: 66, w: 320, h: 38, size: 28 },
  kicker: { x: X, cy: 130, size: 28, tracking: 7 },
  hero: { x: X, top: 174, size: 186, maxW: 440, pctRatio: 0.4 },
  heroLabel: { x: X, cy: 380, size: 33, tracking: 14 },
  rule: { y: 430 },
  rows: { x1: X, x2: X + W, top: 460, h: 92, labelSize: 33, valueSize: 40, unitSize: 28 },
  foot: { x: X, cy: 850, size: 30 },
  qr: { x: X + W - 108, y: 796, size: 108, r: 18 }
}

export function drawSettleCard(ctx, m, qrImage) {
  const L = LAYOUT_SETTLE
  const S = m.settle || {}
  paintPaper(ctx)

  drawText(ctx, S.year, L.year, { color: MUTED })
  drawTrackingText(ctx, S.kicker, L.kicker.x, L.kicker.cy, {
    size: L.kicker.size, tracking: L.kicker.tracking, color: GOLD, weight: 500
  })

  const hero = drawHeroNumber(ctx, String(m.rate), L.hero.x, L.hero.top, L.hero.size, L.hero.maxW, {
    color: INK, weight: 700, serif: true
  })
  drawPercentAt(ctx, L.hero.x + hero.width + 8, L.hero.top, hero.size, L.hero.pctRatio, INK)

  drawTrackingText(ctx, S.rateLabel, L.heroLabel.x, L.heroLabel.cy, {
    size: L.heroLabel.size, tracking: L.heroLabel.tracking, color: LABEL
  })

  ctx.fillStyle = RULE
  ctx.fillRect(L.rows.x1, L.rule.y, W, 2)

  drawDetailRows(ctx, m, L.rows)

  drawText(ctx, m.settleTargetText, { x: L.foot.x, y: L.foot.cy - 18, w: 420, h: 36, size: L.foot.size }, { color: GOLD })
  drawQr(ctx, qrImage, L.qr, m.qrPlaceholder || 'WIO')
}

/** 明细三行：左标签 + 右值（衬线大字 + 小单位） */
function drawDetailRows(ctx, m, box) {
  const rows = (m.cols || []).filter(c => c.key !== 'rest')
  let y = box.top
  rows.forEach(row => {
    const cy = y + box.h / 2
    drawText(ctx, row.label, { x: box.x1, y, w: 240, h: box.h, size: box.labelSize }, {
      color: LABEL, maxWidth: 230
    })

    const unit = String(row.unit || '')
    setFont(ctx, box.unitSize, 400)
    const unitW = ctx.measureText(unit).width
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(unit, box.x2, cy)

    setSerifFont(ctx, box.valueSize, 700)
    ctx.fillStyle = GREEN_DEEP
    ctx.textAlign = 'right'
    ctx.fillText(String(row.value), box.x2 - unitW - 8, cy)

    y += box.h
  })
}

// ------------------------------------------------------------
// B · 达标印章
// 版式：整幅墨绿 → 年月 → 双环章 → 大数字 → 回公司率 → 结论 → 码
// 底部留一块白托放码：绿底上码必须衬白，否则扫不出来
// ------------------------------------------------------------
export const LAYOUT_SEAL = {
  year: { x: X, cy: 88, size: 28 },
  stamp: { cx: 375, cy: 302, r: 108, inner: 90, size: 46, tracking: 10 },
  hero: { cx: 375, top: 462, size: 166, maxW: 580, pctRatio: 0.4 },
  heroLabel: { cx: 375, cy: 672, size: 30, tracking: 14 },
  gap: { cx: 375, cy: 778, size: 27 },
  qr: { x: 327, y: 814, size: 96, r: 14 },
  hint: { cx: 375, cy: 950, size: 25 }
}

export function drawSealCard(ctx, m, qrImage) {
  const L = LAYOUT_SEAL
  const S = m.settle || {}
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = m.achieved ? GREEN : OFF_RED
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  drawText(ctx, m.monthText, { x: L.year.x, y: L.year.cy - 18, w: 320, h: 36, size: L.year.size }, {
    color: 'rgba(246,241,228,0.72)'
  })

  strokeCircle(ctx, L.stamp.cx, L.stamp.cy, L.stamp.r, SEAL_GOLD, 3)
  strokeCircle(ctx, L.stamp.cx, L.stamp.cy, L.stamp.inner, SEAL_GOLD, 1.5)
  drawTrackingText(ctx, S.badgePlain, L.stamp.cx, L.stamp.cy, {
    size: L.stamp.size, tracking: L.stamp.tracking, color: '#E8C987', align: 'center', weight: 500
  })

  // 大数字：先整串量宽再居中，% 跟着数字走
  const heroStr = String(m.rate)
  const size = L.hero.size
  setSerifFont(ctx, size, 700)
  const numW = ctx.measureText(heroStr).width
  const pctSize = Math.round(size * L.hero.pctRatio)
  setSerifFont(ctx, pctSize, 700)
  const pctW = ctx.measureText('%').width
  const total = numW + 12 + pctW
  const startX = L.hero.cx - total / 2
  drawHeroNumber(ctx, heroStr, startX, L.hero.top, size, L.hero.maxW, {
    color: CREAM, weight: 700, serif: true
  })
  drawPercentAt(ctx, startX + numW + 12, L.hero.top, size, L.hero.pctRatio, CREAM)

  drawTrackingText(ctx, S.rateLabel, L.heroLabel.cx, L.heroLabel.cy, {
    size: L.heroLabel.size, tracking: L.heroLabel.tracking, color: 'rgba(246,241,228,0.92)', align: 'center'
  })

  drawText(ctx, S.sealGapText, { x: 75, y: L.gap.cy - 18, w: 600, h: 36, size: L.gap.size, align: 'center' }, {
    color: '#E8C987'
  })

  // 白托 + 码：绿底直接画码会缺静区
  fillRoundRect(ctx, L.qr.x - 10, L.qr.y - 10, L.qr.size + 20, L.qr.size + 20, L.qr.r + 6, '#FDFCF8')
  drawQr(ctx, qrImage, L.qr, m.qrPlaceholder || 'WIO')

  drawText(ctx, S.scan, { x: 75, y: L.hint.cy - 16, w: 600, h: 32, size: L.hint.size, align: 'center' }, {
    color: 'rgba(246,241,228,0.68)'
  })
}

// ------------------------------------------------------------
// C · 月度足迹
// 版式：年月 + 工作日数 → 大数字 → 7 列格子 → 图例 → 细线 → 落款 + 码
// 格子按真实月历排：1 号落在对应的星期列，周末用最浅的一档
// ------------------------------------------------------------
export const LAYOUT_FOOTPRINT = {
  head: { y: 62, h: 38, size: 28 },
  hero: { x: X, top: 140, size: 132, maxW: 400, pctRatio: 0.4 },
  heroLabel: { x: X, cy: 334, size: 26, tracking: 12 },
  grid: { top: 378, cell: 66, gap: 10, r: 16, cols: 7 },
  legend: { size: 27, swatch: 18 },
  qr: { size: 96, r: 18 }
}

export function drawFootprintCard(ctx, m, qrImage) {
  const L = LAYOUT_FOOTPRINT
  const S = m.settle || {}
  paintPaper(ctx)

  drawText(ctx, S.year, { x: X, y: L.head.y, w: 300, h: L.head.h, size: L.head.size }, { color: MUTED })
  drawText(ctx, S.workdays, { x: X, y: L.head.y, w: W, h: L.head.h, size: L.head.size, align: 'right' }, { color: MUTED })

  const hero = drawHeroNumber(ctx, String(m.rate), L.hero.x, L.hero.top, L.hero.size, L.hero.maxW, {
    color: INK, weight: 700, serif: true
  })
  drawPercentAt(ctx, L.hero.x + hero.width + 6, L.hero.top, hero.size, L.hero.pctRatio, INK)

  drawTrackingText(ctx, S.rateLabel, L.heroLabel.x, L.heroLabel.cy, {
    size: L.heroLabel.size, tracking: L.heroLabel.tracking, color: LABEL
  })

  // 行数随月份变（28 天 + 6 个空位要 6 行），6 行时压扁格子，别把图例挤出去
  const G = L.grid
  const grid = m.grid || []
  const rows = Math.max(1, Math.ceil((m.gridLead + grid.length) / 7))
  const cellH = rows >= 6 ? 56 : 66
  const startX = X + (W - (7 * G.cell + 6 * G.gap)) / 2

  grid.forEach((item, i) => {
    const slot = m.gridLead + i
    const gx = startX + (slot % 7) * (G.cell + G.gap)
    const gy = G.top + Math.floor(slot / 7) * (cellH + G.gap)
    fillRoundRect(ctx, gx, gy, G.cell, cellH, G.r, CELL_COLOR[item.key] || CELL_COLOR.off)
  })

  const gridBottom = G.top + rows * cellH + (rows - 1) * G.gap
  let lx = X
  const legendY = gridBottom + 36
  ;['company', 'home', 'leave'].forEach(key => {
    const col = (m.cols || []).find(c => c.key === key)
    if (!col) return
    fillRoundRect(ctx, lx, legendY - 10, L.legend.swatch, L.legend.swatch, 5, CELL_COLOR[key])
    const w = drawText(ctx, `${col.label} ${col.value}`, {
      x: lx + L.legend.swatch + 8, y: legendY - 20, w: 220, h: 40, size: L.legend.size
    }, { color: MUTED })
    lx += L.legend.swatch + 8 + w + 36
  })

  const ruleY = legendY + 44
  ctx.fillStyle = RULE
  ctx.fillRect(X, ruleY, W, 2)

  const qrY = ruleY + 40
  drawQr(ctx, qrImage, { x: X + W - L.qr.size, y: qrY, size: L.qr.size, r: L.qr.r }, m.qrPlaceholder || 'WIO')
  drawText(ctx, S.foot, { x: X, y: qrY + L.qr.size / 2 - 18, w: 420, h: 36, size: 27 }, { color: MUTED })
}

// ------------------------------------------------------------
// 共用零件
// ------------------------------------------------------------
function paintPaper(ctx) {
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_W, CARD_H)
}

/** 百分号：与数字同基线落笔（顶部随意飘会显得没对齐） */
function drawPercentAt(ctx, x, top, heroSize, ratio, color) {
  const s = Math.round(heroSize * ratio)
  setSerifFont(ctx, s, 700)
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('%', x, top + heroSize * CAP_RATIO)
}
