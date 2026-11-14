<template>
  <view class="share-page">
    <view class="nav" :style="{ paddingTop: topSafe + 'px' }">
      <view class="nav-back" @click="goBack">
        <text class="nav-back-icon">‹</text>
      </view>
      <text class="nav-title">{{ t.previewTitle }}</text>
      <view class="nav-holder"></view>
    </view>

    <!-- 卡面切换：swiper 轮播，邻卡露边即「还能滑」的提示，跟手拖动原生 60fps -->
    <view class="style-bar">
      <view class="dots">
        <view
          v-for="key in styleKeys"
          :key="key"
          class="dot"
          :class="{ 'dot-on': key === style }"
          @click="onDotTap(key)"
        ></view>
      </view>
      <text :key="style" class="style-name">{{ styleName }}</text>
    </view>

    <view class="preview-area">
      <swiper
        class="style-swiper"
        :current="swiperCurrent"
        previous-margin="90rpx"
        next-margin="90rpx"
        @change="onSwiperChange"
      >
        <swiper-item v-for="key in styleKeys" :key="key" class="style-item">
          <image
            v-if="images[key]"
            class="preview-img"
            :src="images[key]"
            mode="widthFix"
            @click="previewImage(images[key])"
          />
          <view v-else class="preview-state" @click="failed ? generateAll() : null">
            <text class="state-text">{{ placeholderText }}</text>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <!-- 页面说明：给搜一搜提供可索引的真实正文（canvas 卡片里的文字抓不到） -->
    <text class="page-caption">{{ t.shareCaption }}</text>

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
      // 每个卡面一张图：{ calendar: 'wxfile://...', receipt: '...' }
      images: {},
      failed: false,
      model: null,
      year: 0,
      month: 0,
      style: DEFAULT_STYLE,
      styleKeys: STYLE_KEYS,
      swiperCurrent: 0
    }
  },
  computed: {
    t() {
      const pack = locales[this.language] || locales['zh-CN']
      return pack.shareCard
    },
    /** 当前卡面名（圆点下方的小字说明） */
    styleName() {
      const map = {
        settle: this.t.styleSettle,
        seal: this.t.styleSeal,
        footprint: this.t.styleFootprint,
        calendar: this.t.styleCalendar,
        receipt: this.t.styleReceipt
      }
      return map[this.style] || this.style
    },
    /** 还没出图的滑轨位显示什么：生成中 / 失败重试 */
    placeholderText() {
      if (this.failed && !Object.keys(this.images).length) return this.t.genFailed
      return this.t.generating
    }
  },
  onLoad(options) {
    this.language = wioService.getSettings().language || 'zh-CN'
    this.topSafe = getTopSafeArea().totalHeight
    // 记住上次选的卡面；老版本存了非法值时回退默认
    const savedStyle = wioService.getSettings().cardStyle
    this.style = isKnownStyle(savedStyle) ? savedStyle : DEFAULT_STYLE
    this.swiperCurrent = Math.max(0, STYLE_KEYS.indexOf(this.style))
    // 从首页滑到历史月份再点分享：带上年月，别把上个月的数据画成当月
    const y = Number(options && options.y) || 0
    const m = Number(options && options.m) || 0
    this.year = y
    this.month = m
  },
  onReady() {
    this.generateAll()
  },
  onShareAppMessage() {
    const m = this.model
    return {
      title: m ? `${m.title} ${m.rate}%` : 'WIO Tracker',
      path: '/pages/index/index',
      imageUrl: this.images[this.style] || undefined
    }
  },
  onShareTimeline() {
    const m = this.model
    return {
      title: m ? `${m.title} ${m.rate}%` : 'WIO Tracker',
      imageUrl: this.images[this.style] || undefined
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
    // ---- 卡面切换 ----
    /** swiper 滑动 / 圆点点击都会走到这里，统一在此同步状态并记住选择 */
    onSwiperChange(e) {
      const i = e && e.detail ? e.detail.current : 0
      const key = STYLE_KEYS[i]
      if (!key || key === this.style) return
      haptic('light')
      this.style = key
      const s = wioService.getSettings()
      wioService.saveSettings({ ...s, cardStyle: key })
    },
    /** 圆点直达：驱动 swiper 滑过去，状态变化交给 onSwiperChange */
    onDotTap(key) {
      const i = STYLE_KEYS.indexOf(key)
      if (i === -1 || i === this.swiperCurrent) return
      haptic('light')
      this.swiperCurrent = i
    },
    /**
     * 把所有卡面一次画完：二维码只加载一次，之后逐个样式重画导出。
     * 当前卡面排最前先出图，其余样式随后补齐——滑过去时图已就绪。
     */
    async generateAll() {
      if (this.busy) return
      this.busy = true
      this.failed = false
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

        // 当前样式先出，其余按注册顺序补齐
        const order = [this.style, ...STYLE_KEYS.filter(k => k !== this.style)]
        for (const key of order) {
          paintShareCard(canvas, model, qrImage, key)
          const path = await exportCanvas(canvas)
          // 整体替换对象保证 Vue2 响应式
          this.images = { ...this.images, [key]: path }
        }
      } catch (e) {
        console.error('share card generate failed', e)
        this.failed = true
      } finally {
        this.busy = false
      }
    },
    previewImage(path) {
      if (!path) return
      uni.previewImage({ urls: [path], current: path })
    },
    saveToAlbum() {
      const path = this.images[this.style]
      if (!path) {
        if (this.failed) this.generateAll()
        return
      }
      haptic('light')
      uni.saveImageToPhotosAlbum({
        filePath: path,
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
  /* 换卡面时名字轻淡入，:key 绑定 style 让元素重挂载、动画重放 */
  animation: nameIn 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}

@keyframes nameIn {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ===== 预览（swiper 轮播，邻卡露边）===== */
.preview-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 0 12px;
  overflow: hidden;
}

.style-swiper {
  width: 100%;
  height: 100%;
}

.style-item {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  width: 570rpx;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(20, 40, 36, 0.14);
}

.preview-state {
  width: 570rpx;
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
.page-caption {
  flex-shrink: 0;
  display: block;
  padding: 0 28px 10px;
  font-size: 11px;
  line-height: 1.55;
  color: #9AA0A6;
  text-align: center;
}

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
