<template>
  <view class="container">
    <view class="status-bar-placeholder" :style="{ height: topSafeHeight + 'px' }"></view>

    <view class="content-area">
      <MemberView />
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
      topSafeHeight: 0
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
  /* 二级页面：不再有 TabBar，只留安全区呼吸位 */
  padding-bottom: calc(12px + constant(safe-area-inset-bottom));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.status-bar-placeholder {
  width: 100%;
  flex-shrink: 0;
}

.content-area {
  padding-top: 10px;
  flex: 1;
  height: 0;
  /* MemberView contains a scroll-view with height: 100% */
}
</style>
