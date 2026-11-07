// ============================================================
// 分享卡 · 样式分发层
//
// 卡面有两套样式，排版完全不同，共用 cardPaint.js 的原语：
//   calendar —— 一天一格的日历格，月份做成左上角页签
//   receipt  —— 打卡小票，打孔 + 收银条 + 圆章
//
// 调用方只需要传样式名，不关心具体怎么画。
// 新增样式：写一个 drawXxxCard，在这里注册进 STYLES 即可。
// ============================================================

import { CARD_W, CARD_H, PALETTE } from './cardPaint.js'
import { drawCalendarCard, LAYOUT_CALENDAR } from './cardStyleCalendar.js'
import { drawReceiptCard, LAYOUT_RECEIPT } from './cardStyleReceipt.js'

export { CARD_W, CARD_H, PALETTE }
export { segmentWidths } from './cardPaint.js'
export { LAYOUT_CALENDAR, LAYOUT_RECEIPT }

/** 默认样式：老客户端 / 老调用方不传 style 时走这里 */
export const DEFAULT_STYLE = 'calendar'

export const STYLES = [
  { key: 'calendar', draw: drawCalendarCard, layout: LAYOUT_CALENDAR },
  { key: 'receipt', draw: drawReceiptCard, layout: LAYOUT_RECEIPT }
]

/** 样式顺序表：滑动切换按这个顺序循环，新增卡面加进 STYLES 即自动生效 */
export const STYLE_KEYS = STYLES.map(s => s.key)

export function isKnownStyle(style) {
  return STYLES.some(s => s.key === style)
}

/** 兼容旧断言脚本：LAYOUT 指向日历风版式（历史名） */
export const LAYOUT = LAYOUT_CALENDAR

/**
 * 主绘制入口
 * @param {*} ctx Canvas 2D 上下文
 * @param {object} m   buildShareModel() 产出的文案 + 数值
 * @param {*} qrImage  已 load 的二维码图片对象，可为 null
 * @param {string} [style] 'calendar' | 'receipt'，未知值回退默认
 */
export function drawShareCard(ctx, m, qrImage, style) {
  const target = isKnownStyle(style) ? style : DEFAULT_STYLE
  STYLES.find(s => s.key === target).draw(ctx, m, qrImage)
  return target
}
