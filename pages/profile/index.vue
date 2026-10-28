<template>
  <view class="container">
    <view class="status-bar-placeholder" :style="{ height: topSafeHeight + 'px' }"></view>

    <view class="content-area">
      <ProfileView ref="profileView" />
    </view>

    <CustomTabBar current="profile" />
  </view>
</template>

<script>
import ProfileView from '@/components/ProfileView.vue'
import CustomTabBar from '@/components/CustomTabBar.vue'
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
  onLoad() {
    // 状态栏 + 胶囊按钮区域，避免页面标题与手机导航栏重叠
    this.topSafeHeight = getTopSafeArea().totalHeight;
  },
  onShow() {
    this.language = wioService.getSettings().language || 'zh-CN';
    // 子组件内部的 onShow 不生效，页面切回时由容器驱动刷新：
    // 语言、会员状态、同步时间都可能在上一个页面被改过
    const pv = this.$refs.profileView;
    if (pv) {
      if (typeof pv.loadSettings === 'function') pv.loadSettings();
      // 重新接管同步事件，避免与会员页同时监听导致重复弹窗
      if (typeof pv.bindSync === 'function') pv.bindSync();
    }
  },
  onHide() {
    const pv = this.$refs.profileView;
    if (pv && typeof pv.unbindSync === 'function') pv.unbindSync();
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
  padding-bottom: calc(86px + constant(safe-area-inset-bottom));
  padding-bottom: calc(86px + env(safe-area-inset-bottom));
}

.status-bar-placeholder {
  width: 100%;
  flex-shrink: 0;
}

.content-area {
  padding-top: 10px;
  flex: 1;
  height: 0;
  /* ProfileView contains a scroll-view with height: 100% */
}
</style>
