// ============================================================
// 月度战绩分享卡 · 数据装配与出图
//
// 数据全部走 wioService.getMonthlyReport()（与首页率卡同一口径），
// 文案走 locales 的 shareCard 段，随 App 语言切换。
// ============================================================

import wioService from './wioService.js'
import { locales } from './locales.js'
import { drawShareCard, CARD_W, CARD_H, PALETTE } from './shareCardArt.js'

/** 12 / 12.5 小时：整数不显示小数点 */
function formatHours(n) {
  const v = Math.round(Number(n) * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/**
 * 生成绘制所需的全部字段
 * @param {string} lang 'zh-CN' | 'en-US'
 * @param {number} [year] 默认当月
 * @param {number} [month]
 */
export function buildShareModel(lang, year, month) {
  const L = locales[lang] || locales['zh-CN']
  const S = L.shareCard
  const now = new Date()
  const y = year || now.getFullYear()
  const m = month || now.getMonth() + 1

  const r = wioService.getMonthlyReport(y, m)

  // 假期列名：当月只有一种假期 → 直接写具体名（最常见是年假）；
  // 多于一种 → 回退「休假」+ 总天数，否则两个假期名放不进一列
  const shortNames = S.leaveShort || {}
  const typeKeys = r.leaveTypes.map(item => item.key)
  const singleName = typeKeys.length === 1 ? shortNames[typeKeys[0]] : ''
  const leaveLabel = singleName || S.colLeave

  const cols = [
    { value: r.company, unit: S.unitDay, label: S.colOffice },
    { value: r.home, unit: S.unitDay, label: S.colHome }
  ]
  if (r.leave > 0) {
    cols.push({ value: r.leave, unit: S.unitDay, label: leaveLabel })
  }
  cols.push({ value: r.rest, unit: S.unitDay, label: S.colRemain, accent: true })

  const hasOt = r.otHours > 0

  return {
    lang,
    year: y,
    month: m,
    scene: `${y}${String(m).padStart(2, '0')}`,
    brand: S.brand,
    monthText: `${y} · ${String(m).padStart(2, '0')}`,
    title: S.cardTitle,
    rate: r.rate,
    achieved: r.achieved,
    badgeText: r.achieved ? S.onTarget : S.offTarget,
    gapText: r.achieved
      ? S.above.replace('{n}', r.over)
      : S.need.replace('{n}', r.gapDays),
    compositionText: S.composition.replace('{n}', r.workingDays),
    hasOt,
    otLine1: S.otTitle.replace('{n}', formatHours(r.otHours)),
    otLine2: S.otDays.replace('{n}', formatHours(r.otDays)),
    bar: [
      { key: 'company', days: r.company, color: PALETTE.barCompany },
      { key: 'home', days: r.home, color: PALETTE.barHome },
      { key: 'leave', days: r.leave, color: PALETTE.barLeave },
      { key: 'rest', days: r.rest, color: PALETTE.barRest }
    ],
    cols,
    footer1: S.qrHint,
    footer2: S.qrSub,
    qrPlaceholder: 'WIO',
    report: r
  }
}

/** 把二维码本地文件载入成 canvas.Image（失败返回 null，卡片走占位块） */
export function loadCanvasImage(canvas, src) {
  return new Promise(resolve => {
    if (!canvas || !src || typeof canvas.createImage !== 'function') {
      resolve(null)
      return
    }
    try {
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    } catch (e) {
      resolve(null)
    }
  })
}

/** 在已就绪的 canvas 节点上完成绘制 */
export function paintShareCard(canvas, model, qrImage) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawShareCard(ctx, model, qrImage)
}

/** 导出为临时图片路径（750×1000，与设计稿同尺寸） */
export function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: CARD_W,
      height: CARD_H,
      destWidth: CARD_W,
      destHeight: CARD_H,
      fileType: 'png',
      quality: 1,
      success: res => resolve(res.tempFilePath),
      fail: err => reject(err)
    })
  })
}

export { CARD_W, CARD_H }
