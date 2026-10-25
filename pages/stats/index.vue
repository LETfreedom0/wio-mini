<template>
  <view class="container">
    <view class="status-bar-placeholder" :style="{ height: topSafeHeight + 'px' }"></view>

    <!-- PRO 未解锁：锁定态 -->
    <template v-if="!isPro">
      <view class="page-head">
        <view class="back-btn" @click="goBack"><text class="back-text">‹</text></view>
        <text class="page-title">{{ i18n.profile.statsTitle }}</text>
        <view class="head-space"></view>
      </view>
      <view class="card locked-card">
        <text class="locked-icon">🔒</text>
        <text class="locked-title">{{ i18n.profile.statsLockedTitle }}</text>
        <text class="locked-sub">{{ i18n.profile.statsLockedSub }}</text>
        <view class="locked-cta" @click="goBackToProfile">
          <text class="locked-cta-text">{{ i18n.profile.statsLockedCta }}</text>
        </view>
      </view>
    </template>

    <!-- PRO 已解锁：完整统计 -->
    <template v-else>
      <view class="page-head">
        <view class="back-btn" @click="goBack"><text class="back-text">‹</text></view>
        <text class="page-title">{{ i18n.profile.statsTitle }}</text>
      </view>

      <!-- 概览卡 -->
      <view class="card overview-card">
        <view class="year-row">
          <text class="year-text">{{ year }} {{ i18n.profile.statsUnitYear }}</text>
          <view class="year-switch">
            <text class="year-arrow" :class="{ disabled: !canGoPrev }" @click="changeYear(-1)">‹</text>
            <text class="year-arrow" :class="{ disabled: !canGoNext }" @click="changeYear(1)">›</text>
          </view>
        </view>
        <view class="num-row">
          <text class="num-big">{{ annual.companyDays }}</text>
          <text class="num-denom">/ {{ annual.workingDays }} {{ i18n.profile.statsUnitDay }}</text>
        </view>
        <text class="ratio-text">{{ i18n.profile.statsOfTotal }} {{ annual.ratio }}%</text>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: annual.ratio + '%' }"></view>
        </view>

        <view class="stat-divider"></view>
        <view class="stat-row">
          <text class="stat-label">{{ i18n.profile.statsOtTotal }}</text>
          <view class="stat-value-group">
            <text class="stat-value">{{ annual.overtimeHours }} {{ i18n.profile.statsUnitHour }}</text>
            <text class="stat-conv">= {{ annual.overtimeDays }} {{ i18n.profile.statsUnitDay }}</text>
          </view>
        </view>

        <view class="stat-divider"></view>
        <view class="stat-row" @click="showCommuteEditor = true">
          <view class="stat-label-group">
            <text class="stat-label">{{ i18n.profile.statsCommuteSaved }}</text>
            <text class="stat-est">{{ commuteEstText }} ›</text>
          </view>
          <view class="stat-value-group">
            <text class="stat-value">{{ annual.commuteSavedHours }} {{ i18n.profile.statsUnitHour }}</text>
            <text class="stat-conv">= {{ annual.commuteSavedDays }} {{ i18n.profile.statsUnitDay }}</text>
          </view>
        </view>
      </view>

      <!-- 趋势卡 -->
      <view class="card trend-card">
        <text class="section-title">{{ i18n.profile.statsTrendTitle }}</text>
        <text class="section-sub">{{ i18n.profile.statsTrendSub }}</text>
        <view class="chart">
          <view class="chart-area">
            <view
              class="chart-col"
              v-for="m in annual.monthly"
              :key="m.month"
            >
              <view
                class="bar"
                :class="{ 'bar-current': isCurrentMonth(m.month) }"
                :style="{ height: barHeight(m.companyDays) + 'px' }"
              ></view>
            </view>
          </view>
          <view class="chart-baseline"></view>
        </view>
        <view class="month-labels">
          <text v-for="m in annual.monthly" :key="m.month" class="month-label">{{ m.month }}</text>
        </view>
        <view class="legend">
          <view class="legend-item">
            <view class="legend-dot legend-dot-green"></view>
            <text class="legend-text">{{ i18n.profile.statsLegendMonth }}</text>
          </view>
          <view class="legend-item">
            <view class="legend-dot legend-dot-gold"></view>
            <text class="legend-text">{{ i18n.profile.statsLegendCurrent }}</text>
          </view>
        </view>
      </view>

      <!-- 假期卡 -->
      <view class="card leave-card">
        <text class="section-title">{{ i18n.profile.statsLeaveTitle }}</text>
        <view class="leave-row">
          <text class="leave-name">{{ i18n.profile.vacationDays }}</text>
          <view class="leave-track">
            <view class="leave-fill" :style="{ width: leavePct(annual.vacationDaysUsed, annual.vacationDaysTotal) + '%' }"></view>
          </view>
          <text class="leave-num">{{ annual.vacationDaysUsed }} / {{ annual.vacationDaysTotal }}</text>
        </view>
        <view class="leave-row">
          <text class="leave-name">{{ i18n.profile.sickDays }}</text>
          <view class="leave-track">
            <view class="leave-fill" :style="{ width: leavePct(annual.sickDaysUsed, annual.sickDaysTotal) + '%' }"></view>
          </view>
          <text class="leave-num">{{ annual.sickDaysUsed }} / {{ annual.sickDaysTotal }}</text>
        </view>
        <view v-if="annual.birthdayEnabled" class="leave-row">
          <text class="leave-name">{{ i18n.profile.birthdayLeave }}</text>
          <view class="leave-track">
            <view class="leave-fill leave-fill-gold" :style="{ width: '100%' }"></view>
          </view>
          <text class="leave-num">{{ annual.birthdayDaysUsed }}</text>
        </view>
      </view>

    </template>

    <!-- 通勤时长编辑弹层 -->
    <view v-if="showCommuteEditor" class="editor-mask" @click="showCommuteEditor = false">
      <view class="editor-sheet" @click.stop>
        <text class="editor-title">{{ i18n.profile.statsCommuteTitle }}</text>
        <text class="editor-value">{{ commuteDisplay }}</text>
        <slider
          class="editor-slider"
          :min="0"
          :max="240"
          :step="15"
          :value="draftCommute"
          activeColor="#0E6E62"
          backgroundColor="#E7EBED"
          block-size="20"
          @changing="onCommuteChanging"
          @change="onCommuteChanging"
        />
        <view class="editor-ticks">
          <text class="editor-tick">0</text>
          <text class="editor-tick">2h</text>
          <text class="editor-tick">4h</text>
        </view>
        <view class="editor-save" @click="saveCommute">
          <text class="editor-save-text">{{ i18n.profile.statsCommuteSave }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { getTopSafeArea } from '@/utils/safeArea.js'
import { getAuth, isTrialActive } from '@/utils/auth.js'
import { locales } from '@/utils/locales.js'

const CHART_MAX_BAR = 90 // 柱状图柱子最大高度(px)
const DAY_HOURS = 8      // OT / 通勤折算天数的基准

export default {
  data() {
    return {
      topSafeHeight: 0,
      year: new Date().getFullYear(),
      annual: {
        year: 0, workingDays: 0, companyDays: 0, homeDays: 0, ratio: 0,
        overtimeHours: 0, overtimeDays: 0,
        commuteMinutes: 90, commuteSavedHours: 0, commuteSavedDays: 0,
        vacationDaysUsed: 0, birthdayDaysUsed: 0, sickDaysUsed: 0,
        vacationDaysTotal: 20, sickDaysTotal: 12, birthdayEnabled: false,
        monthly: []
      },
      showCommuteEditor: false,
      draftCommute: 90
    }
  },
  computed: {
    settings() {
      return wioService.getSettings()
    },
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    session() {
      return getAuth()
    },
    isPro() {
      // 兑换码写入的本地试用订阅优先（测试用），登录订阅兜底——与 ProfileView 口径一致
      if (isTrialActive()) return true
      const sub = this.session && this.session.subscription
      if (!sub) return false
      const exp = sub.expiresAt || sub.expires_at
      return !!(exp && exp > Date.now())
    },
    canGoPrev() {
      return this.year > 2000
    },
    canGoNext() {
      return this.year < new Date().getFullYear()
    },
    chartMax() {
      let max = 1
      this.annual.monthly.forEach(m => {
        max = Math.max(max, m.companyDays, m.targetDays)
      })
      return max
    },
    commuteDisplay() {
      const h = this.draftCommute / 60
      return `${parseFloat(h.toFixed(2))} ${this.i18n.profile.statsUnitHour}`
    },
    commuteEstText() {
      return this.i18n.profile.statsCommuteEst
        .replace('{h}', parseFloat((this.annual.commuteMinutes / 60).toFixed(2)))
    }
  },
  onLoad() {
    this.topSafeHeight = getTopSafeArea().totalHeight
  },
  onShow() {
    this.refresh()
  },
  methods: {
    refresh() {
      this.annual = wioService.getAnnualStats(this.year)
      this.draftCommute = this.annual.commuteMinutes
    },
    goBack() {
      uni.navigateBack()
    },
    goBackToProfile() {
      uni.switchTab({ url: '/pages/profile/index' })
    },
    changeYear(delta) {
      if (delta < 0 && !this.canGoPrev) return
      if (delta > 0 && !this.canGoNext) return
      uni.vibrateShort && uni.vibrateShort()
      this.year += delta
      this.refresh()
    },
    isCurrentMonth(month) {
      const now = new Date()
      return this.year === now.getFullYear() && month === now.getMonth() + 1
    },
    barHeight(days) {
      return Math.round(days / this.chartMax * CHART_MAX_BAR)
    },
    leavePct(used, total) {
      if (!total) return 0
      return Math.min(100, Math.round(used / total * 100))
    },
    onCommuteChanging(e) {
      this.draftCommute = e.detail.value
    },
    saveCommute() {
      const settings = wioService.getSettings()
      settings.commuteMinutes = this.draftCommute
      wioService.saveSettings(settings)
      this.showCommuteEditor = false
      this.refresh()
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #F2F4F6;
  padding: 20px;
  box-sizing: border-box;
  padding-bottom: calc(40px + env(safe-area-inset-bottom));
}

/* ---- 页头 ---- */
.page-head {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.back-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-text {
  font-size: 22px;
  color: #151820;
  line-height: 1;
}
.page-title {
  font-size: 18px;
  font-weight: bold;
  color: #151820;
  flex: 1;
}
.head-space { width: 28px; }

/* ---- 卡片通用 ---- */
.card {
  background-color: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #151820;
}
.section-sub {
  font-size: 10.5px;
  color: #8A94A0;
  margin-top: 3px;
}

/* ---- 锁定态 ---- */
.locked-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px;
}
.locked-icon { font-size: 40px; }
.locked-title {
  font-size: 16px;
  font-weight: 600;
  color: #151820;
  margin-top: 12px;
}
.locked-sub {
  font-size: 12px;
  color: #8A94A0;
  text-align: center;
  margin-top: 6px;
  line-height: 1.6;
}
.locked-cta {
  margin-top: 20px;
  background-color: #C08A2D;
  border-radius: 999px;
  padding: 10px 32px;
}
.locked-cta-text { color: #FFFFFF; font-size: 14px; font-weight: 600; }

/* ---- 概览卡 ---- */
.year-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.year-text { font-size: 13px; color: #6B737B; }
.year-switch { display: flex; align-items: center; }
.year-arrow {
  font-size: 18px;
  color: #6B737B;
  padding: 2px 8px;
}
.year-arrow.disabled { color: #C3C9CE; }
.num-row {
  display: flex;
  align-items: flex-end;
  margin-top: 8px;
}
.num-big {
  font-size: 34px;
  font-weight: bold;
  color: #151820;
  line-height: 1.1;
}
.num-denom {
  font-size: 14px;
  color: #8A94A0;
  margin-left: 6px;
  margin-bottom: 3px;
}
.ratio-text {
  font-size: 11px;
  color: #8A8F98;
  margin-top: 6px;
}
.progress-track {
  height: 6px;
  background-color: #E7EBED;
  border-radius: 3px;
  margin-top: 10px;
  overflow: hidden;
}
.progress-fill {
  height: 6px;
  background-color: #0E6E62;
  border-radius: 3px;
}
.stat-divider {
  height: 1px;
  background-color: #F0EDE6;
  margin-top: 14px;
}
.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
}
.stat-label-group { display: flex; flex-direction: column; }
.stat-label { font-size: 11.5px; color: #6B737B; }
.stat-est { font-size: 10.5px; color: #8A94A0; margin-top: 3px; }
.stat-value-group {
  display: flex;
  align-items: center;
}
.stat-value { font-size: 11.5px; font-weight: 500; color: #0E6E62; }
.stat-conv { font-size: 11.5px; color: #8A94A0; margin-left: 4px; }

/* ---- 趋势卡 ---- */
.trend-card .section-sub { display: block; }
.chart { margin-top: 14px; }
.chart-area {
  display: flex;
  align-items: flex-end;
  height: 100px;
  position: relative;
}
.chart-col {
  flex: 1;
  height: 100px;
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar {
  width: 55%;
  background-color: #0E6E62;
  border-radius: 3px 3px 0 0;
  min-height: 0;
}
.bar-current { background-color: #C08A2D; }
.chart-baseline {
  height: 1px;
  background-color: #E7EBED;
}
.month-labels {
  display: flex;
  margin-top: 6px;
}
.month-label {
  flex: 1;
  text-align: center;
  font-size: 9.5px;
  color: #8A94A0;
}
.legend {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}
.legend-dot { width: 8px; height: 8px; border-radius: 2px; }
.legend-dot-green { background-color: #0E6E62; }
.legend-dot-gold { background-color: #C08A2D; }
.legend-text { font-size: 10.5px; color: #6B737B; }

/* ---- 假期卡 ---- */
.leave-row {
  display: flex;
  align-items: center;
  margin-top: 14px;
}
.leave-name {
  width: 44px;
  font-size: 11.5px;
  color: #6B737B;
  flex-shrink: 0;
}
.leave-track {
  flex: 1;
  height: 6px;
  background-color: #E7EBED;
  border-radius: 3px;
  margin: 0 12px;
  overflow: hidden;
}
.leave-fill {
  height: 6px;
  background-color: #0E6E62;
  border-radius: 3px;
}
.leave-fill-gold { background-color: #C08A2D; }
.leave-num {
  font-size: 10.5px;
  color: #8A8F98;
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
}

/* ---- 通勤编辑弹层 ---- */
.editor-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}
.editor-sheet {
  width: 100%;
  background-color: #FFFFFF;
  border-radius: 20px 20px 0 0;
  padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.editor-title { font-size: 14px; font-weight: 600; color: #151820; }
.editor-value {
  display: block;
  font-size: 28px;
  font-weight: bold;
  color: #0E6E62;
  margin-top: 12px;
}
.editor-slider { margin: 20px 4px 4px; }
.editor-ticks {
  display: flex;
  justify-content: space-between;
  margin: 0 4px;
}
.editor-tick { font-size: 10px; color: #8A94A0; }
.editor-save {
  margin-top: 20px;
  background-color: #0E6E62;
  border-radius: 999px;
  padding: 12px;
  display: flex;
  justify-content: center;
}
.editor-save-text { color: #FFFFFF; font-size: 14px; font-weight: 600; }
</style>
