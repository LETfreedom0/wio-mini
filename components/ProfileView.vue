<template>
  <scroll-view scroll-y="true" class="profile-scroll">
    <view class="content">
      
      <!-- WIO Target Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">🎯 WIO 目标</text>
          <text class="card-value blue">{{ settings.targetPercentage }}%</text>
        </view>
        <view class="slider-container">
           <slider 
             :value="settings.targetPercentage" 
             @change="onSliderChange($event, 'targetPercentage')" 
             @changing="onSliderChanging($event, 'targetPercentage')"
             min="0" max="100" step="10" activeColor="#007AFF" backgroundColor="#E3F2FD" block-size="24" block-color="#fff" />
        </view>
        <text class="card-desc">设置您每月期望在公司办公的时间比例。</text>
      </view>

      <!-- Vacation Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">🏖️ 年假额度</text>
          <view class="value-group">
            <text class="card-value orange">{{ settings.vacationDays }} 天</text>
            <text class="balance-sub">剩余 {{ settings.vacationDays - yearStats.vacationDaysUsed }} 天</text>
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
        <text class="card-desc">今年已使用 {{ yearStats.vacationDaysUsed }} 天</text>
      </view>

      <!-- Sick Leave Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">💊 病假额度</text>
          <view class="value-group">
            <text class="card-value purple">{{ settings.sickDays }} 天</text>
            <text class="balance-sub">剩余 {{ settings.sickDays - yearStats.sickDaysUsed }} 天</text>
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
        <text class="card-desc">今年已使用 {{ yearStats.sickDaysUsed }} 天</text>
      </view>

      <!-- Comp Off Settings Card -->
      <view class="settings-card">
        <view class="card-header">
          <text class="card-title">📅 调休配置</text>
        </view>
        
        <text class="section-hint">点击卡片切换状态 (蓝色表示补班算工作日)</text>

        <scroll-view class="holiday-scroll" scroll-x="true" show-scrollbar="false">
          <view class="holiday-row">
            <view 
              class="holiday-item" 
              v-for="item in holidayList" 
              :key="item.name"
              :class="{ 'active-comp-off': getCompOffStatus(item.name), disabled: !item.hasCompOff }"
              @click="toggleCompOff(item)"
            >
              <text class="holiday-name">{{ item.name }}</text>
              <view class="holiday-status-icon" v-if="getCompOffStatus(item.name)">✓</view>
              <text class="no-comp-off-text" v-if="!item.hasCompOff">无补班</text>
            </view>
          </view>
        </scroll-view>
        
        <view v-if="holidayList.length === 0" class="empty-hint">
            <text>本年度无节日安排</text>
        </view>
      </view>

    </view>
  </scroll-view>
</template>

<script>
import wioService from '@/utils/wioService.js'

export default {
  name: 'ProfileView',
  data() {
    return {
      settings: {
        username: '',
        targetPercentage: 40,
        vacationDays: 20,
        sickDays: 12
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      holidayList: [] // 完整节日列表
    }
  },
  mounted() {
    this.loadSettings();
    this.holidayList = wioService.getHolidayInfoList();
  },
  onShow() {
    // Reload when showing (in case changed elsewhere, though Profile is usually entry)
    this.loadSettings();
  },
  methods: {
    loadSettings() {
      this.settings = wioService.getSettings();
      // 确保 compOffRules 存在
      if (!this.settings.compOffRules) {
          this.settings.compOffRules = { '春节': true };
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
    toggleCompOff(item) {
        // 如果该节日没有调休安排，则不允许切换状态（或点击无效）
        // 用户体验上，既然显示了“无补班”，最好点击无反应或提示
        if (!item.hasCompOff) {
            return;
        }

        // Toggle status
        const name = item.name;
        const current = this.getCompOffStatus(name);
        this.settings.compOffRules[name] = !current;
        
        // Haptic feedback
        uni.vibrateShort();
        
        this.save();
    },
    onSliderChange(e, key) {
      this.settings[key] = e.detail.value;
      this.save();
    },
    onSliderChanging(e, key) {
      // 实时更新数值显示
      this.settings[key] = e.detail.value;
      // 震动反馈 (Taptic Engine) - 轻微震动
      uni.vibrateShort(); 
    },

    save() {
      wioService.saveSettings(this.settings);
      uni.showToast({
        title: '已保存',
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

</style>