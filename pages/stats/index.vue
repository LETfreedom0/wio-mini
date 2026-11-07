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
              @click="onBarTap(m)"
            >
              <view
                v-if="selectedMonth === m.month && m.companyDays > 0"
                class="bar-tip"
                :style="{ bottom: barHeight(m.companyDays) + 6 + 'px' }"
              >
                <text class="bar-tip-text">{{ m.companyDays }} {{ i18n.profile.statsUnitDay }}</text>
              </view>
              <view
                class="bar"
                :class="{ 'bar-current': isCurrentMonth(m.month), 'bar-selected': selectedMonth === m.month && !isCurrentMonth(m.month) }"
                :style="{ height: barHeight(m.companyDays) + 'px' }"
              ></view>
            </view>
          </view>
          <view class="chart-baseline"></view>
        </view>
        <view class="month-labels">
          <text
            v-for="m in annual.monthly"
            :key="m.month"
            class="month-label"
            :class="{ active: selectedMonth === m.month }"
          >{{ m.month }}</text>
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

      <!-- 加班趋势卡（折线）：柱状图看回司天数，折线看加班强度 -->
      <view class="card ot-card">
        <view class="ot-head">
          <text class="section-title">{{ i18n.profile.statsOtTrendTitle }}</text>
          <text class="ot-total">{{ annual.overtimeHours }} {{ i18n.profile.statsUnitHour }}</text>
        </view>
        <text class="section-sub">{{ i18n.profile.statsOtTrendSub }}</text>
        <view class="ot-chart-wrap">
          <view class="ot-chart" :style="{ backgroundImage: otChartBg }"></view>
          <!-- 选中的月份在线上的落点：气泡再轻，没有这个点会读不出「标的是哪个点」 -->
          <view
            v-if="otMarker && activeOtMonth > -1"
            class="ot-dot"
            :style="{ left: otMarker.left, top: otMarker.top }"
          ></view>
          <view
            v-if="otMarker"
            class="ot-peak"
            :class="{ picked: activeMonth > -1 }"
            :style="{ left: otMarker.left, top: otMarker.top }"
          >
            <text class="ot-peak-text">{{ otMarker.hours }}</text>
          </view>
          <!-- 折线是背景图画出来的，没有节点可点：铺 12 个等分热区接手点击 -->
          <view v-if="hasOt" class="ot-hit-row">
            <view v-for="(v, i) in otSeries" :key="i" class="ot-hit" @click="pickMonth(i)"></view>
          </view>
        </view>
        <view class="month-labels">
          <text
            v-for="(v, i) in otSeries"
            :key="i"
            class="month-label"
            :class="{ active: activeMonth === i }"
            @click="pickMonth(i)"
          >{{ i + 1 }}</text>
        </view>
        <text class="ot-foot">{{ otFootText }}</text>
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

        <!-- 自定义假期（会员）：按天型看额度，区间型看占用的工作日数 -->
        <template v-if="annual.customLeaves && annual.customLeaves.length">
          <view class="stat-divider"></view>
          <text class="section-sub custom-cap">{{ i18n.profile.statsCustomTitle }}</text>
          <view v-for="l in annual.customLeaves" :key="l.id" class="leave-row">
            <view class="leave-name-group">
              <view class="leave-dot" :style="{ background: l.color }"></view>
              <text class="leave-name custom-name">{{ l.name }}</text>
            </view>
            <view class="leave-track">
              <view class="leave-fill" :style="{ width: customPct(l) + '%', background: l.color }"></view>
            </view>
            <text class="leave-num">{{ customNum(l) }}</text>
          </view>
        </template>
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
import { getAuth } from '@/utils/auth.js'
import { isProUser, PRO_CHANGED_EVENT } from '@/utils/pro.js'
import { locales } from '@/utils/locales.js'
import { tap as haptic } from '@/utils/haptic.js'

const CHART_MAX_BAR = 90 // 柱状图柱子最大高度(px)
const DAY_HOURS = 8      // OT / 通勤折算天数的基准
// 加班折线的画布坐标系（SVG viewBox，按容器拉伸）
const OL_W = 300
const OL_H = 84
const OL_PAD = 8

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
        customLeaves: [],
        monthly: []
      },
      showCommuteEditor: false,
      draftCommute: 90,
      proStamp: 0, // 仅用于让 isPro 在页面重新显示时重算
      langStamp: 0, // 仅用于让 settings 在语言切换后重算（storage 无响应性）
      selectedMonth: new Date().getMonth() + 1,  // 柱状图默认选中当前月
      activeOtMonth: -1                          // 折线点选的月份（0 基，-1 表示未选）
    }
  },
  computed: {
    settings() {
      void this.langStamp
      return wioService.getSettings()
    },
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    session() {
      return getAuth()
    },
    isPro() {
      // 与「我的」「会员」页同一口径（utils/pro.js）
      void this.proStamp
      return isProUser()
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
    },
    // ===== 加班折线 =====
    // 固定输出 12 个月：折线的 x 坐标按 11 等分算，长度不足时末点会塌到左边，
    // 与下方 12 个月份刻度错位；首屏 annual 还没加载时也要能安全求值
    otSeries() {
      const rows = this.annual.monthly || []
      const arr = rows.map(m => Number(m && m.overtimeHours) || 0)
      while (arr.length < 12) arr.push(0)
      return arr.slice(0, 12)
    },
    otMax() {
      return Math.max(1, ...this.otSeries)
    },
    hasOt() {
      return this.otSeries.some(v => v > 0)
    },
    // 峰值：折线上标一个点，回答「哪个月最忙」——趋势线光看形状不够
    otPeak() {
      if (!this.hasOt) return null
      const arr = this.otSeries
      let idx = 0
      arr.forEach((v, i) => { if (v > arr[idx]) idx = i })
      const { x, y } = this.otPoint(idx, arr[idx])
      return {
        month: idx + 1,
        hours: arr[idx],
        left: (x / OL_W * 100).toFixed(2) + '%',
        top: (y / OL_H * 100).toFixed(2) + '%'
      }
    },
    // 折线上那个小标签：点了某个月就跟到那个月，没点就停在峰值上
    otMarker() {
      if (this.activeOtMonth < 0) return this.otPeak
      const idx = Math.min(this.activeOtMonth, this.otSeries.length - 1)
      const v = this.otSeries[idx] || 0
      const { x, y } = this.otPoint(idx, v)
      return {
        month: idx + 1,
        hours: v,
        left: (x / OL_W * 100).toFixed(2) + '%',
        top: (y / OL_H * 100).toFixed(2) + '%'
      }
    },
    // 12 个月加班时长的折线 + 面积，用 SVG data URI 画。
    // 不用 canvas：小程序里 canvas 是原生层级，会盖住弹层与 tabBar，
    // 背景图则完全跟随布局，还能随卡片宽度自适应
    otChartBg() {
      const arr = this.otSeries
      // 没有数据就不画：pts 为空时取 last.x 会直接抛异常（页面白屏）
      if (!arr.length) return ''
      const pts = arr.map((v, i) => this.otPoint(i, v))
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      const last = pts[pts.length - 1]
      const first = pts[0]
      const area = `${line} L${last.x.toFixed(1)} ${OL_H - OL_PAD} L${first.x.toFixed(1)} ${OL_H - OL_PAD} Z`
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OL_W} ${OL_H}" preserveAspectRatio="none">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#C08A2D" stop-opacity="0.32"/>` +
        `<stop offset="1" stop-color="#C08A2D" stop-opacity="0"/>` +
        `</linearGradient></defs>` +
        `<path d="${area}" fill="url(#g)"/>` +
        `<path d="${line}" fill="none" stroke="#C08A2D" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` +
        `</svg>`
      return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
    },
    otFootText() {
      const p = this.i18n.profile
      if (!this.hasOt) return p.statsOtEmpty
      // 点选后脚下这行换成该月明细：加班时长 + 当月回司天数
      if (this.activeOtMonth >= 0) {
        const row = (this.annual.monthly || [])[this.activeOtMonth] || {}
        return p.statsOtPicked
          .replace('{m}', this.activeOtMonth + 1)
          .replace('{n}', this.otSeries[this.activeOtMonth] || 0)
          .replace('{d}', Number(row.companyDays) || 0)
      }
      return p.statsOtPeak
        .replace('{m}', this.otPeak.month)
        .replace('{n}', this.otPeak.hours)
    }
  },
  onLoad() {
    this.topSafeHeight = getTopSafeArea().totalHeight
    // 语言从我的/会员页切换时，本页可能已经挂载：靠广播重算 settings
    uni.$on('wio:language-changed', this.onLangChanged)
  },
  onUnload() {
    uni.$off('wio:language-changed', this.onLangChanged)
  },
  onShow() {
    // 权益可能在别的页面变过（开通 / 退出登录），每次显示都重算
    this.proStamp++
    this.refresh()
  },
  methods: {
    onLangChanged(lang) {
      if (!lang) return
      this.langStamp++
    },
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
      haptic('light')
      this.year += delta
      // 换年等于换一整组数据，别让上一年的选中月残留在新图上
      this.activeOtMonth = -1
      this.refresh()
    },
    isCurrentMonth(month) {
      const now = new Date()
      return this.year === now.getFullYear() && month === now.getMonth() + 1
    },
    barHeight(days) {
      return Math.round(days / this.chartMax * CHART_MAX_BAR)
    },
    // 点柱子：弹出/收起该月的回司天数气泡
    onBarTap(m) {
      haptic('light')
      this.selectedMonth = this.selectedMonth === m.month ? null : m.month
    },
    // 点折线/月份刻度：标记跟到那个月，再点一次收回峰值
    pickMonth(i) {
      if (!this.hasOt) return
      haptic('light')
      this.activeOtMonth = this.activeOtMonth === i ? -1 : i
    },
    leavePct(used, total) {
      if (!total) return 0
      return Math.min(100, Math.round(used / total * 100))
    },
    // 折线上第 i 个月的数据点坐标（渲染与峰值标注共用一个换算，
    // 否则峰值小圆点会偏到线外）
    otPoint(i, v) {
      const stepX = (OL_W - OL_PAD * 2) / 11
      return {
        x: OL_PAD + i * stepX,
        y: OL_H - OL_PAD - (v / this.otMax) * (OL_H - OL_PAD * 2)
      }
    },
    // ===== 自定义假期行 =====
    // 按天型看「已用 / 额度」，区间型看这段假占用了几个工作日
    customPct(l) {
      if (l.mode !== 'day' || !l.quota) return 100
      return Math.min(100, Math.round((l.used / l.quota) * 100))
    },
    customNum(l) {
      return l.mode === 'day'
        ? (l.quota ? `${l.used} / ${l.quota}` : String(l.used))
        : this.i18n.profile.statsCustomRange.replace('{n}', l.days)
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
  height: 116px;
  position: relative;
}
.chart-col {
  flex: 1;
  height: 116px;
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
.bar-selected { background-color: #0B5248; }
/* 点选柱子时弹出的天数气泡 */
.bar-tip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background-color: #151820;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  z-index: 2;
}
.bar-tip-text {
  color: #FFFFFF;
  font-size: 10px;
  line-height: 1.4;
}
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
.month-label.active {
  color: #151820;
  font-weight: 600;
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

/* ---- 加班趋势卡 ---- */
.ot-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.ot-total {
  font-size: 14px;
  font-weight: 600;
  color: #C08A2D;
}
.ot-chart-wrap {
  position: relative;
  height: 84px;
  margin-top: 14px;
}
.ot-chart {
  width: 100%;
  height: 84px;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
/* 峰值点：贴在线上的小标签，回答「哪个月最忙」 */
.ot-peak {
  position: absolute;
  transform: translate(-50%, -140%);
  background-color: #C08A2D;
  border-radius: 4px;
  padding: 1px 5px;
}
.ot-peak-text {
  font-size: 9.5px;
  color: #FFFFFF;
  line-height: 1.4;
}
/* 点选后的气泡比峰值再抬一档，明确「这个是我点出来的」 */
.ot-peak.picked {
  box-shadow: 0 2px 6px rgba(192, 138, 45, 0.35);
}
/* 选中月的落点：白心金环，压在折线顶点上 */
.ot-dot {
  position: absolute;
  width: 9px;
  height: 9px;
  margin-left: -4.5px;
  margin-top: -4.5px;
  border-radius: 50%;
  background-color: #FFFFFF;
  border: 2px solid #C08A2D;
  box-sizing: border-box;
}
/* 点选热区：12 等分铺满图表，本身透明，只负责接点击 */
.ot-hit-row {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
}
.ot-hit {
  flex: 1;
}
.ot-foot {
  display: block;
  font-size: 10px;
  color: #8A94A0;
  margin-top: 8px;
}

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

/* 自定义假期行：名称前面带一个假期自己的颜色点 */
.custom-cap {
  display: block;
  margin-top: 12px;
}
.leave-name-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  min-width: 44px;
}
.leave-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  flex-shrink: 0;
}
.custom-name {
  width: auto;
  max-width: 78px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
