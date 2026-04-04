<template>
  <view class="container">
    <CustomHeader />
    
    <view class="content">


      <!-- Monthly Stats Card -->
      <view class="card stats-card" :class="{ 'warning-border': wioPercentage < targetPercentage, 'success-border': wioPercentage >= targetPercentage }">
        <view class="card-header">
          <view class="card-title-row">
            <text class="card-title">月度 WIO</text>
            <view v-if="stats.totalOvertime > 0" class="tag overtime-tag">OT {{ stats.totalOvertime }}h</view>
          </view>
          <text class="percentage" :class="{ 'red-text': wioPercentage < targetPercentage, 'green-text': wioPercentage >= targetPercentage }">
            {{ wioPercentage }}%
          </text>
        </view>
        
        <text class="target-text">目标: {{ targetPercentage }}%</text>
        
        <view class="progress-bar">
          <view class="progress-fill" 
            :style="{ width: Math.min(wioPercentage, 100) + '%', backgroundColor: wioPercentage >= targetPercentage ? '#4CAF50' : '#D32F2F' }">
          </view>
        </view>
        
        <text class="warning-text" v-if="wioPercentage < targetPercentage">您的WIO百分比低于目标。</text>
        <text class="success-text" v-else>您已达到WIO目标！</text>
      </view>

      <!-- Calendar Card -->
      <view class="card calendar-card">
        <view class="calendar-header">
          <text class="month-year">{{ currentYear }}年{{ currentMonth }}月</text>
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
          <text v-for="day in weekdays" :key="day" class="weekday">{{ day }}</text>
        </view>

        <view class="days-grid">
          <!-- Empty slots for days before 1st of month -->
          <view v-for="n in startEmptyDays" :key="'empty-'+n" class="day-cell empty"></view>
          
          <!-- Days -->
          <view v-for="day in daysInMonth" :key="day" class="day-cell" @click="onDayClick(day)" @longpress="onDayLongPress(day)">
            <view class="day-content" :class="[getDayClass(day), { 'today-highlight': isToday(day) }]">
              <text class="day-number">{{ day }}</text>
              <view v-if="getOvertimeDisplay(day)" class="overtime-badge">{{ getOvertimeDisplay(day) }}</view>
              <text v-if="getHolidayName(day)" class="holiday-text" :class="{'text-work': isHolidayWork(day)}">{{ getHolidayName(day) }}</text>
              <view v-if="isHolidayWork(day)" class="work-badge">班</view>
            </view>
          </view>
        </view>
      </view>

      <!-- Clear Modal (Simple simulation or just toast/confirm?) 
           Actually, double click is hard to detect natively in some frameworks without a library,
           but 'longpress' is standard. User asked for "Double Click", but on mobile/touch, 
           longpress is often better or we can implement a custom double tap.
           Let's try to implement a simple double tap logic in onDayClick or just use longpress as alternative if double tap is tricky.
           Wait, standard uniapp/vue has no @dblclick for mobile easily.
           Let's implement manual double tap detection.
      -->

      <!-- Legend Card -->
      <view class="card legend-card">
        <view class="legend-header">
          <text class="legend-title">图例 (点击选择后标记日历)</text>
          <view class="clear-btn-header" @click="selectLegend({ value: 'clear' })" :class="{ active: selectedStatus === 'clear' }">
            <view class="legend-dot dashed"></view>
            <text class="legend-label">清除</text>
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
    
    <!-- Overtime Modal - Moved outside .content to avoid stacking context issues -->
    <view class="modal-overlay" v-if="showOvertimeModal" @click="closeOvertimeModal">
      <view class="modal-content" @click.stop>
        <view class="modal-close-btn" @click="closeOvertimeModal">×</view>
        <view class="modal-header">
          <text class="modal-title">加班时长</text>
          <text class="modal-subtitle">{{ currentOvertimeDateStr }}</text>
        </view>
        
        <view class="stepper-container">
          <view class="stepper-btn minus" @click="changeOvertime(-0.5)" :class="{ disabled: overtimeValue <= 0 }">
            <text class="stepper-icon">-</text>
          </view>
          <view class="stepper-value">
            <text class="value-text">{{ overtimeValue }}</text>
            <text class="unit-text">小时</text>
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
import CustomHeader from '@/components/CustomHeader.vue'
import CustomTabBar from '@/components/CustomTabBar.vue'
import wioService from '@/utils/wioService.js'

export default {
  components: {
    CustomHeader,
    CustomTabBar
  },
  data() {
    return {
      weekdays: ['日', '一', '二', '三', '四', '五', '六'],
      legends: [
        { label: '公司办公', color: 'green', value: 'company' },
        { label: '居家办公', color: 'blue', value: 'home' },
        { label: '休年假', color: 'orange', value: 'vacation' },
        { label: '调休', color: 'cyan', value: 'comp_off' },
        { label: '休病假', color: 'purple', value: 'sick' },
        { label: '无薪假', color: 'gray', value: 'unpaid' },
        { label: '公共假期', color: 'red', value: 'public' },
        { label: '记录加班', color: 'purple-ot', value: 'overtime_record' },
        { label: '不统计WIO', color: 'exclude', value: 'exclude_wio' },
        { label: '清除', color: 'dashed', value: 'clear' },
      ],
      currentDate: new Date(),
      entries: {},
      overtimeEntries: {}, // New: Store overtime data
      settings: {},
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
      
      // Overtime Modal
      showOvertimeModal: false,
      overtimeValue: 0,
      currentOvertimeDateStr: ''
    }
  },
  computed: {
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
      // WIO = Days in Office / (Total Working Days - Annual Leave - Sick Leave - Unpaid Leave - Compensatory Leave - Excluded Days)
      // Note: workingDays already excludes weekends and public holidays based on isOfficialWorkingDay logic.
      
      const numerator = this.stats.companyDays;
      
      // Calculate total deductible days from the stats
      const totalDeductible = this.stats.vacationDays 
                            + this.stats.sickDays 
                            + this.stats.unpaidDays 
                            + this.stats.compOffDays
                            + this.stats.excludeWioDays;
                            
      // We must add back any leaves that occurred on weekends/holidays (stats.weekendLeaves)
      // because they were counted in the totals above, but should NOT reduce the denominator
      // (since workingDays didn't include them in the first place).
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);

      const denominator = this.stats.workingDays - effectiveDeductible;

      if (denominator <= 0) return 0;
      
      return Math.round((numerator / denominator) * 100);
    },
    filteredLegends() {
      // User specified order:
      // Row 1: Company, Home, Vacation
      // Row 2: Sick, OT, Public
      // Row 3: Comp Off, Unpaid, Exclude
      const order = [
        'company', 'home', 'vacation',
        'sick', 'overtime_record', 'public',
        'comp_off', 'unpaid', 'exclude_wio'
      ];
      
      return order.map(key => this.legends.find(item => item.value === key)).filter(Boolean);
    }
  },
  onShareAppMessage(res) {
    const title = `本月回公司率: ${this.wioPercentage}% - WIO 达标了吗`;
    return {
      title: title,
      path: '/pages/index/index'
    }
  },
  onShareTimeline(res) {
    const title = `本月回公司率: ${this.wioPercentage}% - WIO 达标了吗`;
    return {
      title: title
    }
  },
  onShow() {
    this.loadData();
  },
  methods: {
    loadData() {
      this.settings = wioService.getSettings();
      this.entries = wioService.getEntries();
      this.overtimeEntries = wioService.getOvertimeEntries();
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
      // Add haptic feedback
      uni.vibrateShort({
        success: function () {
            console.log('success');
        }
      });
      
      this.selectedStatus = item.value;
      if (item.value === 'clear') {
        uni.showToast({
            title: '请点击日期清除状态',
            icon: 'none',
            duration: 1500
        });
      }
    },
    onDayClick(day) {
      // 震动反馈
      uni.vibrateShort();

      const currentTime = new Date().getTime();
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Double click detection (within 300ms)
      if (this.lastClickDay === day && (currentTime - this.lastClickTime) < 300) {
        // Double click detected: Clear status
        wioService.saveEntry(dateStr, null);
        uni.vibrateShort(); // Feedback
        this.loadData();
        this.lastClickTime = 0;
        this.lastClickDay = null;
        return;
      }

      // Update last click info
      this.lastClickTime = currentTime;
      this.lastClickDay = day;

      if (!this.selectedStatus) {
        // Optional: show detail or do nothing
        return;
      }

      if (this.selectedStatus === 'clear') {
        wioService.saveEntry(dateStr, null);
      } else if (this.selectedStatus === 'overtime_record') {
        console.log('Opening overtime modal for', dateStr);
        
        // Open Overtime Modal
        this.currentOvertimeDateStr = dateStr;
        try {
          const existing = wioService.getOvertimeForDate(dateStr);
          this.overtimeValue = existing > 0 ? parseFloat(existing) : 0;
        } catch (e) {
          console.error('Error getting existing overtime:', e);
          this.overtimeValue = 0;
        }
        this.showOvertimeModal = true;
        // Force update just in case
        this.$forceUpdate(); 
        console.log('Modal state set to true');
        return; // Don't reload data yet, wait for modal save
      } else {
        wioService.saveEntry(dateStr, this.selectedStatus);
      }
      
      // Refresh local data
      this.loadData();
    },
    changeOvertime(delta) {
      console.log('changeOvertime called', delta, 'current:', this.overtimeValue);
      let newVal = this.overtimeValue + delta;
      
      // Constraints
      if (newVal < 0) newVal = 0;
      if (newVal > 12) newVal = 12;
      
      this.overtimeValue = parseFloat(newVal.toFixed(1)); // Fix float precision
      console.log('new overtimeValue:', this.overtimeValue);
      
      // Auto save on change
      this.saveOvertime();
      uni.vibrateShort();
    },
    saveOvertime() {
      const hours = this.overtimeValue;
      if (hours > 0) {
        wioService.saveOvertimeEntry(this.currentOvertimeDateStr, hours);
      } else {
        // If 0, remove entry
        wioService.saveOvertimeEntry(this.currentOvertimeDateStr, 0);
      }
      // Force update data to reflect changes immediately
      // Using Object.assign to trigger reactivity or re-assigning the whole object
      this.entries = wioService.getEntries();
      this.overtimeEntries = { ...wioService.getOvertimeEntries() }; // Create new reference
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
       // Alternative: Long press to clear
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
    isHolidayWork(day) {
      const info = this.getHolidayInfo(day);
      return info ? !info.isOffDay : false;
    },
    getDayClass(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const status = this.entries[dateStr];
      
      // Removed direct 'today' return to allow status colors to show underneath
      // if (this.isToday(day)) return 'today';

      if (status === 'company') return 'company-office';
      if (status === 'home') return 'home-office';
      if (status === 'vacation') return 'status-vacation';
      if (status === 'comp_off') return 'status-comp-off';
      if (status === 'sick') return 'status-sick';
      if (status === 'unpaid') return 'status-unpaid';
      if (status === 'public') return 'status-public';
      if (status === 'exclude_wio') return 'status-exclude-wio';
      
      // Check for public holiday if no manual status
      if (!status) {
        const holiday = this.getHolidayInfo(day);
        if (holiday && holiday.isOffDay) {
          return 'status-public';
        }
      }
      
      // Simple logic for weekends (if no status)
      const dayOfWeek = new Date(this.currentYear, this.currentMonth - 1, day).getDay();
      if ((dayOfWeek === 0 || dayOfWeek === 6) && !status) {
         // return 'public-holiday'; // Maybe don't mark weekends as holiday by default unless specified
      }

      return '';
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #F8F9FA;
  padding-bottom: calc(20px + 50px + env(safe-area-inset-bottom)); /* 20px padding + 50px tabbar + safe area */
}

.content {
  padding: 15px;
}



.card {
  background-color: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 15px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  border: 1px solid #eee;
}

/* Stats Card - More Compact */
.stats-card {
  border: 1px solid #eee;
  padding: 10px 12px; /* Reduced padding */
}

.stats-card.warning-border {
  border: 1px solid #FFCDD2;
  background-color: #FFEBEE;
}

.stats-card.success-border {
  border: 1px solid #C8E6C9;
  background-color: #F1F8E9;
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
  background-color: #EDE7F6; /* Deep Purple 50 */
  color: #673AB7; /* Deep Purple 500 */
  border: 1px solid #D1C4E9;
  font-weight: 600;
}

.tag.purple { background-color: #F3E5F5; color: #7B1FA2; }
.tag.blue { background-color: #E3F2FD; color: #1976D2; }

.percentage {
  font-size: 32px;
  font-weight: bold;
}

.percentage.red-text { color: #D32F2F; }
.percentage.green-text { color: #4CAF50; }

.target-text {
  font-size: 11px;
  color: #666;
  display: block;
  margin-bottom: 4px;
}

.progress-bar {
  height: 6px;
  background-color: #E0E0E0;
  border-radius: 3px;
  margin-bottom: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s;
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

/* Calendar Card */
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
  height: 48px; /* Increased from 40px */
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 5px;
}

.day-content {
  width: 42px; /* Increased from 36px */
  height: 42px; /* Increased from 36px */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 10px; /* Increased radius */
  font-size: 16px; /* Increased from 14px */
  color: #333;
  transition: all 0.2s; /* Smooth press effect */
  position: relative;
}

.day-number {
  line-height: 1;
}

.holiday-text {
  font-size: 8px;
  line-height: 1;
  margin-top: 2px;
  color: #c62828; /* Default red for holiday name */
}

.holiday-text.text-work {
  color: #333; /* Dark color for work day holiday name */
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

/* Day Classes */
.public-holiday { background-color: #FFCDD2; color: #C62828; }
.home-office { background-color: #BBDEFB; color: #1565C0; }
.company-office { background-color: #C8E6C9; color: #2E7D32; }

/* Today Highlight Style */
.today-highlight {
  position: relative;
  font-weight: bold;
}

/* Add a blue dot indicator for Today */
.today-highlight::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 4px;
  height: 4px;
  background-color: #1976D2;
  border-radius: 50%;
}

/* If no status background, give today a subtle blue background */
.today-highlight:not(.company-office):not(.home-office):not(.status-vacation):not(.status-comp-off):not(.status-sick):not(.status-unpaid):not(.status-public) {
  background-color: #E3F2FD;
  color: #1976D2;
  border: 1px solid #1976D2;
}

/* If it HAS a status background, add a blue border to indicate today */
.today-highlight.company-office,
.today-highlight.home-office,
.today-highlight.status-vacation,
.today-highlight.status-comp-off,
.today-highlight.status-sick,
.today-highlight.status-unpaid,
.today-highlight.status-public {
  border: 2px solid #1976D2; /* Stronger border for visibility */
}

/* Remove old today styles */
/* .today {
  border: 1px solid #1976D2;
  color: #1976D2;
}

.today-text {
  font-size: 12px;
  color: #1976D2;
  border: 1px solid #1976D2;
  border-radius: 12px;
  padding: 2px 6px;
  width: auto;
  height: auto;
} */

/* Legend Card */
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

.legend-item {
  width: calc(33.33% - 5px); /* 3 columns */
  display: flex;
  flex-direction: row; /* Horizontal layout: dot left, text right */
  align-items: center;
  justify-content: center;
  padding: 4px 2px; /* Even smaller vertical padding */
  background-color: #F5F7FA;
  border: 1px solid #EAEAEA;
  border-radius: 6px;
  box-sizing: border-box;
  transition: all 0.2s ease;
  height: 28px; /* Fixed small height */
}

/* Highlight Primary Items (First 6 items - first 2 rows) */
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
  margin-right: 4px; /* Space between dot and text */
  margin-bottom: 0; /* No bottom margin */
  flex-shrink: 0;
}

.legend-label {
  font-size: 10px; 
  color: #666; 
  font-weight: 500;
  text-align: left; /* Align left */
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
  padding: 2px 4px 2px 2px; /* Top Right Bottom Left */
  border-radius: 10px 0 6px 0; /* TopLeft TopRight BottomRight BottomLeft - Curve top-left and bottom-right for a smooth corner look */
  z-index: 2;
  font-weight: bold;
  line-height: 1;
}

/* Modal Styles */
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
  z-index: 9999; /* Increased z-index */
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

/* Stepper Styles */
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

.modal-actions.single-action {
  justify-content: center;
}

.modal-actions.single-action .modal-btn {
  flex: none;
  width: 100%;
}

.modal-btn {
  flex: 1;
  height: 40px;
  line-height: 40px;
  text-align: center;
  border-radius: 8px;
  font-size: 16px;
  margin: 0 5px;
}

.modal-btn.cancel {
  background-color: #f5f5f5;
  color: #666;
}

.modal-btn.confirm {
  background-color: #007AFF;
  color: #fff;
}

.legend-item.active {
  background-color: #FFFFFF;
  border-radius: 8px;
  border: 1px solid #007AFF; /* Ensure border exists */
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.15);
  position: relative;
  z-index: 1;
}

/* Additional Status Classes */
.status-vacation { background-color: #FFE0B2; color: #EF6C00; }
.status-comp-off { background-color: #B2EBF2; color: #006064; }
.status-sick { background-color: #E1BEE7; color: #4A148C; }
.status-unpaid { background-color: #F5F5F5; color: #616161; border: 1px dashed #9E9E9E; }
.status-public { background-color: #FFCDD2; color: #B71C1C; }
.status-exclude-wio { background-color: #ECEFF1; color: #607D8B; border: 1px dashed #90A4AE; }
</style>