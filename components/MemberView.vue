<template>
  <view class="member-root">
    <scroll-view scroll-y="true" class="member-scroll" @scroll="onScroll" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <view class="member-head">
        <view class="member-back" @click="goBack">
          <text class="member-back-icon">‹</text>
        </view>
      </view>

      <view class="content">

        <!-- ===== 会员状态卡 ===== -->
        <view class="settings-card pro-status-card" :class="{ 'pro-locked': !isPro }">
          <view class="pro-head">
            <view class="pro-head-left">
              <text class="pro-name">WIO PRO</text>
              <text class="pro-sub">{{ isPro ? planLine : i18n.profile.proCardSubOff }}</text>
            </view>
            <view v-if="isPro" class="badge-on">
              <text class="badge-on-text">{{ i18n.profile.proCardUnlocked }}</text>
            </view>
            <view v-else class="badge-off">
              <text class="badge-off-text">PRO</text>
            </view>
          </view>

          <!-- 已开通：续费行 -->
          <template v-if="isPro">
            <view class="divider"></view>
            <view class="renew-row" @click="openPaywall">
              <text class="renew-note">{{ i18n.profile.memberNoAutoRenew }}</text>
              <view class="renew-action">
                <text class="renew-text">{{ i18n.profile.renewAction }}</text>
                <text class="renew-arrow">›</text>
              </view>
            </view>
          </template>

          <!-- 未开通：升级 CTA -->
          <view v-else class="upgrade-cta" @click="openPaywall">
            <text class="upgrade-text">{{ i18n.profile.upgradeProCta }}</text>
          </view>
        </view>

        <!-- ===== 云端同步 ===== -->
        <view class="settings-card" @click="onSyncCardTap">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.benefitSync }}</text>
              <text class="feat-sub">{{ syncSub }}</text>
            </view>
            <view v-if="isPro && isLogin" class="toggle-switch" @click.stop="toggleAutoSync">
              <view class="switch-track" :class="{ on: settings.autoSync }">
                <view class="switch-thumb"></view>
              </view>
            </view>
            <text v-else class="feat-locked">{{ lockText }}</text>
          </view>
          <view v-if="isPro && isLogin" class="sync-status">
            <text class="sync-time">{{ i18n.profile.lastSync }}：{{ lastSyncText }}</text>
            <text class="sync-now" @click.stop="onSyncNow">{{ i18n.profile.syncNow }}</text>
          </view>
        </view>

        <!-- ===== 高级统计（入口跳转年度统计页） ===== -->
        <view class="settings-card" @click="onStatsTap">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.statsEntry }}</text>
              <text class="feat-sub">{{ i18n.profile.statsEntrySub }}</text>
            </view>
            <view v-if="isPro" class="feat-right">
              <text class="feat-on">{{ i18n.profile.statsEntryOpen }}</text>
              <text class="feat-arrow">›</text>
            </view>
            <text v-else class="feat-locked">{{ i18n.profile.proLockedShort }}</text>
          </view>
        </view>

        <!-- ===== 多语言 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.proLangTitle }}</text>
              <text class="feat-sub">{{ i18n.profile.benefitLangSub }}</text>
            </view>
            <text v-if="!isPro" class="feat-locked">{{ i18n.profile.proLockedShort }}</text>
          </view>
          <view class="lang-segmented">
            <view class="lang-option" :class="{ active: settings.language === 'zh-CN' }" @click="setLanguage('zh-CN')">
              <text class="lang-option-text">简体中文</text>
            </view>
            <view class="lang-option" :class="{ active: settings.language === 'en-US', locked: !isPro }" @click="setLanguage('en-US')">
              <text class="lang-option-text">English</text>
              <text v-if="!isPro" class="lang-lock-tag">PRO</text>
            </view>
          </view>
          <text class="feat-foot">{{ i18n.profile.memberLangNote }}</text>
        </view>

        <!-- ===== 自定义假期 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.customLeaveTitle }}</text>
              <text class="feat-sub">{{ i18n.profile.customLeaveHint }}</text>
            </view>
            <text v-if="!isPro" class="feat-locked">{{ i18n.profile.proLockedShort }}</text>
          </view>

          <view v-for="l in visibleLeaves" :key="l.id" class="custom-leave-row" @click="openCustomEdit(l)">
            <view class="custom-dot" :style="{ background: l.color }"></view>
            <text class="custom-leave-name">{{ l.name }}</text>
            <text class="custom-leave-range">{{ fmtCustomRange(l) }}</text>
            <text class="custom-leave-chevron">›</text>
          </view>

          <view v-if="visibleLeaves.length === 0" class="custom-empty">
            <text class="custom-empty-text">{{ i18n.profile.customLeaveEmpty }}</text>
          </view>

          <view class="custom-add-btn" @click="openCustomAdd">
            <text class="custom-add-text">{{ i18n.profile.customLeaveAdd }}</text>
          </view>
          <text class="feat-foot">{{ i18n.profile.customLeaveCounted }}</text>
        </view>

        <!-- ===== 更多会员功能 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.benefitMore }}</text>
              <text class="feat-sub">{{ i18n.profile.benefitMoreSub }}</text>
            </view>
            <text class="coming-soon">{{ i18n.profile.comingSoon }}</text>
          </view>
        </view>

        <view class="version-row"><text class="version-text">WIO Tracker · v1.1.0</text></view>
      </view>
    </scroll-view>

    <CustomLeaveSheet
      :visible="showCustomSheet"
      :leave="customEditLeave"
      @close="showCustomSheet = false"
      @saved="onCustomSaved"
    />
    <PaywallSheet :visible="showPaywall" @close="showPaywall = false" @upgraded="onProUpgraded" />
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'
import { getAuth, getTrial } from '@/utils/auth.js'
import * as syncService from '@/utils/syncService.js'
import CustomLeaveSheet from '@/components/CustomLeaveSheet.vue'
import PaywallSheet from '@/components/PaywallSheet.vue'

export default {
  name: 'MemberView',
  components: { CustomLeaveSheet, PaywallSheet },
  data() {
    return {
      settings: { language: 'zh-CN', autoSync: true },
      session: null,
      trialStamp: 0,
      showPaywall: false,
      showCustomSheet: false,
      customEditLeave: null,
      customLeaves: [],
      lastSyncAt: 0,
      lastNx: 0
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    isLogin() {
      return !!(this.session && this.session.user && this.session.user.openid)
    },
    isPro() {
      // 兑换码写入的本地试用订阅优先（测试用）；trialStamp 仅用于触发重算
      void this.trialStamp
      const trial = getTrial()
      if (trial && trial.expiresAt && trial.expiresAt > Date.now()) return true
      const sub = this.session && this.session.subscription
      if (!sub) return false
      const exp = sub.expiresAt || sub.expires_at
      return !!(exp && exp > Date.now())
    },
    // 未开通的 PRO 用户（兑换码）也要能编辑假期，这里按 isPro 判断
    visibleLeaves() {
      return this.isPro ? this.customLeaves : []
    },
    // 锁定态右侧文案：未登录 / 未解锁
    lockText() {
      if (!this.isLogin) return this.i18n.profile.proLoginShort
      return this.i18n.profile.proLockedShort
    },
    syncSub() {
      if (!this.isLogin) return this.i18n.profile.memberSyncGuest
      if (!this.isPro) return this.i18n.profile.syncProBenefit
      return this.i18n.profile.autoSyncSub
    },
    planLine() {
      const sub = this.session && this.session.subscription
      const plan = (sub && sub.plan) || 'trial'
      const name = plan === 'year' ? this.i18n.profile.planYear
        : plan === 'month' ? this.i18n.profile.planMonth
        : this.i18n.profile.proMemTrial
      return `${name} · ${this.i18n.profile.renewValidUntil} ${this.renewDate}`
    },
    renewDate() {
      const sub = this.session && this.session.subscription
      let exp = sub && (sub.expiresAt || sub.expires_at)
      if (!exp || exp <= Date.now()) {
        const trial = getTrial()
        exp = trial && trial.expiresAt
      }
      if (!exp) return '—'
      const d = new Date(exp)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    },
    lastSyncText() {
      if (!this.lastSyncAt) return '—'
      const d = new Date(this.lastSyncAt)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  },
  mounted() {
    this.load()
    this.bindSync()
  },
  destroyed() {
    this.unbindSync()
  },
  onShow() {
    this.load()
    this.bindSync()
  },
  onHide() {
    this.unbindSync()
  },
  methods: {
    // 同步事件绑定：仅当前可见页处理，避免与「我的」页同时弹冲突窗
    bindSync() {
      uni.$off('wio:sync-conflict', this.onSyncConflict)
      uni.$off('wio:data-restored', this.onDataRestored)
      uni.$on('wio:sync-conflict', this.onSyncConflict)
      uni.$on('wio:data-restored', this.onDataRestored)
    },
    unbindSync() {
      uni.$off('wio:sync-conflict', this.onSyncConflict)
      uni.$off('wio:data-restored', this.onDataRestored)
    },
    load() {
      this.settings = wioService.getSettings()
      if (!this.settings.language) this.settings.language = 'zh-CN'
      this.customLeaves = wioService.getCustomLeaves()
      this.session = getAuth()
      this.lastSyncAt = syncService.getLastSyncTime()
    },
    onScroll(e) {
      // 滚动位置映射为垂直视线：顶部=向上看，下滑=向下看
      const ny = Math.max(-1, Math.min(1, e.detail.scrollTop / 400))
      uni.$emit('wio-gaze', { nx: this.lastNx, ny, active: true })
      clearTimeout(this.scrollTimer)
      this.scrollTimer = setTimeout(() => {
        uni.$emit('wio-gaze', { nx: 0, ny: 0, active: false })
      }, 300)
    },
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0]
        const w = uni.getSystemInfoSync().windowWidth
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)))
      }
    },
    onTouchEnd() {
      setTimeout(() => { this.lastNx = 0 }, 600)
    },
    openPaywall() {
      uni.vibrateShort()
      this.showPaywall = true
    },
    onProUpgraded() {
      this.trialStamp++
      this.showPaywall = false
    },
    // ===== 返回 =====
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack({ delta: 1 })
      } else {
        // 分享卡片/扫码直达时页面栈只有一层，退回「我的」页
        uni.switchTab({ url: '/pages/profile/index' })
      }
    },
    // ===== 同步 =====
    onSyncCardTap() {
      if (!this.isPro) {
        this.openPaywall()
        return
      }
      if (!this.isLogin) {
        // 账号登录收口在「我的」页，避免两处维护授权弹层
        uni.showToast({ title: this.i18n.profile.memberSyncGuest, icon: 'none' })
        setTimeout(() => {
          uni.switchTab({ url: '/pages/profile/index' })
        }, 800)
        return
      }
      this.onSyncNow()
    },
    toggleAutoSync() {
      this.settings.autoSync = !this.settings.autoSync
      uni.vibrateShort()
      wioService.saveSettings(this.settings)
      syncService.init()
    },
    async onSyncNow() {
      uni.showLoading({ title: '' })
      try {
        await syncService.syncNow()
        this.lastSyncAt = syncService.getLastSyncTime()
        uni.hideLoading()
        uni.showToast({ title: t('profile.syncDone', this.settings.language), icon: 'success' })
      } catch (err) {
        uni.hideLoading()
        console.error('sync failed', err)
        uni.showToast({ title: t('profile.syncFail', this.settings.language), icon: 'none' })
      }
    },
    onSyncConflict(info) {
      // 会员页用系统弹窗处理冲突（完整冲突卡在「我的」页）
      uni.showModal({
        title: this.i18n.profile.conflictTitle,
        content: this.i18n.profile.conflictBody,
        confirmText: this.i18n.profile.keepCloud,
        cancelText: this.i18n.profile.keepLocal,
        success: async (res) => {
          try {
            await syncService.resolveConflict(res.confirm ? 'cloud' : 'local', info)
            this.lastSyncAt = syncService.getLastSyncTime()
          } catch (err) {
            console.error('resolve conflict failed', err)
          }
        }
      })
    },
    onDataRestored() {
      this.load()
    },
    // ===== 统计 / 语言 =====
    onStatsTap() {
      uni.vibrateShort()
      if (this.isPro) {
        uni.navigateTo({ url: '/pages/stats/index' })
      } else {
        this.openPaywall()
      }
    },
    setLanguage(lang) {
      // 多语言为 PRO 专属权益：非 PRO 点击英文选项直接拉起付费墙
      if (lang !== 'zh-CN' && !this.isPro) {
        this.openPaywall()
        return
      }
      this.settings.language = lang
      uni.vibrateShort()
      wioService.saveSettings(this.settings)
      uni.showToast({ title: t('profile.saved', lang), icon: 'none' })
    },
    // ===== 自定义假期 =====
    fmtCustomRange(l) {
      return `${l.start.slice(5).replace('-', '/')} ~ ${l.end.slice(5).replace('-', '/')}`
    },
    openCustomAdd() {
      if (!this.isPro) {
        this.openPaywall()
        return
      }
      this.customEditLeave = null
      this.showCustomSheet = true
    },
    openCustomEdit(l) {
      if (!this.isPro) {
        this.openPaywall()
        return
      }
      this.customEditLeave = l
      this.showCustomSheet = true
    },
    onCustomSaved() {
      this.showCustomSheet = false
      this.customLeaves = wioService.getCustomLeaves()
    }
  }
}
</script>

<style scoped>
.member-root {
  position: relative;
  height: 100%;
}

.member-scroll {
  height: 100%;
}

.member-head {
  padding: 4px 20px 8px 20px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.member-back {
  width: 30px;
  height: 30px;
  margin-left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-back-icon {
  font-size: 25px;
  line-height: 1;
  color: #15181C;
}

.content {
  padding: 0 20px 24px 20px;
}

/* ===== 通用卡片（与「我的」页一致） ===== */
.settings-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
}

/* ===== PRO 状态卡 ===== */
.pro-status-card {
  padding: 16px 16px 12px 16px;
}

/* 未开通：暖金底 + 金描边，和普通白卡区分 */
.pro-status-card.pro-locked {
  background: #FFFDF8;
  border: 1px solid rgba(192, 138, 45, 0.22);
  box-shadow: 0 2px 10px rgba(176, 122, 34, 0.08);
}

.pro-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pro-head-left {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.pro-name {
  font-size: 15px;
  font-weight: 700;
  color: #18191C;
  letter-spacing: 0.4px;
}

.pro-sub {
  font-size: 11px;
  color: #A9761F;
  margin-top: 3px;
  line-height: 1.4;
}

.badge-on {
  /* 与「云端同步」开关同尺寸：40 × 24，圆角 12 */
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background: #C08A2D;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8px;
}

.badge-on-text {
  font-size: 10px;
  font-weight: 600;
  color: #FFF9EE;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
}

.badge-off {
  /* 未开通态同尺寸，保证两态切换时右上角视觉重量一致 */
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background: rgba(192, 138, 45, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8px;
}

.badge-off-text {
  font-size: 10px;
  font-weight: 700;
  color: #A9761F;
  line-height: 1;
  letter-spacing: 0.6px;
}

.divider {
  height: 1px;
  background: #F1EDE5;
  margin-top: 12px;
}

.renew-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 2px;
}

.renew-row:active {
  opacity: 0.85;
}

.renew-note {
  font-size: 12px;
  font-weight: 500;
  color: #A9761F;
}

.renew-action {
  display: flex;
  align-items: center;
}

.renew-text {
  font-size: 11px;
  font-weight: 500;
  color: #A9761F;
}

.renew-arrow {
  font-size: 14px;
  color: #C08A2D;
  line-height: 1;
  margin-left: 2px;
}

.upgrade-cta {
  margin-top: 14px;
  height: 42px;
  border-radius: 12px;
  background: #C08A2D;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upgrade-cta:active {
  opacity: 0.9;
}

.upgrade-text {
  font-size: 13px;
  font-weight: 700;
  color: #FFF9EE;
}

/* ===== 功能卡通用行 ===== */
.feat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.feat-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.feat-title {
  font-size: 14px;
  font-weight: 600;
  color: #18191C;
}

.feat-sub {
  font-size: 11px;
  color: #8A94A0;
  margin-top: 3px;
  line-height: 1.5;
}

.feat-locked {
  font-size: 11px;
  font-weight: 500;
  color: #C0A46B;
  flex-shrink: 0;
}

.feat-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.feat-on {
  font-size: 11px;
  font-weight: 500;
  color: #0E6E62;
}

.feat-arrow {
  font-size: 16px;
  color: #C3C9CE;
  margin-left: 4px;
  line-height: 1;
}

.feat-foot {
  display: block;
  font-size: 9.5px;
  color: #9AA1A8;
  line-height: 1.6;
  margin-top: 10px;
}

.coming-soon {
  font-size: 11px;
  font-weight: 500;
  color: #C08A2D;
  flex-shrink: 0;
}

/* ===== 同步状态行 ===== */
.sync-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #F2F4F5;
}

.sync-time {
  font-size: 10.5px;
  color: #8A94A0;
}

.sync-now {
  font-size: 10.5px;
  font-weight: 500;
  color: #0E6E62;
}

/* ===== 开关 ===== */
.switch-track {
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background-color: #DDE1E3;
  position: relative;
  transition: background-color 0.3s;
  flex-shrink: 0;
}

.switch-track.on {
  background-color: #C08A2D;
}

.switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #fff;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: left 0.3s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.switch-track.on .switch-thumb {
  left: 19px;
}

/* ===== 语言分段器 ===== */
.lang-segmented {
  display: flex;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  height: 40px;
  padding: 4px;
  margin-top: 12px;
  background: rgba(233, 225, 207, 0.55);
  border-radius: 12px;
  box-sizing: border-box;
}

.lang-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
}

.lang-option.active {
  background: #FFFFFF;
  box-shadow: 0 2px 6px rgba(15, 35, 40, 0.1);
}

.lang-option.locked {
  opacity: 0.85;
}

.lang-lock-tag {
  font-size: 9px;
  font-weight: 800;
  color: #A9761F;
  background: rgba(192, 138, 45, 0.14);
  border-radius: 6px;
  padding: 1px 5px;
  margin-left: 5px;
  letter-spacing: 0.5px;
  line-height: 1.4;
}

.lang-option-text {
  font-size: 12px;
  font-weight: 500;
  color: #8A9098;
  line-height: 1.2;
}

.lang-option.active .lang-option-text {
  color: #15181C;
  font-weight: 600;
}

/* ===== 自定义假期行 ===== */
.custom-leave-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 0;
  border-bottom: 1px solid #F2F4F5;
}

.custom-leave-row:active {
  opacity: 0.85;
}

.custom-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.custom-leave-name {
  font-size: 12.5px;
  color: #3A4149;
  flex: 1;
}

.custom-leave-range {
  font-size: 10.5px;
  color: #6B7379;
}

.custom-leave-chevron {
  font-size: 13px;
  color: #B5BBC1;
}

.custom-empty {
  padding: 10px 0 2px;
}

.custom-empty-text {
  font-size: 11px;
  color: #9AA1A8;
  line-height: 1.5;
}

.custom-add-btn {
  margin-top: 10px;
  height: 36px;
  border-radius: 10px;
  background: #EDF5F3;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-add-btn:active {
  opacity: 0.85;
}

.custom-add-text {
  font-size: 12px;
  font-weight: 500;
  color: #0E6E62;
}

/* ===== 版本号 ===== */
.version-row {
  display: flex;
  justify-content: center;
  padding: 4px 0 4px;
}

.version-text {
  font-size: 11px;
  color: #9AA1A8;
}
</style>
