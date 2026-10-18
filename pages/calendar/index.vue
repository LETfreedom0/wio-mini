<template>
  <view class="container" @touchmove="onTouchMove" @touchend="onTouchEnd">
    <view class="status-bar-placeholder" :style="{ height: topSafeHeight + 'px' }"></view>

    <view class="page-head">
      <text class="page-title">{{ i18n.calendar.pageTitle }}</text>
      <text class="page-sub">{{ i18n.calendar.pageSub }}</text>
    </view>

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
      <view class="card calendar-card">
        <view class="calendar-header">
          <text class="month-year">{{ monthYearText }}</text>
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
            <view class="day-content" :class="[getDayClass(day), { 'today-highlight': isToday(day) }]">
              <text class="day-number">{{ day }}</text>
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
            <view class="legend-dot" :class="item.color"></view>
            <text class="legend-label">{{ item.label }}</text>
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

    <CustomTabBar current="calendar" />
  </view>
</template>

<script>
import CustomTabBar from '@/components/CustomTabBar.vue'
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'
import { getTopSafeArea } from '@/utils/safeArea.js'

const holidayNameMap = {
  '元旦': 'New Year\'s',
  '春节': 'Spring Fest',
  '清明节': 'Qingming',
  '劳动节': 'Labor Day',
  '端午节': 'Dragon Boat',
  '中秋节': 'Mid-Autumn',
  '国庆节': 'National Day'
};

export default {
  components: {
    CustomTabBar
  },
  data() {
    return {
      currentDate: new Date(),
      topSafeHeight: 0,
      entries: {},
      overtimeEntries: {},
      settings: {},
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
      scrollTimer: null
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
        { label: t('calendar.legends.clear', lang), color: 'dashed', value: 'clear' },
      ];
    },
    monthYearText() {
      if (this.settings.language === 'en-US') {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[this.currentMonth - 1]} ${this.currentYear}`;
      }
      return `${this.currentYear}年${this.currentMonth}月`;
    },
    currentYear() {
      return this.currentDate.getFullYear();
    },
    currentMonth() {
      return this.currentDate.getMonth() + 1;
    },
    daysInMonth() {
      return new Date(this.currentYear, this.currentMonth, 0).getDate();
    },
    startEmptyDays() {
      return new Date(this.currentYear, this.currentMonth - 1, 1).getDay();
    },
    targetPercentage() {
      return this.settings.targetPercentage || 40;
    },
    wioPercentage() {
      const numerator = this.stats.companyDays;
      
      const totalDeductible = this.stats.vacationDays 
                            + this.stats.birthdayDays
                            + this.stats.sickDays 
                            + this.stats.unpaidDays 
                            + this.stats.compOffDays
                            + this.stats.excludeWioDays;
                            
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);

      const denominator = this.stats.workingDays - effectiveDeductible;

      if (denominator <= 0) return 0;
      
      return Math.round((numerator / denominator) * 100);
    },
    filteredLegends() {
      const order = [
        'company', 'home', 'vacation',
        'sick', 'overtime_record', 'public',
        'comp_off', 'unpaid', 'exclude_wio'
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
                            + this.stats.excludeWioDays;
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
  },
  onShow() {
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
      this.yearStats = wioService.getYearStats(new Date().getFullYear());
      this.updateStats();
    },
    updateStats() {
      this.stats = wioService.getMonthStats(this.currentYear, this.currentMonth);
    },
    changeMonth(delta) {
      uni.vibrateShort();
      const newDate = new Date(this.currentDate);
      newDate.setMonth(newDate.getMonth() + delta);
      this.currentDate = newDate;
      this.updateStats();
    },
    isToday(day) {
      const now = new Date();
      return now.getDate() === day && 
             now.getMonth() === this.currentDate.getMonth() && 
             now.getFullYear() === this.currentDate.getFullYear();
    },
    selectLegend(item) {
      uni.vibrateShort({
        success: function () {
            console.log('success');
        }
      });
      
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
      uni.vibrateShort();
      this.selectedStatus = 'birthday';
      uni.showToast({
        title: this.i18n.calendar.clickDateToMark,
        icon: 'none',
        duration: 1500
      });
    },
    onDayClick(day) {
      uni.vibrateShort();
      const currentTime = new Date().getTime();
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (this.lastClickDay === day && (currentTime - this.lastClickTime) < 300) {
        wioService.saveEntry(dateStr, null);
        uni.vibrateShort();
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
        wioService.saveEntry(dateStr, this.selectedStatus);
      }
      
      this.loadData();
    },
    changeOvertime(delta) {
      console.log('changeOvertime called', delta, 'current:', this.overtimeValue);
      let newVal = this.overtimeValue + delta;
      
      if (newVal < 0) newVal = 0;
      if (newVal > 12) newVal = 12;
      
      this.overtimeValue = parseFloat(newVal.toFixed(1));
      console.log('new overtimeValue:', this.overtimeValue);
      
      this.saveOvertime();
      uni.vibrateShort();
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
    getOvertimeDisplay(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const val = this.overtimeEntries[dateStr];
      console.log(`getOvertimeDisplay for ${dateStr}:`, val);
      return val ? `${val}` : '';
    },
    onDayLongPress(day) {
       const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
       wioService.saveEntry(dateStr, null);
       uni.vibrateShort();
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
    hasBirthdayInMonth() {
      const prefix = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`;
      return Object.keys(this.entries).some(key => key.startsWith(prefix) && this.entries[key] === 'birthday');
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #F4F5F6;
  padding-bottom: calc(98px + env(safe-area-inset-bottom));
}

.status-bar-placeholder {
  width: 100%;
}

/* ===== 页头 ===== */
.page-head {
  padding: 6px 20px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.35;
}

.page-sub {
  font-size: 12px;
  color: #6B737B;
  line-height: 1.4;
}

.content {
  padding: 0 20px;
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

.month-year {
  font-size: 18px;
  font-weight: bold;
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

.today-highlight:not(.company-office):not(.home-office):not(.status-vacation):not(.status-comp-off):not(.status-sick):not(.status-unpaid):not(.status-public) {
  background-color: #E3F2FD;
  color: #1976D2;
  border: 2px solid #1976D2;
  border-radius: 12px;
}

.today-highlight.company-office,
.today-highlight.home-office,
.today-highlight.status-vacation,
.today-highlight.status-birthday,
.today-highlight.status-comp-off,
.today-highlight.status-sick,
.today-highlight.status-unpaid,
.today-highlight.status-public {
  border: 3px solid #1976D2;
  border-radius: 12px;
  box-shadow: 0 0 8px rgba(25, 118, 210, 0.3);
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
</style>
