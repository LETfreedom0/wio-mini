<template>
  <view class="home-content">
    <!-- 动态渐变背景层 -->
    <view class="bg-layer bg-home" :class="{ active: location === 'home' }"></view>
    <view class="bg-layer bg-company" :class="{ active: location === 'company' }"></view>
    <view class="bg-layer bg-default" :class="{ active: !location }"></view>
    
    <!-- 装饰性光斑 (可选) -->
    <view class="orb orb-1"></view>
    <view class="orb orb-2"></view>

    <!-- 礼花筒效果容器 (居家) -->
    <view class="confetti-container" v-if="showConfetti">
        <view v-for="(item, index) in confettiPieces" :key="index" 
              class="confetti-piece"
              :class="item.className"
              :style="item.style">
        </view>
    </view>

    <!-- 火箭升空效果容器 (公司) -->
    <view class="rocket-container" v-if="showRocket">
        <view class="rocket-wrapper">
            <text class="rocket-icon">🚀</text>
            <view class="rocket-trail">
                <view class="trail-spark" v-for="n in 4" :key="n"></view>
            </view>
        </view>
    </view>

    <view class="content-wrapper">
      <view class="date-section anim-entry" style="animation-delay: 0.1s;">
        <text class="today-label">{{ i18n.home.today }}</text>
        <text class="date-text">{{ currentDateStr }}</text>
      </view>

      <view class="avatar-section anim-entry" style="animation-delay: 0.2s;">
        <view class="avatar-box glass-effect" 
              :class="{ 'avatar-pop': animateAvatar, 'avatar-pressed': isAvatarPressed }"
              @touchstart="isAvatarPressed = true"
              @touchend="isAvatarPressed = false"
        >
          <text class="avatar-emoji">{{ currentEmoji }}</text>
        </view>
      </view>

      <view class="text-container">
        <text class="question anim-text" :class="{ 'text-pop': triggerTextAnim, 'english': settings.language === 'en-US' }">
          {{ statusText }}
        </text>
      </view>

      <view class="toggle-container anim-entry" style="animation-delay: 0.4s;">
        <view class="toggle-track glass-effect-sm" 
              @touchstart="onTouchStart" 
              @touchmove="onTouchMove" 
              @touchend="onTouchEnd">
          <view class="toggle-labels">
            <text class="toggle-label" :class="{ active: location === 'home' }" @click="setStatus('home')">{{ i18n.home.workFromHome }}</text>
            <text class="toggle-label" :class="{ active: location === 'company' }" @click="setStatus('company')">{{ i18n.home.workFromCompany }}</text>
          </view>
          <view class="toggle-thumb shadow-effect" 
                :class="{ 'thumb-animate': !isDragging }" 
                :style="{ left: thumbPosition + 'px' }">
             <text class="thumb-icon">{{ location === 'home' ? '🏠' : (location === 'company' ? '🏢' : '↔') }}</text>
          </view>
        </view>
      </view>

      <text class="hint anim-entry" style="animation-delay: 0.5s;">{{ i18n.home.hint }}</text>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { getRandomQuote } from '@/utils/motivationQuotes.js'
import { locales, getMonthName, getWeekdayName } from '@/utils/locales.js'

export default {
  name: 'HomeView',
  data() {
    return {
      location: null, // 'home' | 'company' | null
      todayStr: '',
      animateAvatar: false,
      thumbPosition: 6, // Initial left position (padding)
      trackWidth: 320,
      thumbWidth: 155,
      padding: 6,
      maxLeft: 0,
      isDragging: false,
      startX: 0,
      currentX: 0,
      isAvatarPressed: false,
      triggerTextAnim: false,
      showConfetti: false,
      showRocket: false,
      confettiPieces: [],
      currentQuote: '',
      settings: {}
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN'];
    },
    statusText() {
      if (this.currentQuote) return this.currentQuote;
      
      if (this.location === 'home') {
        return this.i18n.home.homeStatus;
      } else if (this.location === 'company') {
        return this.i18n.home.companyStatus;
      }
      return this.i18n.home.question;
    },
    currentDateStr() {
      const now = new Date();
      const month = now.getMonth() + 1;
      const date = now.getDate();
      const day = getWeekdayName(now.getDay(), this.settings.language);
      if (this.settings.language === 'en-US') {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[month - 1]} ${date}, ${day}`;
      }
      return `${month}月${date}日 星期${day}`;
    },
    currentEmoji() {
      if (this.location === 'home') return '🏠';
      if (this.location === 'company') return '🏢';
      return '🤔';
    },
    bgClass() {
      if (this.location === 'home') return 'bg-home';
      if (this.location === 'company') return 'bg-company';
      return '';
    }
  },
  watch: {
    location(newVal) {
      this.triggerAnimation();
      this.updateThumbPosition(newVal);
    }
  },
  mounted() {
    this.maxLeft = this.trackWidth - this.thumbWidth - this.padding; 
    this.initData();
  },
  onShow() {
    this.settings = wioService.getSettings();
  },
  methods: {
    initData() {
      this.settings = wioService.getSettings();
      this.todayStr = wioService.getTodayDateStr();
      const entry = wioService.getEntryForDate(this.todayStr);
      this.location = entry;
      this.updateThumbPosition(entry);
      
      if (entry) {
        this.currentQuote = getRandomQuote(entry, this.settings.language);
      } else {
        this.currentQuote = getRandomQuote('default', this.settings.language);
      }
    },
    triggerAnimation() {
      this.animateAvatar = true;
      setTimeout(() => {
        this.animateAvatar = false;
      }, 500);
    },
    updateThumbPosition(status) {
      if (status === 'home') {
        this.thumbPosition = this.padding;
      } else if (status === 'company') {
        this.thumbPosition = this.maxLeft;
      } else {
        this.thumbPosition = (this.trackWidth - this.thumbWidth) / 2;
      }
    },
    setStatus(status) {
      if (this.location !== status) {
         uni.vibrateShort();
         this.currentQuote = getRandomQuote(status, this.settings.language);
         this.triggerTextAnim = true;
         setTimeout(() => {
           this.triggerTextAnim = false;
         }, 400);
         if (status === 'home') {
             this.triggerConfetti();
         } else if (status === 'company') {
             this.triggerRocket();
         }
      }
      this.location = status;
      wioService.saveEntry(this.todayStr, status);
    },
    triggerConfetti() {
        const colors = ['#ff0055', '#00ddff', '#00ff99', '#9900ff', '#ffd300', '#ff8800'];
        const pieces = [];
        for (let i = 0; i < 80; i++) {
            const isLeft = i < 40;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const duration = 3 + Math.random() * 2; 
            const delay = Math.random() * 0.3;
            const targetX = isLeft 
                ? 10 + Math.random() * 50  
                : 40 + Math.random() * 50; 
            const targetY = 5 + Math.random() * 30;
            const rotation = (Math.random() - 0.5) * 720;

            pieces.push({
                className: isLeft ? 'confetti-left-anim' : 'confetti-right-anim',
                style: {
                    '--bg-color': color,
                    '--target-x': `${targetX}%`,
                    '--target-y': `${targetY}%`,
                    '--rotation': `${rotation}deg`,
                    '--duration': `${duration}s`,
                    '--delay': `${delay}s`,
                    backgroundColor: color, 
                    left: isLeft ? '0%' : '100%'
                }
            });
        }
        this.confettiPieces = pieces;
        this.showConfetti = false; 
        this.$nextTick(() => {
            this.showConfetti = true;
            setTimeout(() => {
                this.showConfetti = false;
            }, 6000);
        });
    },
    triggerRocket() {
        this.showRocket = false;
        this.$nextTick(() => {
            this.showRocket = true;
            setTimeout(() => {
                this.showRocket = false;
            }, 2500);
        });
    },
    onTouchStart(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        this.isDragging = true;
        this.startX = e.changedTouches[0].clientX;
        this.currentX = this.thumbPosition;
      }
    },
    onTouchMove(e) {
      if (!this.isDragging) return;
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchX = e.changedTouches[0].clientX;
        const diff = touchX - this.startX;
        let newPos = this.currentX + diff;
        
        if (newPos < this.padding) newPos = this.padding;
        if (newPos > this.maxLeft) newPos = this.maxLeft;
        
        this.thumbPosition = newPos;
      }
    },
    onTouchEnd(e) {
      if (!this.isDragging) return;
      this.isDragging = false;
      
      const centerPoint = this.trackWidth / 2;
      const thumbCenter = this.thumbPosition + this.thumbWidth / 2;
      
      if (thumbCenter < centerPoint) {
        this.setStatus('home');
      } else {
        this.setStatus('company');
      }
    },

  }
}
</script>

<style scoped>
.home-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 移除原有的 flex 布局，改由 content-wrapper 接管或保持全屏 */
}

/* 背景层 */
.bg-layer {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  transition: opacity 0.8s ease;
  opacity: 0;
  z-index: 0;
}

.bg-layer.active {
  opacity: 1;
}

.bg-default {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.bg-home {
  /* 清新的蓝色渐变 */
  background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 50%, #E1F5FE 100%);
}

.bg-company {
  /* 柔和的绿色渐变 */
  background: linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 50%, #B9F6CA 100%);
}

/* 装饰性光斑 */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  z-index: 0;
  opacity: 0.6;
}

.orb-1 {
  top: -50px;
  right: -50px;
  width: 200px;
  height: 200px;
  background: rgba(255, 255, 255, 0.4);
}

.orb-2 {
  bottom: 100px;
  left: -30px;
  width: 150px;
  height: 150px;
  background: rgba(255, 255, 255, 0.3);
}

.content-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding-bottom: 50px;
}

.date-section {
  text-align: center;
  margin-bottom: 50px;
}

.today-label {
  font-size: 14px;
  color: #546E7A;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 8px;
  display: block;
  font-weight: 600;
}

.date-text {
  font-size: 32px;
  font-weight: 800;
  color: #263238;
  letter-spacing: -1px;
}

.avatar-section {
  margin-bottom: 50px;
  position: relative;
}

/* 玻璃拟态效果 */
.glass-effect {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(10px); /* 部分环境支持 */
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 
    0 10px 30px rgba(0,0,0,0.08),
    0 1px 3px rgba(0,0,0,0.05),
    inset 0 0 20px rgba(255,255,255,0.5);
}

.avatar-box {
  width: 160px;
  height: 160px;
  border-radius: 35px; /* 更圆润 */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.2s ease;
}

.avatar-pressed {
  transform: scale(0.95);
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}


.avatar-emoji {
  font-size: 72px; /* 稍微放大 */
}

.text-container {
  min-height: 48px; /* 稍微增加高度 */
  padding: 0 20px; /* 增加左右内边距防止文字贴边 */
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 25px;
  /* overflow: hidden;  <-- 移除这个以防止遮挡 */
  text-align: center; /* 确保文字居中 */
}

.question {
  font-size: 18px;
  color: #455A64;
  font-weight: 500;
  letter-spacing: 1px;
  transition: all 0.3s ease;
  max-width: 90vw;
  text-align: center;
  line-height: 1.4;
}

.question.english {
  font-size: 15px;
  letter-spacing: 0.5px;
}

/* 礼花筒动画 */
.confetti-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 99;
    overflow: hidden;
}

.confetti-piece {
    position: absolute;
    width: 8px;
    height: 16px;
    top: 100%; /* Start from bottom */
    opacity: 0;
    /* Variables for dynamic values */
    background-color: var(--bg-color, #ffd300);
    /* left is set inline now for start pos, animation handles the rest */
}

.confetti-left-anim {
    animation: confetti-left-arc var(--duration, 3s) cubic-bezier(0.2, 0.8, 0.4, 1) var(--delay, 0s) forwards;
}

.confetti-right-anim {
    animation: confetti-right-arc var(--duration, 3s) cubic-bezier(0.2, 0.8, 0.4, 1) var(--delay, 0s) forwards;
}

/* 左侧喷射路径：左下 -> 抛物线顶点 -> 飘落 */
@keyframes confetti-left-arc {
    0% { 
        opacity: 1; 
        top: 90%; 
        left: 0; 
        transform: rotate(0deg); 
    }
    20% { 
        opacity: 1; 
        top: var(--target-y, 10%); /* 快速到达随机顶点 */
        left: var(--target-x); 
        transform: rotate(100deg); 
    }
    100% { 
        opacity: 0; 
        top: 110%; /* 缓慢飘落 */
        left: calc(var(--target-x) + 20%); /* 随风飘远 */
        transform: rotate(var(--rotation)); 
    }
}

/* 右侧喷射路径：右下 -> 抛物线顶点 -> 飘落 */
@keyframes confetti-right-arc {
    0% { 
        opacity: 1; 
        top: 90%; 
        left: 100%; 
        transform: rotate(0deg); 
    }
    20% { 
        opacity: 1; 
        top: var(--target-y, 10%); /* 快速到达随机顶点 */
        left: var(--target-x); 
        transform: rotate(-100deg); 
    }
    100% { 
        opacity: 0; 
        top: 110%; /* 缓慢飘落 */
        left: calc(var(--target-x) - 20%); /* 随风飘远 */
        transform: rotate(var(--rotation)); 
    }
}


/* 火箭动画 */
.rocket-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 100;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: flex-end; /* Start from bottom */
}

.rocket-wrapper {
    position: relative;
    bottom: -100px; /* Hidden initially */
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: rocket-launch 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.rocket-icon {
    font-size: 80px;
    transform: rotate(-45deg); /* Tilt slightly */
    filter: drop-shadow(0 10px 10px rgba(0,0,0,0.2));
}

.rocket-trail {
    position: absolute;
    top: 60px;
    width: 20px;
    height: 100px;
}

.trail-spark {
    position: absolute;
    width: 6px;
    height: 6px;
    background-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: trail-fall 0.5s linear infinite;
}

/* Randomize trail sparks */
.trail-spark:nth-child(1) { left: -5px; animation-delay: 0.1s; }
.trail-spark:nth-child(2) { left: 5px; animation-delay: 0.2s; }
.trail-spark:nth-child(3) { left: 0px; animation-delay: 0s; }
.trail-spark:nth-child(4) { left: -10px; animation-delay: 0.3s; }
/* ... and so on */

@keyframes rocket-launch {
    0% { bottom: -100px; transform: scale(0.8); }
    10% { bottom: 20%; transform: scale(1); } /* Pause briefly? No, launch! */
    100% { bottom: 120%; transform: scale(1); } /* Fly off top */
}

@keyframes trail-fall {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(50px) scale(0); opacity: 0; }
}

/* 文本入场 */
.anim-text {
  animation: slideUpFade 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes slideUpFade {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 强调动画 */
.text-pop {
  color: #263238; /* 加深颜色 */
  transform: scale(1.05);
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.toggle-container {
  margin-bottom: 15px;
}

.toggle-track {
  position: relative;
  width: 320px; /* 稍微加宽 */
  height: 72px; 
  background-color: rgba(255, 255, 255, 0.5); /* 半透明背景 */
  border-radius: 36px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  overflow: hidden; 
}

.glass-effect-sm {
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.03);
}

.toggle-labels {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 25px;
  box-sizing: border-box;
  z-index: 1;
}

.toggle-label {
  font-size: 15px;
  font-weight: 600;
  color: #90A4AE;
  z-index: 2; 
  transition: color 0.3s;
}

.toggle-label.active {
  color: #37474F; 
}

.toggle-thumb {
  position: absolute;
  top: 6px;
  /* left is controlled by JS */
  width: 155px; /* 适配 track 宽度 */
  height: 60px; 
  background-color: #fff;
  border-radius: 30px; 
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.shadow-effect {
  box-shadow: 
    0 4px 15px rgba(0,0,0,0.1), 
    0 2px 4px rgba(0,0,0,0.05);
}

.thumb-animate {
  transition: left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性效果 overshoot */
}

.thumb-icon {
  font-size: 26px;
}

/* Avatar Animation */
.avatar-pop {
  animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.hint {
  font-size: 12px;
  color: #B0BEC5;
  margin-top: 10px;
}

/* 入场动画 */
.anim-entry {
  opacity: 0;
  animation: fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}



</style>