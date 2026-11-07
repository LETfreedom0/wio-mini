<template>
  <view class="member-root">
    <scroll-view scroll-y="true" class="member-scroll" @scroll="onScroll" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <view class="member-head" :style="{ paddingTop: topSafe + 4 + 'px' }">
        <view class="member-back" @click="goBack">
          <text class="member-back-icon">‹</text>
        </view>
      </view>

      <view class="content">

        <!-- ===== 会员状态卡 ===== -->
        <view class="settings-card pro-status-card" :class="{ 'pro-locked': !isPro }">
          <view class="pro-head">
            <view class="pro-head-left">
              <text class="pro-name">WIO PRO</text>
              <text class="pro-sub">{{ isPro ? planLine : i18n.profile.proCardSubOff }}</text>
            </view>
            <view v-if="isPro" class="badge-on">
              <text class="badge-on-text">{{ i18n.profile.proCardUnlocked }}</text>
            </view>
            <view v-else class="badge-off">
              <text class="badge-off-text">PRO</text>
            </view>
          </view>

          <!-- 已开通：续费行 -->
          <template v-if="isPro">
            <view class="divider"></view>
            <view class="renew-row" @click="openPaywall">
              <text class="renew-note">{{ i18n.profile.memberNoAutoRenew }}</text>
              <view class="renew-action">
                <text class="renew-text">{{ i18n.profile.renewAction }}</text>
                <text class="renew-arrow">›</text>
              </view>
            </view>
          </template>

          <!-- 未开通：升级 CTA -->
          <view v-else class="upgrade-cta" @click="openPaywall">
            <text class="upgrade-text">{{ i18n.profile.upgradeProCta }}</text>
          </view>
        </view>

        <!-- ===== 云端同步（手动：两个方向分开，永不自动覆盖） ===== -->
        <view class="settings-card" @click="onSyncCardTap">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.benefitSync }}</text>
              <text class="feat-sub">{{ syncSub }}</text>
            </view>
            <view v-if="isPro && isLogin && syncRemoteNewer" class="sync-newdot"></view>
            <text v-else-if="!isPro || !isLogin" class="feat-locked">{{ lockText }}</text>
          </view>

          <template v-if="isPro && isLogin">
            <view class="sync-meta">
              <text class="sync-meta-line">{{ i18n.profile.lastSync }} · {{ lastSyncText }}</text>
              <text class="sync-meta-line">{{ localCountText }}</text>
            </view>
            <text v-if="!syncRemoteNewer && syncPending" class="sync-pending">{{ i18n.profile.syncPendingLocal }}</text>
            <view v-if="syncRemoteNewer" class="sync-warn">
              <text class="sync-warn-dot">●</text>
              <text class="sync-warn-text">{{ remoteNewerText }}</text>
            </view>

            <view class="sync-actions">
              <view class="sync-btn" :class="{ 'sync-btn-off': !syncLocalCount }" @click.stop="onUploadTap">
                <text class="sync-btn-text">{{ i18n.profile.syncUpload }}</text>
              </view>
              <view class="sync-btn sync-btn-ghost" @click.stop="onRestoreTap">
                <text class="sync-btn-ghost-text">{{ i18n.profile.syncRestore }}</text>
              </view>
            </view>
            <text v-if="syncLocalCount === 0" class="sync-foot">{{ i18n.profile.syncUploadDisabled }}</text>
            <text
              v-else-if="syncCanUndo"
              class="sync-undo"
              @click.stop="onUndoRestore">{{ i18n.profile.syncUndoRestore }}</text>
          </template>
        </view>

        <!-- ===== 高级统计（入口跳转年度统计页） ===== -->
        <view class="settings-card" @click="onStatsTap">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.statsEntry }}</text>
              <text class="feat-sub">{{ i18n.profile.statsEntrySub }}</text>
            </view>
            <view v-if="isPro" class="feat-right">
              <text class="feat-on">{{ i18n.profile.statsEntryOpen }}</text>
              <text class="feat-arrow">›</text>
            </view>
            <text v-else class="feat-locked">{{ i18n.profile.proLockedShort }}</text>
          </view>
        </view>

        <!-- ===== 多语言 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.proLangTitle }}</text>
              <text class="feat-sub">{{ i18n.profile.benefitLangSub }}</text>
            </view>
            <text v-if="!isPro" class="feat-locked">{{ i18n.profile.proLockedShort }}</text>
          </view>
          <view class="lang-segmented">
            <view class="lang-option" :class="{ active: settings.language === 'zh-CN' }" @click="setLanguage('zh-CN')">
              <text class="lang-option-text">简体中文</text>
            </view>
            <view class="lang-option" :class="{ active: settings.language === 'en-US', locked: !isPro }" @click="setLanguage('en-US')">
              <text class="lang-option-text">English</text>
              <text v-if="!isPro" class="lang-lock-tag">PRO</text>
            </view>
          </view>
          <text class="feat-foot">{{ i18n.profile.memberLangNote }}</text>
        </view>

        <!-- ===== 自定义假期 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.customLeaveTitle }}</text>
              <text class="feat-sub">{{ i18n.profile.customLeaveHint }}</text>
            </view>
            <text v-if="!isPro" class="feat-locked">{{ i18n.profile.proLockedShort }}</text>
          </view>

          <view v-for="l in visibleLeaves" :key="l.id" class="custom-leave-row" @click="openCustomEdit(l)">
            <view class="custom-dot" :style="{ background: l.color }"></view>
            <text class="custom-leave-name">{{ l.name }}</text>
            <text class="custom-leave-range">{{ fmtCustomRange(l) }}</text>
            <text class="custom-leave-chevron">›</text>
          </view>

          <view v-if="!isPro" class="custom-empty">
            <text class="custom-empty-text">{{ i18n.profile.customLeaveLocked }}</text>
          </view>
          <view v-else-if="visibleLeaves.length === 0" class="custom-empty">
            <text class="custom-empty-text">{{ i18n.profile.customLeaveEmpty }}</text>
          </view>

          <view class="custom-add-btn" @click="openCustomAdd">
            <text class="custom-add-text">{{ i18n.profile.customLeaveAdd }}</text>
          </view>
          <text class="feat-foot">{{ i18n.profile.customLeaveCounted }}</text>
        </view>

        <!-- ===== 更多会员功能 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.benefitMore }}</text>
              <text class="feat-sub">{{ i18n.profile.benefitMoreSub }}</text>
            </view>
            <text class="coming-soon">{{ i18n.profile.comingSoon }}</text>
          </view>
        </view>

        <view class="version-row"><text class="version-text">{{ versionLabel }}</text></view>
      </view>
    </scroll-view>

    <CustomLeaveSheet
      :visible="showCustomSheet"
      :leave="customEditLeave"
      @close="showCustomSheet = false"
      @saved="onCustomSaved"
    />
    <PaywallSheet :visible="showPaywall" @close="showPaywall = false" @upgraded="onProUpgraded" />

    <!-- 上传前先说清「这次会发生什么」，绝不盲推 -->
    <view v-if="uploadPlan" class="sheet-mask" @click.stop="closeUploadSheet">
      <view class="upload-card" @click.stop>
        <view class="upload-head">
          <text class="upload-title">{{ i18n.profile.syncUploadTitle }}</text>
          <text class="upload-close" @click.stop="closeUploadSheet">✕</text>
        </view>

        <scroll-view scroll-y="true" class="upload-body">
          <text v-if="uploadPlan.noBaseline" class="upload-note upload-note-warn">{{ i18n.profile.syncNoBaseline }}</text>

          <view v-if="uploadPlan.toUpload.length" class="upload-sec">
            <text class="upload-sec-title">{{ uploadPlan.toUpload.length }}{{ i18n.profile.syncWillUpload }}</text>
            <text v-for="it in uploadPlan.toUpload" :key="'u' + it.kind + it.key" class="upload-item">
              {{ it.key }} · {{ itemText(it) }}
            </text>
          </view>

          <view v-if="uploadPlan.bothDiffer.length" class="upload-sec">
            <text class="upload-sec-title">{{ uploadPlan.bothDiffer.length }}{{ i18n.profile.syncWillOverride }}</text>
            <text class="upload-hint">{{ i18n.profile.syncHintPick }}</text>
            <view
              v-for="it in uploadPlan.bothDiffer"
              :key="'d' + it.kind + it.key"
              class="upload-row"
              @click="toggleCloudWin(it)">
              <view class="upload-box" :class="{ on: it.cloudWins }">
                <text v-if="it.cloudWins" class="upload-box-tick">✓</text>
              </view>
              <text class="upload-row-text">
                <text class="upload-row-key">{{ it.key }} · </text>
                <text :class="it.cloudWins ? 'val-dim' : 'val-win'">{{ i18n.profile.syncLocal }} {{ itemText(it, 'local') }}</text>
                <text class="val-sep"> / </text>
                <text :class="it.cloudWins ? 'val-win' : 'val-dim'">{{ i18n.profile.syncCloud }} {{ itemText(it, 'cloud') }}</text>
              </text>
            </view>
          </view>

          <view v-if="uploadPlan.toDownload.length" class="upload-sec">
            <text class="upload-sec-title">
              {{ uploadPlan.toDownload.length }}{{ i18n.profile.syncWillDownload }}<text v-if="dropCount" class="upload-sec-warn">，{{ dropCount }}{{ i18n.profile.syncDropCount }}</text>
            </text>
            <text class="upload-hint">{{ i18n.profile.syncHintDrop }}</text>
            <view
              v-for="it in uploadPlan.toDownload"
              :key="'g' + it.kind + it.key"
              class="upload-row"
              @click="toggleCloudWin(it)">
              <view class="upload-box" :class="{ on: it.cloudWins !== false }">
                <text v-if="it.cloudWins !== false" class="upload-box-tick">✓</text>
              </view>
              <text class="upload-row-text" :class="{ 'val-dim': it.cloudWins === false }">
                {{ it.key }} · {{ itemText(it) }}
              </text>
              <text v-if="it.cloudWins === false" class="upload-drop-badge">{{ i18n.profile.syncDropBadge }}</text>
            </view>
          </view>

          <view v-if="uploadPlan.localDeleted.length" class="upload-sec">
            <text class="upload-sec-title">{{ uploadPlan.localDeleted.length }}{{ i18n.profile.syncWillDelete }}</text>
            <text v-for="it in uploadPlan.localDeleted" :key="'x' + it.kind + it.key" class="upload-item upload-item-warn">
              {{ it.key }} · {{ itemText(it) }}
            </text>
          </view>

          <view v-if="uploadPlan.settingsDiffer.length" class="upload-sec">
            <text class="upload-sec-title">{{ uploadPlan.settingsDiffer.length }}{{ i18n.profile.syncSettingsDiff }}</text>
            <text class="upload-item">{{ uploadPlan.settingsDiffer.join(' · ') }}</text>
          </view>

          <!-- 云端删了、本机还在：按「宁可多留」补回去，但必须让你看见 -->
          <view v-if="uploadPlan.cloudDeleted.length" class="upload-sec">
            <text class="upload-sec-title">{{ uploadPlan.cloudDeleted.length }}{{ i18n.profile.syncWillRevive }}</text>
            <text v-for="it in uploadPlan.cloudDeleted" :key="'r' + it.kind + it.key" class="upload-item">
              {{ it.key }} · {{ itemText(it) }}
            </text>
          </view>

          <text v-if="planIsEmpty" class="upload-empty">{{ i18n.profile.syncNothingToDo }}</text>
          <text v-if="uploadPlan.overwriteMode" class="upload-note upload-note-warn">{{ i18n.profile.syncOverwriteWarn }}</text>
        </scroll-view>

        <view class="upload-actions">
          <view v-if="!uploadPlan.overwriteMode" class="upload-primary" @click="doUploadMerge">
            <text class="upload-primary-text">{{ i18n.profile.syncDoMerge }}</text>
          </view>
          <view v-else class="upload-primary upload-primary-danger" @click="doUploadOverwrite">
            <text class="upload-primary-text">{{ i18n.profile.syncDoOverwrite }}</text>
          </view>
          <text v-if="!uploadPlan.overwriteMode" class="upload-alt" @click="askOverwrite">
            {{ i18n.profile.syncSwitchOverwrite }}
          </text>
          <text v-else class="upload-alt" @click="uploadPlan.overwriteMode = false">
            {{ i18n.profile.syncBackToMerge }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'
import { getAuth, refreshSubscription } from '@/utils/auth.js'
import { isProUser, getProState, proExpireDate, PRO_CHANGED_EVENT } from '@/utils/pro.js'
import * as syncService from '@/utils/syncService.js'
import CustomLeaveSheet from '@/components/CustomLeaveSheet.vue'
import PaywallSheet from '@/components/PaywallSheet.vue'
import { tap as haptic } from '@/utils/haptic.js'
import { APP_VERSION_LABEL } from '@/utils/appVersion.js'

export default {
  name: 'MemberView',
  components: { CustomLeaveSheet, PaywallSheet },
  props: {
    // 顶部安全区（状态栏 + 胶囊行）像素高度，由页面容器测得
    topSafe: { type: Number, default: 64 }
  },
  data() {
    return {
      settings: { language: 'zh-CN' },
      session: null,
      trialStamp: 0,
      showPaywall: false,
      showCustomSheet: false,
      customEditLeave: null,
      customLeaves: [],
      lastSyncAt: 0,
      // 同步卡状态：只读本地缓存，不发请求
      syncSummary: { localCount: 0, remoteCount: 0, remoteNewer: false, canUndoRestore: false },
      // 上传前算出来的差异计划，非空即弹出确认层
      uploadPlan: null,
      busy: false,
      lastNx: 0
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    versionLabel() {
      return APP_VERSION_LABEL
    },
    isLogin() {
      return !!(this.session && this.session.user && this.session.user.openid)
    },
    isPro() {
      // 与「我的」页同一口径（utils/pro.js）：实时读存储，
      // 不再依赖本组件 data.session 快照，避免两页判定分叉
      void this.trialStamp
      return isProUser()
    },
    // 未开通的 PRO 用户（兑换码）也要能编辑假期，这里按 isPro 判断
    visibleLeaves() {
      return this.isPro ? this.customLeaves : []
    },
    // 锁定态右侧文案：未登录 / 未解锁
    lockText() {
      if (!this.isLogin) return this.i18n.profile.proLoginShort
      return this.i18n.profile.proLockedShort
    },
    syncSub() {
      if (!this.isLogin) return this.i18n.profile.memberSyncGuest
      if (!this.isPro) return this.i18n.profile.syncProBenefit
      return this.i18n.profile.syncManualSub
    },
    syncRemoteNewer() {
      return !!this.syncSummary.remoteNewer
    },
    syncLocalCount() {
      return this.syncSummary.localCount || 0
    },
    syncCanUndo() {
      return !!this.syncSummary.canUndoRestore
    },
    syncPending() {
      return !!this.syncSummary.dirty
    },
    localCountText() {
      const L = this.i18n.profile
      return L.syncLocalCount.replace('{n}', this.syncLocalCount)
        + ' · ' + L.syncCloudCount.replace('{n}', this.syncSummary.remoteCount || 0)
    },
    remoteNewerText() {
      const n = this.syncSummary.remoteCount || 0
      return this.i18n.profile.syncRemoteNewer.replace('{n}', n)
    },
    planIsEmpty() {
      const p = this.uploadPlan
      if (!p) return false
      return !p.toUpload.length && !p.toDownload.length && !p.bothDiffer.length
        && !p.localDeleted.length && !p.cloudDeleted.length && !p.settingsDiffer.length
    },
    /** 本次上传将从云端删掉的条数（云端有、本机没有，且被取消了勾选） */
    dropCount() {
      const p = this.uploadPlan
      if (!p) return 0
      return p.toDownload.filter(it => it.cloudWins === false).length
    },
    planLine() {
      void this.trialStamp
      const plan = getProState().plan || 'trial'
      const name = plan === 'year' ? this.i18n.profile.planYear
        : plan === 'month' ? this.i18n.profile.planMonth
        : this.i18n.profile.proMemTrial
      return `${name} · ${this.i18n.profile.renewValidUntil} ${this.renewDate}`
    },
    renewDate() {
      void this.trialStamp
      return proExpireDate()
    },
    lastSyncText() {
      if (!this.lastSyncAt) return '—'
      const d = new Date(this.lastSyncAt)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  },
  mounted() {
    this.load()
    this.bindSync()
    uni.$on(PRO_CHANGED_EVENT, this.onProChanged)
    // 订阅的真身在云端数据库，本地只是镜像：进页面时对齐一次，
    // 避免「已经付过钱、但本地缓存还是旧的」导致页面显示未开通
    refreshSubscription()
    // 进同步页只做一次「只读检查」：知道云端有没有更新即可，不动本地数据
    this.refreshRemote()
  },
  beforeUnmount() {
    this.unbindSync()
    uni.$off(PRO_CHANGED_EVENT, this.onProChanged)
  },
  // 显示/隐藏由页面容器（pages/member/index.vue）驱动：
  // 子组件内的 onShow/onHide 在 Vue3 下不会被触发
  methods: {
    bindSync() {
      uni.$off('wio:data-restored', this.onDataRestored)
      uni.$on('wio:data-restored', this.onDataRestored)
    },
    unbindSync() {
      uni.$off('wio:data-restored', this.onDataRestored)
    },
    load() {
      this.settings = wioService.getSettings()
      if (!this.settings.language) this.settings.language = 'zh-CN'
      this.customLeaves = wioService.getCustomLeaves()
      this.session = getAuth()
      this.lastSyncAt = syncService.getLastSyncTime()
      this.syncSummary = syncService.getSyncSummary()
    },
    /** 只读检查云端：有更新就亮红点，不写任何本地数据 */
    async refreshRemote() {
      if (!this.isPro || !this.isLogin) return
      try {
        const r = await syncService.checkRemote()
        if (r.ok) {
          this.syncSummary = syncService.getSyncSummary()
          this.lastSyncAt = syncService.getLastSyncTime()
        }
      } catch (e) { /* 网络失败保持旧状态，不打扰 */ }
    },
    // 权益变化（登录 / 退出 / 核销 / 过期）：重算 isPro 并刷新可见范围
    onProChanged() {
      this.trialStamp++
      this.load()
    },
    onScroll(e) {
      // 滚动位置映射为垂直视线：顶部=向上看，下滑=向下看
      const ny = Math.max(-1, Math.min(1, e.detail.scrollTop / 400))
      uni.$emit('wio-gaze', { nx: this.lastNx, ny, active: true })
      clearTimeout(this.scrollTimer)
      this.scrollTimer = setTimeout(() => {
        uni.$emit('wio-gaze', { nx: 0, ny: 0, active: false })
      }, 300)
    },
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0]
        const w = uni.getSystemInfoSync().windowWidth
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)))
      }
    },
    onTouchEnd() {
      setTimeout(() => { this.lastNx = 0 }, 600)
    },
    openPaywall() {
      haptic('light')
      this.showPaywall = true
    },
    onProUpgraded() {
      this.trialStamp++
      this.showPaywall = false
    },
    // ===== 返回 =====
    goBack() {
      haptic('light')
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack({ delta: 1 })
      } else {
        // 分享卡片/扫码直达时页面栈只有一层，退回「我的」页
        uni.switchTab({ url: '/pages/profile/index' })
      }
    },
    // ===== 同步（纯手动：两个方向分开，永不在后台自动跑） =====
    onSyncCardTap() {
      // 点卡片只刷新一次「云端有没有更新」，不触发任何写操作
      if (!this.isPro) {
        this.openPaywall()
        return
      }
      if (!this.isLogin) {
        // 账号登录收口在「我的」页，避免两处维护授权弹层
        uni.showToast({ title: this.i18n.profile.memberSyncGuest, icon: 'none' })
        setTimeout(() => {
          uni.switchTab({ url: '/pages/profile/index' })
        }, 800)
        return
      }
      this.refreshRemote()
    },

    /** 上传：先算差异 → 弹层说清「会上传什么、会改什么」→ 用户确认才动云端 */
    async onUploadTap() {
      haptic('light')
      if (this.busy) return
      if (!this.syncLocalCount) {
        uni.showToast({ title: this.i18n.profile.syncUploadDisabled, icon: 'none' })
        return
      }
      this.busy = true
      uni.showLoading({ title: '' })
      try {
        const r = await syncService.prepareUpload()
        uni.hideLoading()
        if (!r.ok) {
          uni.showToast({ title: this.i18n.profile.syncFail, icon: 'none' })
          return
        }
        const plan = r.plan
        plan.overwriteMode = false
        this.syncSummary = syncService.getSyncSummary()
        this.uploadPlan = plan
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: this.i18n.profile.syncFail, icon: 'none' })
      } finally {
        this.busy = false
      }
    },
    closeUploadSheet() {
      this.uploadPlan = null
    },
    /** 差异条目的人话：upload/download 取 value，bothDiffer 按边取 */
    itemText(it, side) {
      let v = it.value
      if (side === 'local') v = it.local
      else if (side === 'cloud') v = it.cloud
      if (it.kind === 'overtime') return `${v || 0}h`
      return syncService.entryText(v)
    },
    /** 勾选 = 以云端为准：云端独有的取消勾选即从云端删掉，分歧条目勾选即采用云端 */
    toggleCloudWin(it) {
      haptic('light')
      it.cloudWins = !it.cloudWins
    },
    async doUploadMerge() {
      const plan = this.uploadPlan
      if (!plan) return
      const L = this.i18n.profile
      uni.showLoading({ title: '' })
      try {
        const r = await syncService.uploadMerge(plan)
        uni.hideLoading()
        if (r.ok) {
          this.uploadPlan = null
          this.load()
          this.lastSyncAt = syncService.getLastSyncTime()
          uni.showToast({ title: L.syncDone, icon: 'success' })
        } else if (r.reason === 'cloud_changed') {
          this.uploadPlan = null
          uni.showToast({ title: L.syncCloudChanged, icon: 'none' })
        } else {
          uni.showToast({ title: L.syncFail, icon: 'none' })
        }
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: L.syncFail, icon: 'none' })
      }
    },
    askOverwrite() {
      haptic('light')
      if (this.uploadPlan) this.uploadPlan.overwriteMode = true
    },
    async doUploadOverwrite() {
      const plan = this.uploadPlan
      if (!plan) return
      const L = this.i18n.profile
      uni.showLoading({ title: '' })
      try {
        const r = await syncService.uploadOverwrite(plan)
        uni.hideLoading()
        if (r.ok) {
          this.uploadPlan = null
          this.load()
          this.lastSyncAt = syncService.getLastSyncTime()
          uni.showToast({ title: L.syncDone, icon: 'success' })
        } else {
          uni.showToast({ title: L.syncFail, icon: 'none' })
        }
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: L.syncFail, icon: 'none' })
      }
    },

    /** 从云端恢复：整份覆盖本机，先备份，可撤销 */
    async onRestoreTap() {
      haptic('light')
      if (this.busy) return
      const L = this.i18n.profile
      this.busy = true
      uni.showLoading({ title: '' })
      let r = null
      try {
        // 先看一次云端最新状态，避免拿过期的条数吓用户
        r = await syncService.checkRemote()
      } catch (e) { r = null }
      uni.hideLoading()
      this.busy = false
      if (!r || !r.ok) {
        uni.showToast({ title: L.syncFail, icon: 'none' })
        return
      }
      if (!r.exists) {
        uni.showToast({ title: L.syncCloudEmpty, icon: 'none' })
        return
      }
      this.syncSummary = syncService.getSyncSummary()
      const n = r.remoteCount || 0
      uni.showModal({
        title: L.syncRestoreTitle,
        content: L.syncRestoreConfirm.replace('{n}', n),
        confirmText: L.syncRestore,
        cancelText: L.cancel,
        success: async (res) => {
          if (!res.confirm) return
          this.busy = true
          uni.showLoading({ title: '' })
          try {
            const out = await syncService.restoreFromCloud()
            uni.hideLoading()
            if (out.ok) {
              this.load()
              uni.showToast({ title: L.syncRestoreDone, icon: 'success' })
            } else if (out.reason === 'empty') {
              uni.showToast({ title: L.syncCloudEmpty, icon: 'none' })
            } else {
              uni.showToast({ title: L.syncFail, icon: 'none' })
            }
          } catch (e) {
            uni.hideLoading()
            uni.showToast({ title: L.syncFail, icon: 'none' })
          } finally {
            this.busy = false
          }
        }
      })
    },
    async onUndoRestore() {
      haptic('light')
      const L = this.i18n.profile
      uni.showLoading({ title: '' })
      try {
        const r = await syncService.undoRestore()
        uni.hideLoading()
        if (r.ok) {
          this.load()
          uni.showToast({ title: L.syncUndoDone, icon: 'success' })
        } else {
          uni.showToast({ title: L.syncFail, icon: 'none' })
        }
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: L.syncFail, icon: 'none' })
      }
    },
    onDataRestored() {
      this.load()
    },
    // ===== 统计 / 语言 =====
    onStatsTap() {
      haptic('light')
      if (this.isPro) {
        uni.navigateTo({ url: '/pages/stats/index' })
      } else {
        this.openPaywall()
      }
    },
    setLanguage(lang) {
      // 多语言为 PRO 专属权益：非 PRO 点击英文选项直接拉起付费墙
      if (lang !== 'zh-CN' && !this.isPro) {
        this.openPaywall()
        return
      }
      this.settings.language = lang
      haptic('light')
      wioService.saveSettings(this.settings)
      uni.showToast({ title: t('profile.saved', lang), icon: 'none' })
    },
    // ===== 自定义假期 =====
    fmtCustomRange(l) {
      // 按天型显示额度与用量：一眼分清这是「额度」还是「假期段」
      if (l.mode !== 'day') {
        return `${l.start.slice(5).replace('-', '/')} ~ ${l.end.slice(5).replace('-', '/')}`
      }
      const u = wioService.getCustomLeaveUsage(l.id)
      const over = u.over > 0 ? ' · ' + this.i18n.profile.customOver.replace('{n}', u.over) : ''
      let base
      if (u.unlimited) {
        base = this.i18n.profile.customRowUnlimited.replace('{u}', u.used)
      } else if (l.quotaRule === 'total') {
        base = this.i18n.profile.customRowTotal.replace('{u}', u.used)
      } else {
        base = this.i18n.profile.customRowYearly.replace('{q}', u.quota).replace('{u}', u.used)
      }
      return base + over
    },
    openCustomAdd() {
      if (!this.isPro) {
        this.openPaywall()
        return
      }
      haptic('light')
      this.customEditLeave = null
      this.showCustomSheet = true
    },
    openCustomEdit(l) {
      if (!this.isPro) {
        this.openPaywall()
        return
      }
      haptic('light')
      this.customEditLeave = l
      this.showCustomSheet = true
    },
    onCustomSaved() {
      this.showCustomSheet = false
      this.customLeaves = wioService.getCustomLeaves()
    }
  }
}
</script>

<style scoped>
.member-root {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.member-scroll {
  height: 100%;
}

.member-head {
  padding: 4px 20px 8px 20px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.member-back {
  width: 30px;
  height: 30px;
  margin-left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-back-icon {
  font-size: 25px;
  line-height: 1;
  color: #15181C;
}

.content {
  padding: 0 20px 24px 20px;
}

/* ===== 通用卡片（与「我的」页一致） ===== */
.settings-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 2px 10px rgba(15, 35, 40, 0.05);
}

/* ===== PRO 状态卡 ===== */
.pro-status-card {
  padding: 16px 16px 12px 16px;
}

/* 未开通：暖金底 + 金描边，和普通白卡区分 */
.pro-status-card.pro-locked {
  background: #FFFDF8;
  border: 1px solid rgba(192, 138, 45, 0.22);
  box-shadow: 0 2px 10px rgba(176, 122, 34, 0.08);
}

.pro-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pro-head-left {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.pro-name {
  font-size: 15px;
  font-weight: 700;
  color: #18191C;
  letter-spacing: 0.4px;
}

.pro-sub {
  font-size: 11px;
  color: #A9761F;
  margin-top: 3px;
  line-height: 1.4;
}

.badge-on {
  /* 与「云端同步」开关同尺寸：40 × 24，圆角 12 */
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background: #C08A2D;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8px;
}

.badge-on-text {
  font-size: 10px;
  font-weight: 600;
  color: #FFF9EE;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
}

.badge-off {
  /* 未开通态同尺寸，保证两态切换时右上角视觉重量一致 */
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background: rgba(192, 138, 45, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8px;
}

.badge-off-text {
  font-size: 10px;
  font-weight: 700;
  color: #A9761F;
  line-height: 1;
  letter-spacing: 0.6px;
}

.divider {
  height: 1px;
  background: #F1EDE5;
  margin-top: 12px;
}

.renew-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 2px;
}

.renew-row:active {
  opacity: 0.85;
}

.renew-note {
  font-size: 12px;
  font-weight: 500;
  color: #A9761F;
}

.renew-action {
  display: flex;
  align-items: center;
}

.renew-text {
  font-size: 11px;
  font-weight: 500;
  color: #A9761F;
}

.renew-arrow {
  font-size: 14px;
  color: #C08A2D;
  line-height: 1;
  margin-left: 2px;
}

.upgrade-cta {
  margin-top: 14px;
  height: 42px;
  border-radius: 12px;
  background: #C08A2D;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upgrade-cta:active {
  opacity: 0.9;
}

.upgrade-text {
  font-size: 13px;
  font-weight: 700;
  color: #FFF9EE;
}

/* ===== 功能卡通用行 ===== */
.feat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.feat-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.feat-title {
  font-size: 14px;
  font-weight: 600;
  color: #18191C;
}

.feat-sub {
  font-size: 11px;
  color: #8A94A0;
  margin-top: 3px;
  line-height: 1.5;
}

.feat-locked {
  font-size: 11px;
  font-weight: 500;
  color: #C0A46B;
  flex-shrink: 0;
}

.feat-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.feat-on {
  font-size: 11px;
  font-weight: 500;
  color: #0E6E62;
}

.feat-arrow {
  font-size: 16px;
  color: #C3C9CE;
  margin-left: 4px;
  line-height: 1;
}

.feat-foot {
  display: block;
  font-size: 9.5px;
  color: #9AA1A8;
  line-height: 1.6;
  margin-top: 10px;
}

.coming-soon {
  font-size: 11px;
  font-weight: 500;
  color: #C08A2D;
  flex-shrink: 0;
}

/* ===== 同步卡 ===== */
.sync-newdot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #C0453B;
  flex-shrink: 0;
}

.sync-meta {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #F2F4F5;
}

.sync-meta-line {
  font-size: 10.5px;
  line-height: 1.7;
  color: #8A94A0;
}

.sync-warn {
  display: flex;
  align-items: flex-start;
  margin-top: 8px;
  padding: 8px 10px;
  background: #FDF6EC;
  border-radius: 8px;
}

.sync-pending {
  display: block;
  margin-top: 8px;
  font-size: 10.5px;
  color: #8A94A0;
}

.sync-warn-dot {
  font-size: 7px;
  color: #C08A2D;
  margin-right: 5px;
  line-height: 16px;
}

.sync-warn-text {
  flex: 1;
  font-size: 10.5px;
  line-height: 16px;
  color: #96682A;
}

.sync-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.sync-btn {
  flex: 1;
  height: 34px;
  border-radius: 10px;
  background: #0E6E62;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sync-btn-off {
  background: #C9D2D1;
}

.sync-btn-text {
  font-size: 12px;
  font-weight: 600;
  color: #FFFFFF;
}

.sync-btn-ghost {
  background: #F4F1EA;
  border: 1px solid rgba(192, 138, 45, 0.22);
}

.sync-btn-ghost-text {
  font-size: 12px;
  font-weight: 600;
  color: #8A6A2A;
}

.sync-foot {
  margin-top: 8px;
  font-size: 10px;
  color: #A8B0B8;
}

.sync-undo {
  margin-top: 10px;
  font-size: 10.5px;
  color: #0E6E62;
  align-self: flex-start;
}

/* ===== 上传差异弹层 ===== */
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

.upload-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFDF8;
  border-radius: 24px 24px 0 0;
  padding: 20px 20px calc(env(safe-area-inset-bottom) + 18px) 20px;
  display: flex;
  flex-direction: column;
  max-height: 76vh;
  animation: upload-up 0.25s cubic-bezier(0.32, 0.9, 0.55, 1);
}

@keyframes upload-up {
  from { transform: translateY(40%); opacity: 0.6; }
  to   { transform: translateY(0); opacity: 1; }
}

.upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(192, 138, 45, 0.16);
}

.upload-title {
  font-size: 15px;
  font-weight: 600;
  color: #2B2F33;
}

.upload-close {
  font-size: 14px;
  color: #9AA2A8;
  padding: 2px 4px;
}

.upload-body {
  max-height: 46vh;
  padding: 4px 0;
}

.upload-sec {
  display: flex;
  flex-direction: column;
  margin-top: 14px;
}

.upload-sec-title {
  font-size: 11.5px;
  font-weight: 600;
  color: #6B7480;
  margin-bottom: 6px;
}

.upload-item {
  font-size: 11.5px;
  line-height: 19px;
  color: #3D444B;
}

.upload-item-warn {
  color: #A9631F;
}

/* 可勾选条目：勾选 = 以云端为准 */
.upload-hint {
  font-size: 10px;
  line-height: 15px;
  color: #9AA1A8;
  margin-bottom: 4px;
}

.upload-row {
  display: flex;
  align-items: flex-start;
  padding: 5px 0;
}

.upload-box {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  margin-right: 8px;
  border-radius: 4px;
  border: 1.5px solid #C9D2D1;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-box.on {
  background: #0E6E62;
  border-color: #0E6E62;
}

.upload-box-tick {
  font-size: 9px;
  line-height: 1;
  color: #FFFFFF;
}

.upload-row-text {
  flex: 1;
  font-size: 11.5px;
  line-height: 19px;
  color: #3D444B;
}

/* 取消勾选的云端记录：后果显性化 */
.upload-sec-warn {
  color: #B4542A;
}

.upload-drop-badge {
  flex-shrink: 0;
  margin-left: 8px;
  padding: 1px 6px;
  font-size: 9.5px;
  line-height: 14px;
  color: #B4542A;
  background: #FBF0E9;
  border-radius: 4px;
}

.upload-row-key {
  color: #6B7480;
}

.val-win {
  color: #0E6E62;
  font-weight: 600;
}

.val-dim {
  color: #A8B0B8;
}

.val-sep {
  color: #C9D2D1;
}

.upload-note {
  display: block;
  margin-top: 12px;
  font-size: 11px;
  line-height: 18px;
  color: #6B7480;
}

.upload-note-warn {
  color: #A9631F;
  background: #FDF6EC;
  border-radius: 8px;
  padding: 8px 10px;
}

.upload-empty {
  display: block;
  margin-top: 18px;
  font-size: 12px;
  color: #8A94A0;
  text-align: center;
}

.upload-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid rgba(192, 138, 45, 0.16);
}

.upload-primary {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  background: #0E6E62;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-primary-danger {
  background: #B4433A;
}

.upload-primary-text {
  font-size: 13.5px;
  font-weight: 600;
  color: #FFFFFF;
}

.upload-alt {
  margin-top: 12px;
  font-size: 11.5px;
  color: #8A6A2A;
}

/* ===== 开关 ===== */
.switch-track {
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background-color: #DDE1E3;
  position: relative;
  transition: background-color 0.3s;
  flex-shrink: 0;
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

/* ===== 语言分段器 ===== */
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

/* ===== 自定义假期行 ===== */
.custom-leave-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 0;
  border-bottom: 1px solid #F2F4F5;
}

.custom-leave-row:active {
  opacity: 0.85;
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
  padding: 10px 0 2px;
}

.custom-empty-text {
  font-size: 11px;
  color: #9AA1A8;
  line-height: 1.5;
}

.custom-add-btn {
  margin-top: 10px;
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

/* ===== 版本号 ===== */
.version-row {
  display: flex;
  justify-content: center;
  padding: 4px 0 4px;
}

.version-text {
  font-size: 11px;
  color: #9AA1A8;
}
</style>
