// ============================================================
// 分享卡 · 样式分发层
//
// 卡面共五套样式，排版各不相同，共用 cardPaint.js 的原语：
//   settle     —— 月度结算单（新默认）
//   seal       —— 达标印章（整幅绿底，未达标换红棕）
//   footprint  —— 月度足迹（真实月历格子）
//   calendar   —— 一天一格的日历格，月份做成左上角页签
//   receipt    —— 打卡小票，打孔 + 收银条 + 圆章
//
// 调用方只需要传样式名，不关心具体怎么画。
// 新增样式：写一个 drawXxxCard，在这里注册进 STYLES 即可。
// ============================================================

import { CARD_W, CARD_H, PALETTE } from './cardPaint.js'
import { drawCalendarCard, LAYOUT_CALENDAR } from './cardStyleCalendar.js'
import { drawReceiptCard, LAYOUT_RECEIPT } from './cardStyleReceipt.js'
import { drawSettleCard, LAYOUT_SETTLE } from './cardStyleMonthly.js'
import { drawSealCard, LAYOUT_SEAL } from './cardStyleMonthly.js'
import { drawFootprintCard, LAYOUT_FOOTPRINT } from './cardStyleMonthly.js'

export { CARD_W, CARD_H, PALETTE }
export { segmentWidths } from './cardPaint.js'
export { LAYOUT_CALENDAR, LAYOUT_RECEIPT, LAYOUT_SETTLE, LAYOUT_SEAL, LAYOUT_FOOTPRINT }

/** 默认样式：新用户先看到结算单，它信息最全、最像一张“战绩” */
export const DEFAULT_STYLE = 'settle'

export const STYLES = [
  { key: 'settle', draw: drawSettleCard, layout: LAYOUT_SETTLE },
  { key: 'seal', draw: drawSealCard, layout: LAYOUT_SEAL },
  { key: 'footprint', draw: drawFootprintCard, layout: LAYOUT_FOOTPRINT },
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
