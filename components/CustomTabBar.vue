<template>
  <view class="tab-bar">
    <view class="tab-item" :class="{ active: current === 'home' }" @click="switchTab('/pages/index/index')">
      <image class="tab-icon-img" :src="current === 'home' ? icons.homeActive : icons.home" />
      <text class="tab-text">首页</text>
    </view>
    <view class="tab-item" :class="{ active: current === 'calendar' }" @click="switchTab('/pages/calendar/index')">
      <image class="tab-icon-img" :src="current === 'calendar' ? icons.calendarActive : icons.calendar" />
      <text class="tab-text">日历</text>
    </view>
    <view class="tab-item" :class="{ active: current === 'profile' }" @click="switchTab('/pages/profile/index')">
      <image class="tab-icon-img" :src="current === 'profile' ? icons.userActive : icons.user" />
      <text class="tab-text">我的</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'CustomTabBar',
  props: {
    current: {
      type: String,
      default: 'home'
    }
  },
  data() {
    // 颜色定义
    const colorDefault = '%23999999';
    const colorActive = '%23007AFF';
    
    // SVG Paths (精选自 Material Design / Iconfont 风格)
    
    // 首页 - 线性
    const pathHome = '<path d="M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>';
    // 首页 - 填充
    const pathHomeFill = '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>';
    
    // 日历 - 线性
    const pathCalendar = '<path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/>';
    // 日历 - 填充
    const pathCalendarFill = '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>'; 
    // 注意：上面的填充路径其实也是线性的变体，真正的填充通常是整个块。这里我选用一个更实心的版本。
    const pathCalendarFillReal = '<path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>';
    // 修正日历填充版，使其更有辨识度
    
    // 用户 - 线性
    const pathUser = '<path d="M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>';
    // 用户 - 填充
    const pathUserFill = '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>';

    const svgPrefix = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="';
    
    return {
      icons: {
        home: `${svgPrefix}${colorDefault}">${pathHome}</svg>`,
        homeActive: `${svgPrefix}${colorActive}">${pathHomeFill}</svg>`,
        calendar: `${svgPrefix}${colorDefault}">${pathCalendar}</svg>`,
        calendarActive: `${svgPrefix}${colorActive}">${pathCalendarFillReal}</svg>`,
        user: `${svgPrefix}${colorDefault}">${pathUser}</svg>`,
        userActive: `${svgPrefix}${colorActive}">${pathUserFill}</svg>`,
      }
    }
  },
  methods: {
    switchTab(path) {
      uni.switchTab({
        url: path
      });
    }
  }
}
</script>

<style scoped>
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  background-color: #fff;
  display: flex;
  justify-content: space-around;
  align-items: center;
  box-shadow: 0 -1px 4px rgba(0, 0, 0, 0.05); /* 更轻柔的阴影 */
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 999;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.tab-icon-img {
  width: 24px;
  height: 24px;
  margin-bottom: 2px;
}

.tab-text {
  font-size: 10px;
  color: #999;
  transition: color 0.2s;
}

.tab-item.active .tab-text {
  color: #007AFF;
  font-weight: 500;
}
</style>