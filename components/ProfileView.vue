<template>
  <view class="profile-root">
    <scroll-view scroll-y="true" class="profile-scroll" @scroll="onScroll" @touchmove="onTouchMove" @touchend="onTouchEnd">
    <view class="content" :style="{ paddingTop: topSafe + 22 + 'px' }">

      <!-- 账号 -->
      <view class="settings-card account-card" @click="onAccountCardTap">
        <view class="account-avatar" :class="{ 'account-avatar-pro': isPro }">
          <image v-if="avatarSrc" class="account-avatar-img" :src="avatarSrc" mode="aspectFill" />
          <text v-else class="account-avatar-placeholder">{{ isLogin ? 'W' : '?' }}</text>
        </view>
        <view class="account-info">
          <text class="account-name">{{ accountName }}</text>
          <text v-if="accountSub" class="account-sub" :class="{ 'account-sub-pro': isPro }">{{ accountSub }}</text>
        </view>
        <view v-if="!isLogin" class="account-login-btn" @click.stop="openAuthSheet('login')">
          <text class="account-login-btn-text">{{ i18n.profile.loginAction }}</text>
        </view>
        <text v-else class="account-chevron">›</text>
      </view>

      <!-- 会员入口：PRO 功能全部收口到「会员」Tab -->
      <view class="settings-card member-entry" @click="goMember">
        <view class="member-entry-badge" :class="{ on: isPro }">
          <text class="member-entry-badge-text">PRO</text>
        </view>
        <view class="member-entry-info">
          <text class="member-entry-title">{{ i18n.profile.memberEntryTitle }}</text>
          <text class="member-entry-sub" :class="{ on: isPro }">{{ isPro ? i18n.profile.memberEntrySubOn : i18n.profile.memberEntrySubOff }}</text>
        </view>
        <text class="member-entry-chevron">›</text>
      </view>

      <!-- 月度回公司目标 -->
      <view class="settings-card">
        <view class="target-row">
          <view class="target-labels">
            <text class="card-title">{{ i18n.profile.wioTarget }}</text>
            <text class="card-hint">{{ i18n.profile.wioTargetHint }}</text>
          </view>
          <text class="target-value">{{ settings.targetPercentage }}%</text>
        </view>
        <view class="slider-wrap target-slider">
          <slider
            :value="settings.targetPercentage"
            @change="onSliderChange($event, 'targetPercentage')"
            @changing="onSliderChanging($event, 'targetPercentage')"
            min="0" max="100" step="5" activeColor="#0E6E62" backgroundColor="#ECEEEF" block-size="18" block-color="#ffffff"
            :aria-label="i18n.profile.wioTarget" />
        </view>
        <view class="tick-row">
          <text v-for="tick in targetTicks" :key="tick" class="tick-text" :class="{ 'tick-active': settings.targetPercentage === tick }">{{ tick }}%</text>
        </view>
      </view>


      <!-- 假期额度（年假 + 病假合并卡） -->
      <view class="settings-card">
        <view class="card-header-row">
          <text class="card-title">{{ i18n.profile.leaveCard }}</text>
          <text class="header-hint">{{ i18n.profile.leaveResetHint }}</text>
        </view>

        <!-- 年假 -->
        <view class="quota-block">
          <view class="quota-row">
            <text class="quota-label">{{ i18n.profile.vacationDays }}</text>
            <view class="quota-values">
              <text class="quota-value vacation-color">{{ settings.vacationDays }} {{ i18n.profile.quotaUnit }}</text>
              <text class="quota-sub" :class="{ 'quota-empty': isQuotaFull(yearStats.vacationDaysUsed, settings.vacationDays) }">{{ remainUsedText(yearStats.vacationDaysUsed, settings.vacationDays) }}</text>
            </view>
          </view>
          <view class="slider-wrap quota-slider">
            <slider
              :value="settings.vacationDays"
              @change="onSliderChange($event, 'vacationDays')"
              @changing="onSliderChanging($event, 'vacationDays')"
              min="0" max="30" step="1" activeColor="#41598A" backgroundColor="#EAEFF6" block-size="14" block-color="#ffffff"
              :aria-label="i18n.profile.vacationDays" />
          </view>
        </view>

        <!-- 病假 -->
        <view class="quota-block" :class="{ 'quota-block-last': !customDayLeaves.length }">
          <view class="quota-row">
            <text class="quota-label">{{ i18n.profile.sickDays }}</text>
            <view class="quota-values">
              <text class="quota-value sick-color">{{ settings.sickDays }} {{ i18n.profile.quotaUnit }}</text>
              <text class="quota-sub" :class="{ 'quota-empty': isQuotaFull(yearStats.sickDaysUsed, settings.sickDays) }">{{ remainUsedText(yearStats.sickDaysUsed, settings.sickDays) }}</text>
            </view>
          </view>
          <view class="slider-wrap quota-slider">
            <slider
              :value="settings.sickDays"
              @change="onSliderChange($event, 'sickDays')"
              @changing="onSliderChanging($event, 'sickDays')"
              min="0" max="30" step="1" activeColor="#8C4F86" backgroundColor="#F3EAF1" block-size="14" block-color="#ffffff"
              :aria-label="i18n.profile.sickDays" />
          </view>
        </view>

        <!-- 自定义假期（按天点选型）：额度只读展示，改额度在会员页的假期面板里；
             没有额度（quota=0）的假不画进度条，只报已用几天 -->
        <view
          v-for="(l, idx) in customDayLeaves"
          :key="l.id"
          class="quota-block"
          :class="{ 'quota-block-last': idx === customDayLeaves.length - 1 }"
        >
          <view class="quota-row">
            <view class="quota-name-row">
              <view class="quota-dot" :style="{ background: l.color }"></view>
              <text class="quota-label">{{ l.name }}</text>
            </view>
            <view class="quota-values">
              <text class="quota-value" :style="{ color: l.color }">{{ l.label }}</text>
              <text class="quota-sub" :class="{ 'quota-empty': l.full }">{{ l.sub }}</text>
            </view>
          </view>
          <view v-if="l.quota > 0" class="quota-track">
            <view class="quota-fill" :style="{ width: l.pct + '%', background: l.color }"></view>
          </view>
        </view>
      </view>

      <!-- 生日假 -->
      <view class="settings-card">
        <view class="card-header-row">
          <text class="card-title">{{ i18n.profile.birthdayLeave }}</text>
          <view class="header-actions">
            <view class="info-btn" @click="showBirthdayInfo">
              <text class="info-icon">i</text>
            </view>
            <view class="toggle-switch" @click="toggleBirthdayEnabled">
              <view class="switch-track" :class="{ 'on': settings.birthdayEnabled }">
                <view class="switch-thumb"></view>
              </view>
            </view>
          </view>
        </view>

        <view v-if="settings.birthdayEnabled" class="birthday-config">
          <view class="month-options">
            <view
              v-for="month in monthOptions"
              :key="month.value"
              class="month-option"
              :class="{ active: settings.birthdayMonth === month.value }"
              @click="selectBirthdayMonth(month.value)"
            >
              <text class="month-text">{{ month.label }}</text>
            </view>
          </view>
          <text class="card-foot-hint">{{ i18n.profile.birthdayCardHint }}</text>
        </view>
        <view v-else class="birthday-disabled-hint">
          <text class="hint-text">{{ i18n.profile.birthdayEnableHint }}</text>
        </view>
      </view>

      <!-- 调休补班 -->
      <view class="settings-card">
        <view class="card-header-row">
          <text class="card-title">{{ i18n.profile.compOffSettings }}</text>
          <view class="info-btn" @click="showCompOffInfo">
            <text class="info-icon">i</text>
          </view>
        </view>

        <scroll-view class="holiday-scroll" scroll-x="true" show-scrollbar="false">
          <view class="holiday-row">
            <view
              class="holiday-chip"
              v-for="item in holidayList"
              :key="item.name"
              :class="{ active: getCompOffStatus(item.name), disabled: !item.hasCompOff }"
              @click="toggleCompOff(item)"
            >
              <text class="holiday-chip-text">{{ getHolidayName(item) }}</text>
            </view>
          </view>
        </scroll-view>

        <view v-if="holidayList.length === 0" class="empty-hint">
            <text>{{ i18n.profile.noHoliday }}</text>
        </view>
      </view>

      <view class="version-row"><text class="version-text">{{ versionLabel }}</text></view>

    </view>

    </scroll-view>

    <!-- ===== 补班规则 ⓘ 弹窗 ===== -->
    <view v-if="showRuleSheet" class="modal-mask" @click="closeInfoSheet">
      <view class="modal-card" @click.stop>
        <view class="modal-icon rule-icon">
          <text class="modal-icon-text">i</text>
        </view>
        <text class="modal-title">{{ i18n.profile.compOffSheetTitle }}</text>
        <text class="modal-body">{{ i18n.profile.compOffSheetBody }}</text>
        <view class="modal-btn" @click="closeInfoSheet">
          <text class="modal-btn-text">{{ i18n.profile.gotIt }}</text>
        </view>
      </view>
    </view>

    <!-- ===== 生日假 ⓘ 弹窗 ===== -->
    <view v-if="showBirthdaySheet" class="modal-mask" @click="closeInfoSheet">
      <view class="modal-card" @click.stop>
        <view class="modal-icon birthday-icon">
          <text class="modal-icon-text">i</text>
        </view>
        <text class="modal-title">{{ i18n.profile.birthdaySheetTitle }}</text>
        <text class="modal-body">{{ i18n.profile.birthdaySheetBody }}</text>
        <view class="modal-btn" @click="closeInfoSheet">
          <text class="modal-btn-text">{{ i18n.profile.gotIt }}</text>
        </view>
      </view>
    </view>

    <!-- ===== 自定义假期 添加/编辑（居中弹出卡片） ===== -->
    <CustomLeaveSheet :visible="showCustomSheet" :leave="customEditLeave" @close="showCustomSheet = false" @saved="onCustomSaved" />

    <!-- ===== 微信授权登录（底部弹层） ===== -->
    <view v-if="showAuthSheet" class="sheet-mask" @click="closeAuthSheet">
      <view class="sheet-card" @click.stop>
        <text class="sheet-title">{{ authMode === 'login' ? i18n.profile.authSheetTitle : i18n.profile.profileEditTitle }}</text>

        <!-- 头像选择（合规：open-type=chooseAvatar） -->
        <view class="auth-avatar-row">
          <view class="auth-avatar-box">
            <image v-if="authForm.avatarTemp" class="auth-avatar-img" :src="authForm.avatarTemp" mode="aspectFill" />
            <text v-else class="auth-avatar-plus">＋</text>
          </view>
          <!-- 按钮必须留在 row 内部：row 是 relative，按钮才能覆盖头像框；
               放在外面会相对 fixed 遮罩定位，飘到屏幕左上角导致点击无效 -->
          <button class="auth-avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar"></button>
          <view class="auth-avatar-info">
            <text class="auth-avatar-label">{{ i18n.profile.useAvatar }}</text>
            <text class="auth-avatar-hint">{{ i18n.profile.nicknameTapHint }}</text>
          </view>
        </view>

        <!-- 昵称输入（合规：type=nickname） -->
        <view class="auth-input-row">
          <text class="auth-input-label">{{ i18n.profile.wechatNickname }}</text>
          <input
            class="auth-input"
            type="nickname"
            :value="authForm.nickname"
            :placeholder="i18n.profile.nicknamePlaceholder"
            @input="onNicknameInput"
            @blur="onNicknameBlur"
          />
        </view>

        <!-- 协议（仅首次登录需要） -->
        <view v-if="authMode === 'login'" class="auth-agree-row" @click="toggleAgree">
          <view class="agree-check" :class="{ checked: authForm.agreed }">
            <text v-if="authForm.agreed" class="agree-check-icon">✓</text>
          </view>
          <view class="agree-text-wrap">
            <text class="agree-text">{{ i18n.profile.privacyAgree }}</text>
            <text class="agree-link">{{ i18n.profile.userAgreement }}</text>
            <text class="agree-text">{{ i18n.profile.andText }}</text>
            <text class="agree-link">{{ i18n.profile.privacyPolicy }}</text>
          </view>
        </view>

        <view class="auth-submit-btn" @click="onSubmitLogin">
          <text class="auth-submit-text">{{ authMode === 'login' ? i18n.profile.authBtn : i18n.profile.authSave }}</text>
        </view>
        <view class="auth-cancel-btn" @click="closeAuthSheet">
          <text class="auth-cancel-text">{{ i18n.profile.cancel }}</text>
        </view>
      </view>
    </view>

    <!-- ===== PRO 付费墙（底部弹层） ===== -->
    <PaywallSheet :visible="showPaywall" @close="showPaywall = false" @upgraded="onProUpgraded" />

    <!-- ===== 数据冲突弹窗（居中） ===== -->
    <view v-if="conflictInfo" class="modal-mask" @click.stop>
      <view class="modal-card conflict-card" @click.stop>
        <view class="modal-icon conflict-icon">
          <text class="conflict-icon-text">⚠️</text>
        </view>
        <text class="modal-title">{{ i18n.profile.conflictTitle }}</text>
        <text class="modal-body">{{ i18n.profile.conflictBody }}</text>

        <view class="conflict-options">
          <view class="conflict-option" @click="onResolveLocal">
            <text class="conflict-option-title">{{ i18n.profile.localData }}</text>
            <text class="conflict-option-sub">{{ i18n.profile.updatedAt }} {{ conflictLocalTime }}</text>
          </view>
          <view class="conflict-option conflict-option-cloud" @click="onResolveCloud">
            <text class="conflict-option-title">{{ i18n.profile.cloudData }}</text>
            <text class="conflict-option-sub">{{ i18n.profile.updatedAt }} {{ conflictCloudTime }}</text>
          </view>
        </view>

        <view class="conflict-btn-row">
          <view class="conflict-btn conflict-btn-ghost" @click="onResolveLocal">
            <text class="conflict-btn-ghost-text">{{ i18n.profile.keepLocal }}</text>
          </view>
          <view class="conflict-btn conflict-btn-primary" @click="onResolveCloud">
            <text class="conflict-btn-primary-text">{{ i18n.profile.keepCloud }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'
import { login, getAuth, logout, updateCachedUser, uploadAvatar, refreshSubscription } from '@/utils/auth.js'
import { isProUser, getProState, proExpireDate, PRO_CHANGED_EVENT } from '@/utils/pro.js'
import * as syncService from '@/utils/syncService.js'
import CustomLeaveSheet from '@/components/CustomLeaveSheet.vue'
import PaywallSheet from '@/components/PaywallSheet.vue'
import { tap as haptic } from '@/utils/haptic.js'
import { APP_VERSION_LABEL } from '@/utils/appVersion.js'

const holidayNameMap = {
  '元旦': 'New Year\'s',
  '春节': 'Spring Fest',
  '清明节': 'Qingming',
  '劳动节': 'Labor Day',
  '端午节': 'Dragon Boat',
  '中秋节': 'Mid-Autumn',
  '国庆节': 'National Day'
};

export default {
  name: 'ProfileView',
  components: { CustomLeaveSheet, PaywallSheet },
  props: {
    // 顶部安全区（状态栏 + 胶囊行）像素高度，由页面容器测得
    topSafe: { type: Number, default: 64 }
  },
  data() {
    return {
      settings: {
        username: '',
        targetPercentage: 40,
        vacationDays: 20,
        sickDays: 12,
        language: 'zh-CN',
        birthdayEnabled: false,
        birthdayMonth: ''
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      holidayList: [], // 完整节日列表
      showRuleSheet: false,
      showBirthdaySheet: false,
      // ===== 自定义假期 =====
      customLeaves: [],
      showCustomSheet: false,
      customEditLeave: null, // 传入弹层：null=新增，否则为编辑对象
      // ===== 账号 / 同步 / 付费 =====
      session: null,           // { openid, user, subscription }
      showAuthSheet: false,
      showPaywall: false,
      trialStamp: 0,       // 兑换码核销后 +1，触发 isPro 重算
      conflictInfo: null,      // { localTime, cloudTime, cloudData, data_version }
      lastSyncAt: 0,
      authMode: 'login', // 'login' 首次登录 | 'edit' 完善资料
      authForm: {
        nickname: '',
        avatarTemp: '',
        agreed: false
      },
      lastNx: 0,
      months: [
        { value: '01', label: '1月', labelEn: 'Jan' },
        { value: '02', label: '2月', labelEn: 'Feb' },
        { value: '03', label: '3月', labelEn: 'Mar' },
        { value: '04', label: '4月', labelEn: 'Apr' },
        { value: '05', label: '5月', labelEn: 'May' },
        { value: '06', label: '6月', labelEn: 'Jun' },
        { value: '07', label: '7月', labelEn: 'Jul' },
        { value: '08', label: '8月', labelEn: 'Aug' },
        { value: '09', label: '9月', labelEn: 'Sep' },
        { value: '10', label: '10月', labelEn: 'Oct' },
        { value: '11', label: '11月', labelEn: 'Nov' },
        { value: '12', label: '12月', labelEn: 'Dec' }
      ]
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN'];
    },
    versionLabel() {
      return APP_VERSION_LABEL;
    },
    monthOptions() {
      const isEn = this.settings.language === 'en-US';
      return this.months.map(m => ({
        value: m.value,
        label: isEn ? m.labelEn : m.label
      }));
    },
    targetTicks() {
      return [0, 20, 40, 60, 80, 100];
    },
    // 按天点选型自定义假期的额度行（年假/病假之外的那部分）。
    // 只做展示：额度本身在会员页的假期面板里改，这里给的是「还剩多少」的答案
    customDayLeaves() {
      const p = this.i18n.profile;
      return (this.customLeaves || [])
        .filter(l => l.mode === 'day')
        .map(l => {
          const u = wioService.getCustomLeaveUsage(l.id);
          const quota = l.quota || 0;
          return {
            id: l.id,
            name: l.name,
            color: l.color,
            quota,
            used: u.used,
            pct: quota > 0 ? Math.min(100, Math.round((u.used / quota) * 100)) : 0,
            full: quota > 0 && u.used >= quota,
            label: quota > 0
              ? `${quota} ${p.quotaUnit}`
              : p.customQuotaUnlimited,
            sub: quota > 0
              ? this.remainUsedText(u.used, quota)
              : p.customUsed.replace('{n}', u.used)
          };
        });
    },
    // ===== 账号 / 同步 =====
    isLogin() {
      return !!(this.session && this.session.user && this.session.user.openid);
    },
    isPro() {
      // 口径统一在 utils/pro.js：实时读存储，不用组件里的 session 快照
      // （快照可能过期，正是「头像显示体验中但会员页 locked」的成因）
      void this.trialStamp;
      return isProUser();
    },
    accountName() {
      if (!this.isLogin) return this.i18n.profile.accountNotLogin;
      const u = this.session.user || {};
      return u.nickname || this.i18n.profile.defaultName;
    },
    // 会员到期日（统一口径：云端订阅优先，本地试用兜底）
    renewDate() {
      void this.trialStamp;
      return proExpireDate();
    },
    accountSub() {
      const lang = this.settings.language;
      // PRO：金色「PRO 会员 · 年卡/月卡/体验会员」（兑换码试用未登录时也显示）
      if (this.isPro) {
        if (!this.isLogin) return t('profile.proMemTrial', lang);
        const plan = getProState().plan || 'trial';
        return plan === 'year' ? t('profile.proMemYear', lang)
          : plan === 'month' ? t('profile.proMemMonth', lang)
          : t('profile.proMemTrial', lang);
      }
      if (!this.isLogin) return this.i18n.profile.accountLoginHint;
      return '';
    },
    // PRO 卡「云端同步」行的说明文案（按登录/订阅状态切换）
    syncRowSub() {
      if (!this.isLogin) return this.i18n.profile.syncNeedLogin;
      if (!this.isPro) return this.i18n.profile.syncProBenefit;
      return this.i18n.profile.autoSyncSub;
    },
    avatarSrc() {
      if (!this.isLogin) return '';
      const u = this.session.user || {};
      return u.avatarFileID || '';
    },
    lastSyncText() {
      if (!this.lastSyncAt) return '—';
      const d = new Date(this.lastSyncAt);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    conflictLocalTime() {
      return this.conflictInfo ? this.formatTime(Date.now()) : '';
    },
    conflictCloudTime() {
      return this.conflictInfo ? this.formatTime(this.conflictInfo.syncedTime) : '';
    }
  },
  mounted() {
    this.loadSettings();
    this.holidayList = wioService.getHolidayInfoList();
    this.session = getAuth();
    this.lastSyncAt = syncService.getLastSyncTime();
    this.bindSync();
    // 组件内的 onShow 不会被触发，语言切换靠全局广播兜住
    uni.$on('wio:language-changed', this.onLanguageChanged);
    // 登录 / 退出 / 核销 / 订阅刷新后重算 isPro
    uni.$on(PRO_CHANGED_EVENT, this.onProChanged);
    // 订阅真身在云端，本地只是镜像：启动时对齐一次，会员入口卡的徽章才不会过期
    refreshSubscription();
  },
  beforeUnmount() {
    this.unbindSync();
    uni.$off('wio:language-changed', this.onLanguageChanged);
    uni.$off(PRO_CHANGED_EVENT, this.onProChanged);
  },
  // 显示/隐藏由页面容器（pages/profile/index.vue）驱动：
  // 子组件内的 onShow/onHide 在 Vue3 下不会被触发
  methods: {
    onScroll(e) {
      // 滚动位置映射为垂直视线：顶部=向上看，下滑=向下看
      const ny = Math.max(-1, Math.min(1, e.detail.scrollTop / 400));
      uni.$emit('wio-gaze', { nx: this.lastNx, ny, active: true });
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => {
        uni.$emit('wio-gaze', { nx: 0, ny: 0, active: false });
      }, 300);
    },
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const w = uni.getSystemInfoSync().windowWidth;
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)));
      }
    },
    onTouchEnd() {
      setTimeout(() => { this.lastNx = 0; }, 600);
    },
    loadSettings() {
      this.settings = wioService.getSettings();
      if (!this.settings.compOffRules) {
          this.settings.compOffRules = { '春节': true };
      }
      if (!this.settings.language) {
          this.settings.language = 'zh-CN';
      }
      this.customLeaves = wioService.getCustomLeaves();
      const currentYear = new Date().getFullYear();
      this.yearStats = wioService.getYearStats(currentYear);
    },
    // ===== 自定义假期 =====
    fmtCustomRange(l) {
      // 03/02 ~ 03/08 紧凑展示
      return `${l.start.slice(5).replace('-', '/')} ~ ${l.end.slice(5).replace('-', '/')}`;
    },
    openCustomAdd() {
      this.customEditLeave = null;
      this.showCustomSheet = true;
    },
    openCustomEdit(l) {
      this.customEditLeave = l;
      this.showCustomSheet = true;
    },
    onCustomSaved() {
      this.showCustomSheet = false;
      this.customLeaves = wioService.getCustomLeaves();
    },
    getUsagePercentage(used, total) {
      if (!total || total === 0) return 0;
      return Math.min(100, Math.round((used / total) * 100));
    },
    // 设计稿格式：剩余 15 天 · 已用 5 天
    remainUsedText(used, total) {
      const remain = Math.max(0, (total || 0) - (used || 0));
      return this.i18n.profile.remainUsed
        .replace('{r}', remain)
        .replace('{u}', used || 0);
    },
    // 额度已用尽（含「调低额度后低于已用天数」这种超额情况）：文案标红提醒
    isQuotaFull(used, total) {
      return (used || 0) > 0 && (used || 0) >= (total || 0);
    },
    getCompOffStatus(name) {
        return !!this.settings.compOffRules[name];
    },
    getHolidayName(item) {
      if (this.settings.language === 'en-US') {
        return holidayNameMap[item.name] || item.name;
      }
      return item.name;
    },
    toggleCompOff(item) {
        if (!item.hasCompOff) {
            // 没有补班的节日点不动：给一句提示，避免用户以为卡了
            uni.showToast({ title: this.i18n.profile.noCompOff, icon: 'none' });
            return;
        }
        haptic('light');
        const name = item.name;
        const current = this.getCompOffStatus(name);
        this.settings.compOffRules[name] = !current;
        haptic('light');
        this.save();
    },
    setLanguage(lang) {
      // 多语言为 PRO 专属权益：非 PRO 点击英文选项直接拉起付费墙
      if (lang !== 'zh-CN' && !this.isPro) {
        this.showPaywall = true;
        return;
      }
      this.settings.language = lang;
      haptic('light');
      this.save();
    },
    onStatsTap() {
      haptic('light');
      if (this.isPro) {
        uni.navigateTo({ url: '/pages/stats/index' });
      } else {
        this.showPaywall = true;
      }
    },
    toggleLanguage() {
      const newLang = this.settings.language === 'zh-CN' ? 'en-US' : 'zh-CN';
      this.setLanguage(newLang);
    },
    toggleBirthdayEnabled() {
      this.settings.birthdayEnabled = !this.settings.birthdayEnabled;
      if (!this.settings.birthdayEnabled) {
        this.settings.birthdayMonth = '';
      }
      haptic('light');
      this.save();
    },
    selectBirthdayMonth(value) {
      this.settings.birthdayMonth = value;
      haptic('light');
      this.save();
    },
    onSliderChange(e, key) {
      this.settings[key] = e.detail.value;
      this.save();
    },
    onSliderChanging(e, key) {
      this.settings[key] = e.detail.value;
      haptic('light'); 
    },
    save() {
      wioService.saveSettings(this.settings);
      uni.showToast({
        title: t('profile.saved', this.settings.language),
        icon: 'none'
      });
    },
    // ===== 账号卡 =====
    onAccountCardTap() {
      haptic('light');
      if (!this.isLogin) {
        this.openAuthSheet('login');
        return;
      }
      // 已登录：提供完善资料 / 退出登录入口
      const lang = this.settings.language;
      uni.showActionSheet({
        itemList: [t('profile.accountEditProfile', lang), t('profile.accountLogout', lang)],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.openAuthSheet('edit');
          } else if (res.tapIndex === 1) {
            this.onLogout();
          }
        }
      });
    },
    onLogout() {
      // 云端数据保留，仅清本地会话与同步状态
      logout();
      this.session = null;
      uni.showToast({ title: t('profile.logoutSuccess', this.settings.language), icon: 'none' });
    },
    // ===== 授权登录 / 完善资料弹层 =====
    // 说明弹层与勾选等轻交互也统一给触感，避免有的地方震有的不震
    showBirthdayInfo() {
      haptic('light');
      this.showBirthdaySheet = true;
    },
    showCompOffInfo() {
      haptic('light');
      this.showRuleSheet = true;
    },
    closeInfoSheet() {
      haptic('light');
      this.showBirthdaySheet = false;
      this.showRuleSheet = false;
    },
    toggleAgree() {
      haptic('light');
      this.authForm.agreed = !this.authForm.agreed;
    },
    openAuthSheet(mode = 'login') {
      haptic('light');
      const cached = this.session && this.session.user ? this.session.user : {};
      this.authMode = mode;
      this.authForm = {
        nickname: cached.nickname || '',
        // 编辑模式回显现有头像（cloud:// fileID 可直接作为 image src）
        avatarTemp: mode === 'edit' ? (cached.avatarFileID || '') : '',
        agreed: false
      };
      this.showAuthSheet = true;
    },
    closeAuthSheet() {
      haptic('light');
      this.showAuthSheet = false;
    },
    onChooseAvatar(e) {
      // 微信新规：chooseAvatar 返回临时文件，立即持久化到云存储
      console.log('[auth] chooseAvatar detail:', e && e.detail);
      if (e && e.detail && e.detail.avatarUrl) {
        this.authForm.avatarTemp = e.detail.avatarUrl;
      }
    },
    onNicknameInput(e) {
      this.authForm.nickname = e.detail.value;
    },
    onNicknameBlur(e) {
      this.authForm.nickname = e.detail.value || this.authForm.nickname;
    },
    async onSubmitLogin() {
      const isLoginMode = this.authMode === 'login';
      if (isLoginMode && !this.authForm.agreed) {
        uni.showToast({ title: t('profile.needAgree', this.settings.language), icon: 'none' });
        return;
      }
      if (!this.authForm.nickname || !this.authForm.nickname.trim()) {
        uni.showToast({ title: t('profile.nicknameRequired', this.settings.language), icon: 'none' });
        return;
      }
      uni.showLoading({ title: '' });
      try {
        // 头像有选择时先传云存储，拿到 fileID 再登录；失败则中断并明确提示
        let avatarFileId = '';
        if (this.authForm.avatarTemp) {
          try {
            avatarFileId = await uploadAvatar(this.authForm.avatarTemp);
            console.log('[auth] avatar uploaded:', avatarFileId);
          } catch (err) {
            uni.hideLoading();
            console.error('[auth] avatar upload failed:', err);
            uni.showToast({ title: t('profile.avatarUploadFail', this.settings.language), icon: 'none' });
            return;
          }
        }
        this.session = await login({
          nickname: this.authForm.nickname,
          avatarFileID: avatarFileId
        });
        uni.hideLoading();
        this.showAuthSheet = false;
        uni.showToast({ title: t('profile.loginSuccess', this.settings.language), icon: 'success' });
        // 首次登录成功后自动拉一次云端数据；完善资料模式无需
        if (isLoginMode) {
          syncService.pull().catch(() => {});
        }
      } catch (err) {
        uni.hideLoading();
        console.error('login failed', err);
        uni.showToast({ title: t('profile.loginFailed', this.settings.language), icon: 'none' });
      }
    },
    // ===== 同步卡 =====
    toggleAutoSync() {
      this.settings.autoSync = !this.settings.autoSync;
      haptic('light');
      this.save();
      // 只有开启时才立即对齐一次；关闭时不能还去拉云端覆盖本地
      if (this.settings.autoSync) syncService.init();
    },
    async onSyncNow() {
      haptic('light');
      uni.showLoading({ title: '' });
      try {
        // syncNow 内部已吞掉异常并返回结果，必须按返回值判断成败，
        // 否则网络失败也会弹「同步成功」
        const r = await syncService.syncNow();
        this.lastSyncAt = syncService.getLastSyncTime();
        uni.hideLoading();
        if (r && r.ok) {
          uni.showToast({ title: t('profile.syncDone', this.settings.language), icon: 'success' });
        } else if (r && r.conflict) {
          // 冲突由 wio:sync-conflict 事件拉起弹窗，这里不叠加提示
        } else {
          uni.showToast({ title: t('profile.syncFail', this.settings.language), icon: 'none' });
        }
      } catch (err) {
        uni.hideLoading();
        console.error('sync failed', err);
        uni.showToast({ title: t('profile.syncFail', this.settings.language), icon: 'none' });
      }
    },
    // ===== 冲突处理 =====
    onSyncConflict(info) {
      // syncService 负载：{ cloud, cloudVersion, syncedTime }
      this.conflictInfo = info || null;
    },
    async onResolveLocal() {
      haptic('medium');
      const info = this.conflictInfo;
      this.conflictInfo = null;
      try {
        await syncService.resolveConflict('local', info);
      } catch (err) {
        console.error('resolve conflict(local) failed', err);
      }
    },
    async onResolveCloud() {
      haptic('medium');
      const info = this.conflictInfo;
      this.conflictInfo = null;
      try {
        await syncService.resolveConflict('cloud', info);
      } catch (err) {
        console.error('resolve conflict(cloud) failed', err);
      }
    },
    onDataRestored() {
      // 云端数据覆盖本地后，刷新整页状态
      this.loadSettings();
      this.lastSyncAt = syncService.getLastSyncTime();
      this.session = getAuth();
    },
    // ===== 语言同步 =====
    // 会员页等处切换语言后由 wioService 广播，这里只更新语言字段，
    // 不整页 reload，避免冲掉用户正在拖动的滑杆等未保存状态
    onLanguageChanged(lang) {
      if (!lang || lang === this.settings.language) return;
      this.settings = { ...this.settings, language: lang };
    },
    // 权益变化（登录 / 退出 / 核销 / 订阅刷新）：重算 isPro，并同步会话快照。
    // 退出登录时语言也会在这里被 getSettings 降级回中文。
    onProChanged() {
      this.trialStamp++;
      this.session = getAuth();
      this.loadSettings();
    },
    // ===== 会员入口 =====
    goMember() {
      haptic('light');
      // 会员页已不是 tab 页，改为普通页面栈跳转
      uni.navigateTo({ url: '/pages/member/index' });
    },
    // 同步事件绑定：仅当前可见页处理，避免会员页与我的页同时弹冲突窗
    bindSync() {
      uni.$off('wio:sync-conflict', this.onSyncConflict);
      uni.$off('wio:data-restored', this.onDataRestored);
      uni.$on('wio:sync-conflict', this.onSyncConflict);
      uni.$on('wio:data-restored', this.onDataRestored);
      // 冲突常发生在启动 / 切后台（那时没有任何页面在监听事件），
      // 事件会丢；这里补捞一次暂存的冲突，保证弹窗一定会出现
      const pending = syncService.takePendingConflict();
      if (pending) this.onSyncConflict(pending);
    },
    unbindSync() {
      uni.$off('wio:sync-conflict', this.onSyncConflict);
      uni.$off('wio:data-restored', this.onDataRestored);
    },
    // ===== 付费墙 =====
    onProUpgraded() {
      // 兑换码核销成功：trialStamp 触发 isPro 重算
      this.trialStamp++;
      this.showPaywall = false;
    },
    formatTime(ts) {
      if (!ts) return '—';
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
}
</script>

<style scoped>
.profile-root {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.profile-scroll {
  height: 100%;
}

.content {
  /* 左右 20；底部为毛玻璃 TabBar 让位（用内边距而不是页面 padding，
     这样内容能滚到 TabBar 后方被磨砂虚化，滚到底时最后一项仍完整露出） */
  padding: 0 20px 0 20px;
  padding-bottom: calc(96px + constant(safe-area-inset-bottom));
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

/* ===== 通用卡片 ===== */
.settings-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
}

/* ===== 会员入口卡 ===== */
.member-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.member-entry:active {
  opacity: 0.88;
}

.member-entry-badge {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: rgba(192, 138, 45, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 已开通：金色渐变徽章 */
.member-entry-badge.on {
  background: linear-gradient(135deg, #D9A94F, #B07A22);
}

.member-entry-badge-text {
  font-size: 10px;
  font-weight: 800;
  color: #A9761F;
  letter-spacing: 0.6px;
}

.member-entry-badge.on .member-entry-badge-text {
  color: #FFF9EE;
}

.member-entry-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.member-entry-title {
  font-size: 14px;
  font-weight: 600;
  color: #18191C;
}

.member-entry-sub {
  font-size: 10.5px;
  color: #8A94A0;
  margin-top: 3px;
  line-height: 1.4;
}

.member-entry-sub.on {
  color: #A9761F;
}

.member-entry-chevron {
  font-size: 16px;
  color: #C3C9CE;
  flex-shrink: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 500;
  color: #15181C;
  line-height: 1.4;
}

.card-hint {
  font-size: 11px;
  color: #9AA1A8;
  line-height: 1.4;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-hint {
  font-size: 10px;
  color: #9AA1A8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ===== ⓘ 信息按钮 ===== */
.info-btn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.2px solid #A3A9B0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-icon {
  font-size: 10px;
  font-style: italic;
  font-weight: 600;
  color: #A3A9B0;
  line-height: 1;
}

/* ===== 目标卡 ===== */
.target-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.target-labels {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.target-value {
  font-size: 20px;
  font-weight: 700;
  color: #0E6E62;
  line-height: 1.2;
}

.slider-wrap {
  width: 100%;
}

.target-slider {
  margin-top: 10px;
}

.tick-row {
  display: flex;
  justify-content: space-between;
}

.tick-text {
  font-size: 9px;
  color: #9AA1A8;
  line-height: 1.3;
}

.tick-text.tick-active {
  color: #0E6E62;
  font-weight: 500;
}

/* ===== 生日假卡 ===== */
.birthday-config {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.month-options {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.month-option {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
  border: 1px solid #EDEFF1;
  border-radius: 10px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.month-option.active {
  background: #FBEAF0;
  border-color: #FBEAF0;
}

.month-option:active {
  transform: scale(0.96);
}

.month-text {
  font-size: 10px;
  font-weight: 500;
  color: #3A4149;
  white-space: nowrap;
}

.month-option.active .month-text {
  color: #C24A7E;
  font-weight: 600;
}

.card-foot-hint {
  font-size: 9px;
  color: #9AA1A8;
  line-height: 1.6;
}

.birthday-disabled-hint {
  margin-top: 10px;
  padding: 10px;
  background-color: #FBEAF0;
  border-radius: 8px;
  text-align: center;
}

.hint-text {
  font-size: 11px;
  color: #C24A7E;
  font-weight: 500;
}

/* ===== 自定义假期卡 ===== */
.custom-leave-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid #F2F4F5;
}

.custom-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.custom-leave-name {
  font-size: 12.5px;
  color: #3A4149;
  flex: 1;
}

.custom-leave-range {
  font-size: 10.5px;
  color: #6B7379;
}

.custom-leave-chevron {
  font-size: 13px;
  color: #B5BBC1;
}

.custom-empty {
  padding: 6px 0 2px;
}

.custom-empty-text {
  font-size: 11px;
  color: #9AA1A8;
  line-height: 1.5;
}

.custom-add-btn {
  margin-top: 8px;
  height: 36px;
  border-radius: 10px;
  background: #EDF5F3;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-add-btn:active {
  opacity: 0.85;
}

.custom-add-text {
  font-size: 12px;
  font-weight: 500;
  color: #0E6E62;
}


/* ===== 开关 ===== */
.toggle-switch {
  cursor: pointer;
}

.switch-track {
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background-color: #ccc;
  position: relative;
  transition: background-color 0.3s;
}

.switch-track.on {
  background-color: #C08A2D;
}

.switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #fff;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: left 0.3s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.switch-track.on .switch-thumb {
  left: 19px;
}

/* ===== 假期额度卡 ===== */
.quota-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quota-block + .quota-block {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #F0F2F4;
}

/* 最后一个额度块，底部多留一点呼吸空间 */
.quota-block-last {
  padding-bottom: 8px;
}

.quota-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quota-label {
  font-size: 12px;
  color: #3A4149;
  line-height: 1.4;
}

.quota-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.quota-value {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.vacation-color { color: #41598A; }
.sick-color { color: #8C4F86; }

.quota-sub {
  font-size: 10px;
  color: #6B7379;
  line-height: 1.4;
}

/* 额度用尽 / 超额：标红，和「已用完不能再标记」的行为对应 */
.quota-empty {
  color: #A63A31;
  font-weight: 500;
}

.quota-slider {
  height: 16px;
}

/* 自定义假期的只读进度条（不像年假/病假那样带 slider） */
.quota-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.quota-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}

.quota-track {
  height: 5px;
  background-color: #EFF1F3;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 2px;
}

.quota-fill {
  height: 5px;
  border-radius: 3px;
}

/* ===== 调休补班 chips ===== */
.holiday-scroll {
  width: 100%;
  white-space: nowrap;
  margin-top: 10px;
}

/* 隐藏横向滚动条 */
.holiday-scroll ::-webkit-scrollbar,
.holiday-scroll ::v-deep ::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.holiday-row {
  display: flex;
  flex-direction: row;
  gap: 5px;
  padding-bottom: 4px;
}

.holiday-chip {
  flex: 0 0 auto;
  height: 26px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F4F5F6;
  border-radius: 8px;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.holiday-chip.active {
  background: #E7F1EF;
}

.holiday-chip:active {
  transform: scale(0.96);
}

.holiday-chip-text {
  font-size: 10.5px;
  font-weight: 500;
  color: #A3A9B0;
  line-height: 1.2;
  white-space: nowrap;
}

.holiday-chip.active .holiday-chip-text {
  color: #0E6E62;
  font-weight: 500;
}

.empty-hint {
  padding: 20px 0;
  text-align: center;
  color: #ccc;
  font-size: 12px;
}

/* ===== 语言卡 ===== */
.language-card {
  display: block;
  box-sizing: border-box;
}

/* 非 PRO：暖金渐变质感卡，与普通白卡区分，暗示付费权益 */
.language-card-pro {
  background: linear-gradient(150deg, #FFFDF8 0%, #FBF4E4 62%, #F6EBD3 100%);
  border: 1px solid rgba(192, 138, 45, 0.22);
  box-shadow: 0 2px 10px rgba(176, 122, 34, 0.08);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lang-segmented {
  display: flex;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  height: 40px;
  padding: 4px;
  margin-top: 12px;
  background: rgba(233, 225, 207, 0.55);
  border-radius: 12px;
  box-sizing: border-box;
}

/* 非 PRO 时分段底槽带一点暖调，融入卡片质感 */
.language-card-pro .lang-segmented {
  background: rgba(226, 214, 188, 0.45);
}

.lang-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
}

.lang-option.active {
  background: #FFFFFF;
  box-shadow: 0 2px 6px rgba(15, 35, 40, 0.1);
}

/* 锁定的 English 选项：微微降透明度示意不可用，点击仍拉起付费墙 */
.lang-option.locked {
  opacity: 0.85;
}

.lang-lock-tag {
  font-size: 9px;
  font-weight: 800;
  color: #A9761F;
  background: rgba(192, 138, 45, 0.14);
  border-radius: 6px;
  padding: 1px 5px;
  margin-left: 5px;
  letter-spacing: 0.5px;
  line-height: 1.4;
}

.lang-option-text {
  font-size: 12px;
  font-weight: 500;
  color: #8A9098;
  line-height: 1.2;
}

.lang-option.active .lang-option-text {
  color: #15181C;
  font-weight: 600;
}

/* 底部升级引导行：金色虚线分隔，点击直达付费墙 */
.lang-pro-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 11px;
  padding-top: 10px;
  border-top: 1px dashed rgba(192, 138, 45, 0.3);
}

.lang-pro-hint-text {
  font-size: 11px;
  color: #A9761F;
}

.lang-pro-hint-arrow {
  font-size: 14px;
  color: #C08A2D;
  font-weight: 600;
  line-height: 1;
}

/* 高级统计入口卡 */
.stats-entry-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stats-entry-card:active {
  opacity: 0.85;
}
.stats-entry-left {
  display: flex;
  flex-direction: column;
}
.stats-entry-title {
  font-size: 14px;
  font-weight: 600;
  color: #18191C;
}
.stats-entry-sub {
  font-size: 11px;
  color: #8A94A0;
  margin-top: 3px;
}
.stats-entry-right {
  display: flex;
  align-items: center;
}
.stats-entry-open {
  font-size: 11px;
  color: #0E6E62;
  font-weight: 500;
}
.stats-entry-arrow {
  font-size: 16px;
  color: #C3C9CE;
  margin-left: 6px;
}

/* PRO 专属卡（同步/多语言/高级统计 统一收口） */
.pro-card-locked {
  background-color: #FFFDF8;
  border: 1px solid rgba(192, 138, 45, 0.22);
}
.pro-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pro-card-title-group {
  display: flex;
  flex-direction: column;
}
.pro-card-title {
  font-size: 15px;
  font-weight: bold;
  color: #18191C;
}
.pro-card-sub {
  font-size: 11px;
  color: #A9761F;
  margin-top: 3px;
}
.pro-card-badge-on {
  background-color: #C08A2D;
  border-radius: 999px;
  /* 高度对齐同卡开关（24px），视觉统一 */
  padding: 5px 11px;
}
.pro-card-badge-on-text {
  color: #FFF9EE;
  font-size: 10px;
  font-weight: 600;
}
.pro-feature-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 10px;
}
.pro-feature-row:active {
  opacity: 0.85;
}
.pro-feature-text {
  display: flex;
  flex-direction: column;
}
.pro-feature-title {
  font-size: 14px;
  font-weight: 600;
  color: #18191C;
}
.pro-feature-sub {
  font-size: 11px;
  color: #8A94A0;
  margin-top: 3px;
  line-height: 1.5;
}
.pro-feature-locked {
  font-size: 11px;
  color: #C0A46B;
  font-weight: 500;
}
.pro-status-on {
  font-size: 11px;
  color: #0E6E62;
  font-weight: 500;
}
/* 「即将上线」金字（更多会员功能行） */
.pro-coming-soon {
  font-size: 11px;
  color: #C08A2D;
  font-weight: 500;
}
.pro-sync-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 10px;
}
.pro-sync-time {
  font-size: 10.5px;
  color: #8A94A0;
}
.pro-sync-now {
  font-size: 10.5px;
  color: #0E6E62;
  font-weight: 500;
}
.pro-divider {
  height: 1px;
  background-color: #F1EDE5;
}
/* 续费行（PRO 已解锁态） */
.pro-renew-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 4px;
}
.pro-renew-row:active {
  opacity: 0.85;
}
.pro-renew-title {
  font-size: 12px;
  color: #A9761F;
  font-weight: 500;
}
.pro-renew-action {
  display: flex;
  align-items: center;
}
.pro-renew-text {
  font-size: 11px;
  color: #A9761F;
  font-weight: 500;
}
.pro-renew-arrow {
  font-size: 14px;
  color: #C08A2D;
  line-height: 1;
}
.pro-upgrade-cta {
  margin-top: 12px;
  background-color: #C08A2D;
  border-radius: 12px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pro-upgrade-cta:active {
  opacity: 0.9;
}
.pro-upgrade-cta-text {
  color: #FFF9EE;
  font-size: 13px;
  font-weight: bold;
}

/* 页面底部版本号 */
.version-row {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
}

.version-text {
  font-size: 11px;
  color: #9AA1A8;
}

/* ===== ⓘ 底部弹层 ===== */
/* ===== ⓘ 说明弹窗（居中卡片，避免被底部 TabBar 遮挡） ===== */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(11, 14, 18, 0.55);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 防止遮罩挡住 TabBar 手势区的同时保证弹窗本身居中且不被裁切 */
  padding: 0 32px;
  box-sizing: border-box;
}

.modal-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFFFF;
  border-radius: 20px;
  padding: 22px 20px 18px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: modal-pop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}

@keyframes modal-pop {
  from { opacity: 0; transform: scale(0.92) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.rule-icon { background: #E8F2F0; }
.birthday-icon { background: #FBEAF0; }

.modal-icon-text {
  font-size: 16px;
  font-weight: 700;
  font-family: Georgia, "Times New Roman", serif;
  color: #0E6E62;
}

.birthday-icon .modal-icon-text {
  color: #C24A7E;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #15181C;
  line-height: 1.4;
  text-align: center;
}

.modal-body {
  font-size: 13px;
  color: #5A6169;
  line-height: 1.75;
  text-align: left;
  margin-top: 10px;
}

.modal-btn {
  width: 100%;
  height: 44px;
  margin-top: 20px;
  border-radius: 12px;
  background: #0E6E62;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-btn-text {
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}

/* ===== 账号卡 ===== */
.account-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.account-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: #F0F2F4;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

/* PRO 会员效果：鎏金渐变圆环包住头像（对齐设计稿 2:57） */
.account-avatar-pro {
  box-sizing: border-box;
  padding: 3px;
  background: linear-gradient(135deg, #D9A94F 0%, #B07A22 100%);
}
.account-avatar-pro .account-avatar-img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}
.account-avatar-pro .account-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #F0F2F4;
  font-size: 16px;
  line-height: 40px;
  text-align: center;
}

.account-avatar-img {
  width: 46px;
  height: 46px;
}

.account-avatar-placeholder {
  font-size: 18px;
  font-weight: 600;
  color: #A3A9B0;
}

/* PRO 会员副标题：金色 */
.account-sub-pro {
  color: #A9761F;
  font-weight: 500;
}

.account-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-name {
  font-size: 15px;
  font-weight: 600;
  color: #15181C;
  line-height: 1.3;
}

.account-sub {
  font-size: 11px;
  color: #9AA1A8;
  line-height: 1.4;
}

.account-login-btn {
  padding: 7px 16px;
  background: #0E6E62;
  border-radius: 16px;
  flex-shrink: 0;
}

.account-login-btn:active {
  opacity: 0.85;
}

.account-login-btn-text {
  font-size: 12px;
  font-weight: 600;
  color: #FFFFFF;
}

.account-chevron {
  font-size: 18px;
  color: #C5CAD0;
  line-height: 1;
}

/* ===== 同步卡 ===== */
.sync-pill {
  padding: 3px 10px;
  border-radius: 10px;
}

.sync-pill-off {
  background: #F4F5F6;
}

.sync-pill-off .sync-pill-text {
  color: #A3A9B0;
}

.sync-pill-on {
  background: #E7F1EF;
}

.sync-pill-on-text {
  color: #0E6E62;
}

.sync-pill-text {
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
}

/* PRO 徽标：鎏金渐变 + 微投影，全页统一（同步卡 / 语言卡共用） */
.pro-badge {
  padding: 4px 11px;
  border-radius: 999px;
  background: linear-gradient(135deg, #D9A94F, #B07A22);
  box-shadow: 0 2px 6px rgba(176, 122, 34, 0.28);
}

.pro-badge-text {
  font-size: 10px;
  font-weight: 800;
  color: #FFF9EE;
  letter-spacing: 1.5px;
}

.sync-lock-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.sync-lock-icon {
  font-size: 14px;
  line-height: 1;
}

.sync-lock-text {
  font-size: 13px;
  color: #3A4149;
  line-height: 1.4;
}

.sync-benefit {
  display: block;
  margin-top: 12px;
  font-size: 13px;
  color: #3A4149;
  line-height: 1.5;
}

.sync-upgrade-btn {
  margin-top: 12px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #C08A2D, #A9761F);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sync-upgrade-btn:active {
  opacity: 0.9;
}

.sync-upgrade-btn-text {
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
}

.sync-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.sync-time {
  font-size: 12px;
  color: #6B7379;
}

.sync-detail-link {
  font-size: 12px;
  font-weight: 500;
  color: #0E6E62;
}

.sync-divider {
  height: 1px;
  background: #F0F2F4;
  margin: 12px 0;
}

.sync-auto-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sync-auto-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-auto-title {
  font-size: 13px;
  color: #15181C;
  line-height: 1.4;
}

.sync-auto-sub {
  font-size: 10px;
  color: #9AA1A8;
  line-height: 1.4;
}

.sync-hint {
  display: block;
  margin-top: 10px;
  font-size: 10px;
  color: #9AA1A8;
  line-height: 1.5;
}

/* ===== 底部弹层（授权 / 付费墙） ===== */
.sheet-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(11, 14, 18, 0.55);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFFFF;
  border-radius: 24px 24px 0 0;
  padding: 24px 20px calc(env(safe-area-inset-bottom) + 20px) 20px;
  display: flex;
  flex-direction: column;
  animation: sheet-up 0.25s cubic-bezier(0.32, 0.9, 0.55, 1);
}

@keyframes sheet-up {
  from { transform: translateY(40%); opacity: 0.6; }
  to   { transform: translateY(0); opacity: 1; }
}

.sheet-title {
  font-size: 17px;
  font-weight: 600;
  color: #15181C;
  text-align: center;
  margin-bottom: 20px;
}

/* --- 授权弹层 --- */
.auth-avatar-row {
  position: relative; /* 让透明 chooseAvatar 按钮相对本行定位，覆盖头像框 */
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 2px;
}

.auth-avatar-box {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #F0F2F4;
  border: 1px dashed #C5CAD0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.auth-avatar-img {
  width: 60px;
  height: 60px;
}

.auth-avatar-plus {
  font-size: 20px;
  color: #A3A9B0;
  line-height: 1;
}

/* 透明按钮覆盖在头像上，承载 open-type=chooseAvatar */
.auth-avatar-btn {
  position: absolute;
  left: 0;
  top: 0;
  width: 68px;
  height: 68px;
  /* 抵消 button 默认边框，保持完全透明覆盖头像框 */
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  opacity: 0;
  z-index: 2;
}

.auth-avatar-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.auth-avatar-label {
  font-size: 14px;
  font-weight: 500;
  color: #15181C;
}

.auth-avatar-hint {
  font-size: 11px;
  color: #9AA1A8;
}

.auth-input-row {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 2px;
}

.auth-input-label {
  font-size: 14px;
  color: #3A4149;
  flex-shrink: 0;
}

.auth-input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  background: #F4F5F6;
  border-radius: 10px;
  font-size: 14px;
  color: #15181C;
}

.auth-agree-row {
  margin-top: 18px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agree-check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.2px solid #C5CAD0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.agree-check.checked {
  background: #0E6E62;
  border-color: #0E6E62;
}

.agree-check-icon {
  font-size: 10px;
  color: #FFFFFF;
  line-height: 1;
}

.agree-text-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.agree-text {
  font-size: 11px;
  color: #6B7379;
  line-height: 1.6;
}

.agree-link {
  font-size: 11px;
  color: #0E6E62;
  line-height: 1.6;
}

.auth-submit-btn {
  margin-top: 20px;
  height: 46px;
  border-radius: 14px;
  background: #07C160;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-submit-btn:active {
  opacity: 0.85;
}

.auth-submit-text {
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}

.auth-cancel-btn {
  margin-top: 10px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-cancel-text {
  font-size: 13px;
  color: #9AA1A8;
}


/* ===== 冲突弹窗 ===== */
.conflict-card {
  align-items: stretch;
}

.conflict-icon {
  align-self: center;
  background: #FEF3E2;
}

.conflict-icon-text {
  font-size: 18px;
  line-height: 1;
}

.conflict-options {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict-option {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #EDEFF1;
  background: #F8F9FA;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.conflict-option-cloud {
  border-color: #CDE4DF;
  background: #F2F8F7;
}

.conflict-option-title {
  font-size: 13px;
  font-weight: 600;
  color: #15181C;
  line-height: 1.3;
}

.conflict-option-sub {
  font-size: 10px;
  color: #9AA1A8;
  line-height: 1.4;
}

.conflict-btn-row {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}

.conflict-btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conflict-btn-ghost {
  background: #F4F5F6;
}

.conflict-btn-ghost-text {
  font-size: 13px;
  font-weight: 500;
  color: #3A4149;
}

.conflict-btn-primary {
  background: #0E6E62;
}

.conflict-btn-primary-text {
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
}

</style>
