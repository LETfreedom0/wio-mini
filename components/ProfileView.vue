<template>
  <scroll-view scroll-y="true" class="profile-scroll" @scroll="onScroll" @touchmove="onTouchMove" @touchend="onTouchEnd">
    <view class="content">
      
      <!-- Language Settings Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">{{ i18n.profile.language }}</text>
        </view>
        <view class="language-toggle-container">
          <text class="card-desc language-desc">{{ i18n.profile.languageDesc }}</text>
          <view 
            class="toggle"
            :class="{ 'active': settings.language === 'en-US' }"
            @click="toggleLanguage"
          >
            <text class="toggle-text">中文</text>
            <view class="toggle__switch">
              <view class="toggle__circle"></view>
            </view>
            <text class="toggle-text">English</text>
          </view>
        </view>
      </view>
      
      <!-- WIO Target Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">{{ i18n.profile.wioTarget }}</text>
          <text class="card-value blue">{{ settings.targetPercentage }}%</text>
        </view>
        <view class="slider-container">
           <slider 
             :value="settings.targetPercentage" 
             @change="onSliderChange($event, 'targetPercentage')" 
             @changing="onSliderChanging($event, 'targetPercentage')"
             min="0" max="100" step="10" activeColor="#007AFF" backgroundColor="#E3F2FD" block-size="24" block-color="#fff" />
        </view>
        <text class="card-desc">{{ i18n.profile.wioTargetDesc }}</text>
      </view>

      <!-- Vacation Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">{{ i18n.profile.vacationDays }}</text>
          <view class="value-group">
            <text class="card-value orange">{{ settings.vacationDays }} {{ i18n.common.days }}</text>
            <text class="balance-sub">{{ i18n.common.remaining }} {{ settings.vacationDays - yearStats.vacationDaysUsed }} {{ i18n.common.days }}</text>
          </view>
        </view>
        <view class="slider-container">
           <slider 
             :value="settings.vacationDays" 
             @change="onSliderChange($event, 'vacationDays')" 
             @changing="onSliderChanging($event, 'vacationDays')"
             min="0" max="30" activeColor="#FF9800" backgroundColor="#FFF3E0" block-size="24" block-color="#fff" />
        </view>
        <view class="usage-bar">
          <view class="usage-fill orange-bg" :style="{ width: getUsagePercentage(yearStats.vacationDaysUsed, settings.vacationDays) + '%' }"></view>
        </view>
        <text class="card-desc">{{ i18n.common.used }} {{ yearStats.vacationDaysUsed }} {{ i18n.common.days }}</text>
      </view>

      <!-- Sick Leave Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">{{ i18n.profile.sickDays }}</text>
          <view class="value-group">
            <text class="card-value purple">{{ settings.sickDays }} {{ i18n.common.days }}</text>
            <text class="balance-sub">{{ i18n.common.remaining }} {{ settings.sickDays - yearStats.sickDaysUsed }} {{ i18n.common.days }}</text>
          </view>
        </view>
        <view class="slider-container">
           <slider 
             :value="settings.sickDays" 
             @change="onSliderChange($event, 'sickDays')" 
             @changing="onSliderChanging($event, 'sickDays')"
             min="0" max="30" activeColor="#9C27B0" backgroundColor="#F3E5F5" block-size="24" block-color="#fff" />
        </view>
        <view class="usage-bar">
          <view class="usage-fill purple-bg" :style="{ width: getUsagePercentage(yearStats.sickDaysUsed, settings.sickDays) + '%' }"></view>
        </view>
        <text class="card-desc">{{ i18n.common.used }} {{ yearStats.sickDaysUsed }} {{ i18n.common.days }}</text>
      </view>

      <!-- Birthday Leave Card -->
      <view class="settings-card birthday-card">
        <view class="card-header">
          <text class="card-title">{{ i18n.profile.birthdayLeave }}</text>
          <view class="toggle-switch" @click="toggleBirthdayEnabled">
            <view class="switch-track" :class="{ 'on': settings.birthdayEnabled }">
              <view class="switch-thumb"></view>
            </view>
          </view>
        </view>
        <text class="card-desc">{{ i18n.profile.birthdayLeaveDesc }}</text>

        <view v-if="settings.birthdayEnabled" class="birthday-config">
          <view class="month-options">
            <view
              v-for="month in monthOptions"
              :key="month.value"
              class="month-option"
              :class="{ active: settings.birthdayMonth === month.value }"
              @click="selectBirthdayMonth(month.value)"
            >
              <text class="month-text">{{ month.label }}</text>
            </view>
          </view>
        </view>
        <view v-else class="birthday-disabled-hint">
          <text class="hint-text">{{ i18n.profile.birthdayEnableHint }}</text>
        </view>
      </view>

      <!-- Comp Off Settings Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">{{ i18n.profile.compOffSettings }}</text>
        </view>
        
        <text class="section-hint">{{ i18n.profile.compOffHint }}</text>

        <scroll-view class="holiday-scroll" scroll-x="true" show-scrollbar="false">
          <view class="holiday-row">
            <view 
              class="holiday-item" 
              v-for="item in holidayList" 
              :key="item.name"
              :class="{ 'active-comp-off': getCompOffStatus(item.name), disabled: !item.hasCompOff, 'english': settings.language === 'en-US' }"
              @click="toggleCompOff(item)"
            >
              <text class="holiday-name">{{ getHolidayName(item) }}</text>
              <view class="holiday-status-icon" v-if="getCompOffStatus(item.name)">✓</view>
              <text class="no-comp-off-text" v-if="!item.hasCompOff">{{ i18n.profile.noCompOff }}</text>
            </view>
          </view>
        </scroll-view>
        
        <view v-if="holidayList.length === 0" class="empty-hint">
            <text>{{ i18n.profile.noHoliday }}</text>
        </view>
      </view>

    </view>
  </scroll-view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'

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
  name: 'ProfileView',
  data() {
    return {
      settings: {
        username: '',
        targetPercentage: 40,
        vacationDays: 20,
        sickDays: 12,
        language: 'zh-CN',
        birthdayEnabled: false,
        birthdayMonth: ''
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      holidayList: [], // 完整节日列表
      lastNx: 0,
      months: [
        { value: '01', label: '1月', labelEn: 'Jan' },
        { value: '02', label: '2月', labelEn: 'Feb' },
        { value: '03', label: '3月', labelEn: 'Mar' },
        { value: '04', label: '4月', labelEn: 'Apr' },
        { value: '05', label: '5月', labelEn: 'May' },
        { value: '06', label: '6月', labelEn: 'Jun' },
        { value: '07', label: '7月', labelEn: 'Jul' },
        { value: '08', label: '8月', labelEn: 'Aug' },
        { value: '09', label: '9月', labelEn: 'Sep' },
        { value: '10', label: '10月', labelEn: 'Oct' },
        { value: '11', label: '11月', labelEn: 'Nov' },
        { value: '12', label: '12月', labelEn: 'Dec' }
      ]
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN'];
    },
    monthOptions() {
      const isEn = this.settings.language === 'en-US';
      return this.months.map(m => ({
        value: m.value,
        label: isEn ? m.labelEn : m.label
      }));
    }
  },
  mounted() {
    this.loadSettings();
    this.holidayList = wioService.getHolidayInfoList();
  },
  onShow() {
    this.loadSettings();
  },
  methods: {
    onScroll(e) {
      // 滚动位置映射为垂直视线：顶部=向上看，下滑=向下看
      const ny = Math.max(-1, Math.min(1, e.detail.scrollTop / 400));
      uni.$emit('wio-gaze', { nx: this.lastNx, ny, active: true });
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => {
        uni.$emit('wio-gaze', { nx: 0, ny: 0, active: false });
      }, 300);
    },
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const w = uni.getSystemInfoSync().windowWidth;
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)));
      }
    },
    onTouchEnd() {
      setTimeout(() => { this.lastNx = 0; }, 600);
    },
    loadSettings() {
      this.settings = wioService.getSettings();
      if (!this.settings.compOffRules) {
          this.settings.compOffRules = { '春节': true };
      }
      if (!this.settings.language) {
          this.settings.language = 'zh-CN';
      }
      const currentYear = new Date().getFullYear();
      this.yearStats = wioService.getYearStats(currentYear);
    },
    getUsagePercentage(used, total) {
      if (!total || total === 0) return 0;
      return Math.min(100, Math.round((used / total) * 100));
    },
    getCompOffStatus(name) {
        return !!this.settings.compOffRules[name];
    },
    getHolidayName(item) {
      if (this.settings.language === 'en-US') {
        return holidayNameMap[item.name] || item.name;
      }
      return item.name;
    },
    toggleCompOff(item) {
        if (!item.hasCompOff) {
            return;
        }
        const name = item.name;
        const current = this.getCompOffStatus(name);
        this.settings.compOffRules[name] = !current;
        uni.vibrateShort();
        this.save();
    },
    setLanguage(lang) {
      this.settings.language = lang;
      uni.vibrateShort();
      this.save();
    },
    toggleLanguage() {
      const newLang = this.settings.language === 'zh-CN' ? 'en-US' : 'zh-CN';
      this.setLanguage(newLang);
    },
    toggleBirthdayEnabled() {
      this.settings.birthdayEnabled = !this.settings.birthdayEnabled;
      if (!this.settings.birthdayEnabled) {
        this.settings.birthdayMonth = '';
      }
      uni.vibrateShort();
      this.save();
    },
    selectBirthdayMonth(value) {
      this.settings.birthdayMonth = value;
      uni.vibrateShort();
      this.save();
    },
    onSliderChange(e, key) {
      this.settings[key] = e.detail.value;
      this.save();
    },
    onSliderChanging(e, key) {
      this.settings[key] = e.detail.value;
      uni.vibrateShort(); 
    },
    save() {
      wioService.saveSettings(this.settings);
      uni.showToast({
        title: t('profile.saved', this.settings.language),
        icon: 'none'
      });
    }
  }
}
</script>

<style scoped>
.profile-scroll {
  height: 100%;
}

.content {
  padding: 15px; /* 减少页面边距 */
  padding-bottom: 50px;
}

.settings-card {
  background-color: #fff;
  border-radius: 12px; /* 减小圆角 */
  padding: 15px; /* 减少卡片内边距 */
  margin-bottom: 15px; /* 减少卡片间距 */
  box-shadow: 0 2px 8px rgba(0,0,0,0.05); /* 减弱阴影 */
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px; /* 减少标题下边距 */
}

.card-title {
  font-size: 16px; /* 减小标题字号 */
  font-weight: bold;
  color: #333;
}

.card-value {
  font-size: 18px; /* 减小数值字号 */
  font-weight: 800;
}

.card-value.blue { color: #007AFF; }
.card-value.orange { color: #FF9800; }
.card-value.purple { color: #9C27B0; }
.card-value.red { color: #F44336; }

.slider-container {
  margin-bottom: 10px;
}

slider {
  margin: 0;
}

.card-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
}

.value-group {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.balance-sub {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.usage-bar {
  height: 4px;
  background-color: #F5F5F5;
  border-radius: 2px;
  margin-bottom: 8px;
  overflow: hidden;
}

.usage-fill {
  height: 100%;
  border-radius: 2px;
}

.usage-fill.orange-bg { background-color: #FF9800; }
.usage-fill.purple-bg { background-color: #9C27B0; }

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
}

.switch-label-group {
  display: flex;
  flex-direction: column;
}

.switch-label {
  font-size: 16px;
  color: #333;
  margin-bottom: 4px;
}

.section-hint {
  font-size: 11px; /* 减小提示文字 */
  color: #999;
  margin-bottom: 10px; /* 减少间距 */
  display: block;
}

.holiday-scroll {
  width: 100%;
  white-space: nowrap;
}

.holiday-row {
  display: flex;
  flex-direction: row;
  padding-bottom: 4px; /* 防止滚动条遮挡 */
}

.holiday-item {
  flex: 0 0 80px; /* 固定宽度，不随父容器伸缩 */
  height: 44px; 
  display: flex;
  flex-direction: column; 
  align-items: center;
  justify-content: center;
  background-color: #F5F7FA;
  border-radius: 6px; 
  border: 1px solid #EAEAEA;
  position: relative;
  transition: all 0.2s ease;
  box-sizing: border-box;
  padding: 2px;
  margin-right: 8px; /* 卡片之间的间距 */
}

/* 最后一个元素不需要右边距 */
.holiday-item:last-child {
  margin-right: 0;
}

.holiday-item:active {
  transform: scale(0.96);
}

/* English holiday item optimization */
.holiday-item.english {
  flex: 0 0 70px; /* Slightly narrower for English */
}

.holiday-item.english .holiday-name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.1;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.holiday-item.active-comp-off {
  background-color: #E3F2FD; /* Light Blue */
  border-color: #007AFF;
  color: #007AFF;
  font-weight: 600;
}

.holiday-item.active-comp-off .holiday-name {
  color: #007AFF;
}

.holiday-item.disabled {
  opacity: 0.6;
  background-color: #f9f9f9;
  border-color: #eee;
  color: #aaa;
}

.holiday-name {
  font-size: 12px;
  line-height: 1.1;
  text-align: center;
  color: #333;
}

.no-comp-off-text {
  position: static;
  margin-top: 1px;
  font-size: 9px;
  color: #ccc;
  line-height: 1;
}

.holiday-status-icon {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 10px;
  color: #007AFF;
  line-height: 1;
}

.empty-hint {
    padding: 20px 0;
    text-align: center;
    color: #ccc;
    font-size: 14px;
}

.language-toggle-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  gap: 15px;
  padding: 12px;
  background-color: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.language-desc {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

.toggle-checkbox {
  display: none;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 12px;
  color: #666;
}

.toggle-text {
  min-width: 45px;
  text-align: center;
  transition: color 0.3s ease;
  line-height: 1;
}

.toggle:not(.active) .toggle-text:first-child {
  color: hsl(119, 84%, 10%);
  font-weight: 600;
}

.toggle:not(.active) .toggle-text:last-child {
  color: #999;
}

.toggle.active .toggle-text:first-child {
  color: #999;
}

.toggle.active .toggle-text:last-child {
  color: hsl(119, 84%, 10%);
  font-weight: 600;
}

.toggle__switch {
  --bg-toggle: hsl(0, 0%, 95%);
  --bg-circle: hsl(119, 84%, 10%);
  --w-toggle-switch: 70px;
  --w-h-toggle-circle: 16px;
  --pd-toggle-switch: 0.3rem;
  height: 24px;
  width: var(--w-toggle-switch);
  background-color: var(--bg-toggle);
  border-radius: 4rem;
  display: flex;
  align-items: center;
  padding: 0 var(--pd-toggle-switch);
  cursor: pointer;
  transition: background-color 500ms;
  border: 1px solid #e0e0e0;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
}

.toggle__circle {
  width: var(--w-h-toggle-circle);
  height: var(--w-h-toggle-circle);
  background-color: var(--bg-circle);
  border-radius: 50%;
  transition: margin 400ms ease-in-out, background-color 1000ms;
}

.toggle.active .toggle__circle {
  margin-left: calc(var(--w-toggle-switch) - (var(--pd-toggle-switch) * 2) - var(--w-h-toggle-circle));
}

.toggle.active .toggle__switch {
  --bg-toggle: hsl(119, 84%, 10%);
  --bg-circle: hsl(0, 0%, 96%);
  box-shadow: 0 .3rem 5rem 0 hsla(96, 85%, 34%, 30%);
  border-color: hsl(119, 84%, 10%);
}

/* Birthday Leave Card */
.birthday-card {
  border: 1px solid #FFCDD2;
}

.toggle-switch {
  cursor: pointer;
}

.switch-track {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background-color: #ccc;
  position: relative;
  transition: background-color 0.3s;
}

.switch-track.on {
  background-color: #FF9800;
}

.switch-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #fff;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: left 0.3s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.switch-track.on .switch-thumb {
  left: 22px;
}

.birthday-config {
  margin-top: 12px;
}

.month-options {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.month-option {
  padding: 6px 4px;
  background-color: #F5F7FA;
  border-radius: 6px;
  border: 1px solid #EAEAEA;
  transition: all 0.2s;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
}

.month-option.active {
  background-color: #FFF3E0;
  border-color: #FF9800;
  color: #FF9800;
  font-weight: 600;
}

.month-option:active {
  transform: scale(0.96);
}

.month-text {
  font-size: 13px;
  color: #333;
  font-weight: 500;
  white-space: nowrap;
}

.month-option.active .month-text {
  color: #FF9800;
}

.birthday-disabled-hint {
  margin-top: 10px;
  padding: 10px;
  background-color: #FFF8E1;
  border-radius: 6px;
  text-align: center;
}

.hint-text {
  font-size: 13px;
  color: #FF9800;
  font-weight: 500;
}

</style>