/**
 * 顶部安全区（状态栏 + 微信胶囊按钮）计算工具
 *
 * 背景：设计稿的页面头部是自定义的（无原生导航栏），
 * 小程序端 `--status-bar-height` CSS 变量不生效（值为 0），
 * 直接依赖它会让「日期问候 / 页面标题」顶到手机状态栏和胶囊按钮上。
 * 这里用 wx.getWindowInfo / wx.getMenuButtonBoundingClientRect 精确测量，
 * 返回一个 px 值供页面以行内 style 设置占位高度。
 */

let cached = null;

function getWindowInfoSafe() {
  try {
    if (typeof wx !== 'undefined' && wx.getWindowInfo) {
      return wx.getWindowInfo();
    }
  } catch (e) { /* fall through */ }
  try {
    return uni.getSystemInfoSync();
  } catch (e) {
    return {};
  }
}

/**
 * @returns {{ statusBarHeight: number, navBarHeight: number, totalHeight: number }}
 *  - statusBarHeight: 手机状态栏高度
 *  - navBarHeight:    状态栏之下、胶囊按钮所占的一行高度（含上下间距）
 *  - totalHeight:     页面头部之前应预留的总高度
 */
export function getTopSafeArea() {
  if (cached) return cached;

  const win = getWindowInfoSafe();
  const statusBarHeight = win.statusBarHeight || 20;

  let navBarHeight = 44; // 兜底：常见胶囊行高度

  try {
    let rect = null;
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
      rect = wx.getMenuButtonBoundingClientRect();
    }
    // #endif
    // #ifndef MP-WEIXIN
    if (typeof uni !== 'undefined' && uni.getMenuButtonBoundingClientRect) {
      rect = uni.getMenuButtonBoundingClientRect();
    }
    // #endif

    if (rect && rect.height) {
      const gap = rect.top - statusBarHeight; // 胶囊上边距
      navBarHeight = rect.height + Math.max(gap, 0) * 2;
    }
  } catch (e) {
    // 保持兜底值
  }

  // 底部 tabBar 的安全区也一并取一次，避免页面重复计算
  const safeAreaBottom = win.safeArea && win.screenHeight
    ? Math.max(0, win.screenHeight - win.safeArea.bottom)
    : 0;

  cached = {
    statusBarHeight,
    navBarHeight: Math.round(navBarHeight),
    totalHeight: Math.round(statusBarHeight + navBarHeight),
    safeAreaBottom
  };
  return cached;
}

export default { getTopSafeArea };
