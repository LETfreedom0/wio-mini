<template>
  <view class="container">
    <CustomHeader />
    
    <view class="content-area">
      <HomeView ref="home" />
    </view>
    
    <CustomTabBar current="home" />
  </view>
</template>

<script>
import CustomHeader from '@/components/CustomHeader.vue'
import HomeView from '@/components/HomeView.vue'
import CustomTabBar from '@/components/CustomTabBar.vue'

export default {
  components: {
    CustomHeader,
    HomeView,
    CustomTabBar
  },
  onShow() {
    // Refresh data in HomeView if needed
    if (this.$refs.home && this.$refs.home.initData) {
      this.$refs.home.initData();
    }
  }
}
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F8F9FA;
  padding-bottom: calc(50px + env(safe-area-inset-bottom)); /* Make space for TabBar */
}

.content-area {
  flex: 1;
  height: 0; 
}
</style>