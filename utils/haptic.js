// ============================================================
// 点击触感反馈
//
// 小程序里 uni.vibrateShort 有三个问题，直接用很容易踩：
// 1. 连续点击时震动会排队，手感拖沓 —— 这里做 60ms 节流
// 2. 部分机型（iPad / 老 Android / H5）不支持，会走 fail 回调 —— 静默吞掉
// 3. 参数 type 只在基础库 2.13+ 生效，低版本传了会报错 —— 包 try/catch
//
// 统一出口，避免每个页面各写一遍 vibrateShort
// ============================================================

let lastAt = 0

/**
 * 轻触反馈
 * @param {'light'|'medium'|'heavy'} type 力度，默认 light（点选/切换）
 */
export function tap(type = 'light') {
  const now = Date.now()
  // 60ms 内重复触发直接忽略：快速连点时不会震成一片
  if (now - lastAt < 60) return
  lastAt = now
  try {
    uni.vibrateShort({
      type,
      // 不支持震动的环境（H5/iPad）与基础库过低时会走 fail，静默即可
      fail: () => {}
    })
  } catch (e) {
    // 非小程序环境（构建期/SSR）无 uni 时忽略
  }
}

/** 成功反馈：稍重一点，用于打卡成功、保存成功 */
export function success() {
  tap('medium')
}
