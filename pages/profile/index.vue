<template>
  <view class="container">
    <view class="status-bar-placeholder" :style="{ height: topSafeHeight + 'px' }"></view>

    <view class="page-head">
      <text class="page-title">{{ pageTitle }}</text>
    </view>

    <view class="content-area">
      <ProfileView />
    </view>

    <CustomTabBar current="profile" />
  </view>
</template>

<script>
import ProfileView from '@/components/ProfileView.vue'
import CustomTabBar from '@/components/CustomTabBar.vue'
import { locales } from '@/utils/locales.js'
import wioService from '@/utils/wioService.js'
import { getTopSafeArea } from '@/utils/safeArea.js'

export default {
  components: {
    ProfileView,
    CustomTabBar
  },
  data() {
    return {
      language: 'zh-CN',
      topSafeHeight: 0
    }
  },
  computed: {
    pageTitle() {
      const localesMap = locales[this.language] || locales['zh-CN'];
      return localesMap.profile.pageTitle;
    }
  },
  onLoad() {
    // 状态栏 + 胶囊按钮区域，避免页面标题与手机导航栏重叠
    this.topSafeHeight = getTopSafeArea().totalHeight;
  },
  onShow() {
    this.language = wioService.getSettings().language || 'zh-CN';
  },
  onShareAppMessage(res) {
    return {
      title: 'WIO 达标了吗 - 实时追踪回公司办公达标率',
      path: '/pages/index/index'
    }
  },
  onShareTimeline(res) {
    return {
      title: 'WIO 达标了吗 - 实时追踪回公司办公达标率'
    }
  }
}
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F4F5F6;
  padding-bottom: calc(86px + env(safe-area-inset-bottom));
}

.status-bar-placeholder {
  width: 100%;
  flex-shrink: 0;
}

.page-head {
  padding: 6px 20px 12px 20px;
  flex-shrink: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.35;
}

.content-area {
  flex: 1;
  height: 0;
  /* ProfileView contains a scroll-view with height: 100% */
}
</style>
