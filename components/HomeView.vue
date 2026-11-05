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
          <view class="greeting-wrap">
            <text class="greeting-text">{{ greetingBase }}{{ greetingJoin }}</text>
            <text class="greeting-name" v-if="nickname">{{ nickname }}</text>
          </view>
          <text class="date-text">{{ currentDateStr }}</text>
        </view>

        <!-- ===== 月度回公司率：左滑看上一个月的同类数据 ===== -->
        <!-- 只有率卡带月度维度（年假、今天打卡、最近记录都不分月），所以滑动只作用在这一张卡上 -->
        <view
          class="report-swipe anim-entry"
          style="animation-delay: 0.1s;"
          @touchstart="onReportTouchStart"
          @touchmove="onReportTouchMove"
          @touchend="onReportTouchEnd"
          @touchcancel="onReportTouchEnd"
        >
          <view class="report-track" :style="trackStyle">
            <view
              v-for="card in reportCards"
              :key="card.key"
              class="progress-card"
              :class="{ 'card-ok': card.achieved }"
              :style="cardStyle"
            >
              <view class="card-header">
                <view class="title-group">
                  <text class="card-label">{{ card.title }}</text>
                  <text class="title-target">· {{ i18n.home.targetLabel }} {{ card.target }}%</text>
                </view>
                <view class="state-badge" :class="card.achieved ? 'badge-ok' : 'badge-miss'">
                  <text v-if="card.achieved" class="badge-check">✓</text>
                  <text class="badge-text">{{ card.achieved ? i18n.home.achieved : i18n.home.notAchieved }}</text>
                </view>
              </view>

              <view class="number-row">
                <view class="number-group">
                  <text class="big-number">{{ card.rate }}</text>
                  <text class="percent-sign">%</text>
                </view>
                <text class="gap-note">{{ card.gapNote }}</text>
              </view>

              <!-- 本月构成条：纯视觉不承载文字，最右淡段 = 还没到的日子 -->
              <view class="mix-track">
                <view
                  v-for="seg in card.segments"
                  :key="seg.key"
                  class="mix-seg"
                  :class="'seg-' + seg.key"
                  :style="{ flexGrow: seg.days }"
                ></view>
              </view>

              <!-- 数据行：条的全部读数都在这一行，最后一组右对齐强调 -->
              <view class="data-row">
                <view class="data-col">
                  <view class="data-value-row">
                    <text class="data-value">{{ card.company }}</text>
                    <text class="data-unit">{{ i18n.home.countDays }}</text>
                  </view>
                  <text class="data-label">{{ i18n.home.dlCompany }}</text>
                </view>
                <view class="data-col">
                  <view class="data-value-row">
                    <text class="data-value">{{ card.home }}</text>
                    <text class="data-unit">{{ i18n.home.countDays }}</text>
                  </view>
                  <text class="data-label">{{ i18n.home.dlHome }}</text>
                </view>
                <view class="data-col">
                  <view class="data-value-row">
                    <text class="data-value">{{ card.leave }}</text>
                    <text class="data-unit">{{ i18n.home.countDays }}</text>
                  </view>
                  <text class="data-label">{{ i18n.home.dlLeave }}</text>
                </view>
                <view class="data-col data-col-last">
                  <view class="data-value-row">
                    <text class="data-value data-value-accent">{{ card.lastValue }}</text>
                    <text class="data-unit data-unit-accent">{{ i18n.home.countDays }}</text>
                  </view>
                  <text class="data-label">{{ card.lastLabel }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 分享入口：轻量文字链；历史月份时左端挂「回到本月」，不额外占一行 -->
        <view class="share-entry anim-entry" style="animation-delay: 0.13s;" @click="goShare">
          <view
            v-if="isPastReport"
            class="nav-back-btn"
            @click.stop="backToCurrentReport"
          >
            <text class="nav-back-text">‹ {{ i18n.calendar.backToCurrent }}</text>
          </view>
          <view v-else class="share-entry-holder"></view>
          <view class="share-entry-link">
            <text class="share-entry-text">{{ i18n.shareCard.entry }}</text>
            <text class="share-entry-arrow">›</text>
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
          <!-- 今天标了半天：把上下午读出来，避免在首页看不出今天到底怎么记的 -->
          <view v-if="todayIsSplit" class="today-half-note">
            <text class="today-half-text">{{ todayHalfText }}</text>
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
import wioService, { computeMonthlyReport, parseDayParts, isSplitDay, customIdOf } from '@/utils/wioService.js'
import { locales, getMonthName, getWeekdayName } from '@/utils/locales.js'
import { getAuth, isLogin } from '@/utils/auth.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  name: 'HomeView',
  data() {
    return {
      location: null, // 'home' | 'company' | null
      // 今天的上下午；两段不同 = 日历里标了半天
      todayParts: { am: null, pm: null },
      todayStr: '',
      nickname: '',
      entries: {},
      // 每个月一份统计，键 'YYYY-M'；率卡翻页时按需读取
      monthStats: {},
      reportIndex: 0, // 0 = 当月，1 = 上月，2 = 上上月……
      reportCardWidth: 0, // 率卡实际像素宽，拖动时按像素位移
      reportDragX: 0, // 拖动中的实时位移（带边界阻尼）
      reportDrag: null, // { startX, startY, decided, horizontal } 本次手势状态
      nowStamp: 0,
      showConfetti: false,
      showRocket: false,
      confettiPieces: [],
      settings: {},
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
    // 拆成前缀 + 昵称两个节点：整句截断时省略号会吃掉昵称（显示成 "Good afternoon, ..."），
    // 现在前缀永不截断，只有昵称自己缩略
    greetingBase() {
      void this.nowStamp
      const h = new Date().getHours()
      const u = this.i18n.home
      if (h < 5) return u.greetingNight
      if (h < 11) return u.greetingMorning
      if (h < 13) return u.greetingNoon
      if (h < 18) return u.greetingAfternoon
      return u.greetingEvening
    },
    greetingJoin() {
      return this.nickname ? this.i18n.home.greetingJoin : ''
    },
    targetPercentage() {
      // 首页只看当月，取当月生效比例
      const now = new Date()
      return wioService.getTargetForMonth(now.getFullYear(), now.getMonth() + 1)
    },
    // 率卡时间轴：当月 + 往前若干个月，一直回溯到「最早有记录的那个月」为止。
    // 再往前翻必然是 0%，没有信息量，所以不生成空页；同时硬上限 12 个月，轨道太长手感会差
    reportMonths() {
      void this.nowStamp
      const entries = this.entries || {}
      const now = new Date()
      const cy = now.getFullYear()
      const cm = now.getMonth() + 1
      let floorDate = new Date(cy, cm - 1, 1)
      const keys = Object.keys(entries).sort()
      if (keys.length) {
        const [fy, fm] = keys[0].split('-').map(Number)
        if (fy && fm) {
          const first = new Date(fy, fm - 1, 1)
          if (first < floorDate) floorDate = first
        }
      }
      const hardFloor = new Date(cy, cm - 1 - 11, 1)
      if (floorDate < hardFloor) floorDate = hardFloor
      const span = (cy - floorDate.getFullYear()) * 12 + (cm - 1 - floorDate.getMonth())
      const list = []
      for (let i = 0; i <= span; i++) {
        const d = new Date(cy, cm - 1 - i, 1)
        list.push({
          key: `${d.getFullYear()}-${d.getMonth() + 1}`,
          year: d.getFullYear(),
          month: d.getMonth() + 1
        })
      }
      return list
    },
    // 每页的率/构成/四列读数都在 buildReportCard 里算好，模板只负责展示，
    // 避免同一套公式在模板里写两遍各算各的
    reportCards() {
      const curYear = new Date().getFullYear()
      return this.reportMonths.map((m, i) => this.buildReportCard({
        key: m.key,
        year: m.year,
        month: m.month,
        stats: this.monthStats[m.key] || {},
        target: wioService.getTargetForMonth(m.year, m.month),
        current: i === 0,
        currentYear: curYear
      }))
    },
    reportPageCount() {
      return Math.max(1, this.reportCards.length)
    },
    // 页码越界保护：数据被清空导致页数变少时，自动落回有效的页
    reportPage() {
      return Math.min(Math.max(this.reportIndex, 0), this.reportPageCount - 1)
    },
    // 不在当月才显示「回到本月」
    isPastReport() {
      return this.reportPage > 0
    },
    // 每张卡占轨道的 1/n，轨道总宽 n×100%
    cardStyle() {
      const ratio = 100 / this.reportPageCount
      return { flex: `0 0 ${ratio}%`, width: `${ratio}%` }
    },
    // 今天标了半天（上下午不同）→ 首页只做只读展示，精细编辑在日历页
    todayIsSplit() {
      const p = this.todayParts
      return !!p.am && !!p.pm && p.am !== p.pm
    },
    todayHalfText() {
      const p = this.todayParts
      return this.i18n.home.todayHalf
        .replace('{am}', this.statusLabel(p.am))
        .replace('{pm}', this.statusLabel(p.pm))
    },
    trackStyle() {
      const n = this.reportPageCount
      const dragging = !!(this.reportDrag && this.reportDrag.horizontal)
      // 有实测卡宽就用像素位移（拖动跟手必需）；没有就退回百分比，翻页本身不受影响
      const transform = this.reportCardWidth
        ? `translate3d(${-this.reportPage * this.reportCardWidth + this.reportDragX}px, 0, 0)`
        : `translateX(${(-100 / n) * this.reportPage}%)`
      return {
        width: `${n * 100}%`,
        transform,
        transition: dragging ? 'none' : 'transform 0.34s cubic-bezier(0.22, 0.75, 0.2, 1)'
      }
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
    // 布局完成后再量卡宽，翻页拖动才有像素基准
    this.$nextTick(() => this.measureReportCard())
  },
  beforeUnmount() {
    uni.$off('wio:data-restored', this.onDataRestored)
  },
  methods: {
    initData() {
      this.settings = wioService.getSettings()
      this.todayStr = wioService.getTodayDateStr()
      this.todayParts = wioService.getDayParts(this.todayStr)
      // 半天时按上午的状态高亮：上午在公司就亮「公司办公」那张卡
      this.location = this.todayParts.am || null
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
    // 只读时间轴内每个月的统计 + 年度假期统计 + 最近记录（不改动存储结构）
    loadStats() {
      const now = new Date()
      const year = now.getFullYear()
      this.entries = wioService.getEntries() || {}
      // 一次性把率卡每个月的统计备好：翻页时不再临时算，滑动手感才稳
      const map = {}
      this.reportMonths.forEach(m => {
        try {
          map[m.key] = wioService.getMonthStats(m.year, m.month)
        } catch (e) {
          console.error('loadStats month failed', m.key, e)
        }
      })
      this.monthStats = map
      try {
        this.yearStats = wioService.getYearStats(year)
      } catch (e) {
        console.error('loadStats year failed', e)
      }
      this.buildRecentRecords()
      // 页数可能变少（清空数据/最早记录变近），页码要落回有效范围
      if (this.reportIndex > this.reportPageCount - 1) this.reportIndex = 0
    },
    // 单页率卡的全部展示字段：所有月份共用，只有措辞不同
    buildReportCard({ key, year, month, stats, target, current, currentYear }) {
      const u = this.i18n.home
      const r = computeMonthlyReport(stats, target)
      const segments = [
        { key: 'company', days: r.company },
        { key: 'home', days: r.home },
        { key: 'leave', days: r.leave },
        { key: 'rest', days: r.rest }
      ].filter(item => item.days > 0)
      // 跨年月份补上年份，否则「11月」看不出是哪一年
      let title = u.monthlyWio
      if (!current) {
        title = u.monthWio.replace('{m}', month)
        if (year !== currentYear) {
          title = this.settings.language === 'en-US'
            ? `${getMonthName(month, 'en-US')} ${year} WIO`
            : `${year}年${month}月回公司率`
        }
      }
      return {
        key,
        year,
        month,
        rate: r.rate,
        target,
        achieved: r.achieved,
        title,
        // 大数字旁的解读：达标讲成果（超多少）；当月未达标讲可行性（再去几天就够）。
        // 已过去的月份说「再去几天就够」没有意义，改成差额总结。
        gapNote: r.achieved
          ? u.gapAchievedOver.replace('{n}', r.rate - target)
          : (current ? u.gapNeed : u.gapShort).replace('{n}', r.gapDays),
        company: r.company,
        home: r.home,
        leave: r.leave,
        // 当月最后一列是「还没到的日子」；历史月份那些天只是没记录，不能叫剩余
        lastValue: r.rest,
        lastLabel: current ? u.remainWorkDays : u.notRecorded,
        segments
      }
    },
    onReportTouchStart(e) {
      const t = e.touches && e.touches[0]
      if (!t) return
      // 记录起点 + 方向判定状态；方向未判定前不移动轨道
      this.reportDrag = { startX: t.clientX, startY: t.clientY, decided: false, horizontal: false }
      this.reportDragX = 0
    },
    onReportTouchMove(e) {
      const drag = this.reportDrag
      if (!drag || !e.touches || !e.touches.length) return
      const t = e.touches[0]
      const dx = t.clientX - drag.startX
      const dy = t.clientY - drag.startY
      if (!drag.decided) {
        // 6px 死区：太小会把点击/轻触误判成拖动
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        drag.decided = true
        // 横向明显占优才接管，否则整个手势让给页面纵向滚动
        drag.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2
      }
      if (!drag.horizontal) return
      this.reportDragX = this.applyDragResistance(dx)
    },
    // 已经在最新/最旧一页还继续拖时给阻尼：手感是「拉不动」，而不是硬顶
    applyDragResistance(dx) {
      const atNewest = this.reportPage === 0 && dx > 0
      const atOldest = this.reportPage >= this.reportPageCount - 1 && dx < 0
      return atNewest || atOldest ? dx * 0.3 : dx
    },
    onReportTouchEnd(e) {
      const drag = this.reportDrag
      if (!drag) return
      this.reportDrag = null
      if (!drag.horizontal) {
        this.reportDragX = 0
        return
      }
      const t = (e.changedTouches && e.changedTouches[0]) || null
      const dx = t ? t.clientX - drag.startX : 0
      const from = this.reportPage
      // 阈值随卡宽走（约卡宽的 22%，夹在 40~64px），比原来固定 60px 更容易触发，
      // 但低于 40px 的轻扫仍判为误触，避免误翻
      const unit = this.reportCardWidth || 320
      const threshold = Math.min(Math.max(unit * 0.22, 40), 64)
      let next = from
      if (Math.abs(dx) >= threshold) next = dx < 0 ? from + 1 : from - 1
      next = Math.min(Math.max(next, 0), this.reportPageCount - 1)
      this.reportDragX = 0
      if (next !== from) {
        haptic('light')
        this.reportIndex = next
      }
    },
    // 一张卡的实际宽度：拖动要按像素位移才跟手，取不到就退回百分比模式
    measureReportCard() {
      const query = uni.createSelectorQuery().in(this)
      query.select('.report-swipe').boundingClientRect(rect => {
        if (rect && rect.width) this.reportCardWidth = rect.width
      }).exec()
    },
    backToCurrentReport() {
      haptic('medium')
      this.reportIndex = 0
    },
    // 最近记录＝「最近有内容的日子」，不能只认打卡。
    // 假期的按天标记、区间假的开始日同样算一条——否则用户在日历上标完假，
    // 回首页看不出任何变化，会以为没保存。取舍优先级与日历一致：
    // 手动打卡 > 按天标记 > 区间假
    buildRecentRecords() {
      const entries = wioService.getEntries() || {}
      const marks = wioService.getCustomMarks() || {}
      const leaves = (wioService.getCustomLeaves() || []).filter(l => l.mode !== 'day' && l.start)
      const u = this.i18n.home
      const rows = []

      Object.keys(entries).forEach(dateStr => {
        const raw = entries[dateStr]
        // 半天记录是 { am, pm } 对象，直接拿去查 meta 会得到 [object Object] 渲染出来，
        // 这里单独拆开成「上午X · 下午Y」，颜色跟上午段走（与今天打卡卡片的取色一致）
        if (isSplitDay(raw)) {
          const p = parseDayParts(raw)
          const head = this.statusMeta(p.am || p.pm)
          rows.push({
            dateStr,
            label: u.recentHalf
              .replace('{am}', this.shortStatusLabel(p.am))
              .replace('{pm}', this.shortStatusLabel(p.pm)),
            color: head.color,
            bgColor: head.bg
          })
          return
        }
        const m2 = this.statusMeta(raw)
        rows.push({ dateStr, label: m2.label, color: m2.color, bgColor: m2.bg })
      })

      Object.keys(marks).forEach(dateStr => {
        if (entries[dateStr]) return // 同一天有打卡就以打卡为准
        const info = wioService.getCustomMarkForDate(dateStr, marks)
        if (!info) return
        const leave = info.leave
        // part: am/pm 时标出半天，否则只写假期名
        let label = leave.name
        if (info.part === 'am') label = u.recentMarkAM.replace('{n}', leave.name)
        else if (info.part === 'pm') label = u.recentMarkPM.replace('{n}', leave.name)
        rows.push({
          dateStr,
          label,
          color: leave.color,
          bgColor: this.hexToRgba(leave.color, 0.12)
        })
      })

      // 区间假整段会覆盖很多天，只记「开始那天」一条，否则列表会被同一个假期刷屏
      leaves.forEach(l => {
        if (!l.name) return
        rows.push({
          dateStr: l.start,
          label: u.recentTill.replace('{n}', l.name).replace('{d}', this.fmtMonthDay(l.end)),
          color: l.color || '#0E6E62',
          bgColor: this.hexToRgba(l.color || '#0E6E62', 0.12)
        })
      })

      // 同一天只留一条（前面的优先级更高），再按日期倒序取最近三条
      const seen = {}
      this.recentRecords = rows
        .filter(r => {
          if (seen[r.dateStr]) return false
          seen[r.dateStr] = true
          return true
        })
        .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1))
        .slice(0, 3)
        .map(r => ({ ...r, dateLabel: this.dateLabelOf(r.dateStr) }))
    },
    dateLabelOf(dateStr) {
      const [y, m, d] = String(dateStr).split('-')
      const dt = new Date(Number(y), Number(m) - 1, Number(d))
      const lang = this.settings.language
      const weekday = getWeekdayName(dt.getDay(), lang)
      return lang === 'en-US'
        ? `${getMonthName(Number(m), lang)} ${Number(d)}`
        : `${Number(m)}月${Number(d)}日 · 周${weekday}`
    },
    fmtMonthDay(dateStr) {
      const [y, m, d] = String(dateStr || '').split('-')
      if (!y || !m || !d) return ''
      const lang = this.settings.language
      return lang === 'en-US'
        ? `${getMonthName(Number(m), lang)} ${Number(d)}`
        : `${Number(m)}月${Number(d)}日`
    },
    // 状态 → 展示用的 { label, color, bg }。
    // 自定义假期（custom:<id>）必须现查假期对象：名字和颜色都存在那边，
    // 光靠固定表查不到，界面就会把 "custom:1735..." 这种键原样印给用户看。
    statusMeta(status) {
      const id = customIdOf(status)
      if (id) {
        const leave = wioService.getCustomLeaveById(id)
        if (leave) {
          return { label: leave.name, color: leave.color, bg: this.hexToRgba(leave.color, 0.12) }
        }
        return { label: '—', color: '#6B7379', bg: '#EFF1F3' }
      }
      const map = {
        company: { label: this.i18n.home.workFromCompany, color: '#0E6E62', bg: '#E7F1EF' },
        home: { label: this.i18n.home.workFromHome, color: '#B26B18', bg: '#FBF0E2' },
        vacation: { label: this.i18n.calendar.legends.vacation, color: '#41598A', bg: '#E9EDF5' },
        birthday: { label: this.i18n.calendar.legends.birthday, color: '#C24A7E', bg: '#FBF0F4' },
        sick: { label: this.i18n.calendar.legends.sick, color: '#8C4F86', bg: '#F4ECF3' },
        unpaid: { label: this.i18n.calendar.legends.unpaid, color: '#6B7379', bg: '#EFF1F3' },
        comp_off: { label: this.i18n.calendar.legends.comp_off, color: '#1E7A8C', bg: '#E5F2F4' },
        public: { label: this.i18n.calendar.legends.public, color: '#B23A32', bg: '#F9EAE8' },
        overtime_record: { label: this.i18n.calendar.legends.overtime_record, color: '#A9722A', bg: '#FAF1E4' },
        exclude_wio: { label: this.i18n.calendar.legends.exclude_wio, color: '#8B95A1', bg: '#EFF1F3' }
      }
      return map[status] || { label: status || '—', color: '#6B7379', bg: '#EFF1F3' }
    },
    // 自定义假期的颜色是用户选的，没有配套的浅底色，按 12% 透明度现算一个
    hexToRgba(hex, alpha) {
      const h = String(hex || '').replace('#', '')
      if (h.length !== 6) return `rgba(107, 115, 121, ${alpha})`
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    },
    // 紧凑位置（最近记录那条 pill）用的短标签：公司 / 居家 / 年假 / 病假
    shortStatusLabel(status) {
      const id = customIdOf(status)
      if (id) {
        const leave = wioService.getCustomLeaveById(id)
        if (leave) return leave.name
      }
      const map = {
        company: this.i18n.home.shortCompany,
        home: this.i18n.home.shortHome,
        vacation: this.i18n.home.shortVacation,
        sick: this.i18n.home.shortSick
      }
      return map[status] || this.statusLabel(status)
    },
    statusLabel(status) {
      return this.statusMeta(status).label
    },
    setStatus(status) {
      haptic('light')
      // 今天已标了半天：首页是「今天在哪办公」的快速打卡，写整天会把半天抹平，
      // 所以先问一句，别让人不小心丢掉上午/下午的精细记录
      if (this.todayIsSplit && this.todayParts.am !== status) {
        uni.showModal({
          title: this.i18n.home.halfOverwriteTitle,
          content: this.i18n.home.halfOverwriteBody
            .replace('{am}', this.statusLabel(this.todayParts.am))
            .replace('{pm}', this.statusLabel(this.todayParts.pm)),
          confirmText: this.i18n.common.confirm,
          cancelText: this.i18n.common.cancel,
          success: (res) => {
            if (res.confirm) this.applyTodayStatus(status)
          }
        })
        return
      }
      this.applyTodayStatus(status)
    },
    applyTodayStatus(status) {
      // 点击就反馈，包括点已选中的卡片（重复点也要有回应，否则像没反应）
      if (this.location !== status) {
        if (status === 'home') this.triggerConfetti()
        else if (status === 'company') this.triggerRocket()
      }
      this.location = status
      this.todayParts = { am: status, pm: status }
      wioService.saveEntry(this.todayStr, status)
      this.loadStats()
    },
    goCalendar() {
      haptic('light')
      uni.switchTab({ url: '/pages/calendar/index' })
    },
    goShare() {
      haptic('light')
      // 分享哪个月就带哪个月，别在上个月的数据上生成「本月」卡片
      const card = this.reportCards[this.reportPage]
      const query = card ? `?y=${card.year}&m=${card.month}` : ''
      uni.navigateTo({ url: `/pages/share/index${query}` })
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

.greeting-wrap {
  display: flex;
  align-items: baseline;
  min-width: 0;
  flex: 1;
  margin-right: 10px;
}

.greeting-text {
  font-size: 22px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.35;
  flex-shrink: 0;
}

/* 昵称单独截断：再窄的屏也至少能露出开头几个字，不会整段变 "..." */
.greeting-name {
  font-size: 22px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ===== 率卡左右翻页（左滑看上一个月，可连续往前翻） ===== */
/* 左右翻页容器：只做裁剪；轨道宽度与每张卡宽度由 cardStyle / trackStyle 按页数算 */
.report-swipe {
  width: 100%;
  overflow: hidden;
  border-radius: 20px;
  margin-bottom: 2px;
}

.report-track {
  display: flex;
  will-change: transform;
}

.report-track .progress-card {
  flex: 0 0 100%;
  margin-bottom: 0;
}

.nav-back-btn {
  display: flex;
  align-items: center;
  padding: 1px 9px;
  border-radius: 10px;
  background: #EAF2F0;
  transition: all 0.15s ease;
}

.nav-back-btn:active {
  background: #DCEAE7;
  transform: scale(0.96);
}

.nav-back-text {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  color: #0E6E62;
}

/* 分享入口：文字链，随率卡右对齐；左侧空占位让「回到本月」出现时不挤动右侧 */
.share-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  margin: 0 0 12px;
  min-height: 18px;
}

.share-entry-holder {
  flex: 1;
}

.share-entry-link {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.share-entry-text {
  font-size: 12px;
  color: #0E6E62;
  line-height: 1.4;
}

.share-entry-arrow {
  font-size: 13px;
  color: #0E6E62;
  line-height: 1;
  margin-top: -1px;
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
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
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

/* 今天标了半天：一行只读说明，用主色底提示「今天不是整天」 */
.today-half-note {
  align-self: flex-start;
  margin: 8px 0 0 2px;
  padding: 4px 10px;
  border-radius: 10px;
  background-color: #EAF2F0;
}

.today-half-text {
  font-size: 11px;
  color: #0E6E62;
  font-weight: 500;
  line-height: 1.4;
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
