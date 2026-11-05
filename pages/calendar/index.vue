<template>
  <view class="container" @touchmove="onTouchMove" @touchend="onTouchEnd">
    <view class="status-bar-placeholder" :style="{ height: topSafeHeight + 'px' }"></view>

    <view class="content">


      <!-- Monthly Stats Card -->
      <view class="card stats-card" :class="{ 'warning-border': wioPercentage < targetPercentage, 'success-border': wioPercentage >= targetPercentage }">
        <view class="stats-head">
          <view class="stats-main">
            <text class="stats-label">{{ i18n.calendar.monthlyWio }}</text>
            <view class="percent-row">
              <text class="percentage" :class="{ 'red-text': wioPercentage < targetPercentage, 'green-text': wioPercentage >= targetPercentage }">{{ wioPercentage }}</text>
              <text class="percent-unit" :class="{ 'red-text': wioPercentage < targetPercentage, 'green-text': wioPercentage >= targetPercentage }">%</text>
            </view>
          </view>
          <view class="stats-meta">
            <text class="target-text">{{ i18n.calendar.target }} {{ targetPercentage }}%</text>
            <view class="meta-divider"></view>
            <text class="gap-text" :class="{ 'red-text': wioPercentage < targetPercentage, 'green-text': wioPercentage >= targetPercentage }">{{ gapText }}</text>
          </view>
        </view>

        <view class="progress-bar">
          <view class="progress-fill"
                :class="{ 'fill-danger': wioPercentage < targetPercentage, 'fill-success': wioPercentage >= targetPercentage }"
                :style="{ width: Math.min(wioPercentage, 100) + '%' }"></view>
          <view class="goal-marker" :style="{ left: Math.min(targetPercentage, 100) + '%' }"></view>
        </view>

        <view class="stats-chips">
          <view class="stat-chip">
            <view class="chip-dot dot-company"></view>
            <text class="chip-label">{{ i18n.home.workFromCompany }}</text>
            <text class="chip-value">{{ stats.companyDays }} {{ i18n.home.countDays }}</text>
          </view>
          <view class="stat-chip">
            <view class="chip-dot dot-home"></view>
            <text class="chip-label">{{ i18n.home.workFromHome }}</text>
            <text class="chip-value">{{ stats.homeDays }} {{ i18n.home.countDays }}</text>
          </view>
          <view class="stat-chip">
            <view class="chip-dot dot-ot"></view>
            <text class="chip-label">{{ i18n.calendar.ot }}</text>
            <text class="chip-value">{{ stats.totalOvertime }}h</text>
          </view>
        </view>
      </view>

      <!-- Birthday Reminder Card -->
      <view v-if="showBirthdayReminder" class="card birthday-reminder-card">
        <view class="birthday-icon">🎂</view>
        <view class="birthday-content">
          <text class="birthday-title">{{ i18n.calendar.birthdayReminderTitle }}</text>
          <text class="birthday-desc">{{ i18n.calendar.birthdayReminderDesc }}</text>
        </view>
        <view class="birthday-action" @click="selectBirthdayLegend">
          <text class="action-text">{{ i18n.calendar.markToday }}</text>
        </view>
      </view>

      <!-- Calendar Card -->
      <view class="card calendar-card" @touchstart="onCardTouchStart" @touchend="onCardTouchEnd">
        <view class="calendar-header">
          <view class="month-group">
            <text class="month-year">{{ monthYearText }}</text>
            <view v-if="!isCurrentMonth" class="back-current" @click="backToCurrentMonth">
              <text class="back-current-text">{{ i18n.calendar.backToCurrent }}</text>
            </view>
          </view>
          <view class="nav-arrows">
            <view class="nav-btn" @click="changeMonth(-1)">
               <text class="arrow-icon">←</text>
            </view>
            <view class="nav-btn" @click="changeMonth(1)">
               <text class="arrow-icon">→</text>
            </view>
          </view>
        </view>

        <view class="weekdays">
          <text v-for="(day, index) in weekdays" :key="index" class="weekday">{{ day }}</text>
        </view>

        <view class="days-grid">
          <view v-for="n in startEmptyDays" :key="'empty-'+n" class="day-cell empty"></view>
          
          <view v-for="day in daysInMonth" :key="day" class="day-cell" @click="onDayClick(day)" @longpress="onDayLongPress(day)">
            <view class="day-content" :class="[getDayClass(day), { 'today-highlight': isToday(day) }, { 'day-split': isDaySplit(day) }]" :style="dayStyle(day)">
              <text class="day-number">{{ day }}</text>
              <!-- 按天型自定义假：只加一根底部色条，不跟出勤状态抢视觉；
                   上午、下午休不同的假时色条左右各一半 -->
              <view
                v-if="customBarStyle(day)"
                class="custom-mark-bar"
                :style="customBarStyle(day)"
              ></view>
              <view v-if="getOvertimeDisplay(day)" class="overtime-badge">{{ getOvertimeDisplay(day) }}</view>
              <text v-if="getHolidayName(day)" class="holiday-text" :class="{'text-work': isHolidayWork(day), 'english': settings.language === 'en-US'}">{{ getHolidayDisplayName(day) }}</text>
              <view v-if="isHolidayWork(day)" class="work-badge">{{ i18n.calendar.workBadge }}</view>
            </view>
          </view>
        </view>
      </view>

      <!-- Legend Card -->
      <view class="card legend-card">
        <view class="legend-header">
          <text class="legend-title">{{ i18n.calendar.legendTitle }}</text>
          <text class="legend-tip-text">{{ i18n.calendar.legendTip }}</text>
          <view class="clear-btn-header" @click="selectLegend({ value: 'clear' })" :class="{ active: selectedStatus === 'clear' }">
            <view class="legend-dot dashed"></view>
            <text class="legend-label">{{ i18n.calendar.legends.clear }}</text>
          </view>
        </view>
        
        <view class="legend-grid">
          <view class="legend-item" v-for="(item, index) in filteredLegends" :key="index" @click="selectLegend(item)" :class="{ active: selectedStatus === item.value, disabled: item.legendDisabled }">
            <view class="legend-dot" :class="item.color" :style="item.dotColor ? { background: item.dotColor } : null"></view>
            <text class="legend-label">{{ item.label }}</text>
            <text v-if="item.isPro" class="legend-pro">PRO</text>
          </view>
        </view>
      </view>

    </view>
    
    <!-- Overtime Modal -->
    <view class="modal-overlay" v-if="showOvertimeModal" @click="closeOvertimeModal">
      <view class="modal-content" @click.stop>
        <view class="modal-close-btn" @click="closeOvertimeModal">×</view>
        <view class="modal-header">
          <text class="modal-title">{{ i18n.calendar.overtime }}</text>
          <text class="modal-subtitle">{{ currentOvertimeDateStr }}</text>
        </view>
        
        <view class="stepper-container">
          <view class="stepper-btn minus" @click="changeOvertime(-0.5)" :class="{ disabled: overtimeValue <= 0 }">
            <text class="stepper-icon">-</text>
          </view>
          <view class="stepper-value">
            <text class="value-text">{{ overtimeValue }}</text>
            <text class="unit-text">{{ i18n.common.hour }}</text>
          </view>
          <view class="stepper-btn plus" @click="changeOvertime(0.5)" :class="{ disabled: overtimeValue >= 12 }">
            <text class="stepper-icon">+</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 半天标记面板（PRO）：上午 / 下午各选各的，任意组合 -->
    <view class="modal-overlay" v-if="showHalfPanel" @click="closeHalfPanel">
      <view class="modal-content half-modal" @click.stop>
        <view class="modal-close-btn" @click="closeHalfPanel">×</view>
        <view class="modal-header">
          <text class="modal-title">{{ halfDateLabel }}</text>
        </view>

        <view class="half-part" v-for="part in halfPartRows" :key="part.key">
          <view class="half-part-head">
            <text class="half-part-title">{{ part.title }}</text>
            <text class="half-part-current" :style="{ color: halfCurrentColor(part.key) }">{{ halfCurrentLabel(part.key) }}</text>
          </view>
          <view class="half-status-grid">
            <view
              v-for="opt in halfStatusOptions"
              :key="opt.value"
              class="half-status-item"
              :class="{
                'half-status-on': partValue(part.key) === opt.value,
                'half-status-off': halfChipDisabled(opt, part.key)
              }"
              :style="[halfChipStyle(partValue(part.key) === opt.value, opt, part.key), { flexBasis: halfChipBasis }]"
              @click="setHalfPart(part.key, opt)"
            >
              <view
                class="half-chip-dot"
                :style="{ background: statusColor(opt.value).bg, borderColor: statusColor(opt.value).color }"
              ></view>
              <text class="half-status-text">{{ opt.label }}</text>
              <text v-if="opt.isCustom" class="half-status-quota">{{ customQuotaShort(opt.leave) }}</text>
            </view>
          </view>
        </view>

        <!-- 半天计法当场确认：只有「一段出勤 + 一段非出勤」时才出现。
             以前是会员页里的全局开关，改一次会把历史上所有半天一起翻口径；
             现在每天单独选，谁也不会连带影响别的日子 -->
        <view v-if="halfNeedFullAsk" class="half-rule">
          <view class="half-rule-head">
            <text class="half-rule-title">{{ i18n.calendar.halfRuleAsk }}</text>
            <text class="half-rule-sub">{{ i18n.calendar.halfRuleSub }}</text>
          </view>
          <view class="half-rule-seg">
            <view class="half-rule-pill" :class="{ active: !halfFullDay }" @click="setHalfFull(false)">
              <text class="half-rule-text">{{ i18n.calendar.halfRuleHalf }}</text>
            </view>
            <view class="half-rule-pill" :class="{ active: halfFullDay }" @click="setHalfFull(true)">
              <text class="half-rule-text">{{ i18n.calendar.halfRuleFull }}</text>
            </view>
          </view>
        </view>

        <view class="half-actions">
          <view class="half-btn half-btn-ghost" @click="clearHalfDay">
            <text class="half-btn-text">{{ i18n.common.clear }}</text>
          </view>
          <view class="half-btn half-btn-primary" @click="applyHalfDay">
            <text class="half-btn-text half-btn-text-on">{{ i18n.common.save }}</text>
          </view>
        </view>
      </view>
    </view>

    <PaywallSheet :visible="showPaywall" @close="showPaywall = false" @upgraded="onProUpgraded" />

    <CustomTabBar current="calendar" />
  </view>
</template>

<script>
import CustomTabBar from '@/components/CustomTabBar.vue'
import PaywallSheet from '@/components/PaywallSheet.vue'
import wioService, { isSplitDay, parseDayParts, customIdOf, computeMonthlyReport } from '@/utils/wioService.js'
import { isProUser } from '@/utils/pro.js'
import { locales, t, getMonthYearName } from '@/utils/locales.js'
import { getTopSafeArea } from '@/utils/safeArea.js'
import { tap as haptic } from '@/utils/haptic.js'

const holidayNameMap = {
  '元旦': 'New Year\'s',
  '春节': 'Spring Fest',
  '清明节': 'Qingming',
  '劳动节': 'Labor Day',
  '端午节': 'Dragon Boat',
  '中秋节': 'Mid-Autumn',
  '国庆节': 'National Day'
};

// 状态配色：日历格斜切（半天）时要用底色，而 CSS 类只能给整格一个颜色，
// 所以这里把 .day-content 的配色表搬一份到 JS，供 inline style 拼渐变
const STATUS_COLORS = {
  company: { bg: '#C8E6C9', color: '#2E7D32' },
  home: { bg: '#BBDEFB', color: '#1565C0' },
  vacation: { bg: '#FFE0B2', color: '#EF6C00' },
  birthday: { bg: '#F8BBD9', color: '#E91E63' },
  comp_off: { bg: '#B2EBF2', color: '#006064' },
  sick: { bg: '#E1BEE7', color: '#4A148C' },
  unpaid: { bg: '#F5F5F5', color: '#616161' },
  public: { bg: '#FFCDD2', color: '#B71C1C' },
  exclude_wio: { bg: '#ECEFF1', color: '#607D8B' },
  default: { bg: '#FFFFFF', color: '#15181C' }
};

export default {
  components: {
    CustomTabBar,
    PaywallSheet
  },
  data() {
    return {
      currentDate: new Date(),
      topSafeHeight: 0,
      entries: {},
      overtimeEntries: {},
      settings: {},
      customLeaves: [],
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      stats: { 
        companyDays: 0, 
        homeDays: 0, 
        vacationDays: 0,
        sickDays: 0,
        unpaidDays: 0,
        compOffDays: 0,
        publicDays: 0,
        excludeWioDays: 0,
        deductibleLeave: 0,
        weekendLeaves: 0,
        totalRecorded: 0,
        workingDays: 0,
        totalOvertime: 0
      },
      // 展示口径（率 / 差额 / 分母）统一由 computeMonthlyReport 产出，
      // 与首页、分享卡同源——本页不再自己拼一套分母公式
      report: { rate: 0, gapDays: 0, denominator: 0, workingDays: 0, company: 0, home: 0, leave: 0, rest: 0 },
      selectedStatus: null,
      lastClickTime: 0,
      lastClickDay: null,
      showOvertimeModal: false,
      overtimeValue: 0,
      currentOvertimeDateStr: '',
      lastNx: 0,
      scrollTimer: null,
      // 打点让「是否本月」随时间重算（computed 不感知时间流逝）
      nowStamp: 0,
      // 左右滑动切月的起点，null = 没有进行中的手势
      swipeStartX: null,
      swipeStartY: null,
      // 半天标记（PRO）：上午/下午各一份，按天型福利假也在这里选
      showHalfPanel: false,
      halfDateStr: '',
      halfDayNum: 0,
      // 老版本按天标记（customMarks）仍只读兼容，用于日历色条与统计
      customMarks: {},
      // 上下午各存一份，天然支持任意组合（上午公司 + 下午年假 等）
      halfAm: 'company',
      halfPm: 'company',
      // 这半天出勤按一整天算吗（逐日；面板里当场选，保存才落库）
      halfFullDay: false,
      // 打开面板时抓一份各按天假的已用天数作基线，选 chip 时在它上面做增量，
      // 这样余额能实时扣减显示，真正落库仍然只在点「保存」时发生
      halfUsageBase: {},
      showPaywall: false,
      // 权益变化后用它打点，让 isPro 这个 computed 重算
      proStamp: 0
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN'];
    },
    weekdays() {
      return this.i18n.calendar.weekdays;
    },
    legends() {
      const lang = this.settings.language || 'zh-CN';
      return [
        { label: t('calendar.legends.company', lang), color: 'green', value: 'company' },
        { label: t('calendar.legends.home', lang), color: 'blue', value: 'home' },
        { label: t('calendar.legends.vacation', lang), color: 'orange', value: 'vacation' },
        { label: t('calendar.legends.birthday', lang), color: 'pink', value: 'birthday' },
        { label: t('calendar.legends.comp_off', lang), color: 'cyan', value: 'comp_off' },
        { label: t('calendar.legends.sick', lang), color: 'purple', value: 'sick' },
        { label: t('calendar.legends.unpaid', lang), color: 'gray', value: 'unpaid' },
        { label: t('calendar.legends.public', lang), color: 'red', value: 'public' },
        { label: t('calendar.legends.overtime_record', lang), color: 'purple-ot', value: 'overtime_record' },
        { label: t('calendar.legends.exclude_wio', lang), color: 'exclude', value: 'exclude_wio' },
        { label: t('calendar.halfLegend', lang), color: 'half', value: 'half_day', isPro: true },
        { label: t('calendar.legends.clear', lang), color: 'dashed', value: 'clear' },
      ];
    },
    // 权益实时判定：proStamp 只是个打点，让开通/到期后这里能重算
    isPro() {
      return this.proStamp >= 0 && isProUser();
    },
    // 半天组合只开放四种最常见状态（公司 / 居家 / 年假 / 病假）：
    // 半天假几乎都是「请半天病假」「请半天年假」，剩下的调休、无薪、公共假期
    // 极少出现半天组合，留在图例里批量标记就够，面板只有四格也更好点
    // 按天型自定义假：只建额度、哪天休了点哪天，所以它们不进图例的固定状态里，
    // 单独给一个「福利假」入口 + 一个标记面板
    customDayLeaves() {
      return (this.customLeaves || []).filter(l => l && l.mode === 'day');
    },
    // 日期 → 标记详情。模板里逐格取用，做成 map 避免每格都去查数组
    customMarkMap() {
      const marks = this.customMarks || {};
      const list = this.customDayLeaves;
      const out = {};
      Object.keys(marks).forEach(d => {
        const m = marks[d];
        if (!m) return;
        // 当天已有两段标记时以 entries 为准（新写入只走 entries），
        // 老标记不删也不显示，避免同一格出现两套口径
        if (this.entries[d]) return;
        const leave = list.find(l => l.id === m.id);
        if (leave) out[d] = { part: m.part, leave };
      });
      return out;
    },
    halfStatusOptions() {
      const allow = ['company', 'home', 'vacation', 'sick'];
      const list = allow
        .map(value => this.legends.find(item => item.value === value))
        .filter(Boolean);
      // 按天型福利假：上午、下午两段都能选，才支持「上午公司 + 下午育儿假」。
      // 想整天都休，点完上一段再用「与上午相同」抄一次即可。
      this.customDayLeaves.forEach(l => {
        const value = 'custom:' + l.id;
        const u = wioService.getCustomLeaveUsage(l.id);
        const inUse = this.halfAm === value || this.halfPm === value;
        list.push({
          label: l.name,
          value: value,
          color: 'custom-dot',
          dotColor: l.color,
          isCustom: true,
          leave: l,
          // 额度用完且这条记录当天没用它：置灰不可再选；
          // 当天已经用它标过的段落保持可点，用户才能改口径或取消
          disabled: !u.unlimited && u.remaining <= 0 && !inUse
        });
      });
      // 调休放按天假后面（设计稿顺序），无额度概念不禁用
      const compOff = this.legends.find(item => item.value === 'comp_off');
      if (compOff) list.push(compOff);
      // 年假 / 病假同样受额度硬约束：用满置灰，当天已用的段落例外。
      // 用 map 生成新对象，避免把 disabled 写回 legends 缓存对象
      const patched = list.map(item => {
        if (item.value !== 'vacation' && item.value !== 'sick') return item;
        if (this.halfAm === item.value || this.halfPm === item.value) return item;
        const year = String(this.halfDateStr || '').slice(0, 4) || String(this.currentYear);
        const quota = wioService.getLeaveQuota(item.value, year);
        return { ...item, disabled: !!(quota && quota.full) };
      });
      // 兼容旧数据 / 图例标的其它状态：把当前值补进选项，
      // 否则打开面板选中态会凭空消失，用户也没法原样保存
      const current = [this.halfAm, this.halfPm];
      current.forEach(value => {
        if (!value || allow.indexOf(value) !== -1) return;
        if (patched.some(item => item.value === value)) return;
        const item = this.legends.find(i => i.value === value);
        if (item) patched.push(item);
        else if (customIdOf(value)) {
          patched.push({
            label: this.statusLabel(value),
            value: value,
            isCustom: true,
            leave: this.leaveByCustomId(customIdOf(value))
          });
        }
      });
      return patched;
    },
    // 一行放几个 chip：能整除就整数排满（6 个 → 3 列 × 2 行），
    // 除不尽时多出来的靠 flex-grow 补齐，右边不留空
    halfGridCols() {
      const n = this.halfStatusOptions.length || 4;
      if (n % 4 === 0) return 4;
      if (n % 3 === 0) return 3;
      return n <= 4 ? n : 4;
    },
    halfChipBasis() {
      const cols = this.halfGridCols;
      return `calc((100% - ${(cols - 1) * 8}px) / ${cols})`;
    },
    halfPartRows() {
      const c = this.i18n.calendar;
      return [
        { key: 'am', title: c.amShort },
        { key: 'pm', title: c.pmShort }
      ];
    },
    halfParts() {
      if (!this.halfDateStr) return { am: null, pm: null };
      return parseDayParts(this.entries[this.halfDateStr]);
    },
    // 恰好一段是公司办公 = 这天只出了半天勤，需要问「按一天还是按半天算」。
    // 两段都公司（整天出勤）或都不是公司（没出勤）都不需要问
    halfNeedFullAsk() {
      return (this.halfAm === 'company') !== (this.halfPm === 'company');
    },
    // 面板标题：对齐设计稿的「M月D日 · 周X」
    halfDateLabel() {
      if (!this.halfDateStr) return '';
      const d = new Date(this.halfDateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return this.halfDateStr;
      const lang = this.settings.language || 'zh-CN';
      const wd = lang === 'en-US'
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
        : '周' + '日一二三四五六'[d.getDay()];
      const [, m, day] = this.halfDateStr.split('-');
      return lang === 'en-US' ? `${wd}, ${+m}/${+day}` : `${+m}月${+day}日 · ${wd}`;
    },
    // 行头右侧的当前选中回显在 methods 里（模板带参数调用，computed 不行）
    monthYearText() {
      return getMonthYearName(this.currentMonth, this.currentYear, this.settings.language);
    },
    currentYear() {
      return this.currentDate.getFullYear();
    },
    currentMonth() {
      return this.currentDate.getMonth() + 1;
    },
    // 当前翻到的月份是不是"真实的这个月"；不是才需要「回到本月」入口
    isCurrentMonth() {
      const stamp = this.nowStamp; // 依赖打点，跨月/回到页面时能重算
      const now = new Date(stamp || Date.now());
      return this.currentYear === now.getFullYear() && this.currentMonth === now.getMonth() + 1;
    },
    daysInMonth() {
      return new Date(this.currentYear, this.currentMonth, 0).getDate();
    },
    startEmptyDays() {
      return new Date(this.currentYear, this.currentMonth - 1, 1).getDay();
    },
    targetPercentage() {
      // 按所看月份取当时生效的比例（历史月份不再被追改）
      return wioService.getTargetForMonth(this.currentYear, this.currentMonth);
    },
    wioPercentage() {
      // 唯一口径：computeMonthlyReport（分母 = 工作日 − deductibleLeave）
      // 旧实现自己拼分母并额外减去 weekendLeaves，而统计层早已把周末排除在外，
      // 于是「周末标了假期」会把分母抬高、比率被压低——就是那条假 bug 的来源
      return this.report.rate;
    },
    filteredLegends() {
      // 顺序：出勤与固定假期在前，「半天」后紧跟按天假（同一族），
      // 公共假期与其他假期垫底，区间假最后（仅展示）
      const head = ['company', 'home', 'vacation', 'sick', 'overtime_record', 'half_day'];
      const tail = ['public', 'comp_off', 'unpaid', 'exclude_wio'];

      let result = head.map(key => this.legends.find(item => item.value === key)).filter(Boolean);

      if (this.settings.birthdayEnabled && this.settings.birthdayMonth) {
        const currentMonthStr = String(this.currentMonth).padStart(2, '0');
        if (currentMonthStr === this.settings.birthdayMonth) {
          const birthdayLegend = this.legends.find(item => item.value === 'birthday');
          if (birthdayLegend) {
            const insertIndex = 3;
            result.splice(insertIndex, 0, birthdayLegend);
          }
        }
      }

      const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
      const monthStart = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-01`;
      const monthEnd = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      // 按天型福利假：每个假单列一项，图例只做整天标记（半天去「半天」面板）。
      // 剩余额度不足 1 天时置灰：整天标不动了，引导去半天面板把最后半天用掉
      (this.customLeaves || []).forEach(l => {
        if (l.mode !== 'day') return;
        const usage = wioService.getCustomLeaveUsage(l.id);
        result.push({
          label: l.name,
          color: 'custom-dot',
          value: 'custom:' + l.id,
          dotColor: l.color,
          isCustom: true,
          isDayLeave: true,
          isPro: true,
          legendDisabled: !usage.unlimited && usage.remaining < 1
        });
      });

      tail.forEach(key => {
        const item = this.legends.find(i => i.value === key);
        if (item) result.push(item);
      });

      // 区间型自定义假：仅当前月有交集时列出，只作展示（区间在设置里配）
      (this.customLeaves || []).forEach(l => {
        if (l.mode === 'day') return;
        if (l.end >= monthStart && l.start <= monthEnd) {
          result.push({ label: l.name, color: 'custom-dot', value: 'custom_' + l.id, dotColor: l.color, isCustom: true });
        }
      });

      return result;
    },
    remainingVacationDays() {
      const total = this.settings.vacationDays || 20;
      const used = this.yearStats.vacationDaysUsed || 0;
      return Math.max(0, total - used);
    },
    // 距离目标还差多少个「公司办公日」
    gapDays() {
      return this.report.gapDays;
    },
    gapText() {
      if (this.wioPercentage >= this.targetPercentage) {
        return this.i18n.home.achieved;
      }
      const u = this.i18n.home;
      return `${u.daysToGo} ${this.gapDays} ${u.daysToGoUnit}`;
    },
    showBirthdayReminder() {
      if (!this.settings.birthdayEnabled || !this.settings.birthdayMonth) {
        return false;
      }
      const currentMonthStr = String(this.currentMonth).padStart(2, '0');
      if (currentMonthStr !== this.settings.birthdayMonth) {
        return false;
      }
      return !this.hasBirthdayInMonth();
    }
  },
  onShareAppMessage(res) {
    const title = this.settings.language === 'en-US' 
      ? `This month's office rate: ${this.wioPercentage}% - Did you reach WIO target?`
      : `本月回公司率: ${this.wioPercentage}% - WIO 达标了吗`;
    return {
      title: title,
      path: '/pages/index/index'
    }
  },
  onShareTimeline(res) {
    const title = this.settings.language === 'en-US' 
      ? `This month's office rate: ${this.wioPercentage}% - Did you reach WIO target?`
      : `本月回公司率: ${this.wioPercentage}% - WIO 达标了吗`;
    return {
      title: title
    }
  },
  onLoad() {
    // 状态栏 + 胶囊按钮区域，避免页面标题与手机导航栏重叠
    this.topSafeHeight = getTopSafeArea().totalHeight;
    // 云端数据覆盖本地（同步恢复）后要重算整月标记与统计
    uni.$on('wio:data-restored', this.loadData);
  },
  onUnload() {
    uni.$off('wio:data-restored', this.loadData);
  },
  onShow() {
    this.nowStamp = Date.now();
    this.loadData();
  },
  onPageScroll(e) {
    // 滚动位置映射为垂直视线：顶部=向上看，下滑=向下看
    const ny = Math.max(-1, Math.min(1, e.scrollTop / 400));
    this.emitGaze(this.lastNx, ny, true);
    // 滚动停止 300ms 后回归自然漂移
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      uni.$emit('wio-gaze', { nx: 0, ny: 0, active: false });
    }, 300);
  },
  methods: {
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const w = uni.getSystemInfoSync().windowWidth;
        // 触摸 x 相对屏幕中心映射为水平视线
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)));
      }
    },
    onTouchEnd() {
      // 手指离开后短暂保持，随后由页面滚动继续驱动垂直视线
      setTimeout(() => {
        this.lastNx = 0;
      }, 600);
    },
    emitGaze(nx, ny, active) {
      uni.$emit('wio-gaze', { nx, ny, active });
    },
    loadData() {
      this.settings = wioService.getSettings();
      this.entries = wioService.getEntries();
      this.overtimeEntries = wioService.getOvertimeEntries();
      this.customLeaves = wioService.getCustomLeaves();
      this.customMarks = wioService.getCustomMarks();
      this.yearStats = wioService.getYearStats(new Date().getFullYear());
      this.updateStats();
    },
    updateStats() {
      this.stats = wioService.getMonthStats(this.currentYear, this.currentMonth);
      this.report = computeMonthlyReport(
        this.stats,
        wioService.getTargetForMonth(this.currentYear, this.currentMonth)
      );
    },
    changeMonth(delta) {
      haptic('light');
      const newDate = new Date(this.currentDate);
      newDate.setMonth(newDate.getMonth() + delta);
      this.currentDate = newDate;
      this.updateStats();
    },
    // 一键跳回真实当月（连翻几个月后不用再一格格点回来）
    backToCurrentMonth() {
      haptic('medium');
      const now = new Date();
      this.nowStamp = now.getTime();
      if (this.isCurrentMonth) return;
      this.currentDate = new Date(now);
      this.updateStats();
    },
    onCardTouchStart(e) {
      if (!e.touches || !e.touches.length) return;
      this.swipeStartX = e.touches[0].clientX;
      this.swipeStartY = e.touches[0].clientY;
    },
    onCardTouchEnd(e) {
      if (this.swipeStartX === null) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      const startX = this.swipeStartX;
      const startY = this.swipeStartY;
      this.swipeStartX = null;
      this.swipeStartY = null;
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // 阈值 60px 且必须明显偏横向，避免上下滑动页面时误切月
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      this.changeMonth(dx < 0 ? 1 : -1);
    },
    isToday(day) {
      const now = new Date();
      return now.getDate() === day && 
             now.getMonth() === this.currentDate.getMonth() && 
             now.getFullYear() === this.currentDate.getFullYear();
    },
    selectLegend(item) {
      // 区间型自定义假仅作展示（区间在设置里配）；按天型可以选中后直标
      if (item.isCustom && !item.isDayLeave) return;
      haptic('light');

      // 按天型福利假：选中哪个假，点哪天就是整天那个假（PRO）
      if (item.isDayLeave) {
        if (!this.isPro) {
          this.showPaywall = true;
          return;
        }
        // 图例只做整天标记：剩余不足 1 天就置灰，最后半天去「半天」面板用
        if (item.legendDisabled) {
          uni.showToast({
            title: this.i18n.calendar.customDayNeedFull.replace('{name}', item.label),
            icon: 'none',
            duration: 2000
          });
          return;
        }
        this.selectedStatus = item.value;
        uni.showToast({
          title: this.i18n.calendar.legendHint,
          icon: 'none',
          duration: 1500
        });
        return;
      }

      // 半天是 PRO 功能：非会员点这里直接拉起付费墙，不给「选了却用不了」的半截体验
      // 按天型福利假也从这个入口进（面板里就是一组 chip），不再单列图例
      if (item.value === 'half_day') {
        if (!this.isPro) {
          this.showPaywall = true;
          return;
        }
        this.selectedStatus = 'half_day';
        uni.showToast({
          title: this.i18n.calendar.legendHint,
          icon: 'none',
          duration: 1500
        });
        return;
      }

      this.selectedStatus = item.value;
      if (item.value === 'clear') {
        uni.showToast({
            title: t('calendar.clickToClear', this.settings.language),
            icon: 'none',
            duration: 1500
        });
      }
    },
    selectBirthdayLegend() {
      haptic('light');
      this.selectedStatus = 'birthday';
      uni.showToast({
        title: this.i18n.calendar.clickDateToMark,
        icon: 'none',
        duration: 1500
      });
    },
    onDayClick(day) {
      haptic('light');
      const currentTime = new Date().getTime();
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (this.lastClickDay === day && (currentTime - this.lastClickTime) < 300) {
        // 连续休假整天占用：双击清除也进不去，否则取消假期后原记录会被悄悄抹掉
        const rangeHit = this.rangeLeaveForDate(dateStr);
        if (rangeHit) {
          uni.showToast({
            title: this.i18n.calendar.rangeLocked.replace('{name}', rangeHit.name),
            icon: 'none',
            duration: 2000
          });
          this.lastClickTime = 0;
          this.lastClickDay = null;
          return;
        }
        wioService.saveEntry(dateStr, null);
        wioService.clearCustomMark(dateStr);
        this.loadData();
        this.lastClickTime = 0;
        this.lastClickDay = null;
        return;
      }

      this.lastClickTime = currentTime;
      this.lastClickDay = day;

      if (!this.selectedStatus) {
        return;
      }

      // 连续休假（区间型）整天占用：图例直标同样拦下，并说明真实原因。
      // 不拦的话会落到 saveEntry 的 false 兜底，被误报成「病假/年假额度用完」
      const range = this.rangeLeaveForDate(dateStr);
      if (range) {
        uni.showToast({
          title: this.i18n.calendar.rangeLocked.replace('{name}', range.name),
          icon: 'none',
          duration: 2000
        });
        return;
      }

      // 半天面板：上午 / 下午各选各的，按天型福利假是其中一组 chip
      if (this.selectedStatus === 'half_day') {
        if (!this.isPro) {
          this.showPaywall = true;
          return;
        }
        this.openHalfPanel(day, dateStr);
        return;
      }

      if (this.selectedStatus === 'birthday') {
        if (this.hasBirthdayInMonth()) {
          uni.showToast({
            title: this.i18n.calendar.birthdayLimit,
            icon: 'none',
            duration: 2000
          });
          return;
        }
      }

      // 年假 / 病假：额度用满必须明确告知并拒绝，不能默默标上去
      // （数据层 saveEntry 也会拦一道，这里负责把原因说清楚）
      if (this.selectedStatus === 'vacation' || this.selectedStatus === 'sick') {
        const alreadySame = this.entries[dateStr] === this.selectedStatus;
        const quota = wioService.getLeaveQuota(this.selectedStatus, this.currentYear);
        if (quota && quota.full && !alreadySame) {
          this.showLeaveLimitModal(this.selectedStatus);
          return;
        }
      }

      // 按天型福利假：额度用满同样拒绝，并说清是哪个假没额度了
      const selectedCustomId = customIdOf(this.selectedStatus);
      if (selectedCustomId) {
        if (!this.isPro) {
          this.showPaywall = true;
          return;
        }
        const alreadySame = this.entries[dateStr] === this.selectedStatus;
        if (!alreadySame) {
          const usage = wioService.getCustomLeaveUsage(selectedCustomId);
          if (!usage.unlimited && usage.remaining <= 0) {
            uni.showToast({
              title: this.i18n.calendar.leaveQuotaEmpty,
              icon: 'none',
              duration: 2000
            });
            return;
          }
        }
      }

      if (this.selectedStatus === 'clear') {
        wioService.saveEntry(dateStr, null);
      } else if (this.selectedStatus === 'overtime_record') {
        console.log('Opening overtime modal for', dateStr);
        this.currentOvertimeDateStr = dateStr;
        try {
          const existing = wioService.getOvertimeForDate(dateStr);
          this.overtimeValue = existing > 0 ? parseFloat(existing) : 0;
        } catch (e) {
          console.error('Error getting existing overtime:', e);
          this.overtimeValue = 0;
        }
        this.showOvertimeModal = true;
        this.$forceUpdate(); 
        console.log('Modal state set to true');
        return;
      } else {
        // 数据层是最后一道闸：返回 false 说明被拦（额度用满，或保险起见的区间假），
        // 按真实原因分流，不能一律报「额度用满」
        const saved = wioService.saveEntry(dateStr, this.selectedStatus);
        if (saved === false) {
          const range = this.rangeLeaveForDate(dateStr);
          if (range) {
            uni.showToast({
              title: this.i18n.calendar.rangeLocked.replace('{name}', range.name),
              icon: 'none',
              duration: 2000
            });
          } else {
            this.showLeaveLimitModal(this.selectedStatus);
          }
          return;
        }
      }
      
      this.loadData();
    },
    // 假期额度用满的统一提示
    showLeaveLimitModal(status) {
      const cal = this.i18n.calendar;
      const isVacation = status === 'vacation';
      const quota = wioService.getLeaveQuota(status, this.currentYear) || { total: 0 };
      const body = (isVacation ? cal.vacationLimit : cal.sickLimit).replace('{total}', quota.total);
      uni.showModal({
        title: isVacation ? cal.legends.vacation : cal.legends.sick,
        content: body + '\n' + cal.leaveLimitHint,
        showCancel: false,
        confirmText: this.i18n.common.confirm
      });
    },
    changeOvertime(delta) {
      console.log('changeOvertime called', delta, 'current:', this.overtimeValue);
      let newVal = this.overtimeValue + delta;
      
      if (newVal < 0) newVal = 0;
      if (newVal > 12) newVal = 12;
      
      this.overtimeValue = parseFloat(newVal.toFixed(1));
      console.log('new overtimeValue:', this.overtimeValue);
      
      this.saveOvertime();
      haptic('light');
    },
    saveOvertime() {
      const hours = this.overtimeValue;
      if (hours > 0) {
        wioService.saveOvertimeEntry(this.currentOvertimeDateStr, hours);
      } else {
        wioService.saveOvertimeEntry(this.currentOvertimeDateStr, 0);
      }
      this.entries = wioService.getEntries();
      this.overtimeEntries = { ...wioService.getOvertimeEntries() };
      this.updateStats();
      this.$forceUpdate();
    },
    closeOvertimeModal() {
      this.showOvertimeModal = false;
    },
    dateStrOf(day) {
      return `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    },
    isDaySplit(day) {
      return isSplitDay(this.entries[this.dateStrOf(day)]);
    },
    // 格子样式：上下午不同时用对角斜切（左上 = 上午，右下 = 下午），
    // 其余情况退回原来的自定义假期底色
    dayStyle(day) {
      const dateStr = this.dateStrOf(day);
      // 区间假整天占用：压倒当天残留的出勤标记，格子直接按假期着色
      const range = this.rangeLeaveForDate(dateStr);
      if (range) return { background: this.hexToRgba(range.color, 0.16), color: range.color };
      const raw = this.entries[dateStr];
      // 整天是同一个按天假（图例直标的结果）：铺该假的浅底，和区间假同一套视觉
      const rawParts = parseDayParts(raw);
      const wholeCustomId = customIdOf(rawParts.am);
      if (wholeCustomId && wholeCustomId === customIdOf(rawParts.pm)) {
        const leave = this.leaveByCustomId(wholeCustomId);
        if (leave) {
          return { background: this.hexToRgba(leave.color, 0.16), color: leave.color };
        }
      }
      if (isSplitDay(raw)) {
        const p = parseDayParts(raw);
        const a = this.statusColor(p.am);
        const b = this.statusColor(p.pm);
        // 左半 = 上午，右半 = 下午，中间一根竖线分开
        return {
          background: `linear-gradient(to right, ${a.bg} 0%, ${a.bg} 50%, ${b.bg} 50%, ${b.bg} 100%)`,
          color: a.color
        };
      }
      return this.getCustomStyle(day);
    },
    // 该日是否被区间型自定义假（连续休假）整天占用
    rangeLeaveForDate(dateStr) {
      return (this.customLeaves || []).find(l => {
        if (l.mode === 'day') return false;
        if (dateStr < l.start || dateStr > l.end) return false;
        // 勾了「跳过周末与公共假期」的区间：周末不着色，也不锁出勤入口
        if (l.skipOffDays && !wioService.isOfficialWorkingDay(new Date(dateStr + 'T00:00:00'))) return false;
        return true;
      }) || null;
    },
    // 格子底部那根按天假色条：两段不同假时左右各一半，老标记兜底
    customBarStyle(day) {
      const dateStr = this.dateStrOf(day);
      const p = parseDayParts(this.entries[dateStr]);
      const idA = customIdOf(p.am);
      const idB = customIdOf(p.pm);
      const a = this.leaveByCustomId(idA);
      const b = this.leaveByCustomId(idB);
      // 整天同一个按天假：格子已铺浅底，不再叠色条
      if (idA && idA === idB) return null;
      if (a && b && idA !== idB) {
        return {
          background: `linear-gradient(to right, ${a.color} 0%, ${a.color} 50%, ${b.color} 50%, ${b.color} 100%)`
        };
      }
      const one = a || b;
      if (one) return { background: one.color };
      const mark = this.customMarkMap[dateStr];
      return mark ? { background: mark.leave.color } : null;
    },
    // --- 按天型自定义假 ---
    // 额度短文案：存在 chip 的右侧（「3.5/10」「不限 2」）
    // 一段里某个按天假占了多少天（0 / 0.5），入参可以是原始 entries 值或 {am,pm}
    customSegWeight(raw, id) {
      if (!id) return 0;
      const p = parseDayParts(raw);
      let w = 0;
      if (customIdOf(p.am) === id) w += 0.5;
      if (customIdOf(p.pm) === id) w += 0.5;
      return w;
    },
    // 面板内的预览用量：已落库的基线 − 这天原来的贡献 + 本次选择的贡献。
    // 只影响显示，写库仍由「保存」触发
    customPreviewUsed(id) {
      // 面板没打开时没有预览上下文，直接读存储，避免基线过期算出脏值
      if (!this.halfDateStr) return wioService.getCustomLeaveUsage(id).used;
      const base = (this.halfUsageBase && this.halfUsageBase[id]) || 0;
      const before = this.customSegWeight(this.entries[this.halfDateStr], id);
      const after = this.customSegWeight({ am: this.halfAm, pm: this.halfPm }, id);
      return Math.round((base - before + after) * 10) / 10;
    },
    customPreviewRemaining(l) {
      if (!l) return 0;
      const quota = l.quota || 0;
      if (quota <= 0) return 0;
      return Math.max(0, Math.round((quota - this.customPreviewUsed(l.id)) * 10) / 10);
    },
    customQuotaShort(l) {
      if (!l) return '';
      // chip 上的余额跟着选择实时变化（选中即扣减），保存后才写进存储
      const used = this.customPreviewUsed(l.id);
      if (!l.quota) return String(used);
      return `${used}/${l.quota}`;
    },
    openHalfPanel(day, dateStr) {
      // 连续休假整天占用：这段日子人不在，出勤入口直接关掉并说明原因
      const range = this.rangeLeaveForDate(dateStr);
      if (range) {
        uni.showToast({
          title: this.i18n.calendar.rangeLocked.replace('{name}', range.name),
          icon: 'none',
          duration: 2000
        });
        return;
      }
      const parts = parseDayParts(this.entries[dateStr]);
      this.halfDateStr = dateStr;
      this.halfDayNum = day;
      // 两段都预填当前值；没有记录就给「公司办公」，打开即可直接保存
      this.halfAm = parts.am || parts.pm || 'company';
      this.halfPm = parts.pm || parts.am || 'company';
      // 抓额度基线：面板里的余额 = 基线 + 本次选择带来的增量，保存前不写库
      const base = {};
      (this.customDayLeaves || []).forEach(l => {
        base[l.id] = wioService.getCustomLeaveUsage(l.id).used;
      });
      this.halfUsageBase = base;
      // 该日已有的口径：明细里有就按明细，没有就按全局默认（老会员在会员页设过）
      this.halfFullDay = wioService.isHalfDayAsFullAttendance(dateStr);
      this.showHalfPanel = true;
    },
    closeHalfPanel() {
      this.showHalfPanel = false;
      // 取消没有落库，清掉预览上下文即可（reopen 会重抓基线）
      this.halfUsageBase = {};
      this.halfDateStr = '';
    },
    // 面板里两行各自的当前值
    partValue(key) {
      return key === 'am' ? this.halfAm : this.halfPm;
    },
    // 当场选半天计法：只改面板里的草稿，点「保存」才落库
    setHalfFull(full) {
      if (this.halfFullDay === full) return;
      haptic('light');
      this.halfFullDay = full;
    },
    setHalfPart(key, opt) {
      if (!opt) return;
      const other = key === 'am' ? this.halfPm : this.halfAm;
      // 按天型福利假是「半天天性」的假：一天只该标一段，两段都选等于重复扣
      if (opt.isCustom && other === opt.value) {
        uni.showToast({ title: this.i18n.calendar.customHalfOnlyOnePart, icon: 'none' });
        return;
      }
      // 额度用完的 chip 置灰不可选，点了只提示原因
      if (opt.disabled) {
        uni.showToast({ title: this.i18n.calendar.leaveQuotaEmpty, icon: 'none' });
        return;
      }
      haptic('light');
      if (key === 'am') this.halfAm = opt.value;
      else this.halfPm = opt.value;
    },
    // 行头右侧的当前选中回显（设计稿：上午行右端「居家」、下午行右端「育儿假 · 扣 0.5 天」）
    // 注意必须在 methods：模板是带参数调用，放 computed 会变成「不是函数」而崩掉面板
    halfCurrentLabel(key) {
      const v = this.partValue(key);
      if (!v) return '—';
      const id = customIdOf(v);
      if (id) {
        const l = this.leaveByCustomId(id);
        if (!l) return '—';
        // 设计稿：选中按天假时行头显示「育儿假 · 余 0.5」，余额同样按预览值算
        if (!l.quota) return l.name + this.i18n.calendar.customUnlimitedSuffix;
        const remain = this.customPreviewRemaining(l);
        return l.name + this.i18n.calendar.customRemainSuffix.replace('{n}', remain);
      }
      const item = this.legends.find(i => i.value === v);
      return item ? item.label : v;
    },
    halfCurrentColor(key) {
      const v = this.partValue(key);
      if (!v) return '#8A8F96';
      return this.statusColor(v).color;
    },
    // 按天型福利假用自己的颜色（存档色），其余走固定状态色板
    leaveByCustomId(id) {
      if (!id) return null;
      return this.customDayLeaves.find(l => l.id === id) || null;
    },
    statusColor(value) {
      const id = customIdOf(value);
      if (id) {
        const l = this.leaveByCustomId(id);
        const c = l ? l.color : '#888780';
        return { bg: this.hexToRgba(c, 0.16), color: c };
      }
      return STATUS_COLORS[value] || STATUS_COLORS.default;
    },
    statusLabel(value) {
      if (!value) return '—';
      const id = customIdOf(value);
      if (id) {
        const l = this.leaveByCustomId(id);
        return l ? l.name : '—';
      }
      const item = this.legends.find(i => i.value === value);
      return item ? item.label : value;
    },
    // chip 是否不可点：额度用尽，或这一天另一段已经占用了同一个按天福利假
    halfChipDisabled(opt, key) {
      if (!opt) return true;
      if (opt.disabled) return true;
      const other = key === 'am' ? this.halfPm : this.halfAm;
      return !!(opt.isCustom && other === opt.value);
    },
    // 选中的 chip 用该状态自己的颜色做浅底 + 描边，比统一的主题色更好认；
    // 置灰 chip 不上选中色
    halfChipStyle(on, opt, key) {
      if (!on || !opt || this.halfChipDisabled(opt, key)) return {};
      const c = this.statusColor(opt.value);
      return { background: this.hexToRgba(c.color, 0.1), borderColor: c.color };
    },
    applyHalfDay() {
      const am = this.halfAm;
      const pm = this.halfPm;
      const customIds = [customIdOf(am), customIdOf(pm)].filter(Boolean);

      // 先逐条预检：saveDayParts 只返回 true/false，分不清是哪条规则拦的
      const range = this.rangeLeaveForDate(this.halfDateStr);
      if (range) {
        uni.showToast({
          title: this.i18n.calendar.rangeLocked.replace('{name}', range.name),
          icon: 'none',
          duration: 2000
        });
        return;
      }
      if (customIds.length && !isProUser()) {
        this.showPaywall = true;
        return;
      }

      if (!wioService.saveDayParts(this.halfDateStr, am, pm)) {
        // 剩下的可能：假期额度用满，或权益在面板打开期间失效
        if (am !== pm && !isProUser()) {
          this.showPaywall = true;
          return;
        }
        const hit = ['vacation', 'sick'].find(k => am === k || pm === k);
        if (hit) {
          this.showLeaveLimitModal(hit);
        } else {
          uni.showToast({ title: this.i18n.calendar.halfSaveFailed, icon: 'none' });
        }
        return;
      }
      haptic('medium');
      // 半天计法逐日落库：只在真的要问的那天写，整天出勤的日子不动，
      // 免得给一个月 20 多天都留下一条没意义的记录
      if (this.halfNeedFullAsk) {
        wioService.setHalfFullDay(this.halfDateStr, this.halfFullDay);
      }
      this.showHalfPanel = false;
      // 落库后基线过期：清掉预览上下文，避免关面板后还算出脏余额
      this.halfUsageBase = {};
      this.halfDateStr = '';
      this.loadData();
      // 福利假超额不拦截，但要说一声——个人记录工具，拦了真实请的假就记不进去
      const over = customIds
        .map(id => wioService.getCustomLeaveUsage(id))
        .filter(u => u.over > 0)[0];
      if (over) {
        uni.showToast({
          title: this.i18n.profile.customOver.replace('{n}', over.over),
          icon: 'none',
          duration: 2000
        });
      }
    },
    clearHalfDay() {
      haptic('medium');
      wioService.saveDayParts(this.halfDateStr, null, null);
      this.showHalfPanel = false;
      this.halfUsageBase = {};
      this.halfDateStr = '';
      this.loadData();
    },
    onProUpgraded() {
      this.showPaywall = false;
      this.proStamp++;
      // 刚开通：顺手把「半天」选上，用户不用再点一次图例
      if (this.isPro) this.selectedStatus = 'half_day';
    },
    getOvertimeDisplay(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const val = this.overtimeEntries[dateStr];
      console.log(`getOvertimeDisplay for ${dateStr}:`, val);
      return val ? `${val}` : '';
    },
    onDayLongPress(day) {
       const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
       wioService.saveEntry(dateStr, null);
       haptic('medium');
       this.loadData();
    },
    getHolidayInfo(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return wioService.getPublicHoliday(dateStr);
    },
    getHolidayName(day) {
      const info = this.getHolidayInfo(day);
      return info ? info.name : '';
    },
    getHolidayDisplayName(day) {
      const name = this.getHolidayName(day);
      if (this.settings.language === 'en-US') {
        return holidayNameMap[name] || name;
      }
      return name;
    },
    isHolidayWork(day) {
      const info = this.getHolidayInfo(day);
      return info ? !info.isOffDay : false;
    },
    getDayClass(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const status = this.entries[dateStr];
      
      if (status === 'company') return 'company-office';
      if (status === 'home') return 'home-office';
      if (status === 'vacation') return 'status-vacation';
      if (status === 'birthday') return 'status-birthday';
      if (status === 'comp_off') return 'status-comp-off';
      if (status === 'sick') return 'status-sick';
      if (status === 'unpaid') return 'status-unpaid';
      if (status === 'public') return 'status-public';
      if (status === 'exclude_wio') return 'status-exclude-wio';
      
      if (!status) {
        // 自定义假期区间：优先于法定节假日底色显示
        if (this.getCustomLeaveInfo(day)) {
          return 'status-custom';
        }
        const holiday = this.getHolidayInfo(day);
        if (holiday && holiday.isOffDay) {
          return 'status-public';
        }
      }
      
      const dayOfWeek = new Date(this.currentYear, this.currentMonth - 1, day).getDay();
      if ((dayOfWeek === 0 || dayOfWeek === 6) && !status) {
      }

      return '';
    },
    // 自定义假期：取该日命中的假期（用于格子着色与图例）
    getCustomLeaveInfo(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return wioService.getCustomLeaveForDate(dateStr);
    },
    // 手动标记优先：有手动状态的日期不套自定义假期配色
    getCustomStyle(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (this.entries[dateStr]) return null;
      // 按天标记优先于区间型：同一天既在区间里又被单独标过，以单独标记为准
      const mark = this.customMarkMap[dateStr];
      if (mark) {
        return { background: this.hexToRgba(mark.leave.color, 0.16), color: mark.leave.color };
      }
      const cl = (this.customLeaves || []).find(l => l.mode !== 'day' && dateStr >= l.start && dateStr <= l.end);
      if (!cl) return null;
      return { background: this.hexToRgba(cl.color, 0.16), color: cl.color };
    },
    hexToRgba(hex, alpha) {
      const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex || '');
      if (!m) return '';
      const n = parseInt(m[1], 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    },
    hasBirthdayInMonth() {
      const prefix = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`;
      return Object.keys(this.entries).some(key => {
        if (!key.startsWith(prefix)) return false;
        // 半天标记的生日假也算「本月已休」
        const p = parseDayParts(this.entries[key]);
        return p.am === 'birthday' || p.pm === 'birthday';
      });
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #F4F5F6;
  padding-bottom: calc(98px + constant(safe-area-inset-bottom));
  padding-bottom: calc(98px + env(safe-area-inset-bottom));
}

.status-bar-placeholder {
  width: 100%;
}

.content {
  padding: 10px 20px 0 20px;
}

.card {
  background-color: #fff;
  border-radius: 18px;
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
  border: none;
}

/* ===== 月度 WIO 摘要卡（紧凑版） ===== */
.stats-card {
  border: none;
  border-radius: 18px;
  padding: 14px 16px;
  background: #FFFFFF;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stats-card.warning-border {
  background: linear-gradient(180deg, #FBF1EF 0%, #FFFFFF 62%);
}

.stats-card.success-border {
  background: linear-gradient(180deg, #EDF6F4 0%, #FFFFFF 62%);
}

.stats-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.stats-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stats-label {
  font-size: 11px;
  color: #6B737B;
  line-height: 1.4;
}

.percent-row {
  display: flex;
  align-items: baseline;
}

.percent-unit {
  font-size: 13px;
  font-weight: 600;
  margin-left: 1px;
}

.percent-unit.red-text { color: #A63A31; }
.percent-unit.green-text { color: #0E6E62; }

.stats-meta {
  display: flex;
  align-items: center;
  padding-bottom: 4px;
}

.meta-divider {
  width: 1px;
  height: 9px;
  background: #DDE1E5;
  margin: 0 7px;
}

.gap-text {
  font-size: 10.5px;
  font-weight: 600;
  color: #6B737B;
}

/* 目标刻度线 */
.goal-marker {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  border-radius: 1px;
  background: #15181C;
  transform: translateX(-1px);
  z-index: 2;
}

.fill-danger { background: #A63A31; }
.fill-success { background: #0E6E62; }

/* 统计胶囊行 */
.stats-chips {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 9px;
  border-top: 1px solid #F1F3F5;
}

.stat-chip {
  display: flex;
  align-items: center;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 5px;
  flex-shrink: 0;
}

.dot-company { background: #0E6E62; }
.dot-home { background: #B26B18; }
.dot-ot { background: #5F53A5; }

.chip-label {
  font-size: 10px;
  color: #6B737B;
  margin-right: 4px;
  line-height: 1.4;
}

.chip-value {
  font-size: 11px;
  font-weight: 600;
  color: #1F242A;
  line-height: 1.4;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.card-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  margin-right: 8px;
  color: #333;
}

.tag {
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 10px;
  margin-right: 4px;
}

.overtime-tag {
  background-color: #EDE7F6;
  color: #673AB7;
  border: 1px solid #D1C4E9;
  font-weight: 600;
}

.office-tag {
  background-color: #E3F2FD;
  color: #1976D2;
  border: 1px solid #BBDEFB;
  font-weight: 600;
}

.vacation-tag {
  background-color: #FFF8E1;
  color: #FF9800;
  border: 1px solid #FFE0B2;
  font-weight: 600;
}

.tag.purple { background-color: #F3E5F5; color: #7B1FA2; }
.tag.blue { background-color: #E3F2FD; color: #1976D2; }

.percentage {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.4px;
}

.percentage.red-text { color: #A63A31; }
.percentage.green-text { color: #0E6E62; }

.target-text {
  font-size: 11px;
  color: #6B737B;
  line-height: 1.4;
}

.progress-bar {
  position: relative;
  height: 6px;
  background-color: #E9ECF0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s cubic-bezier(0.25, 0.8, 0.3, 1);
}

.warning-text {
  font-size: 11px;
  color: #F44336;
  margin-top: 2px;
}

.success-text {
  font-size: 11px;
  color: #4CAF50;
  margin-top: 2px;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.month-group {
  display: flex;
  align-items: center;
  min-width: 0;
}

.month-year {
  font-size: 18px;
  font-weight: bold;
  white-space: nowrap;
}

/* 「回到本月」：轻量 pill，只在翻到别的月份时出现 */
.back-current {
  display: flex;
  align-items: center;
  margin-left: 8px;
  padding: 4px 10px;
  border-radius: 100px;
  background-color: #EAF2F0;
  transition: all 0.15s ease;
}

.back-current:active {
  background-color: #DCEAE7;
  transform: scale(0.96);
}

.back-current-text {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  color: #0E6E62;
}

.nav-arrows {
  display: flex;
  align-items: center;
}

.nav-btn {
  width: 32px;
  height: 32px;
  background-color: #F5F5F5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 10px;
}

.nav-btn:active {
  background-color: #E0E0E0;
}

.arrow-icon {
  font-size: 16px;
  color: #666;
  font-weight: bold;
}

.weekdays {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.weekday {
  width: 14.28%;
  text-align: center;
  font-size: 14px;
  color: #666;
  font-weight: bold;
}

.days-grid {
  display: flex;
  flex-wrap: wrap;
}

.day-cell {
  width: 14.28%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 5px;
}

.day-content {
  width: 42px;
  height: 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 16px;
  color: #333;
  transition: all 0.2s;
  position: relative;
}

.day-number {
  line-height: 1;
}

.holiday-text {
  font-size: 8px;
  line-height: 1;
  margin-top: 2px;
  color: #c62828;
  max-width: 36px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.holiday-text.text-work {
  color: #333;
}

/* English holiday text optimization */
.holiday-text.english {
  font-size: 7px;
  letter-spacing: -0.5px;
  max-width: 32px;
}

.work-badge {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 8px;
  background-color: #f5f5f5;
  color: #666;
  padding: 1px 2px;
  border-radius: 0 4px 0 4px;
  line-height: 1;
}

.day-content:active {
  transform: scale(0.9);
}

.public-holiday { background-color: #FFCDD2; color: #C62828; }
.home-office { background-color: #BBDEFB; color: #1565C0; }
.company-office { background-color: #C8E6C9; color: #2E7D32; }

/* ===== 今日标识 =====
   只去掉「底色 + 字色」这层填充——它会把已标记日子的绿/红/橙整片盖掉，
   同一天既"是今天"又"已标记"时分不清到底什么状态。
   描边、外光晕、底部蓝点、脉冲动画全部保留：这些是外圈/角标，
   和格子内部的标记色不抢位。 */
.today-highlight {
  position: relative;
  font-weight: bold;
  animation: pulse 2s infinite;
}

.today-highlight::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 6px;
  height: 6px;
  background-color: #1976D2;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(25, 118, 210, 0.5);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(25, 118, 210, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);
  }
}

/* 无标记的今天：留蓝框蓝字，只是不再铺蓝底（蓝底才是盖住标记色的元凶） */
.today-highlight:not(.company-office):not(.home-office):not(.status-vacation):not(.status-birthday):not(.status-comp-off):not(.status-sick):not(.status-unpaid):not(.status-public):not(.status-exclude-wio):not(.status-custom) {
  color: #1976D2;
  border: 2px solid #1976D2;
  border-radius: 12px;
}

/* 已标记的今天：标记底色照原样显示，只叠蓝框 + 外光晕 */
.today-highlight.company-office,
.today-highlight.home-office,
.today-highlight.status-vacation,
.today-highlight.status-birthday,
.today-highlight.status-comp-off,
.today-highlight.status-sick,
.today-highlight.status-unpaid,
.today-highlight.status-public,
.today-highlight.status-exclude-wio,
.today-highlight.status-custom {
  border: 3px solid #1976D2;
  border-radius: 12px;
}

.legend-header {
  display: flex;
  align-items: center;
  justify-content: space-between; 
  margin-bottom: 8px; 
  padding-bottom: 6px; 
  border-bottom: 1px solid #f0f0f0;
}

.legend-title {
  font-size: 14px; 
  font-weight: 600;
  color: #333;
}

.clear-btn-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background-color: #F5F7FA;
  border: 1px solid #EAEAEA;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.clear-btn-header:active {
  transform: scale(0.96);
  background-color: #EBEEF5;
}

.clear-btn-header.active {
  background-color: #FFFFFF;
  border-color: #007AFF;
  box-shadow: 0 2px 6px rgba(0, 122, 255, 0.15);
}

.clear-btn-header .legend-dot {
  width: 8px;
  height: 8px;
  margin-right: 4px;
  margin-bottom: 0;
}

.clear-btn-header .legend-label {
  font-size: 11px;
  font-weight: 500;
}

.legend-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px; 
}

.legend-tip-text {
  font-size: 10px;
  color: #999;
  flex: 1;
  text-align: center;
}

.legend-item {
  width: calc(33.33% - 5px);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 4px 2px;
  background-color: #F5F7FA;
  border: 1px solid #EAEAEA;
  border-radius: 6px;
  box-sizing: border-box;
  transition: all 0.2s ease;
  height: 28px;
}

.legend-item:nth-child(-n+6) {
  background-color: #ffffff;
  border-color: #d1d9e6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.legend-item:nth-child(-n+6) .legend-label {
  font-weight: 600;
  color: #333;
}

.legend-item:active {
  transform: scale(0.96);
  background-color: #EBEEF5;
}

/* 额度不足 1 天的按天假：图例只做整天标记，标不动就置灰引导去半天面板 */
.legend-item.disabled {
  opacity: 0.38;
}

.legend-item.disabled:active {
  transform: none;
  background-color: #F5F7FA;
}

.legend-item.active {
  background-color: #FFFFFF;
  border-radius: 6px;
  border: 1px solid #007AFF !important; 
  box-shadow: 0 2px 6px rgba(0, 122, 255, 0.15);
  position: relative;
  z-index: 1;
}

.legend-item.active .legend-label {
  color: #007AFF;
}

.legend-dot {
  width: 8px; 
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  margin-bottom: 0;
  flex-shrink: 0;
}

.legend-label {
  font-size: 10px; 
  color: #666; 
  font-weight: 500;
  text-align: left;
  line-height: 1;
  white-space: nowrap; 
}

.legend-item.active .legend-label {
  color: #007AFF;
  font-weight: 600;
}

.legend-dot.green { background-color: #C8E6C9; border: 1px solid #2E7D32; }
.legend-dot.blue { background-color: #BBDEFB; border: 1px solid #1565C0; }
.legend-dot.orange { background-color: #FFE0B2; border: 1px solid #EF6C00; }
.legend-dot.pink { background-color: #F8BBD9; border: 1px solid #E91E63; }
.legend-dot.cyan { background-color: #B2EBF2; border: 1px solid #00BCD4; }
.legend-dot.purple { background-color: #E1BEE7; border: 1px solid #7B1FA2; }
.legend-dot.gray { background-color: #E0E0E0; border: 1px solid #9E9E9E; }
.legend-dot.red { background-color: #FFCDD2; border: 1px solid #C62828; }
.legend-dot.dashed { border: 1px dashed #999; background-color: transparent; }
.legend-dot.purple-ot { background-color: #EDE7F6; border: 1px solid #673AB7; }
.legend-dot.exclude { background-color: #ECEFF1; border: 1px dashed #607D8B; }

.overtime-badge {
  position: absolute;
  top: 0;
  left: 0;
  right: auto;
  background-color: #EDE7F6;
  color: #673AB7;
  font-size: 9px;
  padding: 2px 4px 2px 2px;
  border-radius: 10px 0 6px 0;
  z-index: 2;
  font-weight: bold;
  line-height: 1;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background-color: #fff;
  border-radius: 12px;
  width: 80%;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.modal-header {
  margin-bottom: 20px;
  text-align: center;
}

.modal-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 4px;
}

.modal-subtitle {
  font-size: 12px;
  color: #999;
}

.stepper-container {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30px;
}

.stepper-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  transition: all 0.2s;
}

.stepper-btn:active {
  background-color: #e0e0e0;
  transform: scale(0.95);
}

.stepper-btn.minus {
  color: #FF5252;
  background-color: #FFEBEE;
}

.stepper-btn.plus {
  color: #4CAF50;
  background-color: #E8F5E9;
}

.stepper-btn.disabled {
  opacity: 0.5;
  background-color: #f5f5f5;
  color: #ccc;
}

.stepper-icon {
  font-size: 24px;
  font-weight: bold;
  line-height: 1;
}

.stepper-value {
  margin: 0 25px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
}

.value-text {
  font-size: 36px;
  font-weight: bold;
  color: #333;
  line-height: 1.2;
}

.unit-text {
  font-size: 12px;
  color: #999;
}

.legend-item.active {
  background-color: #FFFFFF;
  border-radius: 8px;
  border: 1px solid #007AFF;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.15);
  position: relative;
  z-index: 1;
}

.status-vacation { background-color: #FFE0B2; color: #EF6C00; }
.status-birthday { background-color: #F8BBD9; color: #E91E63; }
.status-comp-off { background-color: #B2EBF2; color: #006064; }
.status-sick { background-color: #E1BEE7; color: #4A148C; }
.status-unpaid { background-color: #F5F5F5; color: #616161; border: 1px dashed #9E9E9E; }
.status-public { background-color: #FFCDD2; color: #B71C1C; }
.status-exclude-wio { background-color: #ECEFF1; color: #607D8B; border: 1px dashed #90A4AE; }

.birthday-reminder-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #FFF5F5 0%, #FFEBEE 100%);
  border: 1px solid #FFCDD2;
  border-radius: 12px;
  margin-bottom: 12px;
}

.birthday-icon {
  font-size: 36px;
  margin-right: 12px;
}

.birthday-content {
  flex: 1;
}

.birthday-title {
  font-size: 15px;
  font-weight: 600;
  color: #E91E63;
  display: block;
  margin-bottom: 4px;
}

.birthday-desc {
  font-size: 12px;
  color: #888;
  display: block;
}

.birthday-action {
  padding: 6px 12px;
  background-color: #E91E63;
  border-radius: 20px;
  transition: all 0.2s;
}

.birthday-action:active {
  transform: scale(0.95);
  opacity: 0.8;
}

.action-text {
  font-size: 12px;
  color: #fff;
  font-weight: 500;
}

/* ===== 半天标记（PRO） ===== */
/* 图例里的 PRO 角标：跟在标签右边，不挤占格子高度 */
.legend-pro {
  font-size: 8px;
  font-weight: 700;
  color: #8A5A12;
  background-color: #F6E3BC;
  border-radius: 3px;
  padding: 0 3px;
  margin-left: 3px;
  line-height: 12px;
}

/* 图例圆点：斜切两色，直观表示「上下午可以不同」 */
.legend-dot.half {
  background: linear-gradient(to right, #C8E6C9 0%, #C8E6C9 50%, #FFE0B2 50%, #FFE0B2 100%);
  border: 1px solid #B0A08A;
}

/* 上下午分色的竖线：左半上午、右半下午，中间一根细线把两段切开 */
.day-split::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: rgba(21, 24, 28, 0.18);
  pointer-events: none;
}

.day-split .day-number {
  position: relative;
  z-index: 1;
}

.half-modal {
  padding-bottom: 20px;
  /* 状态多时（英文标签更长）面板会变高，限高后可滚动，不会被顶出屏幕 */
  max-height: 78vh;
  overflow-y: auto;
}

/* ===== 上午 / 下午 两段 ===== */
.half-part + .half-part {
  margin-top: 14px;
}

.half-part-head {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.half-part-title {
  font-size: 12px;
  font-weight: 600;
  color: #15181C;
}

/* 行头右侧的当前选中回显：用状态自己的颜色（设计稿「上午 · 居家」蓝字） */
.half-part-current {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  max-width: 45%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.half-status-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
}

/* 列数由 JS 按 chip 数量算（halfChipBasis），最后一行用 flex-grow 补齐不留空 */
.half-status-item {
  flex-grow: 1;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 9px 8px;
  border-radius: 10px;
  background-color: #F7F8F9;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.half-status-item.half-status-on {
  font-weight: 600;
}

/* 额度用完：置灰不可点（点击只 toast 说明） */
.half-status-item.half-status-off {
  opacity: 0.45;
}

.half-chip-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  border-width: 1px;
  border-style: solid;
}

.half-status-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #15181C;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 按天型福利假 chip 右侧的额度：3.5/10，额度卡同源 */
.half-status-quota {
  flex-shrink: 0;
  font-size: 11px;
  color: #8A8F96;
  white-space: nowrap;
}

/* --- 半天计法当场确认 --- */
.half-rule {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: #F6F4EE;
}

.half-rule-head {
  display: flex;
  flex-direction: column;
}

.half-rule-title {
  font-size: 12px;
  font-weight: 600;
  color: #3A4148;
}

.half-rule-sub {
  font-size: 10px;
  color: #9AA0A6;
  margin-top: 2px;
}

.half-rule-seg {
  display: flex;
  gap: 8px;
  margin-top: 9px;
}

.half-rule-pill {
  flex: 1;
  height: 32px;
  border-radius: 9px;
  background: #FFFFFF;
  border: 1px solid #E4DFD3;
  display: flex;
  align-items: center;
  justify-content: center;
}

.half-rule-pill.active {
  background: rgba(14, 110, 98, 0.08);
  border-color: #0E6E62;
}

.half-rule-text {
  font-size: 11.5px;
  color: #6B737B;
}

.half-rule-pill.active .half-rule-text {
  color: #0E6E62;
  font-weight: 600;
}

.half-actions {
  display: flex;
  flex-direction: row;
  gap: 10px;
  margin-top: 18px;
}

.half-btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.half-btn-ghost {
  background-color: #F1F3F4;
}

.half-btn-primary {
  background-color: #0E6E62;
}

.half-btn-text {
  font-size: 15px;
  color: #15181C;
  font-weight: 500;
}

.half-btn-text-on {
  color: #FFFFFF;
}

/* ===== 按天型福利假 ===== */
/* 格子底部色条：整格淡底 + 一根条，和区间型的区别只有这一条，避免散假抢视觉 */
.custom-mark-bar {
  position: absolute;
  bottom: 4px;
  left: 50%;
  margin-left: -7px;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

.custom-mark-modal {
  padding-bottom: 20px;
  max-height: 78vh;
  overflow-y: auto;
}

.custom-mark-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.custom-mark-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.custom-mark-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.custom-mark-name {
  font-size: 13px;
  font-weight: 500;
  color: #15181C;
  flex: 1;
}

.custom-mark-quota {
  font-size: 9.5px;
  color: #8A9299;
}

.custom-part-row {
  display: flex;
  gap: 0;
  padding: 3px;
  border-radius: 10px;
  background: #F2F4F6;
}

.custom-part-item {
  flex: 1;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-part-item.on {
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(21, 24, 28, 0.08);
}

.custom-part-text {
  font-size: 11.5px;
  color: #6B7378;
}

.custom-part-item.on .custom-part-text {
  color: #0B5248;
  font-weight: 600;
}

.custom-mark-hint {
  display: block;
  font-size: 9.5px;
  color: #9AA1A8;
  margin: 8px 0 14px;
}
</style>
