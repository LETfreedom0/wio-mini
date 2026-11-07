<template>
  <view v-if="visible" class="rs-mask" @click="close">
    <view class="rs-card" @click.stop>
      <view class="rs-head">
        <text class="rs-title">{{ i18n.profile.redeemSheetTitle }}</text>
        <text class="rs-hint">{{ i18n.profile.redeemSheetHint }}</text>
      </view>

      <!-- 输入态 -->
      <template v-if="!done">
        <view class="rs-input-wrap" :class="{ 'rs-input-err': !!error }">
          <input
            class="rs-input"
            :value="code"
            :placeholder="i18n.profile.redeemPlaceholder"
            placeholder-style="color:#B5BBC1;font-weight:500;letter-spacing:1px"
            :maxlength="32"
            :disabled="busy"
            confirm-type="done"
            @input="onInput"
            @confirm="submit"
          />
        </view>
        <text v-if="error" class="rs-error">{{ error }}</text>
        <view class="rs-btn" :class="{ 'rs-btn-busy': busy }" @click="submit">
          <text class="rs-btn-text">{{ busy ? i18n.profile.redeemBusy : i18n.profile.redeemBtn }}</text>
        </view>
      </template>

      <!-- 成功态：把到期日明确写出来，兑换完就知道到哪一天 -->
      <template v-else>
        <view class="rs-ok-badge"><text class="rs-ok-icon">✓</text></view>
        <text class="rs-ok-title">{{ i18n.profile.redeemOk }}</text>
        <text class="rs-ok-date">{{ untilText }}</text>
        <view class="rs-btn" @click="close">
          <text class="rs-btn-text">{{ i18n.profile.gotIt }}</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script>
import wioService from '@/utils/wioService.js'
import { locales, t } from '@/utils/locales.js'
import { redeemCode } from '@/utils/auth.js'
import { tap as haptic } from '@/utils/haptic.js'

export default {
  name: 'RedeemSheet',
  props: {
    visible: { type: Boolean, default: false }
  },
  emits: ['close', 'redeemed'],
  data() {
    return {
      settings: { language: 'zh-CN' },
      code: '',
      error: '',
      busy: false,
      done: false,
      until: 0
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    untilText() {
      if (!this.until) return ''
      const d = new Date(this.until)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
  },
  watch: {
    visible(v) {
      if (!v) return
      this.settings = wioService.getSettings()
      this.code = ''
      this.error = ''
      this.done = false
      this.until = 0
      this.busy = false
    }
  },
  methods: {
    onInput(e) {
      // 统一大写，用户抄码时不用管大小写
      this.code = String((e && e.detail && e.detail.value) || '').toUpperCase()
      if (this.error) this.error = ''
    },
    msgFor(e) {
      const lang = this.settings.language
      const c = (e && (e.code || e.error)) || ''
      if (c === 'need_login' || c === 'cloud_unavailable') return t('profile.redeemNeedLogin', lang)
      if (c === 'code_used') return t('profile.redeemUsed', lang)
      if (c === 'code_expired') return t('profile.redeemExpired', lang)
      if (c === 'code_exhausted') return t('profile.redeemExhausted', lang)
      if (c === 'bad_code') return t('profile.redeemBad', lang)
      return t('profile.redeemFail', lang)
    },
    async submit() {
      if (this.busy || this.done) return
      const lang = this.settings.language
      const value = this.code.trim()
      if (!value) {
        this.error = t('profile.redeemEmpty', lang)
        return
      }
      this.busy = true
      this.error = ''
      try {
        const res = await redeemCode(value)
        haptic('medium')
        this.until = (res && res.expiresAt) || 0
        this.done = true
        this.$emit('redeemed', res)
      } catch (e) {
        haptic('light')
        this.error = this.msgFor(e)
      } finally {
        this.busy = false
      }
    },
    close() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.rs-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(11, 14, 18, 0.55);
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.rs-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFFFF;
  border-radius: 24px 24px 0 0;
  padding: 26px 20px calc(env(safe-area-inset-bottom) + 22px) 20px;
  display: flex;
  flex-direction: column;
  animation: rs-up 0.25s cubic-bezier(0.32, 0.9, 0.55, 1);
}

@keyframes rs-up {
  from { transform: translateY(40%); opacity: 0.6; }
  to   { transform: translateY(0); opacity: 1; }
}

.rs-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
}

.rs-title {
  font-size: 17px;
  font-weight: 700;
  color: #15181C;
  letter-spacing: 0.3px;
}

.rs-hint {
  font-size: 12px;
  color: #8A94A0;
}

.rs-input-wrap {
  height: 52px;
  border-radius: 14px;
  background: #F6F7F8;
  border: 1.5px solid transparent;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.rs-input-err {
  border-color: #D9544D;
  background: #FDF4F3;
}

.rs-input {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  color: #15181C;
}

.rs-error {
  margin-top: 10px;
  font-size: 12px;
  color: #D9544D;
  line-height: 1.4;
}

.rs-btn {
  margin-top: 18px;
  height: 48px;
  border-radius: 16px;
  background: linear-gradient(135deg, #C08A2D, #A9761F);
  box-shadow: 0 6px 16px rgba(192, 138, 45, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rs-btn:active {
  opacity: 0.9;
}

.rs-btn-busy {
  opacity: 0.6;
}

.rs-btn-text {
  font-size: 15px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 0.5px;
}

.rs-ok-badge {
  align-self: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #D9A94F, #B07A22);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rs-ok-icon {
  font-size: 26px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1;
}

.rs-ok-title {
  align-self: center;
  margin-top: 14px;
  font-size: 15px;
  font-weight: 600;
  color: #15181C;
}

.rs-ok-date {
  align-self: center;
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  color: #B07A22;
  letter-spacing: 1px;
}
</style>
