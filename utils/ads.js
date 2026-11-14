// ============================================================
// 激励视频广告封装 · 看视频换 3 天 PRO 体验
//
// 广告位在微信流量主后台创建（广告管理 → 广告位管理）：
//   adunit-31b93598b3895027（PRO体验激励视频，最大激励时长 30 秒）
//
// 注意：
//   - createRewardedVideoAd 全局单例，重复 create 会拿不到回调，
//     所以这里缓存实例，onClose 每次现挂现摘
//   - onClose 的 isEnded 由客户端给出，理论上可伪造——所以权益
//     从不在前端入账，只拿它当「触发云函数」的门槛，
//     真正的防刷在 pay 云函数的终身计数里
//   - 广告不是每次都拉得到（无填充/网络差），失败重试一次 load，
//     仍失败就抛给 UI 层出兜底文案
// ============================================================

const AD_UNIT_ID = 'adunit-31b93598b3895027'

let rewardedAd = null

function getAd() {
  if (rewardedAd) return rewardedAd
  // 小程序端才有 wx；其余环境直接抛错，由调用方兜底
  if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) {
    throw new Error('unsupported')
  }
  rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID })
  return rewardedAd
}

/**
 * 拉起激励视频。完整看完 resolve(true)；
 * 中途关闭 reject({ code:'aborted' })；
 * 拉取失败 reject({ code:'no_fill' })。
 */
export function showRewardedAd() {
  return new Promise((resolve, reject) => {
    let ad
    try {
      ad = getAd()
    } catch (e) {
      reject({ code: 'no_fill', message: e.message })
      return
    }

    const onClose = (res) => {
      ad.offClose(onClose)
      if (res && res.isEnded) {
        resolve(true)
      } else {
        reject({ code: 'aborted' })
      }
    }
    ad.onClose(onClose)

    const show = () => ad.show()
    show().catch(() => {
      // 首次 show 失败通常是还没 load 完，兜一次 load 再 show
      ad.load()
        .then(show)
        .catch((err) => {
          ad.offClose(onClose)
          console.warn('[ads] 拉取失败', err && err.errMsg)
          reject({ code: 'no_fill', message: err && err.errMsg })
        })
    })
  })
}
