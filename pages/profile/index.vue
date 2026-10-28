<template>
  <view class="container">
    <!-- 不再用固定的状态栏占位条：滚动区直接贯通到屏幕顶端，
         安全区高度交给内容自己留（会随内容滚走），上滑时卡片滑出屏幕而不是被一条灰带截断 -->
    <view class="content-area">
      <ProfileView ref="profileView" :top-safe="topSafeHeight" />
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
      // 初始值同步取一次，避免首帧内容从屏幕顶端弹下来
      topSafeHeight: getTopSafeArea().totalHeight
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
  box-sizing: border-box;
  background-color: #F4F5F6;
  padding-bottom: calc(86px + constant(safe-area-inset-bottom));
  padding-bottom: calc(86px + env(safe-area-inset-bottom));
  /* 防止页面本身产生原生滚动，把滚动完全交给内部 scroll-view */
  overflow: hidden;
}

.content-area {
  flex: 1;
  height: 0;
  /* ProfileView contains a scroll-view with height: 100% */
}
</style>
