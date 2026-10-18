<template>
  <view class="tab-bar-area">
    <view class="tab-bar">
      <view class="tab-item" :class="{ active: current === 'home' }" @click="switchTab('/pages/index/index')">
        <image class="tab-icon-img" :src="current === 'home' ? icons.homeActive : icons.home" />
        <text class="tab-text">{{ i18n.tabBar.home }}</text>
      </view>
      <view class="tab-item" :class="{ active: current === 'calendar' }" @click="switchTab('/pages/calendar/index')">
        <image class="tab-icon-img" :src="current === 'calendar' ? icons.calendarActive : icons.calendar" />
        <text class="tab-text">{{ i18n.tabBar.calendar }}</text>
      </view>
      <view class="tab-item" :class="{ active: current === 'profile' }" @click="switchTab('/pages/profile/index')">
        <image class="tab-icon-img" :src="current === 'profile' ? icons.userActive : icons.user" />
        <text class="tab-text">{{ i18n.tabBar.profile }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales } from '@/utils/locales.js'

export default {
  name: 'CustomTabBar',
  props: {
    current: {
      type: String,
      default: 'home'
    }
  },
  data() {
    const colorDefault = '%239AA1A8';
    const colorActive = '%23FFFFFF';

    const pathHome = '<path d="M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>';
    const pathHomeFill = '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>';
    const pathCalendar = '<path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/>';
    const pathCalendarFillReal = '<path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>';
    const pathUser = '<path d="M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>';
    const pathUserFill = '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>';

    const svgPrefix = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="';

    return {
      settings: {},
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
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN'];
    }
  },
  mounted() {
    this.settings = wioService.getSettings();
    // 定期检查语言设置变化
    this.languageCheckInterval = setInterval(() => {
      const currentSettings = wioService.getSettings();
      if (currentSettings.language !== this.settings.language) {
        this.settings = currentSettings;
      }
    }, 1000);
  },
  beforeUnmount() {
    if (this.languageCheckInterval) {
      clearInterval(this.languageCheckInterval);
    }
  },
  updated() {
    this.settings = wioService.getSettings();
  },
  watch: {
    current() {
      this.settings = wioService.getSettings();
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
/* 设计稿：Tab Bar Area（外层留白）+ 白色圆角胶囊 Bar */
.tab-bar-area {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  /* 适配全面屏 Home Indicator：constant() 兜底老 iOS，env() 为标准写法 */
  padding: 12px 21px 12px 21px;
  padding-bottom: calc(12px + constant(safe-area-inset-bottom));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  z-index: 999;
  pointer-events: none; /* 外层不拦截点击 */
}

.tab-bar {
  pointer-events: auto;
  display: flex;
  align-items: stretch;
  gap: 4px;
  height: 62px;
  padding: 4px;
  box-sizing: border-box;
  background: #FFFFFF;
  border: 1px solid #E9EBEC;
  border-radius: 36px;
  box-shadow: 0 8px 24px rgba(15, 35, 40, 0.08);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 26px;
  transition: background 0.2s ease;
}

.tab-item.active {
  background: #0C6D60;
}

.tab-icon-img {
  width: 18px;
  height: 18px;
}

.tab-text {
  font-size: 10px;
  font-weight: 500;
  color: #9AA1A8;
  line-height: 1.2;
  transition: color 0.2s;
}

.tab-item.active .tab-text {
  color: #FFFFFF;
  font-weight: 600;
}
</style>
