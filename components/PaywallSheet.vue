<template>
  <view v-if="visible" class="sheet-mask" @click="close">
    <view class="sheet-card" @click.stop>
      <view class="paywall-head">
        <view class="paywall-crown-medal">
          <text class="paywall-crown">👑</text>
        </view>
        <text class="paywall-title">{{ i18n.profile.paywallTitle }}</text>
        <text class="paywall-sub">{{ i18n.profile.paywallSub }}</text>
      </view>

      <view class="paywall-benefits">
        <view class="benefit-row">
          <view class="benefit-check"><text class="benefit-check-text">✓</text></view>
          <view class="benefit-info">
            <text class="benefit-title">{{ i18n.profile.benefitSync }}</text>
            <text class="benefit-sub">{{ i18n.profile.benefitSyncSub }}</text>
          </view>
        </view>
        <view class="benefit-row">
          <view class="benefit-check"><text class="benefit-check-text">✓</text></view>
          <view class="benefit-info">
            <text class="benefit-title">{{ i18n.profile.benefitBackup }}</text>
            <text class="benefit-sub">{{ i18n.profile.benefitBackupSub }}</text>
          </view>
        </view>
        <view class="benefit-row">
          <view class="benefit-check"><text class="benefit-check-text">✓</text></view>
          <view class="benefit-info">
            <text class="benefit-title">{{ i18n.profile.benefitStats }}</text>
            <text class="benefit-sub">{{ i18n.profile.benefitStatsSub }}</text>
          </view>
        </view>
        <view class="benefit-row">
          <view class="benefit-check"><text class="benefit-check-text">✓</text></view>
          <view class="benefit-info">
            <text class="benefit-title">{{ i18n.profile.benefitLang }}</text>
            <text class="benefit-sub">{{ i18n.profile.benefitLangSub }}</text>
          </view>
        </view>
        <!-- 更多会员功能预告 -->
        <view class="benefit-more-row">
          <view class="benefit-info">
            <text class="benefit-title">{{ i18n.profile.benefitMore }}</text>
            <text class="benefit-sub">{{ i18n.profile.benefitMoreSub }}</text>
          </view>
          <text class="coming-soon">{{ i18n.profile.comingSoon }}</text>
        </view>
      </view>

      <view class="plan-row">
        <view class="plan-card" :class="{ selected: payPlan === 'month' }" @click="selectPlan('month')">
          <text class="plan-name">{{ i18n.profile.planMonth }}</text>
          <view class="plan-price-row">
            <text class="plan-price">¥6</text>
            <text class="plan-unit">/{{ unitMonth }}</text>
          </view>
          <text class="plan-sub">{{ i18n.profile.planMonthSub }}</text>
        </view>
        <view class="plan-card plan-card-year" :class="{ selected: payPlan === 'year' }" @click="selectPlan('year')">
          <view class="plan-save-badge"><text class="plan-save-text">{{ i18n.profile.planSave }}</text></view>
          <text class="plan-name">{{ i18n.profile.planYear }}</text>
          <view class="plan-price-row">
            <text class="plan-price">¥48</text>
            <text class="plan-unit">/{{ unitYear }}</text>
          </view>
          <text class="plan-sub">{{ i18n.profile.planYearSub }}</text>
        </view>
      </view>

      <view class="paywall-cta" @click="onPayTap">
        <text class="paywall-cta-text">{{ payPlan === 'year' ? i18n.profile.payCta : i18n.profile.payCtaMonth }}</text>
      </view>
      <text class="paywall-fine">{{ i18n.profile.payFine }}</text>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'
import { purchase } from '@/utils/pay.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  name: 'PaywallSheet',
  props: {
    visible: { type: Boolean, default: false }
  },
  emits: ['close', 'upgraded'],
  data() {
    return {
      settings: { language: 'zh-CN' },
      payPlan: 'year',
      paying: false
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    unitMonth() {
      return this.settings.language === 'en-US' ? 'mo' : '月'
    },
    unitYear() {
      return this.settings.language === 'en-US' ? 'yr' : '年'
    }
  },
  watch: {
    visible(v) {
      if (v) this.settings = wioService.getSettings()
    }
  },
  methods: {
    selectPlan(plan) {
      if (this.payPlan === plan) return
      haptic('light')
      this.payPlan = plan
    },
    onPayTap() {
      haptic('medium')
      this.startPurchase()
    },
    async startPurchase() {
      if (this.paying) return
      const lang = this.settings.language
      this.paying = true
      uni.showLoading({ title: t('profile.payProcessing', lang), mask: true })

      try {
        // 签名全部由云函数 pay 完成，前端只负责拉起支付
        const res = await purchase(this.payPlan)
        uni.hideLoading()

        if (res && res.pending) {
          // 钱已付、服务端尚未确认发货：不提示失败，避免用户重复付费
          this.$emit('close')
          uni.showToast({ title: t('profile.payConfirming', lang), icon: 'none', duration: 3000 })
          return
        }

        this.$emit('close')
        this.$emit('upgraded')
        uni.showToast({ title: t('profile.paySuccess', lang), icon: 'success' })
      } catch (e) {
        uni.hideLoading()
        const code = (e && e.code) || 'pay_failed'
        let msg = t('profile.payFailed', lang)
        if (code === 'cancelled') msg = t('profile.payCancelled', lang)
        else if (code === 'not_login') msg = t('profile.payNotLogin', lang)
        else if (code === 'not_configured') msg = t('profile.payNotConfigured', lang)
        else if (code === 'ios_version' || code === 'base_lib' || code === 'not_weixin') {
          msg = t('profile.payUnsupported', lang)
        }
        // 测试期把微信返回的原始错误码与 errMsg 完整带出来（-15014 道具未生效 / -15013 金额不符 /
        // -15006 签名错 / -15010 道具未发布），用弹窗是为了能看到全文并截图；上线前改回 toast。
        if (e && e.errCode) {
          const lines = [msg + ' (' + e.errCode + ')']
          try {
            const d = JSON.parse(e.signData || '{}')
            if (d.productId) lines.push('道具 ' + d.productId + ' · ' + d.goodsPrice + ' 分')
          } catch (_) { /* signData 解析失败就算了，不影响提示 */ }
          if (e.message) lines.push(e.message)
          uni.showModal({
            title: '支付失败',
            content: lines.join('\n\n'),
            showCancel: false,
            confirmText: '知道了'
          })
        } else {
          uni.showToast({ title: msg, icon: 'none' })
        }
        console.warn('[pay] 支付未完成', e)
      } finally {
        this.paying = false
      }
    },
    close() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
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

/* ===== 付费墙 ===== */
.paywall-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.paywall-crown-medal {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFF4DC, #FFE7B8);
  border: 1px solid #F1DDA9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.paywall-crown {
  font-size: 24px;
  line-height: 1;
  margin-top: -2px;
}

.paywall-title {
  font-size: 20px;
  font-weight: 700;
  color: #15181C;
  letter-spacing: 0.5px;
}

.paywall-sub {
  font-size: 12.5px;
  color: #8A94A0;
}

.paywall-benefits {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 16px;
  background: #F8F9FA;
  border-radius: 14px;
}

.benefit-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

/* 金色对勾锚点：强化「已包含权益」的确认感 */
.benefit-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, #D9A94F, #B07A22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.benefit-check-text {
  font-size: 11px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1;
}

/* 「更多会员功能」预告行：与权益行区分的弱化态 */
.benefit-more-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
  padding: 10px 12px;
  background: #FFF9EE;
  border-radius: 10px;
}

.coming-soon {
  font-size: 10.5px;
  color: #C08A2D;
  font-weight: 600;
  flex-shrink: 0;
}

.benefit-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.benefit-title {
  font-size: 14px;
  font-weight: 600;
  color: #15181C;
  line-height: 1.3;
}

.benefit-sub {
  font-size: 11.5px;
  color: #9AA1A8;
  line-height: 1.45;
}

.plan-row {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}

.plan-card {
  flex: 1;
  position: relative;
  padding: 15px 12px 13px;
  border-radius: 14px;
  border: 1.5px solid #EDEFF1;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.plan-card.selected {
  border-color: #C08A2D;
  background: #FDF9F1;
}

.plan-card-year {
  overflow: hidden;
}

.plan-save-badge {
  position: absolute;
  top: 0;
  right: 0;
  padding: 2px 8px;
  background: #C08A2D;
  border-radius: 0 12px 0 10px;
}

.plan-save-text {
  font-size: 9px;
  font-weight: 600;
  color: #FFFFFF;
}

.plan-name {
  font-size: 12.5px;
  font-weight: 500;
  color: #6B7379;
}

.plan-price-row {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.plan-price {
  font-size: 26px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.1;
}

.plan-unit {
  font-size: 11px;
  color: #9AA1A8;
}

.plan-sub {
  font-size: 10.5px;
  color: #9AA1A8;
  line-height: 1.3;
}

.plan-card.selected .plan-sub {
  color: #B07A22;
}

.paywall-cta {
  margin-top: 20px;
  height: 48px;
  border-radius: 16px;
  background: linear-gradient(135deg, #C08A2D, #A9761F);
  box-shadow: 0 6px 16px rgba(192, 138, 45, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
}

.paywall-cta:active {
  opacity: 0.9;
}

.paywall-cta-text {
  font-size: 15px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 0.5px;
}

.paywall-fine {
  margin-top: 10px;
  font-size: 10px;
  color: #B5BBC1;
  text-align: center;
  line-height: 1.5;
}
</style>
