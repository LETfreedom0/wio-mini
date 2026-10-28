<template>
  <view class="container">
    <!-- 同「我的」页：滚动区贯通到屏幕顶端，安全区由滚动内容自己留 -->
    <view class="content-area">
      <MemberView ref="memberView" :top-safe="topSafeHeight" />
    </view>
  </view>
</template>

<script>
import MemberView from '@/components/MemberView.vue'
import wioService from '@/utils/wioService.js'
import { getTopSafeArea } from '@/utils/safeArea.js'

export default {
  components: {
    MemberView
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
    // 子组件内部的 onShow 不生效，页面显示时由容器驱动刷新与事件绑定
    const mv = this.$refs.memberView;
    if (mv) {
      if (typeof mv.load === 'function') mv.load();
      if (typeof mv.bindSync === 'function') mv.bindSync();
    }
  },
  onHide() {
    const mv = this.$refs.memberView;
    if (mv && typeof mv.unbindSync === 'function') mv.unbindSync();
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
  /* 二级页面：不再有 TabBar，只留安全区呼吸位 */
  padding-bottom: calc(12px + constant(safe-area-inset-bottom));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  /* 防止页面本身产生原生滚动，把滚动完全交给内部 scroll-view */
  overflow: hidden;
}

.content-area {
  flex: 1;
  height: 0;
  /* MemberView contains a scroll-view with height: 100% */
}
</style>
