<template>
  <view class="container">
    <!-- 首页用设计稿的「日期 + 问候」替代白色导航条 -->
    <view class="status-bar-placeholder"></view>

    <view class="content-area">
      <HomeView ref="home" />
    </view>

    <CustomTabBar current="home" />
  </view>
</template>

<script>
import HomeView from '@/components/HomeView.vue'
import CustomTabBar from '@/components/CustomTabBar.vue'

export default {
  components: {
    HomeView,
    CustomTabBar
  },
  onShow() {
    // Refresh data in HomeView if needed
    if (this.$refs.home && this.$refs.home.initData) {
      this.$refs.home.initData();
    }
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
  padding-bottom: calc(86px + env(safe-area-inset-bottom)); /* Make space for floating TabBar */
}

.status-bar-placeholder {
  height: var(--status-bar-height);
  width: 100%;
  flex-shrink: 0;
}

.content-area {
  flex: 1;
  height: 0; 
}
</style>