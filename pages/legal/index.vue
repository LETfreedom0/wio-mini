<template>
  <view class="container">
    <scroll-view scroll-y="true" class="legal-scroll">
      <view class="legal-head" :style="{ paddingTop: topSafeHeight + 4 + 'px' }">
        <view class="legal-back" @click="goBack">
          <text class="legal-back-icon">‹</text>
        </view>
      </view>

      <view class="content">
        <view class="doc-card">
          <text class="doc-title">{{ doc.title }}</text>
          <text class="doc-updated">{{ doc.updatedLabel }}{{ doc.updated }}</text>

          <view class="doc-intro">
            <text class="doc-intro-text">{{ doc.intro }}</text>
          </view>

          <view v-for="(sec, si) in doc.sections" :key="si" class="doc-section">
            <text class="doc-h">{{ sec.h }}</text>
            <text v-for="(para, pi) in sec.p" :key="pi" class="doc-p">{{ para }}</text>
          </view>

          <!-- 微信托管的隐私指引：仅隐私政策页出现 -->
          <view v-if="type === 'privacy'" class="wechat-policy-row" @click="openWechatPolicy">
            <text class="wechat-policy-text">{{ labels.openWechatPolicy }}</text>
            <text class="wechat-policy-arrow">›</text>
          </view>
        </view>

        <!-- 联系方式：协议里承诺的联系渠道，点一下复制 -->
        <view class="contact-card" @click="copyEmail">
          <text class="contact-title">{{ labels.contactTitle }}</text>
          <text class="contact-email">{{ email }}</text>
          <text class="contact-hint">{{ labels.tapToCopy }}</text>
        </view>

        <view class="legal-foot">
          <text class="legal-foot-text">WIO Tracker · v{{ version }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { getTopSafeArea } from '@/utils/safeArea.js'
import { getLegalDoc, getLegalLabels, CONTACT_EMAIL } from '@/utils/legalDocs.js'
import { APP_VERSION } from '@/utils/appVersion.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  data() {
    return {
      type: 'agreement',
      topSafeHeight: getTopSafeArea().totalHeight,
      version: APP_VERSION,
      email: CONTACT_EMAIL,
      doc: getLegalDoc('agreement', 'zh-CN'),
      labels: getLegalLabels('zh-CN')
    }
  },
  onLoad(options) {
    this.topSafeHeight = getTopSafeArea().totalHeight
    this.type = options && options.type === 'privacy' ? 'privacy' : 'agreement'
    this.load()
  },
  onShow() {
    // 语言可能在「我的」页被切换，回到本页时按当前语言重取
    this.load()
  },
  methods: {
    load() {
      const lang = (wioService.getSettings() || {}).language || 'zh-CN'
      this.doc = getLegalDoc(this.type, lang)
      this.labels = getLegalLabels(lang)
    },
    goBack() {
      haptic('light')
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack({ delta: 1 })
      } else {
        // 从分享卡片/直达进来时页面栈只有一层
        uni.switchTab({ url: '/pages/profile/index' })
      }
    },
    copyEmail() {
      haptic('light')
      uni.setClipboardData({
        data: this.email,
        success: () => {
          uni.showToast({ title: this.labels.copied, icon: 'none' })
        }
      })
    },
    openWechatPolicy() {
      haptic('light')
      // #ifdef MP-WEIXIN
      if (typeof wx !== 'undefined' && typeof wx.openPrivacyContract === 'function') {
        wx.openPrivacyContract({
          fail: () => {
            // 后台未配置指引时接口会失败，页面上已有完整政策，不需要再跳
            uni.showToast({ title: this.labels.missing, icon: 'none' })
          }
        })
        return
      }
      // #endif
      uni.showToast({ title: this.labels.missing, icon: 'none' })
    }
  },
  onShareAppMessage() {
    return {
      title: 'WIO 达标了吗 - 实时追踪回公司办公达标率',
      path: '/pages/index/index'
    }
  }
}
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background-color: #F4F5F6;
  overflow: hidden;
}

.legal-scroll {
  flex: 1;
  height: 0;
}

.legal-head {
  padding-left: 12px;
  padding-bottom: 2px;
}

.legal-back {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.legal-back-icon {
  font-size: 24px;
  line-height: 24px;
  color: #1F2A2E;
}

.content {
  padding: 1px 16px calc(20px + env(safe-area-inset-bottom));
}

.doc-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 18px 16px 16px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
}

.doc-title {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: #1F2A2E;
  letter-spacing: 0.2px;
}

.doc-updated {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: #9AA3A8;
}

.doc-intro {
  margin-top: 14px;
  padding: 12px;
  background: #FAF9F5;
  border-radius: 12px;
}

.doc-intro-text {
  font-size: 12.5px;
  line-height: 1.8;
  color: #4A555A;
}

.doc-section {
  margin-top: 18px;
}

.doc-h {
  display: block;
  font-size: 13.5px;
  font-weight: 600;
  color: #1F2A2E;
  margin-bottom: 7px;
}

.doc-p {
  display: block;
  font-size: 12.5px;
  line-height: 1.9;
  color: #5A6469;
  margin-bottom: 7px;
}

.doc-p:last-child {
  margin-bottom: 0;
}

.wechat-policy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding: 11px 12px;
  background: #FAF9F5;
  border-radius: 12px;
}

.wechat-policy-text {
  font-size: 12px;
  color: #A8802F;
  font-weight: 500;
  flex: 1;
}

.wechat-policy-arrow {
  font-size: 15px;
  color: #C08A2D;
  margin-left: 8px;
}

.contact-card {
  margin-top: 14px;
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
}

.contact-title {
  display: block;
  font-size: 12px;
  color: #9AA3A8;
}

.contact-email {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #1F2A2E;
  letter-spacing: 0.2px;
}

.contact-hint {
  display: block;
  margin-top: 5px;
  font-size: 10.5px;
  color: #B5BBC1;
}

.legal-foot {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.legal-foot-text {
  font-size: 10.5px;
  color: #B5BBC1;
}
</style>
