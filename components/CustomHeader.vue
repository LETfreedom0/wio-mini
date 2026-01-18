<template>
  <view class="header-container">
    <!-- Status Bar Placeholder -->
    <view class="status-bar"></view>
    <!-- Nav Bar Content -->
    <view class="nav-bar">
      <view class="left">
        <view class="logo-box">
          <text class="logo-text">W</text>
        </view>
        <text class="title">WIO Tracker</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'CustomHeader',
}
</script>

<style scoped>
.header-container {
  background-color: #fff;
  border-bottom: 1px solid #eee;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 999;
}

.status-bar {
  height: var(--status-bar-height);
  width: 100%;
  background-color: #fff;
}

.nav-bar {
  height: 70px; /* Increased height */
  display: flex;
  align-items: center;
  padding: 10px 20px 0 20px;
  background-color: #fff;
}

.left {
  display: flex;
  align-items: center;
}

.logo-box {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #007AFF 0%, #00C6FF 100%);
  margin-right: 12px;
  border-radius: 10px;
  box-shadow: 0 4px 10px rgba(0, 122, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-text {
  color: #fff;
  font-weight: 900;
  font-size: 18px;
  line-height: 1;
}

.title {
  font-weight: 800; /* Bolder */
  font-size: 20px; /* Larger */
  color: #333;
  letter-spacing: 0.5px;
}
</style>