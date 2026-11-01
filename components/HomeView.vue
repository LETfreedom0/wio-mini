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

        <!-- ===== Header：问候 + 日期（右侧） ===== -->
        <view class="header-row anim-entry" style="animation-delay: 0.05s;">
          <text class="greeting-text">{{ greetingText }}</text>
          <text class="date-text">{{ currentDateStr }}</text>
        </view>

        <!-- ===== 本月回公司率 ===== -->
        <view class="progress-card anim-entry" :class="{ 'card-ok': isAchieved }" style="animation-delay: 0.1s;">
          <view class="card-header">
            <view class="title-group">
              <text class="card-label">{{ i18n.home.monthlyWio }}</text>
              <text class="title-target">· {{ i18n.home.targetLabel }} {{ targetPercentage }}%</text>
            </view>
            <view class="state-badge" :class="isAchieved ? 'badge-ok' : 'badge-miss'">
              <text v-if="isAchieved" class="badge-check">✓</text>
              <text class="badge-text">{{ isAchieved ? i18n.home.achieved : i18n.home.notAchieved }}</text>
            </view>
          </view>

          <view class="number-row">
            <view class="number-group">
              <text class="big-number">{{ wioPercentage }}</text>
              <text class="percent-sign">%</text>
            </view>
            <text class="gap-note">{{ gapNote }}</text>
          </view>

          <!-- 本月构成条：纯视觉不承载文字，最右淡段 = 还没到的日子 -->
          <view class="mix-track">
            <view
              v-for="seg in mixSegments"
              :key="seg.key"
              class="mix-seg"
              :class="'seg-' + seg.key"
              :style="{ flexGrow: seg.days }"
            ></view>
          </view>

          <!-- 数据行：条的全部读数都在这一行，左三组左对齐，剩余右对齐强调 -->
          <view class="data-row">
            <view class="data-col">
              <view class="data-value-row">
                <text class="data-value">{{ stats.companyDays || 0 }}</text>
                <text class="data-unit">{{ i18n.home.countDays }}</text>
              </view>
              <text class="data-label">{{ i18n.home.dlCompany }}</text>
            </view>
            <view class="data-col">
              <view class="data-value-row">
                <text class="data-value">{{ stats.homeDays || 0 }}</text>
                <text class="data-unit">{{ i18n.home.countDays }}</text>
              </view>
              <text class="data-label">{{ i18n.home.dlHome }}</text>
            </view>
            <view class="data-col">
              <view class="data-value-row">
                <text class="data-value">{{ leaveTotalDays }}</text>
                <text class="data-unit">{{ i18n.home.countDays }}</text>
              </view>
              <text class="data-label">{{ i18n.home.dlLeave }}</text>
            </view>
            <view class="data-col data-col-last">
              <view class="data-value-row">
                <text class="data-value data-value-accent">{{ restDays }}</text>
                <text class="data-unit data-unit-accent">{{ i18n.home.countDays }}</text>
              </view>
              <text class="data-label">{{ i18n.home.remainWorkDays }}</text>
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
              <view class="choice-icon" :class="location === 'company' ? 'icon-company-on' : 'icon-company-off'"></view>
              <text class="choice-title">{{ i18n.home.workFromCompany }}</text>
              <text class="choice-state" :class="{ 'state-on': location === 'company' }">{{ location === 'company' ? i18n.home.recorded : i18n.home.tapToSwitch }}</text>
            </view>

            <view class="choice-card" :class="{ selected: location === 'home' }" @click="setStatus('home')">
              <view class="choice-icon" :class="location === 'home' ? 'icon-home-on' : 'icon-home-off'"></view>
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
import { getAuth, isLogin } from '@/utils/auth.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  name: 'HomeView',
  data() {
    return {
      location: null, // 'home' | 'company' | null
      todayStr: '',
      nickname: '',
      entries: {},
      nowStamp: 0,
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
      // 依赖 nowStamp：页面停留跨天后 onShow 也要重新计算日期
      void this.nowStamp
      const now = new Date()
      const month = now.getMonth() + 1
      const date = now.getDate()
      const day = getWeekdayName(now.getDay(), this.settings.language)
      if (this.settings.language === 'en-US') {
        return `${getMonthName(month, 'en-US')} ${date} · ${day}`
      }
      return `${month}月${date}日 · 星期${day}`
    },
    // 时段问候 + 已登录用户的昵称
    // 凌晨 0-4 点用「夜深了」：5 点前说「早上好」明显不对，这是之前的 bug
    greetingText() {
      void this.nowStamp
      const h = new Date().getHours()
      const u = this.i18n.home
      let base
      if (h < 5) base = u.greetingNight
      else if (h < 11) base = u.greetingMorning
      else if (h < 13) base = u.greetingNoon
      else if (h < 18) base = u.greetingAfternoon
      else base = u.greetingEvening
      const name = this.nickname
      return name ? base + u.greetingJoin + name : base
    },
    targetPercentage() {
      // 首页只看当月，取当月生效比例
      const now = new Date()
      return wioService.getTargetForMonth(now.getFullYear(), now.getMonth() + 1)
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
    // 大数字旁的解读：达标讲成果（超多少），未达标讲可行性（还差几天）
    gapNote() {
      const u = this.i18n.home
      if (this.isAchieved) {
        const over = this.wioPercentage - this.targetPercentage
        return u.gapAchievedOver.replace('{n}', over)
      }
      return u.gapNeed.replace('{n}', this.gapDays)
    },
    // 休假合计：与分母的扣减项保持一致（年假/生日假/病假/无薪/调休/不计入/自定义假期）
    leaveTotalDays() {
      const s = this.stats || {}
      return (s.vacationDays || 0) + (s.birthdayDays || 0) + (s.sickDays || 0)
           + (s.unpaidDays || 0) + (s.compOffDays || 0) + (s.excludeWioDays || 0)
           + (s.customLeaveDays || 0)
    },
    // 还没到的日子 = 全月工作日 - 已办公 - 休假（含周末标记的假期，它们同样占掉了可用工作日）
    restDays() {
      const s = this.stats || {}
      return Math.max(0, (s.workingDays || 0) - (s.companyDays || 0) - (s.homeDays || 0) - this.leaveTotalDays)
    },
    // 构成条四段：天数为 0 的段不渲染；最右 rest 段永远最后
    mixSegments() {
      const list = [
        { key: 'company', days: this.stats.companyDays || 0 },
        { key: 'home', days: this.stats.homeDays || 0 },
        { key: 'leave', days: this.leaveTotalDays },
        { key: 'rest', days: this.restDays }
      ]
      return list.filter(item => item.days > 0)
    },
    // 距离月底还有多少个工作日（原实现是「本月的有效工作日里还有几天没记录」，
    // 与用户想看的「还剩多少天可以冲目标」不是一回事）
    // 口径：今天（含）到月末逐日判断，排除：
    //   - 已标记的假期 / 不计入（那些天本来就不用来公司）
    //   - 自定义假期区间
    //   - 今天若已打卡（公司/居家），从明天算起——今天这一天已经用掉了
    remainWorkDays() {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const today = now.getDate()
      const daysInMonth = new Date(y, m, 0).getDate()
      const entries = this.entries || {}
      const leaveStatuses = ['vacation', 'birthday', 'sick', 'unpaid', 'comp_off', 'exclude_wio']
      // 自定义假期只取一次，避免逐日重复读存储
      const customLeaves = wioService.getCustomLeaves()
      const inCustomLeave = (dateStr) => customLeaves.some(l => dateStr >= l.start && dateStr <= l.end)

      let count = 0
      for (let d = today; d <= daysInMonth; d++) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const status = entries[dateStr]
        if (d === today && (status === 'company' || status === 'home')) continue
        if (status && leaveStatuses.indexOf(status) !== -1) continue
        if (!status && inCustomLeave(dateStr)) continue
        if (!wioService.isOfficialWorkingDay(new Date(y, m - 1, d))) continue
        count++
      }
      return count
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
    // 云端数据覆盖本地（同步恢复 / 冲突选云端）后，首页要立刻跟着变
    uni.$on('wio:data-restored', this.onDataRestored)
  },
  beforeUnmount() {
    uni.$off('wio:data-restored', this.onDataRestored)
  },
  methods: {
    initData() {
      this.settings = wioService.getSettings()
      this.todayStr = wioService.getTodayDateStr()
      this.location = wioService.getEntryForDate(this.todayStr)
      // nowStamp 触发 greeting / 日期重新计算：computed 不感知时间流逝，
      // 页面从后台切回来（跨时段/跨天）必须手动打点
      this.nowStamp = Date.now()
      this.nickname = this.resolveNickname()
      this.loadStats()
    },
    onDataRestored() {
      this.initData()
    },
    // 已登录才显示昵称；未登录保持纯问候语
    resolveNickname() {
      if (!isLogin()) return ''
      const session = getAuth()
      const name = session && session.user && session.user.nickname
      return name ? String(name).trim() : ''
    },
    // 只读本月统计 + 年度假期统计 + 最近记录（不改动存储结构）
    loadStats() {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      this.entries = wioService.getEntries() || {}
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
      // 点击就反馈，包括点已选中的卡片（重复点也要有回应，否则像没反应）
      haptic('light')
      if (this.location !== status) {
        if (status === 'home') this.triggerConfetti()
        else if (status === 'company') this.triggerRocket()
      }
      this.location = status
      wioService.saveEntry(this.todayStr, status)
      this.loadStats()
    },
    goCalendar() {
      haptic('light')
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
  align-items: baseline;
  justify-content: space-between;
  /* 文字块比卡片略微内缩 4px：块面视觉更重，纯文字贴齐卡片左边缘反而显歪 */
  padding: 0 4px;
  margin-bottom: 12px;
}

.date-text {
  font-size: 12px;
  color: #6B737B;
  line-height: 1.4;
  flex-shrink: 0;
}

.greeting-text {
  font-size: 22px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.35;
  /* 昵称可能很长：单行省略，不能把右侧日期挤走或换行破版 */
  max-width: 64%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.title-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
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

.title-target {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.4;
  flex-shrink: 0;
}

/* 状态徽章：达标 = 金底，未达标 = 半透白底 */
.state-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 10px;
  border-radius: 100px;
  flex-shrink: 0;
}

.badge-check {
  font-size: 11px;
  line-height: 1.2;
}

.badge-text {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

.badge-ok {
  background: #F0D49A;
}

.badge-ok .badge-check,
.badge-ok .badge-text {
  color: #6B5312;
}

.badge-miss {
  background: rgba(255, 255, 255, 0.20);
}

.badge-miss .badge-text {
  color: #FFFFFF;
}

.number-row {
  display: flex;
  align-items: flex-end;
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
  line-height: 1.4;
  color: #FBD9B0;
  padding-bottom: 5px;
  flex-shrink: 0;
}

.card-ok .gap-note {
  color: #F0D49A;
}

/* ===== 本月构成条：细条纯视觉，最右淡段是还没到的日子 ===== */
.mix-track {
  display: flex;
  gap: 2px;
  width: 100%;
  height: 10px;
}

.mix-seg {
  flex-basis: 0;
  border-radius: 5px;
  overflow: hidden;
}

.seg-company {
  background: rgba(255, 255, 255, 0.95);
}

.seg-home {
  background: rgba(255, 255, 255, 0.52);
}

.seg-leave {
  background: rgba(0, 0, 0, 0.22);
}

.seg-rest {
  background: rgba(255, 255, 255, 0.11);
}

/* ===== 数据行：条的全部读数 ===== */
.data-row {
  display: flex;
  align-items: flex-start;
}

.data-col {
  flex: 1;
  min-width: 0;
}

.data-col-last {
  text-align: right;
}

.data-col-last .data-value-row {
  justify-content: flex-end;
}

.data-value-row {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.data-value {
  font-size: 16px;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.25;
}

.data-unit {
  font-size: 11px;
  color: #F2D3CD;
  line-height: 1.2;
}

.data-label {
  font-size: 11px;
  color: #CE9C95;
  margin-top: 2px;
  line-height: 1.3;
}

.data-value-accent {
  color: #FBD9B0;
}

.data-unit-accent {
  color: #E0B98C;
}

.card-ok .data-unit {
  color: #CFE6E1;
}

.card-ok .data-label {
  color: #9DC8C1;
}

.card-ok .data-value-accent {
  color: #F0D49A;
}

.card-ok .data-unit-accent {
  color: #D8C08A;
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
  /* 与 header-row 同一光学缩进，卡片本体不跟着动 */
  margin-left: 4px;
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
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

/* 图标用 data-URI 背景（小程序真机不支持内联 <svg>） */
.icon-company-on {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22' fill='none'%3E%3Cpath d='M4.2 18.5V5.1c0-.6.5-1.1 1.1-1.1h6.4c.6 0 1.1.5 1.1 1.1v13.4M12.8 10.7h4c.6 0 1.1.5 1.1 1.1v6.7M2.6 18.5h16.8M7 6.9h3M7 9.8h3M7 12.7h3M15.4 13.6h1.2M15.4 16.1h1.2' stroke='%230E6E62' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.icon-home-on {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22' fill='none'%3E%3Cpath d='M3.6 9.6 11 3.6l7.4 6v8.2c0 .5-.4.9-.9.9h-3.9v-5.1H8.4v5.1H4.5c-.5 0-.9-.4-.9-.9V9.6Z' stroke='%23B26B18' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.icon-off,
.icon-company-off {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22' fill='none'%3E%3Cpath d='M4.2 18.5V5.1c0-.6.5-1.1 1.1-1.1h6.4c.6 0 1.1.5 1.1 1.1v13.4M12.8 10.7h4c.6 0 1.1.5 1.1 1.1v6.7M2.6 18.5h16.8M7 6.9h3M7 9.8h3M7 12.7h3M15.4 13.6h1.2M15.4 16.1h1.2' stroke='%239AA1A8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.icon-home-off {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22' fill='none'%3E%3Cpath d='M3.6 9.6 11 3.6l7.4 6v8.2c0 .5-.4.9-.9.9h-3.9v-5.1H8.4v5.1H4.5c-.5 0-.9-.4-.9-.9V9.6Z' stroke='%239AA1A8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
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
  margin-left: 4px;
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
  /* 标题与「查看全部」一起右落，与列表右边界 16px 更接近 */
  padding: 0 4px;
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
