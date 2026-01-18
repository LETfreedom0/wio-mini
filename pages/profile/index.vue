<template>
  <view class="container">
    <CustomHeader />
    <view class="content-area">
      <ProfileView />
    </view>
    
    <CustomTabBar current="profile" />
  </view>
</template>

<script>
import CustomHeader from '@/components/CustomHeader.vue'
import ProfileView from '@/components/ProfileView.vue'
import CustomTabBar from '@/components/CustomTabBar.vue'

export default {
  components: {
    CustomHeader,
    ProfileView,
    CustomTabBar
  }
}
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F8F9FA;
  padding-bottom: calc(50px + env(safe-area-inset-bottom));
}

.content-area {
  flex: 1;
  height: 0;
  /* ProfileView contains a scroll-view with height: 100% */
}
</style>