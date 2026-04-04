<template>
  <scroll-view scroll-y="true" class="profile-scroll">
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
        language: 'zh-CN'
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      holidayList: [] // 完整节日列表
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN'];
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
  --w-toggle-switch: 120px;
  --w-h-toggle-circle: 28px;
  --pd-toggle-switch: 0.4rem;
  height: 44px;
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

</style>