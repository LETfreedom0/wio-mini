<template>
  <view class="share-page">
    <view class="nav" :style="{ paddingTop: topSafe + 'px' }">
      <view class="nav-back" @click="goBack">
        <text class="nav-back-icon">‹</text>
      </view>
      <text class="nav-title">{{ t.previewTitle }}</text>
      <view class="nav-holder"></view>
    </view>

    <!-- 卡面切换：左右滑动预览图即可换卡面，圆点指示当前位置 -->
    <view class="style-bar">
      <view class="dots">
        <view
          v-for="key in styleKeys"
          :key="key"
          class="dot"
          :class="{ 'dot-on': key === style }"
          @click="setStyle(key)"
        ></view>
      </view>
      <text class="style-name">{{ styleName }}</text>
    </view>

    <view
      class="preview-area"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <image
        v-if="imagePath"
        class="preview-img"
        :src="imagePath"
        mode="widthFix"
        @click="previewImage"
      />
      <view v-else class="preview-state" @click="failed ? generate() : null">
        <text class="state-text">{{ failed ? t.genFailed : t.generating }}</text>
      </view>
    </view>

    <view class="action-bar">
      <view class="btn btn-ghost" @click="saveToAlbum">
        <text class="btn-text">{{ t.saveToAlbum }}</text>
      </view>
      <button class="btn btn-primary" open-type="share">
        <text class="btn-text btn-text-primary">{{ t.shareToFriend }}</text>
      </button>
    </view>

    <!-- 离屏画布：只用来出图，不参与布局 -->
    <canvas id="shareCanvas" type="2d" class="off-canvas"></canvas>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales } from '@/utils/locales.js'
import { buildShareModel, paintShareCard, exportCanvas, loadCanvasImage, CARD_W, CARD_H } from '@/utils/shareCard.js'
import { isKnownStyle, DEFAULT_STYLE, STYLE_KEYS } from '@/utils/shareCardArt.js'
import { getShareQrPath } from '@/utils/shareQr.js'
import { getTopSafeArea } from '@/utils/safeArea.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  data() {
    return {
      language: 'zh-CN',
      topSafe: 44,
      imagePath: '',
      failed: false,
      model: null,
      year: 0,
      month: 0,
      style: DEFAULT_STYLE,
      touchX: 0,
      touchY: 0
    }
  },
  computed: {
    t() {
      const pack = locales[this.language] || locales['zh-CN']
      return pack.shareCard
    },
    /** 当前卡面名（圆点下方的小字说明） */
    styleName() {
      const map = { calendar: this.t.styleCalendar, receipt: this.t.styleReceipt }
      return map[this.style] || this.style
    }
  },
  onLoad(options) {
    this.language = wioService.getSettings().language || 'zh-CN'
    this.topSafe = getTopSafeArea().totalHeight
    // 记住上次选的卡面；老版本存了非法值时回退默认
    const savedStyle = wioService.getSettings().cardStyle
    this.style = isKnownStyle(savedStyle) ? savedStyle : DEFAULT_STYLE
    // 从首页滑到历史月份再点分享：带上年月，别把上个月的数据画成当月
    const y = Number(options && options.y) || 0
    const m = Number(options && options.m) || 0
    this.year = y
    this.month = m
  },
  onReady() {
    this.generate()
  },
  onShareAppMessage() {
    const m = this.model
    return {
      title: m ? `${m.title} ${m.rate}%` : 'WIO Tracker',
      path: '/pages/index/index',
      imageUrl: this.imagePath || undefined
    }
  },
  onShareTimeline() {
    const m = this.model
    return {
      title: m ? `${m.title} ${m.rate}%` : 'WIO Tracker',
      imageUrl: this.imagePath || undefined
    }
  },
  methods: {
    goBack() {
      haptic('light')
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack({ delta: 1 })
      } else {
        uni.switchTab({ url: '/pages/index/index' })
      }
    },
    getCanvasNode() {
      return new Promise(resolve => {
        uni.createSelectorQuery()
          .in(this)
          .select('#shareCanvas')
          .fields({ node: true, size: true })
          .exec(res => resolve(res && res[0] ? res[0].node : null))
      })
    },
    /** 切换卡面：换样式立刻重画，旧图留在原位直到新图就绪，不闪白 */
    setStyle(key) {
      if (key === this.style || !isKnownStyle(key)) return
      haptic('light')
      this.style = key
      const s = wioService.getSettings()
      wioService.saveSettings({ ...s, cardStyle: key })
      this.generate()
    },
    // ---- 左右滑动切换卡面 ----
    onTouchStart(e) {
      const t = e.touches && e.touches[0]
      if (t) {
        this.touchX = t.clientX
        this.touchY = t.clientY
      }
    },
    onTouchEnd(e) {
      const t = e.changedTouches && e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - this.touchX
      const dy = t.clientY - this.touchY
      // 水平位移够大、且明显比纵向位移大，才算一次滑动（避免和纵向滚动打架）
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.swipeStyle(dx < 0 ? 1 : -1)
      }
    },
    /** 按样式表顺序循环：往左滑 = 下一张，往右滑 = 上一张 */
    swipeStyle(dir) {
      const keys = STYLE_KEYS
      const i = keys.indexOf(this.style)
      if (i === -1) return
      this.setStyle(keys[(i + dir + keys.length) % keys.length])
    },
    async generate() {
      // 正在出图时又切了样式：等这一张画完，finally 会按最新选择补一张
      if (this.busy) return
      this.busy = true
      this.failed = false
      const drawnStyle = this.style
      try {
        const model = buildShareModel(this.language, this.year || undefined, this.month || undefined)
        this.model = model

        const canvas = await this.getCanvasNode()
        if (!canvas) throw new Error('canvas_not_ready')
        // 画布像素 = 设计稿尺寸，导出即 750×1000
        canvas.width = CARD_W
        canvas.height = CARD_H

        // 二维码拿不到（云函数未部署 / 无网络）时传 null，卡片自动走占位块
        const qrPath = await getShareQrPath(model.scene)
        const qrImage = qrPath ? await loadCanvasImage(canvas, qrPath) : null

        paintShareCard(canvas, model, qrImage, this.style)
        this.imagePath = await exportCanvas(canvas)
      } catch (e) {
        console.error('share card generate failed', e)
        this.failed = true
      } finally {
        this.busy = false
        // 出图期间用户切到别的样式了：按最新选择再画一次
        if (this.style !== drawnStyle) this.generate()
      }
    },
    previewImage() {
      if (!this.imagePath) return
      uni.previewImage({ urls: [this.imagePath], current: this.imagePath })
    },
    saveToAlbum() {
      if (!this.imagePath) {
        if (this.failed) this.generate()
        return
      }
      haptic('light')
      uni.saveImageToPhotosAlbum({
        filePath: this.imagePath,
        success: () => {
          uni.showToast({ title: this.t.saved, icon: 'none' })
        },
        fail: err => {
          const msg = String((err && err.errMsg) || '')
          const denied = msg.indexOf('auth') !== -1 || msg.indexOf('deny') !== -1 || msg.indexOf('denied') !== -1
          if (denied) {
            uni.showModal({
              title: this.t.saveToAlbum,
              content: this.t.saveDenied,
              confirmText: this.t.openSetting,
              cancelText: locales[this.language].common.cancel,
              success: res => {
                if (res.confirm && uni.openSetting) uni.openSetting({})
              }
            })
          } else {
            uni.showToast({ title: this.t.saveDenied, icon: 'none' })
          }
        }
      })
    }
  }
}
</script>

<style scoped>
.share-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background: #F4F5F6;
  overflow: hidden;
}

/* ===== 头部 ===== */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 12px;
  padding-right: 12px;
  padding-bottom: 6px;
  flex-shrink: 0;
}

.nav-back {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.04);
}

.nav-back-icon {
  font-size: 22px;
  line-height: 1;
  color: #15181C;
  /* ‹ 字形本身偏右，往回推一点视觉才居中 */
  margin-right: 2px;
  margin-top: -1px;
}

.nav-title {
  font-size: 16px;
  font-weight: 600;
  color: #15181C;
}

.nav-holder {
  width: 36px;
  height: 36px;
}

/* ===== 卡面切换（滑动 + 圆点）===== */
.style-bar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 2px 16px 6px;
}

.dots {
  display: flex;
  align-items: center;
  gap: 7px;
  /* 扩大热区，圆点本身小不好点 */
  padding: 4px 6px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: #D4D8DC;
  transition: width 0.2s, background 0.2s;
}

.dot-on {
  width: 18px;
  background: #0E6E62;
}

.style-name {
  font-size: 11px;
  color: #8A9099;
}

/* ===== 预览 ===== */
.preview-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0 12px;
}

.preview-img {
  width: 76vw;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(20, 40, 36, 0.14);
}

.preview-state {
  width: 76vw;
  /* 与卡片同为 3:4，加载时不跳动 */
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.state-text {
  font-size: 13px;
  color: #8A9099;
}

/* ===== 底部操作 ===== */
.action-bar {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 0 16px;
  padding-bottom: calc(16px + constant(safe-area-inset-bottom));
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.btn {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  line-height: 1;
}

.btn::after {
  border: none;
}

.btn-ghost {
  background: #FFFFFF;
  border: 1px solid #E3E6E9;
}

.btn-primary {
  background: #0E6E62;
  border: none;
}

.btn-text {
  font-size: 15px;
  font-weight: 500;
  color: #15181C;
}

.btn-text-primary {
  color: #FFFFFF;
}

/* 离屏画布：不占位、不可见，只为出图存在 */
.off-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 375px;
  height: 500px;
}
</style>
