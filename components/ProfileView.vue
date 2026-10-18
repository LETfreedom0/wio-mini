<template>
  <view class="profile-root">
    <scroll-view scroll-y="true" class="profile-scroll" @scroll="onScroll" @touchmove="onTouchMove" @touchend="onTouchEnd">
    <view class="content">

      <!-- 月度回公司目标 -->
      <view class="settings-card">
        <view class="target-row">
          <view class="target-labels">
            <text class="card-title">{{ i18n.profile.wioTarget }}</text>
            <text class="card-hint">{{ i18n.profile.wioTargetHint }}</text>
          </view>
          <text class="target-value">{{ settings.targetPercentage }}%</text>
        </view>
        <view class="slider-wrap target-slider">
          <slider
            :value="settings.targetPercentage"
            @change="onSliderChange($event, 'targetPercentage')"
            @changing="onSliderChanging($event, 'targetPercentage')"
            min="0" max="100" step="10" activeColor="#0E6E62" backgroundColor="#ECEEEF" block-size="18" block-color="#ffffff" />
        </view>
        <view class="tick-row">
          <text v-for="tick in targetTicks" :key="tick" class="tick-text" :class="{ 'tick-active': settings.targetPercentage === tick }">{{ tick }}%</text>
        </view>
      </view>

      <!-- 生日假 -->
      <view class="settings-card">
        <view class="card-header-row">
          <text class="card-title">{{ i18n.profile.birthdayLeave }}</text>
          <view class="header-actions">
            <view class="info-btn" @click="showBirthdaySheet = true">
              <text class="info-icon">i</text>
            </view>
            <view class="toggle-switch" @click="toggleBirthdayEnabled">
              <view class="switch-track" :class="{ 'on': settings.birthdayEnabled }">
                <view class="switch-thumb"></view>
              </view>
            </view>
          </view>
        </view>

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
          <text class="card-foot-hint">{{ i18n.profile.birthdayCardHint }}</text>
        </view>
        <view v-else class="birthday-disabled-hint">
          <text class="hint-text">{{ i18n.profile.birthdayEnableHint }}</text>
        </view>
      </view>

      <!-- 假期额度（年假 + 病假合并卡） -->
      <view class="settings-card">
        <view class="card-header-row">
          <text class="card-title">{{ i18n.profile.leaveCard }}</text>
          <text class="header-hint">{{ i18n.profile.leaveResetHint }}</text>
        </view>

        <!-- 年假 -->
        <view class="quota-block">
          <view class="quota-row">
            <text class="quota-label">{{ i18n.profile.vacationDays }}</text>
            <view class="quota-values">
              <text class="quota-value vacation-color">{{ settings.vacationDays }} {{ i18n.profile.quotaUnit }}</text>
              <text class="quota-sub">{{ remainUsedText(yearStats.vacationDaysUsed, settings.vacationDays) }}</text>
            </view>
          </view>
          <view class="slider-wrap quota-slider">
            <slider
              :value="settings.vacationDays"
              @change="onSliderChange($event, 'vacationDays')"
              @changing="onSliderChanging($event, 'vacationDays')"
              min="0" max="30" step="1" activeColor="#41598A" backgroundColor="#EAEFF6" block-size="14" block-color="#ffffff" />
          </view>
        </view>

        <!-- 病假 -->
        <view class="quota-block quota-block-last">
          <view class="quota-row">
            <text class="quota-label">{{ i18n.profile.sickDays }}</text>
            <view class="quota-values">
              <text class="quota-value sick-color">{{ settings.sickDays }} {{ i18n.profile.quotaUnit }}</text>
              <text class="quota-sub">{{ remainUsedText(yearStats.sickDaysUsed, settings.sickDays) }}</text>
            </view>
          </view>
          <view class="slider-wrap quota-slider">
            <slider
              :value="settings.sickDays"
              @change="onSliderChange($event, 'sickDays')"
              @changing="onSliderChanging($event, 'sickDays')"
              min="0" max="30" step="1" activeColor="#8C4F86" backgroundColor="#F3EAF1" block-size="14" block-color="#ffffff" />
          </view>
        </view>
      </view>

      <!-- 调休补班 -->
      <view class="settings-card">
        <view class="card-header-row">
          <text class="card-title">{{ i18n.profile.compOffSettings }}</text>
          <view class="info-btn" @click="showRuleSheet = true">
            <text class="info-icon">i</text>
          </view>
        </view>

        <scroll-view class="holiday-scroll" scroll-x="true" show-scrollbar="false">
          <view class="holiday-row">
            <view
              class="holiday-chip"
              v-for="item in holidayList"
              :key="item.name"
              :class="{ active: getCompOffStatus(item.name), disabled: !item.hasCompOff }"
              @click="toggleCompOff(item)"
            >
              <text class="holiday-chip-text">{{ getHolidayName(item) }}</text>
            </view>
          </view>
        </scroll-view>

        <view v-if="holidayList.length === 0" class="empty-hint">
            <text>{{ i18n.profile.noHoliday }}</text>
        </view>
      </view>

      <!-- 语言 -->
      <view class="settings-card language-card">
        <text class="card-title">{{ i18n.profile.language }}</text>
        <view class="lang-segmented">
          <view class="lang-option" :class="{ active: settings.language === 'zh-CN' }" @click="setLanguage('zh-CN')">
            <text class="lang-option-text">简体中文</text>
          </view>
          <view class="lang-option" :class="{ active: settings.language === 'en-US' }" @click="setLanguage('en-US')">
            <text class="lang-option-text">English</text>
          </view>
        </view>
      </view>
    </view>

    </scroll-view>

    <!-- ===== 补班规则 ⓘ 弹窗 ===== -->
    <view v-if="showRuleSheet" class="modal-mask" @click="showRuleSheet = false">
      <view class="modal-card" @click.stop>
        <view class="modal-icon rule-icon">
          <text class="modal-icon-text">i</text>
        </view>
        <text class="modal-title">{{ i18n.profile.compOffSheetTitle }}</text>
        <text class="modal-body">{{ i18n.profile.compOffSheetBody }}</text>
        <view class="modal-btn" @click="showRuleSheet = false">
          <text class="modal-btn-text">{{ i18n.profile.gotIt }}</text>
        </view>
      </view>
    </view>

    <!-- ===== 生日假 ⓘ 弹窗 ===== -->
    <view v-if="showBirthdaySheet" class="modal-mask" @click="showBirthdaySheet = false">
      <view class="modal-card" @click.stop>
        <view class="modal-icon birthday-icon">
          <text class="modal-icon-text">i</text>
        </view>
        <text class="modal-title">{{ i18n.profile.birthdaySheetTitle }}</text>
        <text class="modal-body">{{ i18n.profile.birthdaySheetBody }}</text>
        <view class="modal-btn" @click="showBirthdaySheet = false">
          <text class="modal-btn-text">{{ i18n.profile.gotIt }}</text>
        </view>
      </view>
    </view>
  </view>
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
      showRuleSheet: false,
      showBirthdaySheet: false,
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
    },
    targetTicks() {
      return [0, 20, 40, 60, 80, 100];
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
    // 设计稿格式：剩余 15 天 · 已用 5 天
    remainUsedText(used, total) {
      const remain = Math.max(0, (total || 0) - (used || 0));
      return this.i18n.profile.remainUsed
        .replace('{r}', remain)
        .replace('{u}', used || 0);
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
.profile-root {
  position: relative;
  height: 100%;
}

.profile-scroll {
  height: 100%;
}

.content {
  padding: 12px 20px 0 20px;
}

/* ===== 通用卡片 ===== */
.settings-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
}

.card-title {
  font-size: 14px;
  font-weight: 500;
  color: #15181C;
  line-height: 1.4;
}

.card-hint {
  font-size: 11px;
  color: #9AA1A8;
  line-height: 1.4;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-hint {
  font-size: 10px;
  color: #9AA1A8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ===== ⓘ 信息按钮 ===== */
.info-btn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.2px solid #A3A9B0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-icon {
  font-size: 10px;
  font-style: italic;
  font-weight: 600;
  color: #A3A9B0;
  line-height: 1;
}

/* ===== 目标卡 ===== */
.target-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.target-labels {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.target-value {
  font-size: 20px;
  font-weight: 700;
  color: #0E6E62;
  line-height: 1.2;
}

.slider-wrap {
  width: 100%;
}

.target-slider {
  margin-top: 10px;
}

.tick-row {
  display: flex;
  justify-content: space-between;
}

.tick-text {
  font-size: 9px;
  color: #9AA1A8;
  line-height: 1.3;
}

.tick-text.tick-active {
  color: #0E6E62;
  font-weight: 500;
}

/* ===== 生日假卡 ===== */
.birthday-config {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.month-options {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.month-option {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
  border: 1px solid #EDEFF1;
  border-radius: 10px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.month-option.active {
  background: #FBEAF0;
  border-color: #FBEAF0;
}

.month-option:active {
  transform: scale(0.96);
}

.month-text {
  font-size: 10px;
  font-weight: 500;
  color: #3A4149;
  white-space: nowrap;
}

.month-option.active .month-text {
  color: #C24A7E;
  font-weight: 600;
}

.card-foot-hint {
  font-size: 9px;
  color: #9AA1A8;
  line-height: 1.6;
}

.birthday-disabled-hint {
  margin-top: 10px;
  padding: 10px;
  background-color: #FBEAF0;
  border-radius: 8px;
  text-align: center;
}

.hint-text {
  font-size: 11px;
  color: #C24A7E;
  font-weight: 500;
}

/* ===== 开关 ===== */
.toggle-switch {
  cursor: pointer;
}

.switch-track {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background-color: #ccc;
  position: relative;
  transition: background-color 0.3s;
}

.switch-track.on {
  background-color: #0E6E62;
}

.switch-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #fff;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: left 0.3s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.switch-track.on .switch-thumb {
  left: 21px;
}

/* ===== 假期额度卡 ===== */
.quota-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quota-block + .quota-block {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #F0F2F4;
}

/* 最后一个额度块，底部多留一点呼吸空间 */
.quota-block-last {
  padding-bottom: 8px;
}

.quota-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quota-label {
  font-size: 12px;
  color: #3A4149;
  line-height: 1.4;
}

.quota-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.quota-value {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.vacation-color { color: #41598A; }
.sick-color { color: #8C4F86; }

.quota-sub {
  font-size: 10px;
  color: #6B7379;
  line-height: 1.4;
}

.quota-slider {
  height: 16px;
}

/* ===== 调休补班 chips ===== */
.holiday-scroll {
  width: 100%;
  white-space: nowrap;
  margin-top: 10px;
}

/* 隐藏横向滚动条 */
.holiday-scroll ::-webkit-scrollbar,
.holiday-scroll ::v-deep ::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.holiday-row {
  display: flex;
  flex-direction: row;
  gap: 5px;
  padding-bottom: 4px;
}

.holiday-chip {
  flex: 0 0 auto;
  height: 26px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F4F5F6;
  border-radius: 8px;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.holiday-chip.active {
  background: #E7F1EF;
}

.holiday-chip:active {
  transform: scale(0.96);
}

.holiday-chip-text {
  font-size: 10.5px;
  font-weight: 500;
  color: #A3A9B0;
  line-height: 1.2;
  white-space: nowrap;
}

.holiday-chip.active .holiday-chip-text {
  color: #0E6E62;
  font-weight: 500;
}

.empty-hint {
  padding: 20px 0;
  text-align: center;
  color: #ccc;
  font-size: 12px;
}

/* ===== 语言卡 ===== */
.language-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 6px 13px;
  min-height: 46px;
  box-sizing: border-box;
}

.lang-segmented {
  display: flex;
  align-items: stretch;
  gap: 2px;
  width: 128px;
  height: 34px;
  padding: 3px;
  background: #F2F4F6;
  border-radius: 10px;
  box-sizing: border-box;
}

.lang-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.lang-option.active {
  background: #FFFFFF;
}

.lang-option-text {
  font-size: 10px;
  font-weight: 500;
  color: #6B737B;
  line-height: 1.2;
}

.lang-option.active .lang-option-text {
  color: #15181C;
  font-weight: 600;
}

/* ===== ⓘ 底部弹层 ===== */
/* ===== ⓘ 说明弹窗（居中卡片，避免被底部 TabBar 遮挡） ===== */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(11, 14, 18, 0.55);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 防止遮罩挡住 TabBar 手势区的同时保证弹窗本身居中且不被裁切 */
  padding: 0 32px;
  box-sizing: border-box;
}

.modal-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFFFF;
  border-radius: 20px;
  padding: 22px 20px 18px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: modal-pop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}

@keyframes modal-pop {
  from { opacity: 0; transform: scale(0.92) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.rule-icon { background: #E8F2F0; }
.birthday-icon { background: #FBEAF0; }

.modal-icon-text {
  font-size: 16px;
  font-weight: 700;
  font-family: Georgia, "Times New Roman", serif;
  color: #0E6E62;
}

.birthday-icon .modal-icon-text {
  color: #C24A7E;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #15181C;
  line-height: 1.4;
  text-align: center;
}

.modal-body {
  font-size: 13px;
  color: #5A6169;
  line-height: 1.75;
  text-align: left;
  margin-top: 10px;
}

.modal-btn {
  width: 100%;
  height: 44px;
  margin-top: 20px;
  border-radius: 12px;
  background: #0E6E62;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-btn-text {
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}
</style>
