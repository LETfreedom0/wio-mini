<template>
  <view class="home-content">
    <!-- 礼花筒效果容器 (居家) -->
    <view class="confetti-container" v-if="showConfetti">
      <view v-for="(item, index) in confettiPieces" :key="index"
            class="confetti-piece"
            :class="item.className"
            :style="item.style">
      </view>
    </view>

    <!-- 火箭升空效果容器 (公司) -->
    <view class="rocket-container" v-if="showRocket">
      <view class="rocket-wrapper">
        <text class="rocket-icon">🚀</text>
        <view class="rocket-trail">
          <view class="trail-spark" v-for="n in 4" :key="n"></view>
        </view>
      </view>
    </view>

    <scroll-view scroll-y="true" class="home-scroll" :show-scrollbar="false">
      <view class="content-wrapper">

        <!-- ===== Header：日期 + 问候 + 设置 ===== -->
        <view class="header-row anim-entry" style="animation-delay: 0.05s;">
          <view class="greeting-col">
            <text class="date-text">{{ currentDateStr }}</text>
            <text class="greeting-text">{{ greetingText }}</text>
          </view>
          <view class="settings-btn" @click="goProfile">
            <svg class="gear-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                    stroke="#15181C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a1.6 1.6 0 0 1 0 2.27 1.6 1.6 0 0 1-2.27 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a1.6 1.6 0 0 1-1.6 1.6 1.6 1.6 0 0 1-1.6-1.6v-.09A1.65 1.65 0 0 0 10.44 19a1.65 1.65 0 0 0-1.82.33l-.06.06a1.6 1.6 0 0 1-2.27 0 1.6 1.6 0 0 1 0-2.27l.06-.06A1.65 1.65 0 0 0 6.68 15a1.65 1.65 0 0 0-1.51-1H5.1a1.6 1.6 0 0 1-1.6-1.6 1.6 1.6 0 0 1 1.6-1.6h.09A1.65 1.65 0 0 0 6.7 9.8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a1.6 1.6 0 0 1 0-2.27 1.6 1.6 0 0 1 2.27 0l.06.06A1.65 1.65 0 0 0 10.46 6h.07A1.65 1.65 0 0 0 11.5 4.49V4.4A1.6 1.6 0 0 1 13.1 2.8a1.6 1.6 0 0 1 1.6 1.6v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a1.6 1.6 0 0 1 2.27 0 1.6 1.6 0 0 1 0 2.27l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1h.09a1.6 1.6 0 0 1 1.6 1.6 1.6 1.6 0 0 1-1.6 1.6h-.09a1.65 1.65 0 0 0-1.51 1Z"
                    stroke="#15181C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </view>
        </view>

        <!-- ===== 本月回公司率 ===== -->
        <view class="progress-card anim-entry" :class="{ 'card-ok': isAchieved }" style="animation-delay: 0.1s;">
          <view class="card-header">
            <text class="card-label">{{ i18n.home.monthlyWio }}</text>
            <view class="target-pill">
              <text class="target-pill-text">{{ i18n.home.targetLabel }} {{ targetPercentage }}%</text>
            </view>
          </view>

          <view class="number-row">
            <view class="number-group">
              <text class="big-number">{{ wioPercentage }}</text>
              <text class="percent-sign">%</text>
            </view>
            <text class="gap-note">{{ gapText }}</text>
          </view>

          <view class="progress-track">
            <view class="progress-fill" :style="{ width: fillWidth + '%' }"></view>
          </view>

          <view class="stats-row">
            <view class="stat-col">
              <text class="stat-value">{{ stats.companyDays }} {{ i18n.home.countDays }}</text>
              <text class="stat-label">{{ i18n.home.workFromCompany }}</text>
            </view>
            <view class="stat-col">
              <text class="stat-value">{{ stats.homeDays }} {{ i18n.home.countDays }}</text>
              <text class="stat-label">{{ i18n.home.workFromHome }}</text>
            </view>
            <view class="stat-col">
              <text class="stat-value">{{ remainWorkDays }} {{ i18n.home.countDays }}</text>
              <text class="stat-label">{{ i18n.home.remainWorkDays }}</text>
            </view>
          </view>
        </view>

        <!-- ===== 年假剩余 ===== -->
        <view class="leave-card anim-entry" style="animation-delay: 0.15s;">
          <view class="leave-top">
            <view class="leave-left">
              <text class="leave-label">{{ i18n.home.leaveLeft }}</text>
              <text class="leave-quota">{{ i18n.home.leaveUsed }} {{ vacationUsed }} / {{ vacationTotal }} {{ i18n.home.countDays }}</text>
            </view>
            <view class="leave-right">
              <text class="leave-num">{{ vacationLeft }}</text>
              <text class="leave-unit">{{ i18n.home.countDays }}</text>
            </view>
          </view>
          <view class="leave-track">
            <view class="leave-fill" :style="{ width: vacationPercent + '%' }"></view>
          </view>
        </view>

        <!-- ===== 今天在哪办公 ===== -->
        <view class="today-section anim-entry" style="animation-delay: 0.2s;">
          <text class="section-title">{{ i18n.home.todayTitle }}</text>
          <view class="choice-row">
            <view class="choice-card" :class="{ selected: location === 'company' }" @click="setStatus('company')">
              <view class="choice-icon">
                <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4.2 18.5V5.1c0-.6.5-1.1 1.1-1.1h6.4c.6 0 1.1.5 1.1 1.1v13.4M12.8 10.7h4c.6 0 1.1.5 1.1 1.1v6.7M2.6 18.5h16.8M7 6.9h3M7 9.8h3M7 12.7h3M15.4 13.6h1.2M15.4 16.1h1.2"
                        :stroke="location === 'company' ? '#0E6E62' : '#9AA1A8'" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </view>
              <text class="choice-title">{{ i18n.home.workFromCompany }}</text>
              <text class="choice-state" :class="{ 'state-on': location === 'company' }">{{ location === 'company' ? i18n.home.recorded : i18n.home.tapToSwitch }}</text>
            </view>

            <view class="choice-card" :class="{ selected: location === 'home' }" @click="setStatus('home')">
              <view class="choice-icon">
                <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3.6 9.6 11 3.6l7.4 6v8.2c0 .5-.4.9-.9.9h-3.9v-5.1H8.4v5.1H4.5c-.5 0-.9-.4-.9-.9V9.6Z"
                        :stroke="location === 'home' ? '#B26B18' : '#9AA1A8'" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </view>
              <text class="choice-title">{{ i18n.home.workFromHome }}</text>
              <text class="choice-state" :class="{ 'state-on': location === 'home' }">{{ location === 'home' ? i18n.home.recorded : i18n.home.tapToSwitch }}</text>
            </view>
          </view>
          <text class="today-hint">{{ i18n.home.hint }}</text>
        </view>

        <!-- ===== 最近记录 ===== -->
        <view class="recent-section anim-entry" style="animation-delay: 0.25s;">
          <view class="recent-header">
            <text class="section-title">{{ i18n.home.recentRecords }}</text>
            <text class="recent-all" @click="goCalendar">{{ i18n.home.viewAll }}</text>
          </view>
          <view class="recent-list">
            <view v-if="recentRecords.length === 0" class="record-empty">
              <text class="empty-text">{{ i18n.home.noRecord }}</text>
            </view>
            <view v-for="(item, index) in recentRecords" :key="index" class="record-row">
              <text class="record-date">{{ item.dateLabel }}</text>
              <view class="status-pill" :style="{ backgroundColor: item.bgColor }">
                <text class="status-text" :style="{ color: item.color }">{{ item.label }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="bottom-spacer"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, getMonthName, getWeekdayName } from '@/utils/locales.js'

export default {
  name: 'HomeView',
  data() {
    return {
      location: null, // 'home' | 'company' | null
      todayStr: '',
      showConfetti: false,
      showRocket: false,
      confettiPieces: [],
      settings: {},
      stats: {
        companyDays: 0,
        homeDays: 0,
        totalOvertime: 0,
        workingDays: 0,
        vacationDays: 0,
        birthdayDays: 0,
        sickDays: 0,
        unpaidDays: 0,
        compOffDays: 0,
        excludeWioDays: 0,
        weekendLeaves: 0
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0
      },
      recentRecords: []
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    currentDateStr() {
      const now = new Date()
      const month = now.getMonth() + 1
      const date = now.getDate()
      const day = getWeekdayName(now.getDay(), this.settings.language)
      if (this.settings.language === 'en-US') {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
        return `${months[month - 1]} ${date} · ${day}`
      }
      return `${month}月${date}日 · 星期${day}`
    },
    // 时段问候（无账号体系，不带用户名）
    greetingText() {
      const h = new Date().getHours()
      const hh = this.i18n.home
      if (h < 11) return hh.greetingMorning
      if (h < 13) return hh.greetingNoon
      if (h < 18) return hh.greetingAfternoon
      return hh.greetingEvening
    },
    targetPercentage() {
      return this.settings.targetPercentage || 40
    },
    // 与日历页保持同一套回公司率公式
    wioPercentage() {
      const denominator = this.denominator
      if (denominator <= 0) return 0
      return Math.round((this.stats.companyDays / denominator) * 100)
    },
    denominator() {
      const totalDeductible = this.stats.vacationDays
                            + this.stats.birthdayDays
                            + this.stats.sickDays
                            + this.stats.unpaidDays
                            + this.stats.compOffDays
                            + this.stats.excludeWioDays
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0)
      return this.stats.workingDays - effectiveDeductible
    },
    isAchieved() {
      return this.wioPercentage >= this.targetPercentage
    },
    // 距离目标还差多少个「公司办公日」
    gapDays() {
      if (this.isAchieved) return 0
      if (this.denominator <= 0) return 0
      const needCompany = Math.ceil((this.targetPercentage / 100) * this.denominator)
      return Math.max(0, needCompany - this.stats.companyDays)
    },
    gapText() {
      if (this.isAchieved) return this.i18n.home.achieved
      const u = this.i18n.home
      return `${u.daysToGo} ${this.gapDays} ${u.daysToGoUnit}${u.achievedSuffix}`
    },
    fillWidth() {
      return Math.max(0, Math.min(100, this.wioPercentage))
    },
    remainWorkDays() {
      return Math.max(0, this.denominator - this.stats.companyDays - this.stats.homeDays)
    },
    vacationTotal() {
      return this.settings.vacationDays || 0
    },
    vacationUsed() {
      return this.yearStats.vacationDaysUsed || 0
    },
    vacationLeft() {
      return Math.max(0, this.vacationTotal - this.vacationUsed)
    },
    vacationPercent() {
      if (!this.vacationTotal) return 0
      return Math.max(0, Math.min(100, (this.vacationLeft / this.vacationTotal) * 100))
    }
  },
  mounted() {
    this.initData()
  },
  onShow() {
    this.settings = wioService.getSettings()
    this.loadStats()
  },
  methods: {
    initData() {
      this.settings = wioService.getSettings()
      this.todayStr = wioService.getTodayDateStr()
      this.location = wioService.getEntryForDate(this.todayStr)
      this.loadStats()
    },
    // 只读本月统计 + 年度假期统计 + 最近记录（不改动存储结构）
    loadStats() {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      try {
        this.stats = wioService.getMonthStats(year, month)
      } catch (e) {
        console.error('loadStats month failed', e)
      }
      try {
        this.yearStats = wioService.getYearStats(year)
      } catch (e) {
        console.error('loadStats year failed', e)
      }
      this.buildRecentRecords()
    },
    buildRecentRecords() {
      const entries = wioService.getEntries() || {}
      const lang = this.settings.language
      const dates = Object.keys(entries).sort().reverse().slice(0, 3)

      const meta = {
        company: { label: this.i18n.home.workFromCompany, color: '#0E6E62', bg: '#E7F1EF' },
        home: { label: this.i18n.home.workFromHome, color: '#B26B18', bg: '#FBF0E2' },
        vacation: { label: this.i18n.calendar.legends.vacation, color: '#41598A', bg: '#E9EDF5' },
        birthday: { label: this.i18n.calendar.legends.birthday, color: '#C24A7E', bg: '#FBF0F4' },
        sick: { label: this.i18n.calendar.legends.sick, color: '#8C4F86', bg: '#F4ECF3' },
        unpaid: { label: this.i18n.calendar.legends.unpaid, color: '#6B7379', bg: '#EFF1F3' },
        comp_off: { label: this.i18n.calendar.legends.comp_off, color: '#1E7A8C', bg: '#E5F2F4' },
        public: { label: this.i18n.calendar.legends.public, color: '#B23A32', bg: '#F9EAE8' },
        exclude_wio: { label: this.i18n.calendar.legends.exclude_wio, color: '#8B95A1', bg: '#EFF1F3' }
      }

      this.recentRecords = dates.map(dateStr => {
        const [y, m, d] = dateStr.split('-')
        const dt = new Date(Number(y), Number(m) - 1, Number(d))
        const weekday = getWeekdayName(dt.getDay(), lang)
        const dateLabel = lang === 'en-US'
          ? `${getMonthName(Number(m), lang)} ${Number(d)}`
          : `${Number(m)}月${Number(d)}日 · 周${weekday}`
        const status = entries[dateStr]
        const m2 = meta[status] || { label: status, color: '#6B7379', bg: '#EFF1F3' }
        return { dateLabel, label: m2.label, color: m2.color, bgColor: m2.bg }
      })
    },
    setStatus(status) {
      if (this.location !== status) {
        uni.vibrateShort()
        if (status === 'home') this.triggerConfetti()
        else if (status === 'company') this.triggerRocket()
      }
      this.location = status
      wioService.saveEntry(this.todayStr, status)
      this.loadStats()
    },
    goProfile() {
      uni.switchTab({ url: '/pages/profile/index' })
    },
    goCalendar() {
      uni.switchTab({ url: '/pages/calendar/index' })
    },
    triggerConfetti() {
      const colors = ['#ff0055', '#00ddff', '#00ff99', '#9900ff', '#ffd300', '#ff8800']
      const pieces = []
      for (let i = 0; i < 80; i++) {
        const isLeft = i < 40
        const color = colors[Math.floor(Math.random() * colors.length)]
        const duration = 3 + Math.random() * 2
        const delay = Math.random() * 0.3
        const targetX = isLeft ? 10 + Math.random() * 50 : 40 + Math.random() * 50
        const targetY = 5 + Math.random() * 30
        const rotation = (Math.random() - 0.5) * 720
        pieces.push({
          className: isLeft ? 'confetti-left-anim' : 'confetti-right-anim',
          style: {
            '--bg-color': color,
            '--target-x': `${targetX}%`,
            '--target-y': `${targetY}%`,
            '--rotation': `${rotation}deg`,
            '--duration': `${duration}s`,
            '--delay': `${delay}s`,
            backgroundColor: color,
            left: isLeft ? '0%' : '100%'
          }
        })
      }
      this.confettiPieces = pieces
      this.showConfetti = false
      this.$nextTick(() => {
        this.showConfetti = true
        setTimeout(() => { this.showConfetti = false }, 6000)
      })
    },
    triggerRocket() {
      this.showRocket = false
      this.$nextTick(() => {
        this.showRocket = true
        setTimeout(() => { this.showRocket = false }, 2500)
      })
    }
  }
}
</script>

<style scoped>
.home-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #F4F5F6;
}

/* ===== 滚动容器 ===== */
.home-scroll {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 20px 0 20px;
}

.header-row,
.progress-card,
.leave-card,
.today-section,
.recent-section {
  width: 100%;
}

/* ===== Header ===== */
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.greeting-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-text {
  font-size: 12px;
  color: #6B737B;
  line-height: 1.4;
}

.greeting-text {
  font-size: 22px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.35;
}

.settings-btn {
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.gear-svg {
  width: 20px;
  height: 20px;
}

/* ===== 本月回公司率卡（低于目标 = 红卡） ===== */
.progress-card {
  box-sizing: border-box;
  width: 100%;
  background: #A63A31;
  border-radius: 20px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
  transition: background 0.3s ease;
}

/* 已达标 = 主色绿卡 */
.progress-card.card-ok {
  background: #0E6E62;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-label {
  font-size: 13px;
  font-weight: 500;
  color: #F2D3CD;
  line-height: 1.4;
}

.card-ok .card-label {
  color: #CFE6E1;
}

.target-pill {
  padding: 5px 10px;
  border-radius: 100px;
  background: #BC5349;
}

.card-ok .target-pill {
  background: #1F7F73;
}

.target-pill-text {
  font-size: 11px;
  font-weight: 500;
  color: #FCE9E5;
  line-height: 1.3;
}

.card-ok .target-pill-text {
  color: #E4F4F0;
}

.number-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.number-group {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.big-number {
  font-size: 52px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 54px;
  letter-spacing: -1px;
}

.percent-sign {
  font-size: 22px;
  font-weight: 600;
  color: #F2D3CD;
  line-height: 1.2;
}

.card-ok .percent-sign {
  color: #CFE6E1;
}

.gap-note {
  font-size: 12px;
  color: #F6D8D2;
  line-height: 1.4;
}

.card-ok .gap-note {
  color: #D8EFEA;
}

.progress-track {
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #BF6157;
  overflow: hidden;
}

.card-ok .progress-track {
  background: #2E897C;
}

.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 6px;
  border-radius: 3px;
  background: #FFFFFF;
  transition: width 0.5s cubic-bezier(0.25, 0.8, 0.3, 1);
}

.stats-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.stat-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat-value {
  font-size: 17px;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.3;
}

.stat-label {
  font-size: 11px;
  color: #EFC9C3;
  line-height: 1.3;
}

.card-ok .stat-label {
  color: #CBE5E0;
}

/* ===== 年假剩余卡 ===== */
.leave-card {
  box-sizing: border-box;
  width: 100%;
  background: #FFFFFF;
  border-radius: 18px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.leave-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.leave-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.leave-label {
  font-size: 13px;
  font-weight: 500;
  color: #3A4149;
  line-height: 1.4;
}

.leave-quota {
  font-size: 10px;
  color: #9AA1A8;
  line-height: 1.4;
}

.leave-right {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.leave-num {
  font-size: 22px;
  font-weight: 600;
  color: #41598A;
  line-height: 1.25;
}

.leave-unit {
  font-size: 12px;
  font-weight: 500;
  color: #41598A;
  line-height: 1.4;
}

.leave-track {
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #E4E8F0;
  overflow: hidden;
}

.leave-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 6px;
  border-radius: 3px;
  background: #41598A;
  transition: width 0.5s cubic-bezier(0.25, 0.8, 0.3, 1);
}

/* ===== 今天在哪办公 ===== */
.today-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #15181C;
  line-height: 1.4;
}

.choice-row {
  display: flex;
  gap: 10px;
}

.choice-card {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 104px;
  background: #FFFFFF;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1.5px solid transparent;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.choice-card.selected {
  background: #F2F4F9;
  border-color: #0E6E62;
}

.choice-icon {
  width: 22px;
  height: 22px;
}

.choice-icon svg {
  width: 22px;
  height: 22px;
}

.choice-title {
  font-size: 14px;
  font-weight: 600;
  color: #15181C;
  line-height: 1.4;
}

.choice-state {
  font-size: 10px;
  color: #9AA1A8;
  line-height: 1.4;
}

.choice-state.state-on {
  color: #0E6E62;
  font-weight: 500;
}

.today-hint {
  font-size: 10px;
  color: #9AA1A8;
  line-height: 1.5;
}

/* ===== 最近记录 ===== */
.recent-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.recent-all {
  font-size: 12px;
  color: #6B737B;
  line-height: 1.4;
}

.recent-list {
  background: #FFFFFF;
  border-radius: 18px;
  overflow: hidden;
}

.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 11px 16px;
  box-sizing: border-box;
}

.record-row + .record-row {
  border-top: 1px solid #F2F4F5;
}

.record-date {
  font-size: 13px;
  color: #15181C;
  line-height: 1.4;
}

.status-pill {
  padding: 4px 10px;
  border-radius: 100px;
}

.status-text {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
}

.record-empty {
  padding: 14px 16px;
}

.empty-text {
  font-size: 12px;
  color: #9AA1A8;
  line-height: 1.5;
}

.bottom-spacer {
  height: 20px;
  flex-shrink: 0;
}

/* ===== 礼花 ===== */
.confetti-container {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 99;
  overflow: hidden;
}

.confetti-piece {
  position: absolute;
  width: 8px;
  height: 16px;
  top: 100%;
  opacity: 0;
  background-color: var(--bg-color, #ffd300);
}

.confetti-left-anim {
  animation: confetti-left-arc var(--duration, 3s) cubic-bezier(0.2, 0.8, 0.4, 1) var(--delay, 0s) forwards;
}

.confetti-right-anim {
  animation: confetti-right-arc var(--duration, 3s) cubic-bezier(0.2, 0.8, 0.4, 1) var(--delay, 0s) forwards;
}

@keyframes confetti-left-arc {
  0% { opacity: 1; top: 90%; left: 0; transform: rotate(0deg); }
  20% { opacity: 1; top: var(--target-y, 10%); left: var(--target-x); transform: rotate(100deg); }
  100% { opacity: 0; top: 110%; left: calc(var(--target-x) + 20%); transform: rotate(var(--rotation)); }
}

@keyframes confetti-right-arc {
  0% { opacity: 1; top: 90%; left: 100%; transform: rotate(0deg); }
  20% { opacity: 1; top: var(--target-y, 10%); left: var(--target-x); transform: rotate(-100deg); }
  100% { opacity: 0; top: 110%; left: calc(var(--target-x) - 20%); transform: rotate(var(--rotation)); }
}

/* ===== 火箭 ===== */
.rocket-container {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 100;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.rocket-wrapper {
  position: relative;
  bottom: -100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: rocket-launch 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.rocket-icon {
  font-size: 80px;
  transform: rotate(-45deg);
  filter: drop-shadow(0 10px 10px rgba(0, 0, 0, 0.2));
}

.rocket-trail {
  position: absolute;
  top: 60px;
  width: 20px;
  height: 100px;
}

.trail-spark {
  position: absolute;
  width: 6px;
  height: 6px;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  animation: trail-fall 0.5s linear infinite;
}

.trail-spark:nth-child(1) { left: -5px; animation-delay: 0.1s; }
.trail-spark:nth-child(2) { left: 5px; animation-delay: 0.2s; }
.trail-spark:nth-child(3) { left: 0px; animation-delay: 0s; }
.trail-spark:nth-child(4) { left: -10px; animation-delay: 0.3s; }

@keyframes rocket-launch {
  0% { bottom: -100px; transform: scale(0.8); }
  10% { bottom: 20%; transform: scale(1); }
  100% { bottom: 120%; transform: scale(1); }
}

@keyframes trail-fall {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(50px) scale(0); opacity: 0; }
}

/* ===== 入场动画 ===== */
.anim-entry {
  opacity: 0;
  animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
