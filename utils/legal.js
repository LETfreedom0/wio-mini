// ============================================================
// 协议入口 · 统一跳转
//
// 为什么隐私政策不直接跳自建页：
//   微信在后台登记的《小程序用户隐私保护指引》才是审核与监管认可的正式版本，
//   wx.openPrivacyContract() 能直接打开它，内容永远与登记的一致。
//   但该接口要求基础库 2.32.3+ 且后台已配置，配置缺失时会 fail——
//   所以失败时退回自建页，保证任何情况下点得开（不能出现"点了没反应"）。
// ============================================================

export const LEGAL_AGREEMENT = 'agreement'
export const LEGAL_PRIVACY = 'privacy'

export function openAgreementPage() {
  uni.navigateTo({ url: '/pages/legal/index?type=' + LEGAL_AGREEMENT })
}

export function openPrivacyPage() {
  uni.navigateTo({ url: '/pages/legal/index?type=' + LEGAL_PRIVACY })
}

/** 打开微信托管的《小程序用户隐私保护指引》，不可用时退回自建页 */
export function openPrivacy() {
  // #ifdef MP-WEIXIN
  try {
    // 用 typeof 判断而不是 canIUse：canIUse 的接口白名单不覆盖这个 API，
    // 会误判成不支持，结果永远走自建页。
    if (typeof wx !== 'undefined' && typeof wx.openPrivacyContract === 'function') {
      wx.openPrivacyContract({
        fail: () => openPrivacyPage()
      })
      return
    }
  } catch (e) {
    // 落到下面的自建页
  }
  // #endif
  openPrivacyPage()
}

/** 打开用户协议 */
export function openAgreement() {
  openAgreementPage()
}
