// ============================================================
// 分享卡 · 样式「日历风」
//
// 记忆点：把抽象进度条换成「一天一格的日历格」——24 个工作日就是 24 格，
// 深绿=公司、浅绿=居家、金=假期、空心=剩余。一眼能「数」出这个月。
// 月份本身做成左上角的日历页签，把「月份」从一个标题变成一个物件。
//
// 版式：页签 + 品牌小字 → 特大数字（字形顶对齐状态章顶边）→
//       右列状态章与 OT → 结论行（金色批注线）→ 格子阵 + 图例 → 二维码
// ============================================================

import {
  CARD_W, CARD_H, PALETTE as P,
  drawText, drawHeroNumber, drawPercent, drawQr,
  expandDays, fillRoundRect, strokeRoundRect, setFont
} from './cardPaint.js'

export const LAYOUT_CALENDAR = {
  // 日历页签：金环 + 绿块 + 月份数字
  tabRing: { x: 54, y: 48, w: 92, h: 10, r: 5 },
  tab: { x: 54, y: 56, w: 92, h: 92, r: 14 },
  brand: { x: 162, y: 76, w: 260, h: 30, size: 24, weight: 500 },
  month: { x: 476, y: 76, w: 218, h: 30, size: 24, weight: 500, align: 'right' },
  title: { x: 54, y: 170, w: 460, h: 42, size: 30, weight: 400 },
  hero: { x: 54, top: 222, w: 336, size: 260, weight: 700 },
  badge: { x: 498, y: 222, w: 196, h: 54, r: 27, size: 26 },
  ot1: { x: 400, y: 350, w: 294, h: 38, size: 32, weight: 500, align: 'right' },
  ot2: { x: 400, y: 400, w: 294, h: 30, size: 24, weight: 400, align: 'right' },
  gap: { x: 54, y: 458, w: 440, h: 40, size: 32, weight: 500 },
  gapRule: { x: 54, y: 508, h: 3, r: 1.5 },
  section: { x: 54, y: 546, w: 520, h: 28, size: 24, weight: 400 },
  grid: { x: 54, y: 592, w: 640, h: 36, gap: 5, r: 5, minW: 8 },
  legend: { y: 648, swatch: 16, swatchR: 4, textSize: 24, gap: 8 },
  divider: { x: 54, y: 732, w: 640, h: 2 },
  qr: { x: 54, y: 768, size: 140, r: 18 },
  footer1: { x: 226, y: 800, w: 460, h: 38, size: 30, weight: 500 },
  footer2: { x: 226, y: 852, w: 480, h: 34, size: 24, weight: 400 }
}

// 格子配色：key 与 shareCard.js 里 bar / cols 的 key 一致
const GRID_COLORS = {
  company: P.barCompany,
  home: P.gridHome,
  leave: P.gridLeave,
  rest: null // null = 空心格，表示「还没到的日子」
}

/**
 * @param {*} ctx Canvas 2D 上下文
 * @param {object} m  buildShareModel() 产出的文案与数值
 * @param {*} qrImage 已加载的二维码图片对象，可为 null
 */
export function drawCalendarCard(ctx, m, qrImage) {
  const L = LAYOUT_CALENDAR
  const accent = m.achieved ? P.hero : P.miss

  ctx.clearRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // ---- 日历页签：月份从「标题的一部分」变成实体物件 ----
  fillRoundRect(ctx, L.tabRing.x, L.tabRing.y, L.tabRing.w, L.tabRing.h, L.tabRing.r, P.gold)
  fillRoundRect(ctx, L.tab.x, L.tab.y, L.tab.w, L.tab.h, L.tab.r, P.hero)
  drawText(ctx, String(m.month || ''), {
    x: L.tab.x, y: L.tab.y, w: L.tab.w, h: L.tab.h,
    size: 46, weight: 700, align: 'center'
  }, { color: P.bg, maxWidth: L.tab.w - 16 })

  drawText(ctx, m.brand, L.brand, { color: P.brand })
  drawText(ctx, m.monthText, L.month, { color: P.brand })
  drawText(ctx, m.title, L.title, { color: P.label })

  // ---- 特大数字：字形顶 = 状态章顶 ----
  const H = L.hero
  const hero = drawHeroNumber(ctx, m.rate, H.x, H.top, H.size, H.w, { color: P.hero, weight: 700 })
  // 百分号贴着数字走；右侧留 60 给状态章，三位数 100% 也压不到章上
  drawPercent(ctx, H.x + hero.width + 8, H.top, hero.size, 0.38, 0.3, P.hero)

  // ---- 状态章 ----
  const B = L.badge
  strokeRoundRect(ctx, B.x, B.y, B.w, B.h, B.r, accent, 2.5)
  drawText(ctx, m.badgeText, {
    x: B.x, y: B.y, w: B.w, h: B.h, size: B.size, align: 'center'
  }, { color: accent, maxWidth: B.w - 24 })

  // ---- 加班换算（右侧，与大数字同底）----
  if (m.hasOt) {
    drawText(ctx, m.otLine1, L.ot1, { color: P.ink })
    drawText(ctx, m.otLine2, L.ot2, { color: P.gold })
  }

  // ---- 结论行：紧贴数字，用一条金线把它和下面的构成分开 ----
  const gapWidth = drawText(ctx, m.gapText, L.gap, { color: P.gold })
  fillRoundRect(
    ctx, L.gapRule.x, L.gapRule.y,
    Math.max(96, Math.min(gapWidth * 0.94, L.gap.w)),
    L.gapRule.h, L.gapRule.r, '#EBD8B4'
  )

  // ---- 格子阵：一天一格 ----
  drawText(ctx, m.compositionText, L.section, { color: P.muted })
  drawGrid(ctx, expandDays(m.bar || [], GRID_COLORS), L.grid)

  // ---- 图例（列数随数据变：有没有假期会差一项）----
  drawLegend(ctx, m.cols || [], L.legend)

  // ---- 分隔线 ----
  ctx.fillStyle = P.line
  ctx.fillRect(L.divider.x, L.divider.y, L.divider.w, L.divider.h)

  // ---- 二维码 ----
  drawQr(ctx, qrImage, L.qr, m.qrPlaceholder || 'WIO')
  drawText(ctx, m.footer1, L.footer1, { color: P.ink })
  drawText(ctx, m.footer2, L.footer2, { color: P.muted })
}

function drawGrid(ctx, cells, box) {
  const n = cells.length
  if (!n) return
  // 格数多（23 个工作日）时收紧间隙，保证整行不超出右边距
  const gap = n > 20 ? box.gap : box.gap + 3
  const w = Math.max(box.minW, (box.w - gap * (n - 1)) / n)
  cells.forEach((cell, i) => {
    const x = box.x + i * (w + gap)
    if (!cell.color) {
      fillRoundRect(ctx, x, box.y, w, box.h, box.r, P.gridEmpty)
      strokeRoundRect(ctx, x, box.y, w, box.h, box.r, P.gridEmptyLine, 1.5)
    } else {
      fillRoundRect(ctx, x, box.y, w, box.h, box.r, cell.color)
    }
  })
}

function drawLegend(ctx, cols, box) {
  const n = cols.length
  if (!n) return
  const slotW = 640 / n
  const cy = box.y + box.swatch / 2

  cols.forEach((col, i) => {
    const x = 54 + i * slotW
    const color = GRID_COLORS[col.key] === undefined ? P.gridLeave : GRID_COLORS[col.key]
    if (color) {
      fillRoundRect(ctx, x, box.y, box.swatch, box.swatch, box.swatchR, color)
    } else {
      fillRoundRect(ctx, x, box.y, box.swatch, box.swatch, box.swatchR, P.gridEmpty)
      strokeRoundRect(ctx, x, box.y, box.swatch, box.swatch, box.swatchR, P.gridEmptyLine, 1.5)
    }

    const textX = x + box.swatch + box.gap
    const maxW = slotW - box.swatch - box.gap - 8
    const valueColor = col.key === 'rest' ? P.gold : P.ink

    // 标签
    setFont(ctx, box.textSize, 400)
    const labelStr = String(col.label || '')
    let labelSize = box.textSize
    let lw = ctx.measureText(labelStr).width
    if (lw + 40 > maxW) {
      labelSize = Math.max(16, Math.floor((box.textSize * maxW) / (lw + 40)))
      setFont(ctx, labelSize, 400)
      lw = ctx.measureText(labelStr).width
    }
    ctx.fillStyle = P.label
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(labelStr, textX, cy)

    // 值：比标签重一档，剩余天数用金色
    setFont(ctx, labelSize, 700)
    const valueStr = String(col.value)
    ctx.fillStyle = valueColor
    ctx.fillText(valueStr, textX + lw + 6, cy)
    const vw = ctx.measureText(valueStr).width

    // 单位：小一号、同一基线，跟着值走
    setFont(ctx, Math.max(14, labelSize - 4), 400)
    ctx.fillText(String(col.unit || ''), textX + lw + 6 + vw + 3, cy)
  })
}
