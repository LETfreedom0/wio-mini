// ============================================================
// 分享卡用的小程序码
//
// 走云函数 wxacode（cloud.openapi.wxacode.getUnlimited），
// 拿到 base64 后写进用户目录做本地缓存：同一个月只请求一次，
// 离线/云函数未部署时返回空字符串，卡片自动降级成占位块。
// ============================================================

import { callCloud, isCloudAvailable } from './cloud.js'

const PREFIX = 'wio-share-qr-'
const PAGE = 'pages/index/index'

function fsManager() {
  // #ifdef MP-WEIXIN
  return typeof wx !== 'undefined' && wx.getFileSystemManager ? wx.getFileSystemManager() : null
  // #endif
  // #ifndef MP-WEIXIN
  return null
  // #endif
}

function cachePath(scene) {
  // #ifdef MP-WEIXIN
  return `${wx.env.USER_DATA_PATH}/${PREFIX}${scene}.png`
  // #endif
  // #ifndef MP-WEIXIN
  return ''
  // #endif
}

function exists(fs, path) {
  if (!fs || !path) return false
  try {
    fs.accessSync(path)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 取指定月份的小程序码本地路径
 * @param {string} scene 场景值（这里存 YYYYMM，扫码进入后可定位到对应月份）
 * @returns {Promise<string>} 本地文件路径，失败返回 ''
 */
export async function getShareQrPath(scene) {
  if (!isCloudAvailable()) return ''
  const fs = fsManager()
  if (!fs) return ''
  const path = cachePath(scene)
  if (exists(fs, path)) return path

  try {
    const res = await callCloud('wxacode', { scene, page: PAGE })
    if (!res || !res.image) return ''
    fs.writeFileSync(path, res.image, 'base64')
    return exists(fs, path) ? path : ''
  } catch (e) {
    console.warn('getShareQrPath failed', e)
    return ''
  }
}

/** 清掉缓存（月份数据变化或调试时用） */
export function clearShareQrCache(scene) {
  const fs = fsManager()
  if (!fs) return
  const path = cachePath(scene)
  if (exists(fs, path)) {
    try { fs.unlinkSync(path) } catch (e) { /* 忽略 */ }
  }
}
