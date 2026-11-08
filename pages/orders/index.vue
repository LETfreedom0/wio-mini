<!--
  订单记录 · 微信「小程序订单中心」要求的订单页

  用户在 微信 → 我 → 服务 → 钱包 → 账单 里点进小程序订单时，
  平台会按后台登记的 path 直接打开本页（主 path，不带参数）。
  所以本页必须满足三条硬要求：
    1. 主 path 可访问，不依赖任何参数
    2. 无登录态时不跳走，就地引导登录，登录后仍停在本页
    3. 能看到本人全部交易记录（金额、状态、时间、订单号）

  数据只能经云函数取：payment_orders 集合权限是「所有用户不可读写」，
  客户端直连读不到，也不该读得到别人的。
-->
<template>
  <view class="container">
    <scroll-view
      scroll-y="true"
      class="page-scroll"
      refresher-enabled
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view class="head" :style="{ paddingTop: topSafe + 4 + 'px' }">
        <view class="back" @click="goBack">
          <text class="back-icon">‹</text>
        </view>
      </view>

      <view class="content">
        <view class="title-row">
          <text class="page-title">{{ L.title }}</text>
          <text v-if="logged && orders.length" class="page-count">{{ orders.length }} {{ L.count }}</text>
        </view>

        <!-- 未登录：就地引导，不跳页（跳走就不符合订单中心规范了） -->
        <view v-if="!logged" class="card state-card">
          <text class="state-title">{{ L.needLogin }}</text>
          <text class="state-sub">{{ L.needLoginSub }}</text>
          <view class="primary-btn" :class="{ 'primary-btn-busy': loggingIn }" @click="doLogin">
            <text class="primary-btn-text">{{ loggingIn ? L.loading : L.login }}</text>
          </view>
        </view>

        <!-- 加载失败 -->
        <view v-else-if="loadError" class="card state-card">
          <text class="state-title">{{ L.failed }}</text>
          <view class="ghost-btn" @click="load">
            <text class="ghost-btn-text">{{ L.retry }}</text>
          </view>
        </view>

        <!-- 空态 -->
        <view v-else-if="!loading && !orders.length" class="card state-card">
          <text class="state-title">{{ L.empty }}</text>
          <text class="state-sub">{{ L.emptySub }}</text>
          <view class="ghost-btn" @click="openMember">
            <text class="ghost-btn-text">{{ L.viewMember }}</text>
          </view>
        </view>

        <!-- 订单列表 -->
        <view v-for="o in orders" :key="o.outTradeNo" class="card order-card">
          <view class="order-top">
            <text class="order-plan">{{ planName(o) }}</text>
            <view class="status-badge" :class="statusClass(o)">
              <text class="status-text">{{ statusText(o) }}</text>
            </view>
          </view>

          <view class="order-row">
            <text class="row-label">{{ L.amount }}</text>
            <text class="row-value row-amount">{{ yuan(o.amountFen) }}</text>
          </view>
          <view class="order-row">
            <text class="row-label">{{ L.created }}</text>
            <text class="row-value">{{ fmt(o.createdAt) }}</text>
          </view>
          <view v-if="o.paidAt" class="order-row">
            <text class="row-label">{{ L.paidAt }}</text>
            <text class="row-value">{{ fmt(o.paidAt) }}</text>
          </view>

          <view class="order-no" @click="copyNo(o.outTradeNo)">
            <text class="no-label">{{ L.orderNo }}</text>
            <text class="no-value">{{ o.outTradeNo }}</text>
          </view>
        </view>

        <!-- 售后入口：协议与隐私政策里承诺的联系渠道，点一下复制邮箱 -->
        <view v-if="logged && orders.length" class="help-row" @click="copyEmail">
          <text class="help-text">{{ L.help }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { isLogin, login } from '@/utils/auth.js'
import { callCloud } from '@/utils/cloud.js'
import { getTopSafeArea } from '@/utils/safeArea.js'
import { t } from '@/utils/locales.js'
import { CONTACT_EMAIL } from '@/utils/legalDocs.js'
import wioService from '@/utils/wioService.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  data() {
    return {
      topSafe: getTopSafeArea().totalHeight,
      L: t('orders', 'zh-CN'),
      orders: [],
      logged: false,
      loading: false,
      loadError: false,
      loggingIn: false,
      refreshing: false,
      email: CONTACT_EMAIL
    }
  },
  onLoad() {
    this.topSafe = getTopSafeArea().totalHeight
    this.applyLang()
    this.load()
  },
  onShow() {
    // 从「我的」页登录后返回、或语言被切换，都按当前状态重取
    this.applyLang()
    this.load()
  },
  methods: {
    applyLang() {
      const lang = (wioService.getSettings() || {}).language || 'zh-CN'
      this.L = t('orders', lang)
    },
    async load() {
      this.logged = isLogin()
      if (!this.logged) {
        this.orders = []
        this.loadError = false
        this.loading = false
        return
      }
      this.loading = true
      this.loadError = false
      try {
        const res = await callCloud('pay', { action: 'orders' })
        if (res && res.ok && Array.isArray(res.orders)) {
          this.orders = res.orders
        } else {
          this.orders = []
          this.loadError = true
        }
      } catch (e) {
        this.orders = []
        this.loadError = true
      } finally {
        this.loading = false
      }
    },
    async onRefresh() {
      this.refreshing = true
      try { await this.load() } finally { this.refreshing = false }
    },
    async doLogin() {
      if (this.loggingIn) return
      haptic('light')
      this.loggingIn = true
      try {
        // 不带 profile：只是取回 openid 与订阅状态，不索取头像昵称
        await login({})
        this.logged = isLogin()
        await this.load()
      } catch (e) {
        uni.showToast({ title: this.L.failed, icon: 'none' })
      } finally {
        this.loggingIn = false
      }
    },
    planName(o) {
      if (o.plan === 'month') return this.L.planMonth
      if (o.plan === 'year') return this.L.planYear
      if (o.plan === 'code') return this.L.planCode
      if (o.plan === 'trial') return this.L.planTrial
      return this.L.planOther
    },
    statusText(o) {
      if (o.status === 'refunded') return this.L.statusRefunded
      if (o.status === 'paid') {
        return o.refundStatus === 'pending' ? this.L.statusRefunding : this.L.statusPaid
      }
      return this.L.statusPending
    },
    statusClass(o) {
      if (o.status === 'refunded') return 'badge-warn'
      if (o.status === 'paid') return o.refundStatus === 'pending' ? 'badge-warn' : 'badge-ok'
      return 'badge-muted'
    },
    yuan(fen) {
      const n = (Number(fen) || 0) / 100
      return '¥' + (Number.isInteger(n) ? String(n) : n.toFixed(2))
    },
    fmt(ts) {
      if (!ts) return '—'
      const d = new Date(Number(ts))
      if (Number.isNaN(d.getTime())) return '—'
      const p = (v) => String(v).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    },
    copyNo(no) {
      if (!no) return
      haptic('light')
      uni.setClipboardData({
        data: no,
        success: () => uni.showToast({ title: this.L.copyNo, icon: 'none' })
      })
    },
    copyEmail() {
      haptic('light')
      uni.setClipboardData({ data: this.email, success: () => uni.showToast({ title: this.email, icon: 'none' }) })
    },
    openMember() {
      haptic('light')
      uni.navigateTo({ url: '/pages/member/index' })
    },
    goBack() {
      haptic('light')
      const pages = getCurrentPages()
      if (pages.length > 1) uni.navigateBack()
      else uni.switchTab({ url: '/pages/profile/index' })
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

.page-scroll {
  flex: 1;
  height: 0;
}

.head {
  padding-left: 12px;
  padding-bottom: 2px;
}

.back {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  font-size: 24px;
  line-height: 24px;
  color: #1F2A2E;
}

.content {
  padding: 1px 16px calc(24px + env(safe-area-inset-bottom));
}

.title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 2px 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1F2A2E;
  letter-spacing: 0.3px;
}

.page-count {
  font-size: 12px;
  color: #9AA3A8;
}

.card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
  margin-bottom: 12px;
}

/* ---------- 未登录 / 失败 / 空态 ---------- */
.state-card {
  padding: 28px 18px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.state-title {
  font-size: 15px;
  font-weight: 600;
  color: #1F2A2E;
  text-align: center;
}

.state-sub {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: #8A9398;
  text-align: center;
  padding: 0 6px;
}

.primary-btn {
  margin-top: 18px;
  min-width: 168px;
  height: 44px;
  border-radius: 22px;
  background: #0E6E62;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
}

.primary-btn-busy {
  opacity: 0.6;
}

.primary-btn-text {
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
}

.ghost-btn {
  margin-top: 16px;
  height: 38px;
  padding: 0 18px;
  border-radius: 19px;
  border: 1px solid rgba(14, 110, 98, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ghost-btn-text {
  font-size: 13px;
  font-weight: 500;
  color: #0E6E62;
}

/* ---------- 订单卡 ---------- */
.order-card {
  padding: 15px 16px 4px;
}

.order-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
}

.order-plan {
  font-size: 15px;
  font-weight: 600;
  color: #1F2A2E;
}

.status-badge {
  padding: 3px 9px;
  border-radius: 9px;
}

.badge-ok {
  background: rgba(14, 110, 98, 0.10);
}

.badge-ok .status-text {
  color: #0E6E62;
}

.badge-warn {
  background: rgba(192, 138, 45, 0.14);
}

.badge-warn .status-text {
  color: #A5761F;
}

.badge-muted {
  background: rgba(31, 42, 46, 0.06);
}

.badge-muted .status-text {
  color: #8A9398;
}

.status-text {
  font-size: 11px;
  font-weight: 500;
}

.order-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
}

.row-label {
  font-size: 12px;
  color: #8A9398;
}

.row-value {
  font-size: 12px;
  color: #3C4A50;
}

.row-amount {
  font-size: 14px;
  font-weight: 600;
  color: #1F2A2E;
}

.order-no {
  margin-top: 6px;
  padding: 11px 0 12px;
  border-top: 1px solid rgba(31, 42, 46, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.no-label {
  font-size: 11px;
  color: #9AA3A8;
  flex: 0 0 auto;
}

.no-value {
  font-size: 11px;
  color: #6D777C;
  text-align: right;
  flex: 1 1 auto;
}

.help-row {
  padding: 10px 4px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-text {
  font-size: 11px;
  color: #9AA3A8;
  text-align: center;
}
</style>
