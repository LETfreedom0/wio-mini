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
              <!-- 按天型自定义假：只加一根底部色条，不跟出勤状态抢视觉 -->
              <view
                v-if="customMarkMap[dateStrOf(day)]"
                class="custom-mark-bar"
                :style="{ background: customMarkMap[dateStrOf(day)].leave.color }"
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
          <view class="legend-item" v-for="(item, index) in filteredLegends" :key="index" @click="selectLegend(item)" :class="{ active: selectedStatus === item.value }">
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
          <text class="modal-title">{{ i18n.calendar.halfTitle }}</text>
          <text class="modal-subtitle">{{ halfDateStr }}</text>
        </view>

        <!-- 预览：把日历上那一格直接摆出来，选完就知道长什么样 -->
        <view class="half-preview">
          <view class="half-preview-cell" :style="halfPreviewStyle">
            <text class="half-preview-num">{{ halfDayNum }}</text>
          </view>
          <view class="half-preview-text">
            <text class="half-preview-line">{{ halfPreviewAm }}</text>
            <text class="half-preview-line">{{ halfPreviewPm }}</text>
          </view>
        </view>

        <view class="half-part" v-for="part in halfPartRows" :key="part.key">
          <view class="half-part-head">
            <text class="half-part-title">{{ part.title }}</text>
            <view v-if="part.key === 'pm'" class="half-copy" @click="copyAmToPm">
              <text class="half-copy-text">{{ i18n.calendar.halfSameAsAm }}</text>
            </view>
          </view>
          <view class="half-status-grid">
            <view
              v-for="opt in halfStatusOptions"
              :key="opt.value"
              class="half-status-item"
              :class="{ 'half-status-on': partValue(part.key) === opt.value }"
              :style="halfChipStyle(partValue(part.key) === opt.value, opt.value)"
              @click="setHalfPart(part.key, opt.value)"
            >
              <view
                class="half-chip-dot"
                :style="{ background: statusColor(opt.value).bg, borderColor: statusColor(opt.value).color }"
              ></view>
              <text class="half-status-text">{{ opt.label }}</text>
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

    <!-- 按天型自定义假的标记面板：先选哪个假，再选整天/上午/下午 -->
    <view class="modal-overlay" v-if="showCustomMarkPanel" @click="showCustomMarkPanel = false">
      <view class="modal-content custom-mark-modal" @click.stop>
        <view class="modal-close-btn" @click="showCustomMarkPanel = false">×</view>
        <view class="modal-header">
          <text class="modal-title">{{ i18n.calendar.customMarkTitle }}</text>
          <text class="modal-subtitle">{{ customMarkDateLabel }}</text>
        </view>

        <view class="custom-mark-list">
          <view
            v-for="l in customDayLeaves"
            :key="l.id"
            class="custom-mark-chip"
            :class="{ on: customMarkLeaveId === l.id }"
            :style="customMarkChipStyle(l)"
            @click="pickCustomLeave(l)"
          >
            <view class="custom-mark-dot" :style="{ background: l.color }"></view>
            <text class="custom-mark-name">{{ l.name }}</text>
            <text class="custom-mark-quota">{{ customQuotaText(l) }}</text>
          </view>
        </view>

        <view class="custom-part-row">
          <view
            v-for="p in customPartOptions"
            :key="p.value"
            class="custom-part-item"
            :class="{ on: customMarkPart === p.value }"
            @click="pickCustomPart(p.value)"
          >
            <text class="custom-part-text">{{ p.label }}</text>
          </view>
        </view>

        <text class="custom-mark-hint">{{ i18n.calendar.customMarkQuotaHint }}</text>

        <view class="half-actions">
          <view class="half-btn half-btn-ghost" @click="clearCustomMarkDay">
            <text class="half-btn-text">{{ i18n.common.clear }}</text>
          </view>
          <view class="half-btn half-btn-primary" @click="applyCustomMark">
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
import wioService, { isSplitDay, parseDayParts } from '@/utils/wioService.js'
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
        totalRecorded: 0,
        workingDays: 0,
        totalOvertime: 0
      },
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
      // 半天标记（PRO）
      showHalfPanel: false,
      halfDateStr: '',
      halfDayNum: 0,
      // 按天型自定义假的标记面板（PRO）
      showCustomMarkPanel: false,
      customMarkDateStr: '',
      customMarkLeaveId: '',
      customMarkPart: 'full',
      customMarks: {},
      // 上下午各存一份，天然支持任意组合（上午公司 + 下午年假 等）
      halfAm: 'company',
      halfPm: 'company',
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
        const leave = list.find(l => l.id === m.id);
        if (leave) out[d] = { part: m.part, leave };
      });
      return out;
    },
    customPartOptions() {
      return [
        { value: 'full', label: this.i18n.calendar.partFull },
        { value: 'am', label: this.i18n.calendar.amShort },
        { value: 'pm', label: this.i18n.calendar.pmShort }
      ];
    },
    customMarkDateLabel() {
      if (!this.customMarkDateStr) return '';
      const d = new Date(this.customMarkDateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return '';
      const wd = this.settings.language === 'en-US'
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
        : '周' + '日一二三四五六'[d.getDay()];
      const [, m, day] = this.customMarkDateStr.split('-');
      return this.settings.language === 'en-US'
        ? `${+m}/${+day} · ${wd}`
        : `${+m}月${+day}日 · ${wd}`;
    },
    halfStatusOptions() {
      const allow = ['company', 'home', 'vacation', 'sick'];
      const list = allow
        .map(value => this.legends.find(item => item.value === value))
        .filter(Boolean);
      // 兼容旧数据 / 图例标的其它状态：把当前值补进选项，
      // 否则打开面板选中态会凭空消失，用户也没法原样保存
      const current = [this.halfAm, this.halfPm];
      current.forEach(value => {
        if (!value || allow.indexOf(value) !== -1) return;
        if (list.some(item => item.value === value)) return;
        const item = this.legends.find(i => i.value === value);
        if (item) list.push(item);
      });
      return list;
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
    // 预览格：与日历上的格子同一套斜切画法（左上=上午，右下=下午）
    halfPreviewStyle() {
      const a = this.statusColor(this.halfAm);
      const b = this.statusColor(this.halfPm);
      return {
        background: `linear-gradient(to bottom right, ${a.bg} 0%, ${a.bg} 50%, ${b.bg} 50%, ${b.bg} 100%)`,
        color: a.color
      };
    },
    halfPreviewAm() {
      return `${this.i18n.calendar.amShort} ${this.statusLabel(this.halfAm)}`;
    },
    halfPreviewPm() {
      return `${this.i18n.calendar.pmShort} ${this.statusLabel(this.halfPm)}`;
    },
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
      const numerator = this.stats.companyDays;
      
      const totalDeductible = this.stats.vacationDays 
                            + this.stats.birthdayDays
                            + this.stats.sickDays 
                            + this.stats.unpaidDays 
                            + this.stats.compOffDays
                            + this.stats.excludeWioDays
                            + (this.stats.customLeaveDays || 0);
                            
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);

      const denominator = this.stats.workingDays - effectiveDeductible;

      if (denominator <= 0) return 0;
      
      return Math.round((numerator / denominator) * 100);
    },
    filteredLegends() {
      const order = [
        'company', 'home', 'vacation',
        'sick', 'overtime_record', 'public',
        'comp_off', 'unpaid', 'exclude_wio',
        'half_day' // PRO：按上午/下午分别标记
      ];
      
      let result = order.map(key => this.legends.find(item => item.value === key)).filter(Boolean);
      
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
      
      // 自定义假期图例：仅显示与当前月有交集的，颜色用假期自带色
      const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
      const monthStart = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-01`;
      const monthEnd = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      (this.customLeaves || []).forEach(l => {
        // 按天型不在这里逐个列（可能十几个），合并成下面一个入口
        if (l.mode === 'day') return;
        if (l.end >= monthStart && l.start <= monthEnd) {
          result.push({ label: l.name, color: 'custom-dot', value: 'custom_' + l.id, dotColor: l.color, isCustom: true });
        }
      });
      // 按天型：一个「福利假」入口，点选后再点日历格子标记
      if (this.customDayLeaves.length) {
        result.push({
          label: t('calendar.customDayLegend', this.settings.language || 'zh-CN'),
          color: 'custom-dot',
          value: 'custom_day',
          dotColor: this.customDayLeaves[0].color
        });
      }
      
      return result;
    },
    remainingVacationDays() {
      const total = this.settings.vacationDays || 20;
      const used = this.yearStats.vacationDaysUsed || 0;
      return Math.max(0, total - used);
    },
    // 距离目标还差多少个「公司办公日」
    gapDays() {
      if (this.wioPercentage >= this.targetPercentage) return 0;
      const totalDeductible = this.stats.vacationDays 
                            + this.stats.birthdayDays
                            + this.stats.sickDays 
                            + this.stats.unpaidDays 
                            + this.stats.compOffDays
                            + this.stats.excludeWioDays
                            + (this.stats.customLeaveDays || 0);
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);
      const denominator = this.stats.workingDays - effectiveDeductible;
      if (denominator <= 0) return 0;
      const needCompany = Math.ceil((this.targetPercentage / 100) * denominator);
      return Math.max(0, needCompany - this.stats.companyDays);
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
      // 自定义假期图例仅作展示，不支持点选标记（区间在设置中配置）
      if (item.isCustom) return;
      haptic('light');

      // 按天型福利假：同样要先选它，再去点具体哪一天
      if (item.value === 'custom_day') {
        if (!this.isPro) {
          this.showPaywall = true;
          return;
        }
        this.selectedStatus = 'custom_day';
        uni.showToast({
          title: this.i18n.calendar.legendHint,
          icon: 'none',
          duration: 1500
        });
        return;
      }

      // 半天是 PRO 功能：非会员点这里直接拉起付费墙，不给「选了却用不了」的半截体验
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

      // 按天型福利假：打开面板选「哪个假 + 整天/上午/下午」
      if (this.selectedStatus === 'custom_day') {
        if (!this.isPro) {
          this.showPaywall = true;
          return;
        }
        this.openCustomMarkPanel(day, dateStr);
        return;
      }

      // 半天标记走独立面板：要先决定作用范围（全天/上午/下午）再选状态
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
        // 数据层是最后一道闸：返回 false 说明额度已满（跨月/跨年统计口径
        // 与 UI 预检不一致时会走到这里），必须把原因告知用户
        const saved = wioService.saveEntry(dateStr, this.selectedStatus);
        if (saved === false) {
          this.showLeaveLimitModal(this.selectedStatus);
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
      const raw = this.entries[this.dateStrOf(day)];
      if (isSplitDay(raw)) {
        const p = parseDayParts(raw);
        const a = STATUS_COLORS[p.am] || STATUS_COLORS.default;
        const b = STATUS_COLORS[p.pm] || STATUS_COLORS.default;
        return {
          background: `linear-gradient(to bottom right, ${a.bg} 0%, ${a.bg} 50%, ${b.bg} 50%, ${b.bg} 100%)`,
          color: a.color
        };
      }
      return this.getCustomStyle(day);
    },
    // --- 按天型自定义假 ---
    openCustomMarkPanel(day, dateStr) {
      const existing = this.customMarkMap[dateStr];
      const first = this.customDayLeaves[0];
      const leaveId = existing ? existing.leave.id : (first ? first.id : '');
      // 一条按天型假期都没有时不该走到这里，兜一下防止空面板
      if (!leaveId) {
        uni.showToast({ title: this.i18n.profile.customLeaveEmpty, icon: 'none' });
        return;
      }
      this.customMarkDateStr = dateStr;
      this.customMarkLeaveId = leaveId;
      // 已有标记就回填原来的半天口径，否则默认整天
      this.customMarkPart = existing ? existing.part : 'full';
      this.showCustomMarkPanel = true;
    },
    pickCustomLeave(l) {
      haptic('light');
      this.customMarkLeaveId = l.id;
    },
    pickCustomPart(part) {
      haptic('light');
      this.customMarkPart = part;
    },
    customMarkChipStyle(l) {
      const on = this.customMarkLeaveId === l.id;
      return {
        background: on ? this.hexToRgba(l.color, 0.14) : '#F3F5F6',
        borderColor: on ? l.color : 'transparent'
      };
    },
    customQuotaText(l) {
      const u = wioService.getCustomLeaveUsage(l.id);
      if (u.unlimited) return this.i18n.profile.customRowUnlimited.replace('{u}', u.used);
      if (l.quotaRule === 'total') return this.i18n.profile.customRowTotal.replace('{u}', u.used);
      return this.i18n.profile.customRowYearly.replace('{q}', u.quota).replace('{u}', u.used);
    },
    applyCustomMark() {
      if (!this.customMarkLeaveId) return;
      const ok = wioService.setCustomMark(this.customMarkDateStr, this.customMarkLeaveId, this.customMarkPart);
      if (!ok) {
        uni.showToast({ title: this.i18n.calendar.customMarkFailed, icon: 'none' });
        return;
      }
      this.showCustomMarkPanel = false;
      this.loadData();
      // 额度用超不拦截，但要说一声——个人记录工具，拦了真实请的假就记不进去
      const u = wioService.getCustomLeaveUsage(this.customMarkLeaveId);
      if (u.over > 0) {
        uni.showToast({
          title: this.i18n.profile.customOver.replace('{n}', u.over),
          icon: 'none',
          duration: 2000
        });
      }
    },
    clearCustomMarkDay() {
      wioService.clearCustomMark(this.customMarkDateStr);
      this.showCustomMarkPanel = false;
      this.loadData();
    },
    openHalfPanel(day, dateStr) {
      const parts = parseDayParts(this.entries[dateStr]);
      this.halfDateStr = dateStr;
      this.halfDayNum = day;
      // 两段都预填当前值；没有记录就给「公司办公」，打开即可直接保存
      this.halfAm = parts.am || parts.pm || 'company';
      this.halfPm = parts.pm || parts.am || 'company';
      this.showHalfPanel = true;
    },
    closeHalfPanel() {
      this.showHalfPanel = false;
    },
    // 面板里两行各自的当前值
    partValue(key) {
      return key === 'am' ? this.halfAm : this.halfPm;
    },
    setHalfPart(key, value) {
      haptic('light');
      if (key === 'am') this.halfAm = value;
      else this.halfPm = value;
    },
    // 常见操作「下午和上午一样」，省一次点击
    copyAmToPm() {
      haptic('light');
      this.halfPm = this.halfAm;
    },
    statusColor(value) {
      return STATUS_COLORS[value] || STATUS_COLORS.default;
    },
    statusLabel(value) {
      if (!value) return '—';
      const item = this.legends.find(i => i.value === value);
      return item ? item.label : value;
    },
    // 选中的 chip 用该状态自己的颜色做浅底 + 描边，比统一的主题色更好认
    halfChipStyle(on, value) {
      if (!on) return {};
      const c = this.statusColor(value);
      return { background: this.hexToRgba(c.color, 0.1), borderColor: c.color };
    },
    applyHalfDay() {
      const am = this.halfAm;
      const pm = this.halfPm;

      if (!wioService.saveDayParts(this.halfDateStr, am, pm)) {
        // 失败的两种可能：假期额度用满，或权益在面板打开期间失效
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
      this.showHalfPanel = false;
      this.loadData();
    },
    clearHalfDay() {
      haptic('medium');
      wioService.saveDayParts(this.halfDateStr, null, null);
      this.showHalfPanel = false;
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
  background: linear-gradient(to bottom right, #C8E6C9 0%, #C8E6C9 50%, #FFE0B2 50%, #FFE0B2 100%);
  border: 1px solid #B0A08A;
}

/* 斜切格子上的那条对角线：光靠渐变在浅色组合下边界发糊，补一根细线 */
.day-split::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(to bottom right, transparent calc(50% - 0.5px), rgba(21, 24, 28, 0.16) calc(50% - 0.5px), rgba(21, 24, 28, 0.16) calc(50% + 0.5px), transparent calc(50% + 0.5px));
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

/* ===== 预览：与日历格子同一套斜切画法 ===== */
.half-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 16px;
  border-radius: 14px;
  background-color: #F7F8F9;
}

.half-preview-cell {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  overflow: hidden;
}

.half-preview-num {
  font-size: 15px;
  font-weight: 600;
}

.half-preview-text {
  flex: 1;
  min-width: 0;
}

.half-preview-line {
  display: block;
  font-size: 12px;
  color: #5A626A;
  line-height: 1.7;
}

/* ===== 上午 / 下午 两段 ===== */
.half-part + .half-part {
  margin-top: 14px;
}

.half-part-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.half-part-title {
  font-size: 12px;
  font-weight: 600;
  color: #15181C;
}

.half-copy {
  padding: 2px 8px;
  border-radius: 8px;
  background-color: #EAF2F0;
}

.half-copy-text {
  font-size: 10px;
  font-weight: 500;
  color: #0E6E62;
}

.half-status-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
}

/* 固定四种状态，做成 2×2 等宽格：比一行塞四个小 chip 更好点，英文也不挤 */
.half-status-item {
  flex: 0 0 calc(50% - 4px);
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  border-radius: 10px;
  background-color: #F7F8F9;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.half-status-item.half-status-on {
  font-weight: 600;
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
  font-size: 12px;
  color: #15181C;
  white-space: nowrap;
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
