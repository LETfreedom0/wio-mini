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
      }
    }
  },
  mounted() {
    this.loadSettings();
  },
  onShow() {
    // Reload when showing (in case changed elsewhere, though Profile is usually entry)
    this.loadSettings();
  },
  methods: {
    loadSettings() {
      this.settings = wioService.getSettings();
      const currentYear = new Date().getFullYear();
      this.yearStats = wioService.getYearStats(currentYear);
    },
    getUsagePercentage(used, total) {
      if (!total || total === 0) return 0;
      return Math.min(100, Math.round((used / total) * 100));
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
  padding: 20px;
  padding-bottom: 50px;
}

.settings-card {
  background-color: #fff;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.card-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.card-value {
  font-size: 20px;
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

</style>