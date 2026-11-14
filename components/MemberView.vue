<template>
  <view class="member-root">
    <scroll-view scroll-y="true" class="member-scroll" @scroll="onScroll" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <view class="member-head" :style="{ paddingTop: topSafe + 4 + 'px' }">
        <view class="member-back" @click="goBack">
          <text class="member-back-icon">‹</text>
        </view>
      </view>

      <view class="content">

        <!-- ===== 会员状态卡（整卡可点：会员详情 + 订单记录都在下一页） ===== -->
        <view
          class="settings-card pro-status-card"
          :class="{ 'pro-locked': !isPro }"
          @click="openMemberDetail">
          <view class="pro-head">
            <view class="pro-head-left">
              <text class="pro-name">WIO PRO</text>
              <text class="pro-sub">{{ isPro ? planLine : i18n.profile.proCardSubOff }}</text>
            </view>
            <view class="pro-head-right">
              <view v-if="isPro" class="badge-on">
                <text class="badge-on-text">{{ i18n.profile.proCardUnlocked }}</text>
              </view>
              <view v-else class="badge-off">
                <text class="badge-off-text">PRO</text>
              </view>
              <text class="pro-chev">›</text>
            </view>
          </view>

          <!-- 已开通：续费行（卡内按钮只负责下单，不触发整卡跳转） -->
          <template v-if="isPro">
            <view class="divider"></view>
            <view class="renew-row" @click.stop="openPaywall">
              <text class="renew-note">{{ i18n.profile.memberNoAutoRenew }}</text>
              <view class="renew-action">
                <text class="renew-text">{{ i18n.profile.renewAction }}</text>
                <text class="renew-arrow">›</text>
              </view>
            </view>
          </template>

          <!-- 未开通：升级 CTA -->
          <view v-else class="upgrade-cta" @click.stop="openPaywall">
            <text class="upgrade-text">{{ i18n.profile.upgradeProCta }}</text>
          </view>
          <!-- 未开通：看广告换体验的轻入口，点开付费墙（广告按钮统一在墙内） -->
          <view v-if="!isPro" class="ad-trial-link" @click.stop="openPaywall">
            <text class="ad-trial-link-text">{{ i18n.profile.adTrialEntry }}</text>
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
              <view class="sync-btn sync-btn-ghost" :class="{ 'sync-btn-busy': readingRemote }" @click.stop="onRestoreTap">
                <text class="sync-btn-ghost-text">{{ readingRemote ? i18n.profile.syncReading : i18n.profile.syncRestore }}</text>
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
        </view>

        <!-- ===== 自定义假期 ===== -->
        <view class="settings-card">
          <view class="feat-head">
            <view class="feat-text">
              <text class="feat-title">{{ i18n.profile.customLeaveTitle }}</text>
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

        <view class="version-row" @click="onVersionTap"><text class="version-text">{{ versionLabel }}</text></view>
      </view>
    </scroll-view>

    <CustomLeaveSheet
      :visible="showCustomSheet"
      :leave="customEditLeave"
      @close="showCustomSheet = false"
      @saved="onCustomSaved"
    />
    <PaywallSheet :visible="showPaywall" @close="showPaywall = false" @upgraded="onProUpgraded" />
    <!-- 隐藏入口：版本号连点 5 次，与「我的」页同一套判定 -->
    <RedeemSheet :visible="showRedeem" @close="showRedeem = false" @redeemed="onRedeemed" />

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
              {{ uploadPlan.toDownload.length }}{{ i18n.profile.syncWillDownload }}<text v-if="dropCount" class="upload-sec-warn"> · {{ dropCount }}{{ i18n.profile.syncDropCount }}</text>
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

          <view v-if="uploadPlan.settingsDetail && uploadPlan.settingsDetail.length" class="upload-sec">
            <text class="upload-sec-title">{{ uploadPlan.settingsDetail.length }}{{ i18n.profile.syncSettingsDiff }}</text>
            <view
              v-for="(d, i) in uploadPlan.settingsDetail"
              :key="'s' + i"
              class="upload-setting">
              <text class="upload-setting-label">{{ d.label }}</text>
              <text class="upload-setting-val">
                <text class="val-win">{{ i18n.profile.syncLocal }} {{ d.local }}</text>
                <text class="val-sep"> / </text>
                <text class="val-dim2">{{ i18n.profile.syncCloud }} {{ d.cloud }}</text>
              </text>
            </view>
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

    <!-- 恢复预览：只报云端规模和净变化；逐条明细折起来，想核对再展开 -->
    <view v-if="restorePlan" class="sheet-mask" @click.stop="closeRestoreSheet">
      <view class="upload-card" @click.stop>
        <view class="upload-head">
          <text class="upload-title">{{ i18n.profile.syncRestoreTitle }}</text>
          <text class="upload-close" @click.stop="closeRestoreSheet">✕</text>
        </view>

        <scroll-view scroll-y="true" class="upload-body">
          <!-- 云端那份有多少东西：三个数字说完，不铺开 -->
          <view class="restore-snap">
            <view class="restore-snap-top">
              <text class="restore-snap-cap">{{ i18n.profile.syncRestoreCloudCap }}</text>
              <text class="restore-snap-time">{{ restoreSnapTime }}</text>
            </view>
            <view class="restore-figs">
              <view class="restore-fig">
                <text class="restore-fig-num">{{ restoreCloud.entries }}</text>
                <text class="restore-fig-cap">{{ i18n.profile.syncRestoreEntriesCap }}</text>
              </view>
              <view class="restore-sep"></view>
              <view class="restore-fig">
                <text class="restore-fig-num">{{ restoreCloud.overtime }}</text>
                <text class="restore-fig-cap">{{ i18n.profile.syncRestoreOvertimeCap }}</text>
              </view>
              <view class="restore-sep"></view>
              <view class="restore-fig">
                <text class="restore-fig-num">{{ restoreCloud.leaves }}</text>
                <text class="restore-fig-cap">{{ i18n.profile.syncRestoreLeavesCap }}</text>
              </view>
            </view>
          </view>

          <!-- 恢复之后本机会变成什么样：三个净变化，一句说完 -->
          <view class="restore-delta">
            <text class="restore-delta-cap">{{ i18n.profile.syncRestoreDeltaCap }}</text>
            <text
              v-for="d in restoreDeltas"
              :key="'rd' + d.key"
              class="restore-delta-item">
              <text>{{ d.pre }}</text><text class="restore-delta-num" :class="'d-' + d.key">{{ d.n }}</text><text>{{ d.post }}</text>
            </text>
          </view>
          <text v-if="restoreLeaveLine" class="restore-leave-line">{{ restoreLeaveLine }}</text>

          <!-- 两条保证，一行一条，不挤成长句 -->
          <view class="restore-notes">
            <view class="restore-note-row">
              <view class="restore-note-dot"></view>
              <text class="restore-note-text">{{ i18n.profile.syncRestoreKeepFuture }}</text>
            </view>
            <view class="restore-note-row">
              <view class="restore-note-dot"></view>
              <text class="restore-note-text">{{ i18n.profile.syncRestoreUndoNote }}</text>
            </view>
          </view>

          <text class="restore-more" @click.stop="restoreDetail = !restoreDetail">
            {{ restoreDetail ? i18n.profile.syncRestoreHideDetail : i18n.profile.syncRestoreShowDetail + ' ›' }}
          </text>

          <view v-if="restoreDetail" class="restore-detail">
            <view v-if="restoreItems('added').length" class="upload-sec">
              <text class="upload-sec-title">{{ restoreItems('added').length }}{{ i18n.profile.syncRestoreAdded }}</text>
              <text v-for="it in restoreItems('added')" :key="'ra' + it.kind + it.key" class="upload-item">
                {{ it.key }} · {{ itemText(it, 'cloud') }}
              </text>
            </view>

            <view v-if="restoreItems('changed').length" class="upload-sec">
              <text class="upload-sec-title">{{ restoreItems('changed').length }}{{ i18n.profile.syncRestoreChanged }}</text>
              <text v-for="it in restoreItems('changed')" :key="'rc' + it.kind + it.key" class="upload-item">
                {{ it.key }} · {{ itemText(it, 'local') }} → {{ itemText(it, 'cloud') }}
              </text>
            </view>

            <view v-if="restoreItems('removed').length" class="upload-sec">
              <text class="upload-sec-title upload-sec-warn">{{ restoreItems('removed').length }}{{ i18n.profile.syncRestoreRemoved }}</text>
              <text v-for="it in restoreItems('removed')" :key="'rr' + it.kind + it.key" class="upload-item upload-item-warn">
                {{ it.key }} · {{ itemText(it, 'local') }}
              </text>
            </view>
          </view>
        </scroll-view>

        <view class="upload-actions">
          <view class="upload-primary" @click="runRestore">
            <text class="upload-primary-text">{{ i18n.profile.syncRestore }}</text>
          </view>
          <text class="upload-alt" @click="closeRestoreSheet">{{ i18n.profile.cancel }}</text>
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
import RedeemSheet from '@/components/RedeemSheet.vue'
import { isSecretTriggered } from '@/utils/secretTap.js'
import { tap as haptic } from '@/utils/haptic.js'
import { APP_VERSION_LABEL } from '@/utils/appVersion.js'

export default {
  name: 'MemberView',
  components: { CustomLeaveSheet, PaywallSheet, RedeemSheet },
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
      showRedeem: false,       // 隐藏兑换入口（版本号连点 5 次）
      secretTap: { count: 0, at: 0 },
      showCustomSheet: false,
      customEditLeave: null,
      customLeaves: [],
      lastSyncAt: 0,
      // 同步卡状态：只读本地缓存，不发请求
      syncSummary: { localCount: 0, remoteCount: 0, remoteNewer: false, canUndoRestore: false },
      // 上传前算出来的差异计划，非空即弹出确认层
      uploadPlan: null,
      // 恢复预览：只摆总体规模与净变化，明细默认收起
      restorePlan: null,
      restoreDetail: false,
      busy: false,
      // 恢复分两段：先读云端（按钮就地转圈），再整份覆盖（全屏 loading）
      readingRemote: false,
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
    },
    /** 云端那份的规模：只给三个数，不铺明细 */
    restoreCloud() {
      const c = (this.restorePlan && this.restorePlan.cloudCounts) || {}
      return { entries: c.entries || 0, overtime: c.overtime || 0, leaves: c.leaves || 0 }
    },
    restoreSnapTime() {
      const p = this.restorePlan
      return p && p.syncedTime ? this.fmtStamp(p.syncedTime) : '—'
    },
    /**
     * 净变化：补进多少、改写多少、删掉多少。
     * 文案用 {n} 占位再切开，是为了让中英各自保持语序
     * （「补入 12 条」/「12 added」），而不是硬拼数字。
     */
    restoreDeltas() {
      const p = this.restorePlan
      if (!p || !p.receipt) return []
      const L = this.i18n.profile
      const rc = p.receipt
      return [
        { key: 'add', n: rc.added || 0, tpl: L.syncRestoreDAdd },
        { key: 'mod', n: rc.changed || 0, tpl: L.syncRestoreDMod },
        { key: 'del', n: rc.removed || 0, tpl: L.syncRestoreDDel }
      ].filter(d => d.n > 0).map(d => {
        const parts = String(d.tpl).split('{n}')
        return { key: d.key, n: d.n, pre: parts[0] || '', post: parts[1] || '' }
      })
    },
    /** 只改了假期配置（打卡一条没变）时，也得让用户看见 */
    restoreLeaveLine() {
      const p = this.restorePlan
      if (!p || !p.receipt || !p.receipt.leavesDelta) return ''
      if (this.restoreDeltas.length) return ''
      return String(this.i18n.profile.syncRestoreLeaveLine).replace('{n}', p.receipt.leaves || 0)
    },
    /** 云端快照的写入时间：确认层里给用户一个「这是哪一份」的锚点 */
    remoteSyncedText() {
      const t = this.syncSummary.remoteSyncedTime
      if (!t) return '—'
      return this.fmtStamp(t)
    }
  },
  mounted() {
    this.load()
    this.bindSync()
    uni.$on(PRO_CHANGED_EVENT, this.onProChanged)
    // 语言是全局偏好：从我的页切换后，已挂载的会员页要立即跟着变
    uni.$on('wio:language-changed', this.onLangChanged)
    // 订阅的真身在云端数据库，本地只是镜像：进页面时对齐一次，
    // 避免「已经付过钱、但本地缓存还是旧的」导致页面显示未开通
    refreshSubscription()
    // 进同步页只做一次「只读检查」：知道云端有没有更新即可，不动本地数据
    this.refreshRemote()
  },
  beforeUnmount() {
    this.unbindSync()
    uni.$off(PRO_CHANGED_EVENT, this.onProChanged)
    uni.$off('wio:language-changed', this.onLangChanged)
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
    // 语言切换（从我的页发起）：立即生效，不等页面重进
    onLangChanged(lang) {
      if (!lang || lang === this.settings.language) return
      this.settings = { ...this.settings, language: lang }
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
    // 整卡入口：会员详情与订单记录在同一个页面（pages/orders/index，
    // 同时是微信「订单中心」登记的 path），卡内按钮仍各自负责下单
    openMemberDetail() {
      haptic('light')
      uni.navigateTo({ url: '/pages/orders/index' })
    },
    onProUpgraded() {
      this.trialStamp++
      this.showPaywall = false
    },
    // ===== 隐藏兑换入口 =====
    // 会员页未登录时不做弹层：与同步卡一致，先把人送回「我的」页登录，
    // 兑换要落到 openid 名下的订阅，没有身份无法入账。
    onVersionTap() {
      if (!isSecretTriggered(this.secretTap, 5)) return
      haptic('light')
      if (!this.isLogin) {
        uni.showToast({ title: this.i18n.profile.redeemNeedLogin, icon: 'none' })
        return
      }
      this.showRedeem = true
    },
    onRedeemed() {
      // 权益已在云端入账，本地镜像由 auth.redeemCode 刷新过，这里重算一次 isPro
      this.trialStamp++
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
      const L = this.i18n.profile
      if (this.busy) {
        this.notify(L.syncBusy)
        return
      }
      if (!this.syncLocalCount) {
        this.notify(L.syncUploadDisabled)
        return
      }
      this.busy = true
      uni.showLoading({ title: L.syncReading, mask: true })
      try {
        const r = await syncService.prepareUpload()
        uni.hideLoading()
        if (!r.ok) {
          this.notify(L.syncFail)
          return
        }
        const plan = r.plan
        plan.overwriteMode = false
        this.syncSummary = syncService.getSyncSummary()
        this.uploadPlan = plan
      } catch (e) {
        uni.hideLoading()
        this.notify(L.syncFail)
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
    /** 记下当前勾选：待丢弃的云端记录、改选云端的条目 */
    snapshotChoices(plan) {
      const drop = {}
      const pick = {}
      ;(plan.toDownload || []).forEach(it => {
        if (it.cloudWins === false) drop[`${it.kind}:${it.key}`] = true
      })
      ;(plan.bothDiffer || []).forEach(it => {
        if (it.cloudWins) pick[`${it.kind}:${it.key}`] = true
      })
      return { drop, pick }
    },
    /** 云端被别处改过：按最新数据重算清单，并还原用户刚才的勾选 */
    async reopenPlanWithChoices(choices) {
      uni.showLoading({ title: this.i18n.profile.syncReading, mask: true })
      try {
        const r = await syncService.prepareUpload()
        uni.hideLoading()
        if (!r.ok) { this.uploadPlan = null; return }
        const plan = r.plan
        plan.overwriteMode = false
        ;(plan.toDownload || []).forEach(it => {
          if (choices.drop[`${it.kind}:${it.key}`]) it.cloudWins = false
        })
        ;(plan.bothDiffer || []).forEach(it => {
          if (choices.pick[`${it.kind}:${it.key}`]) it.cloudWins = true
        })
        this.syncSummary = syncService.getSyncSummary()
        this.uploadPlan = plan
      } catch (e) {
        uni.hideLoading()
        this.uploadPlan = null
      }
    },
    async doUploadMerge() {
      const plan = this.uploadPlan
      if (!plan) return
      const L = this.i18n.profile
      // 记住用户勾过的选择，云端被抢跑后重开清单时还原
      const choices = this.snapshotChoices(plan)
      uni.showLoading({ title: L.syncUploading, mask: true })
      try {
        const r = await syncService.uploadMerge(plan)
        uni.hideLoading()
        if (r.ok) {
          this.uploadPlan = null
          this.load()
          this.lastSyncAt = syncService.getLastSyncTime()
          // 回执要具体：删了几条、云端现在几条，用户才知道真的生效了
          let title = r.deleted > 0
            ? L.syncDoneDeleted.replace('{n}', r.deleted)
            : (r.remoteCount !== undefined ? L.syncDoneCount.replace('{n}', r.remoteCount) : L.syncDone)
          // 回读发现「该删的还在」：如实说，别让用户以为删干净了
          if (r.stuck > 0) title = L.syncDeleteStuck.replace('{n}', r.stuck)
          this.notify(title)
        } else if (r.reason === 'cloud_changed') {
          // 不能静默失败：云端刚被别处改过，马上按新数据重算清单，
          // 并把刚才的勾选还原，用户再点一次就行
          await this.reopenPlanWithChoices(choices)
          this.notify(L.syncCloudChanged)
        } else {
          this.notify(L.syncFail)
        }
      } catch (e) {
        uni.hideLoading()
        this.notify(L.syncFail)
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
      uni.showLoading({ title: L.syncUploading, mask: true })
      try {
        const r = await syncService.uploadOverwrite(plan)
        uni.hideLoading()
        if (r.ok) {
          this.uploadPlan = null
          this.load()
          this.lastSyncAt = syncService.getLastSyncTime()
          this.notify(L.syncDone)
        } else {
          this.notify(L.syncFail)
        }
      } catch (e) {
        uni.hideLoading()
        this.notify(L.syncFail)
      }
    },

    /**
     * 小程序里 showLoading / showToast / showModal 共用同一个原生交互层：
     * hideLoading() 之后紧接着调 showToast / showModal，后者会被静默吞掉。
     * 表现出来就是「点了完全没有任何反应」——所以统一延迟一拍再弹。
     */
    notify(title, icon = 'none') {
      setTimeout(() => {
        uni.showToast({ title, icon, duration: 2200 })
      }, 160)
    },
    popupModal(opts) {
      setTimeout(() => {
        uni.showModal(opts)
      }, 60)
    },
    /** 统一的时间戳格式：MM-DD HH:mm */
    fmtStamp(v) {
      const d = new Date(v)
      if (isNaN(d.getTime())) return '—'
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },

    /** 从云端恢复：先试算（只算不动），把「云端有什么、会改什么」逐条摆出来再确认 */
    async onRestoreTap() {
      haptic('light')
      const L = this.i18n.profile
      // 这里以前是静默 return：busy 卡住时用户点几次都毫无反应
      if (this.busy || this.readingRemote) {
        this.notify(L.syncBusy)
        return
      }
      this.readingRemote = true
      let r = null
      try {
        r = await syncService.previewRestore()
      } catch (e) { r = null }
      this.readingRemote = false
      if (!r || !r.ok) {
        this.notify(L.syncFail)
        return
      }
      if (!r.exists) {
        this.notify(L.syncCloudEmpty)
        return
      }
      this.syncSummary = syncService.getSyncSummary()
      const rc = r.receipt || {}
      // 云端与本机完全一致：不弹层（确认了也不会有任何变化），直说真相
      if (!rc.total && !rc.leavesDelta) {
        this.notify(L.syncRestoreNoChange)
        return
      }
      // 用页面内弹层（与上传同一套 UI）：原生 showModal 会被 hideLoading 吞，
      // 且它放不下逐条差异——用户必须亲眼看到云端有什么、恢复会改什么
      this.restoreDetail = false
      this.restorePlan = {
        receipt: rc,
        cloudCounts: r.cloudCounts || {},
        syncedTime: r.syncedTime || null,
        remoteCount: r.remoteCount || 0
      }
    },
    closeRestoreSheet() {
      this.restorePlan = null
      this.restoreDetail = false
    },
    /** 恢复明细行的分组：新增 / 修改 / 删除 */
    restoreItems(kind) {
      const p = this.restorePlan
      if (!p || !p.receipt || !p.receipt.items) return []
      return p.receipt.items.filter(it => kind === 'mixed' ? true : (
        kind === 'added' ? it.local === null && it.cloud !== null
          : kind === 'removed' ? it.local !== null && it.cloud === null
          : it.local !== null && it.cloud !== null
      ))
    },
    /** 真正的覆盖动作（预览层确认之后才走这里） */
    async runRestore() {
      const L = this.i18n.profile
      this.restorePlan = null
      this.restoreDetail = false
      this.busy = true
      uni.showLoading({ title: L.syncRestoring, mask: true })
      try {
        const out = await syncService.restoreFromCloud()
        uni.hideLoading()
        if (out.ok) {
          this.load()
          this.lastSyncAt = syncService.getLastSyncTime()
          // 内容一致时不能再报「已恢复」：用户只会觉得点了没反应。
          // 有变化就把变化量摆出来，一眼能对上日历。
          const rc = out.receipt || {}
          let title = L.syncRestoreNoChange
          if (rc.total || rc.leavesDelta) {
            title = L.syncRestoreDoneDetail
              .replace('{e}', rc.entries || 0)
              .replace('{o}', rc.overtime || 0)
              .replace('{l}', rc.leaves || 0)
          }
          this.notify(title)
        } else if (out.reason === 'empty') {
          this.notify(L.syncCloudEmpty)
        } else {
          this.notify(L.syncFail)
        }
      } catch (e) {
        uni.hideLoading()
        this.notify(L.syncFail)
      } finally {
        this.busy = false
      }
    },
    async onUndoRestore() {
      haptic('light')
      const L = this.i18n.profile
      uni.showLoading({ title: L.syncRestoring, mask: true })
      try {
        const r = await syncService.undoRestore()
        uni.hideLoading()
        if (r.ok) {
          this.load()
          this.notify(L.syncUndoDone)
        } else {
          this.notify(L.syncFail)
        }
      } catch (e) {
        uni.hideLoading()
        this.notify(L.syncFail)
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

.ad-trial-link {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  padding: 2px 0;
}

.ad-trial-link:active {
  opacity: 0.6;
}

.ad-trial-link-text {
  font-size: 11.5px;
  color: #8A9098;
}

.upgrade-text {
  font-size: 13px;
  font-weight: 700;
  color: #FFF9EE;
}

/* 右上角：状态徽标 + 进入详情的箭头（整卡可点的可见提示） */
.pro-head-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.pro-chev {
  font-size: 16px;
  line-height: 1;
  color: rgba(25, 30, 34, 0.28);
  margin-left: 6px;
  margin-top: -1px;
}

.pro-locked .pro-chev {
  color: rgba(169, 118, 31, 0.55);
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

/* ===== 恢复预览：云端规模 ===== */
.restore-snap {
  background: #FFF9EE;
  border-radius: 16px;
  padding: 13px 16px 15px;
  margin-top: 4px;
}

.restore-snap-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 11px;
}

.restore-snap-cap {
  font-size: 11px;
  font-weight: 600;
  color: #8A6A2A;
  letter-spacing: 0.3px;
}

.restore-snap-time {
  font-size: 10.5px;
  color: #AAA191;
}

.restore-figs {
  display: flex;
  align-items: center;
}

.restore-fig {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.restore-fig-num {
  font-size: 21px;
  font-weight: 700;
  line-height: 1.1;
  color: #2B2F33;
  letter-spacing: -0.4px;
}

.restore-fig-cap {
  font-size: 10px;
  color: #918877;
  margin-top: 4px;
}

.restore-sep {
  width: 1px;
  height: 22px;
  margin-right: 14px;
  background: rgba(192, 138, 45, 0.2);
}

/* ===== 恢复预览：净变化一行 ===== */
.restore-delta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  margin-top: 14px;
}

.restore-delta-cap {
  font-size: 11px;
  font-weight: 600;
  color: #6B7480;
  margin-right: 10px;
}

.restore-delta-item {
  font-size: 11.5px;
  color: #7C868C;
  margin-right: 12px;
}

.restore-delta-num {
  font-size: 13px;
  font-weight: 700;
  margin: 0 1px;
}

.d-add {
  color: #0E6E62;
}

.d-mod {
  color: #A9761F;
}

.d-del {
  color: #B4542A;
}

.restore-leave-line {
  display: block;
  font-size: 11px;
  line-height: 16px;
  color: #7C868C;
  margin-top: 6px;
}

/* 两条保证：一行一条，不挤成长句 */
.restore-notes {
  margin-top: 12px;
}

.restore-note-row {
  display: flex;
  align-items: flex-start;
  margin-top: 5px;
}

.restore-note-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #C9C0AE;
  margin: 7px 8px 0 2px;
  flex-shrink: 0;
}

.restore-note-text {
  flex: 1;
  font-size: 11px;
  line-height: 17px;
  color: #9AA1A8;
}

/* 明细折叠：默认收起，想核对的人自己展开 */
.restore-more {
  display: block;
  text-align: center;
  font-size: 11.5px;
  color: #6B7480;
  padding: 14px 0 4px;
}

.restore-detail {
  margin-top: 10px;
  padding-top: 4px;
  border-top: 1px dashed rgba(192, 138, 45, 0.18);
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

/* 假期与设置差异：一条占两行，窄屏也不挤 */
.upload-setting {
  padding: 5px 0;
}

.upload-setting-label {
  display: block;
  font-size: 11.5px;
  line-height: 18px;
  color: #3D444B;
  font-weight: 500;
}

.upload-setting-val {
  display: block;
  font-size: 10.5px;
  line-height: 16px;
  color: #6B7480;
}

.val-dim2 {
  color: #8A94A0;
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
