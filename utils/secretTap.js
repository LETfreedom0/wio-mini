// ============================================================
// 隐藏入口：连点 N 次
//
// 用途：会员兑换码不做公开入口（付费墙只留「购买」一条路），
// 改成「版本号连点 5 次」才出现。这样普通用户不会误触，
// 运营发码时又能一句话说清入口在哪。
//
// 判定要求「连续」：两次点击间隔超过 windowMs 就重新计数，
// 否则零散点几下累计到 5 次会莫名其妙弹出面板。
// ============================================================

const WINDOW_MS = 1200

/**
 * @param {{count:number, at:number}} state 调用方持有并复用的计数状态
 * @param {number} [need] 需要连点几次
 * @param {number} [windowMs] 相邻两次点击的最大间隔
 * @returns {boolean} 本次点击是否达标（达标后自动清零，避免重复触发）
 */
export function isSecretTriggered(state, need = 5, windowMs = WINDOW_MS) {
  const now = Date.now()
  if (!state || now - (state.at || 0) > windowMs) {
    if (state) state.count = 0
  }
  state.at = now
  state.count = (state.count || 0) + 1
  if (state.count >= need) {
    state.count = 0
    return true
  }
  return false
}
