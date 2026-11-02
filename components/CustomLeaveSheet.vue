<template>
  <view v-if="visible" class="cl-modal-mask" @click="close">
    <view class="cl-modal-card" @click.stop>
      <view class="cl-modal-head">
        <text class="cl-modal-title">{{ editingId ? i18n.profile.customSheetEdit : i18n.profile.customSheetAdd }}</text>
        <view class="cl-pro-chip"><text class="cl-pro-chip-text">{{ i18n.profile.customProChip }}</text></view>
      </view>

      <!-- 使用方式：放最前面，因为下面每个字段都跟着它变 -->
      <view class="cl-mode-seg">
        <view class="cl-mode-item" :class="{ active: form.mode === 'range' }" @click="setMode('range')">
          <text class="cl-mode-title">{{ i18n.profile.customModeRange }}</text>
          <text class="cl-mode-sub">{{ i18n.profile.customModeRangeSub }}</text>
        </view>
        <view class="cl-mode-item" :class="{ active: form.mode === 'day' }" @click="setMode('day')">
          <text class="cl-mode-title">{{ i18n.profile.customModeDay }}</text>
          <text class="cl-mode-sub">{{ i18n.profile.customModeDaySub }}</text>
        </view>
      </view>

      <!-- 预设跟随模式换整行：婚产陪丧是连续休，关爱假/生日假是散着用 -->
      <view v-if="!editingId" class="custom-preset-row">
        <view
          v-for="p in presets"
          :key="p.key"
          class="custom-preset-chip"
          :class="{ active: form.name === p.name }"
          @click="applyPreset(p)"
        >
          <view class="custom-preset-dot" :style="{ background: p.color }"></view>
          <text class="custom-preset-text">{{ p.name }}</text>
        </view>
      </view>

      <input class="custom-input" :value="form.name" :placeholder="i18n.profile.customNamePh" maxlength="12" @input="onName" />

      <!-- ===== 连续休假：日期区间 + 逐日条 + 结论 ===== -->
      <view v-if="form.mode === 'range'" class="cl-range-card">
        <view class="cl-range-row">
          <picker class="cl-range-side" mode="date" :value="form.start" @change="onStart">
            <view class="cl-date-block">
              <text class="cl-date-cap">{{ i18n.profile.customDateStart }}</text>
              <text class="cl-date-value">{{ fmtMD(form.start) }}</text>
              <text class="cl-date-week">{{ fmtYW(form.start) }}</text>
            </view>
          </picker>
          <view class="cl-connector">
            <view class="cl-conn-line"></view>
            <view class="cl-duration-pill">
              <text class="cl-duration-text">{{ i18n.profile.customDaysText.replace('{n}', days) }}</text>
            </view>
            <view class="cl-conn-line"></view>
          </view>
          <picker class="cl-range-side" mode="date" :value="form.end" @change="onEnd">
            <view class="cl-date-block end">
              <text class="cl-date-cap">{{ i18n.profile.customDateEnd }}</text>
              <text class="cl-date-value">{{ fmtMD(form.end) }}</text>
              <text class="cl-date-week">{{ fmtYW(form.end) }}</text>
            </view>
          </picker>
        </view>

        <view class="cl-week-strip">
          <view v-for="d in weekStrip" :key="d.key" class="cl-week-cell">
            <text v-if="d.weekday" class="cl-week-wd" :class="{ weekend: d.weekend }">{{ d.weekday }}</text>
            <view v-if="d.gap" class="cl-week-gap"><text class="cl-week-gap-text">…</text></view>
            <view
              v-else
              class="cl-week-dot"
              :class="{ weekend: d.weekend }"
              :style="d.weekend ? '' : { background: form.color }"
            >
              <text class="cl-week-num" :class="{ weekend: d.weekend }">{{ d.day }}</text>
            </view>
          </view>
        </view>

        <view class="cl-calc-bar">
          <text class="cl-calc-note">{{ rangeCalcNote }}</text>
          <text class="cl-calc-value">{{ rangeDeduct }} {{ i18n.profile.customQuotaUnit }}</text>
        </view>
      </view>

      <!-- ===== 按天点选：只建额度，哪天休了点哪天 ===== -->
      <view v-else class="cl-range-card">
        <view class="cl-quota-row">
          <view class="cl-quota-left">
            <text class="cl-date-cap">{{ quotaCapLabel }}</text>
            <view class="cl-quota-num-row">
              <text class="cl-quota-num">{{ form.quota || '—' }}</text>
              <text class="cl-quota-unit">{{ i18n.profile.customQuotaUnit }}</text>
            </view>
          </view>
          <view class="cl-stepper">
            <view class="cl-step-btn" @click="stepQuota(-1)"><text class="cl-step-sign">−</text></view>
            <text class="cl-step-val">{{ form.quota }}</text>
            <view class="cl-step-btn" @click="stepQuota(1)"><text class="cl-step-sign">＋</text></view>
          </view>
        </view>

        <view v-if="form.quota > 0" class="cl-quota-bar">
          <view class="cl-quota-fill" :style="{ width: quotaPercent + '%', background: form.color }"></view>
        </view>

        <view class="cl-quota-stats">
          <text class="cl-quota-used" :style="{ color: form.color }">{{ usedLabel }}</text>
          <text class="cl-quota-left-text">{{ leftLabel }}</text>
        </view>
      </view>

      <!-- 额度规则：只对按天型有意义，区间型没有额度概念 -->
      <view v-if="form.mode === 'day'" class="cl-rule-block">
        <view class="cl-rule-seg">
          <view class="cl-rule-pill" :class="{ active: form.quotaRule === 'yearly' }" @click="setRule('yearly')">
            <text class="cl-rule-text">{{ i18n.profile.customRuleYearly }}</text>
          </view>
          <view class="cl-rule-pill" :class="{ active: form.quotaRule === 'total' }" @click="setRule('total')">
            <text class="cl-rule-text">{{ i18n.profile.customRuleTotal }}</text>
          </view>
        </view>
        <text class="cl-rule-note">{{ ruleNote }}</text>
      </view>

      <!-- 颜色：一维色相条比色环更好用，右端留一个格子预览「标完长什么样」 -->
      <view class="cl-color-row">
        <view id="clHueBar" class="cl-hue-bar" @touchstart.stop="onHueTouch" @touchmove.stop="onHueTouch">
          <view class="cl-hue-knob" :style="{ left: knobPct + '%' }">
            <view class="cl-hue-knob-inner" :style="{ background: form.color }"></view>
          </view>
        </view>
        <view class="cl-cell-preview" :style="{ background: previewBg }">
          <text class="cl-cell-num" :style="{ color: form.color }">{{ previewDay }}</text>
          <view v-if="form.mode === 'day'" class="cl-cell-bar" :style="{ background: form.color }"></view>
        </view>
      </view>

      <view class="custom-save-btn" @click="save">
        <text class="custom-save-text">{{ i18n.profile.customSave }}</text>
      </view>
      <view v-if="editingId" class="custom-delete-btn" @click="remove">
        <text class="custom-delete-text">{{ i18n.profile.customDelete }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import wioService, { buildWeekStrip } from '@/utils/wioService.js'
import { locales } from '@/utils/locales.js'
import { tap as haptic } from '@/utils/haptic.js'

const HUE_STOPS = ['#E54849', '#E57A3D', '#D9A93A', '#A8C24A', '#4FB36B', '#2FA37F',
                   '#3597B8', '#3D6FCB', '#6A5ACD', '#8B54C0', '#B0489F', '#D2437A']

export default {
  name: 'CustomLeaveSheet',
  props: {
    visible: { type: Boolean, default: false },
    // 传入假期对象=编辑；传 null=新增
    leave: { type: Object, default: null }
  },
  emits: ['close', 'saved'],
  data() {
    return {
      settings: { language: 'zh-CN' },
      form: { mode: 'range', name: '', color: '#0E6E62', start: '', end: '', quota: 0, quotaRule: 'yearly' },
      editingId: null,
      hue: 168,
      hueRect: null,
      storedUsage: { used: 0 }
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    presets() {
      // 名字随语言切换；分组随模式切换
      const dict = {
        marriage: this.i18n.profile.presetMarriage,
        maternity: this.i18n.profile.presetMaternity,
        paternity: this.i18n.profile.presetPaternity,
        bereavement: this.i18n.profile.presetBereavement,
        care: this.i18n.profile.presetCare,
        birthday: this.i18n.profile.presetBirthday,
        quarter: this.i18n.profile.presetQuarter,
        compOff: this.i18n.profile.presetCompOff
      }
      const group = (wioService.CUSTOM_LEAVE_PRESETS || {})[this.form.mode] || []
      return group.map(p => ({ ...p, name: dict[p.key] || p.key }))
    },
    days() {
      const { start, end } = this.form
      if (!start || !end || end < start) return 1
      return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
    },
    // 日期条：≤7 天逐日显示；超过 7 天折叠成「前 5 天 + … + 末日」
    weekStrip() {
      return buildWeekStrip(this.form.start, this.form.end)
    },
    // 区间型：真实要扣的天数（排除法定节假日，调休上班要算进来）
    rangeDeduct() {
      return wioService.countDeductibleDays(this.form.start, this.form.end)
    },
    rangeWeekend() {
      return Math.max(0, this.days - this.rangeDeduct)
    },
    rangeCalcNote() {
      if (this.rangeWeekend <= 0) return this.i18n.profile.customRangeNote
      return this.i18n.profile.customRangeNote + ' · '
        + this.i18n.profile.customRangeWeekendNote.replace('{n}', this.rangeWeekend)
    },
    quotaCapLabel() {
      return this.form.quotaRule === 'total'
        ? this.i18n.profile.customQuotaCapTotal
        : this.i18n.profile.customQuotaCap
    },
    ruleNote() {
      return this.form.quotaRule === 'total'
        ? this.i18n.profile.customRuleTotalNote
        : this.i18n.profile.customRuleYearlyNote
    },
    usage() {
      if (this.form.mode !== 'day') {
        return { used: 0, quota: 0, remaining: 0, over: 0, unlimited: true }
      }
      const used = this.storedUsage.used || 0
      const quota = Number(this.form.quota) || 0
      return {
        used,
        quota,
        remaining: quota > 0 ? Math.max(0, Math.round((quota - used) * 10) / 10) : 0,
        over: quota > 0 && used > quota ? Math.round((used - quota) * 10) / 10 : 0,
        unlimited: quota <= 0
      }
    },
    quotaPercent() {
      const u = this.usage
      if (!u.quota) return 0
      return Math.min(100, Math.round((u.used / u.quota) * 100))
    },
    usedLabel() {
      const u = this.usage
      let txt = this.i18n.profile.customUsed.replace('{n}', u.used)
      if (u.over > 0) txt += ' · ' + this.i18n.profile.customOver.replace('{n}', u.over)
      return txt
    },
    leftLabel() {
      const u = this.usage
      if (u.unlimited) return this.i18n.profile.customQuotaUnlimited
      const tpl = this.form.quotaRule === 'total'
        ? this.i18n.profile.customLeftTotal
        : this.i18n.profile.customLeft
      return tpl.replace('{n}', u.remaining)
    },
    knobPct() {
      return Math.max(0, Math.min(100, (this.hue / 360) * 100))
    },
    previewDay() {
      if (this.form.mode === 'day') return 14
      const s = this.form.start
      return s ? Number(s.split('-')[2]) : 14
    },
    // 日历里假期色是 16% 淡底 + 原色文字，预览必须用同一套算法
    previewBg() {
      return this.hexToRgba(this.form.color, 0.16)
    }
  },
  watch: {
    visible(v) {
      if (v) {
        this.init()
        this.$nextTick(() => {
          setTimeout(() => this.measureHueBar(), 120)
        })
      }
    }
  },
  methods: {
    todayStr() {
      const n = new Date()
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    },
    init() {
      this.settings = wioService.getSettings()
      const l = this.leave
      if (l && l.id) {
        this.editingId = l.id
        this.form = {
          mode: l.mode === 'day' ? 'day' : 'range',
          name: l.name,
          color: l.color,
          start: l.start || this.todayStr(),
          end: l.end || this.todayStr(),
          quota: l.quota || 0,
          quotaRule: l.quotaRule || 'yearly'
        }
        this.storedUsage = this.form.mode === 'day'
          ? wioService.getCustomLeaveUsage(l.id)
          : { used: 0 }
      } else {
        const today = this.todayStr()
        this.editingId = null
        this.form = {
          mode: 'range',
          name: '',
          color: wioService.CUSTOM_LEAVE_COLORS[0],
          start: today,
          end: today,
          quota: 0,
          quotaRule: 'yearly'
        }
        this.storedUsage = { used: 0 }
      }
      this.hue = this.hexToHue(this.form.color)
    },
    measureHueBar() {
      const q = uni.createSelectorQuery().in(this)
      q.select('#clHueBar').boundingClientRect(rect => {
        if (rect && rect.width) this.hueRect = rect
      }).exec()
    },
    onHueTouch(e) {
      const t = e.touches && e.touches[0]
      if (!t) return
      if (!this.hueRect) {
        this.measureHueBar()
        return
      }
      const p = Math.max(0, Math.min(1, (t.clientX - this.hueRect.left) / this.hueRect.width))
      // 吸附 5°：不吸附会拖出一堆肉眼难分的近似红
      const h = (Math.round((p * 360) / 5) * 5) % 360
      this.hue = h
      // 饱和度/明度锁在可读区间：日历里这色要当文字色用，太浅会糊
      this.form.color = this.hslToHex(h, 52, 42)
    },
    stepQuota(delta) {
      haptic('light')
      const next = Math.max(0, Math.min(365, (Number(this.form.quota) || 0) + delta))
      this.form.quota = next
    },
    setMode(mode) {
      if (this.form.mode === mode) return
      haptic('light')
      // 名字若来自上一组的预设（比如在按天模式里还留着「婚假」），跟着清掉，
      // 否则会留下「婚假 · 按天扣额度」这种语义错误的组合
      const prevNames = this.presets.map(p => p.name)
      if (prevNames.indexOf(this.form.name) !== -1) this.form.name = ''
      this.form.mode = mode
      if (mode === 'range') this.form.quotaRule = 'yearly'
    },
    setRule(rule) {
      if (this.form.quotaRule === rule) return
      haptic('light')
      this.form.quotaRule = rule
    },
    fmtMD(s) {
      if (!s) return '--'
      const [, m, d] = s.split('-')
      return this.settings.language === 'en-US' ? `${+m}/${+d}` : `${+m}月${+d}日`
    },
    fmtYW(s) {
      if (!s) return ''
      const d = new Date(s + 'T00:00:00')
      if (isNaN(d.getTime())) return ''
      const weekEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const wd = this.settings.language === 'en-US' ? weekEn[d.getDay()] : '周' + '日一二三四五六'[d.getDay()]
      return `${d.getFullYear()} · ${wd}`
    },
    onName(e) {
      this.form.name = e.detail.value
    },
    onStart(e) {
      this.form.start = e.detail.value
      if (this.form.end && this.form.end < e.detail.value) {
        this.form.end = e.detail.value
      }
    },
    onEnd(e) {
      let v = e.detail.value
      if (this.form.start && v < this.form.start) {
        v = this.form.start
        uni.showToast({ title: this.i18n.profile.customRangeFixed, icon: 'none', duration: 1500 })
      }
      this.form.end = v
    },
    applyPreset(p) {
      this.form.name = p.name
      this.form.color = p.color
      // 预设法定期限自带额度规则：婚产陪丧一次性，关爱假/生日假按年发
      if (p.quotaRule) this.form.quotaRule = p.quotaRule
      this.hue = this.hexToHue(p.color)
      haptic('light')
    },
    save() {
      haptic('medium')
      if (!this.form.name.trim()) {
        uni.showToast({ title: this.i18n.profile.customNameRequired, icon: 'none', duration: 1500 })
        return
      }
      const payload = {
        id: this.editingId || undefined,
        name: this.form.name,
        color: this.form.color,
        mode: this.form.mode
      }
      if (this.form.mode === 'day') {
        payload.quota = this.form.quota
        payload.quotaRule = this.form.quotaRule
      } else {
        payload.start = this.form.start
        payload.end = this.form.end
      }
      const saved = wioService.saveCustomLeave(payload)
      if (!saved) {
        uni.showToast({ title: this.i18n.profile.customNameRequired, icon: 'none', duration: 1500 })
        return
      }
      uni.showToast({ title: this.i18n.profile.customSaved, icon: 'success' })
      this.$emit('saved')
    },
    remove() {
      uni.showModal({
        title: this.i18n.profile.customDelete,
        content: this.i18n.profile.customDeleteConfirm.replace('{n}', this.form.name),
        success: (res) => {
          if (!res.confirm) return
          wioService.deleteCustomLeave(this.editingId)
          uni.showToast({ title: this.i18n.profile.customDeleted, icon: 'none', duration: 1500 })
          this.$emit('saved')
        }
      })
    },
    close() {
      haptic('light')
      this.$emit('close')
    },
    // --- 颜色换算 ---
    hexToRgba(hex, alpha) {
      const h = String(hex || '').replace('#', '')
      if (h.length !== 6) return `rgba(14,110,98,${alpha})`
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return `rgba(${r},${g},${b},${alpha})`
    },
    hexToHue(hex) {
      const h = String(hex || '').replace('#', '')
      if (h.length !== 6) return 168
      const r = parseInt(h.slice(0, 2), 16) / 255
      const g = parseInt(h.slice(2, 4), 16) / 255
      const b = parseInt(h.slice(4, 6), 16) / 255
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      if (!d) return 0
      let deg
      if (max === r) deg = ((g - b) / d) % 6
      else if (max === g) deg = (b - r) / d + 2
      else deg = (r - g) / d + 4
      return Math.round((deg * 60 + 360) % 360)
    },
    hslToHex(hue, s, l) {
      const S = s / 100
      const L = l / 100
      const k = n => (n + hue / 30) % 12
      const a = S * Math.min(L, 1 - L)
      const f = n => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
      const to = x => Math.round(255 * x).toString(16).padStart(2, '0')
      return '#' + to(f(0)) + to(f(8)) + to(f(4))
    }
  }
}
</script>

<style scoped>
/* ===== 居中弹出卡片 ===== */
.cl-modal-mask {
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
  padding: 0 28px;
  box-sizing: border-box;
}

.cl-modal-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFFFF;
  border-radius: 20px;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: modal-pop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
  max-height: 86vh;
}

@keyframes modal-pop {
  from { transform: scale(0.94); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.cl-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.cl-modal-title {
  font-size: 17px;
  font-weight: 700;
  color: #15181C;
}

.cl-pro-chip {
  height: 20px;
  padding: 0 9px;
  border-radius: 100px;
  background: linear-gradient(135deg, #D9A947, #A97A1F);
  display: flex;
  align-items: center;
}

.cl-pro-chip-text {
  font-size: 9px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 1px;
}

/* --- 使用方式 --- */
.cl-mode-seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 10px;
  background: #F2F4F6;
}

.cl-mode-item {
  flex: 1;
  height: 46px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.cl-mode-item.active {
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(21, 24, 28, 0.08);
}

.cl-mode-title {
  font-size: 12.5px;
  font-weight: 500;
  color: #6B7378;
}

.cl-mode-item.active .cl-mode-title {
  color: #0B5248;
  font-weight: 600;
}

.cl-mode-sub {
  font-size: 9px;
  color: #8A9299;
}

.cl-mode-item.active .cl-mode-sub {
  color: #7E9A94;
}

/* --- 预设 chips --- */
.custom-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.custom-preset-chip {
  height: 26px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  gap: 5px;
  border-radius: 100px;
  background: #F3F5F6;
  border: 1px solid #F3F5F6;
}

.custom-preset-chip.active {
  background: #EAF3F1;
  border-color: #0E6E62;
}

.custom-preset-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.custom-preset-text {
  font-size: 11px;
  color: #3C444B;
  font-weight: 500;
}

.custom-preset-chip.active .custom-preset-text {
  color: #0B5248;
  font-weight: 600;
}

.custom-input {
  height: 44px;
  border: 1px solid #E7E9EB;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 14px;
  color: #15181C;
  box-sizing: border-box;
}

/* --- 鎏金卡（日期 / 额度共用） --- */
.cl-range-card {
  background: linear-gradient(180deg, #FFFAED, #FFF3DD);
  border: 1px solid #F0DBA7;
  border-radius: 14px;
  padding: 13px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.cl-range-row {
  display: flex;
  align-items: center;
}

.cl-range-side {
  flex: 1;
  min-width: 0;
}

.cl-date-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}

.cl-date-block.end {
  align-items: flex-end;
}

.cl-date-cap {
  font-size: 9.5px;
  color: #B09E78;
  letter-spacing: 0.5px;
}

.cl-date-value {
  font-size: 16px;
  font-weight: 600;
  color: #15181C;
}

.cl-date-week {
  font-size: 9px;
  color: #9AA1A8;
}

.cl-connector {
  width: 72px;
  height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.cl-conn-line {
  flex: 1;
  width: 100%;
  min-height: 1px;
  background: #E7D3A6;
}

.cl-duration-pill {
  height: 21px;
  padding: 0 10px;
  border-radius: 100px;
  background: linear-gradient(135deg, #D9A947, #A97A1F);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cl-duration-text {
  font-size: 10px;
  font-weight: 700;
  color: #FFFFFF;
}

/* --- 逐日条 --- */
.cl-week-strip {
  display: flex;
  gap: 5px;
  align-items: flex-end;
}

.cl-week-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.cl-week-wd {
  font-size: 8.5px;
  color: #B09E78;
}

.cl-week-wd.weekend {
  color: #C9BFA6;
}

.cl-week-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-week-dot.weekend {
  background: #FFFFFF;
  border: 1px solid #E0D5B7;
}

.cl-week-num {
  font-size: 10px;
  font-weight: 500;
  color: #FFFFFF;
}

.cl-week-num.weekend {
  font-weight: 400;
  color: #BCAE8C;
}

.cl-week-gap {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(192, 138, 45, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-week-gap-text {
  font-size: 13px;
  color: #9A8663;
  line-height: 1;
}

/* --- 结论条 --- */
.cl-calc-bar {
  height: 34px;
  border-radius: 10px;
  padding: 0 12px;
  background: rgba(192, 138, 45, 0.09);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cl-calc-note {
  font-size: 9.5px;
  color: #8A6A2A;
}

.cl-calc-value {
  font-size: 13px;
  font-weight: 600;
  color: #8A5A00;
}

/* --- 额度 --- */
.cl-quota-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cl-quota-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cl-quota-num-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.cl-quota-num {
  font-size: 28px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.1;
}

.cl-quota-unit {
  font-size: 11px;
  color: #6B7378;
}

.cl-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cl-step-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-step-sign {
  font-size: 13px;
  font-weight: 500;
  color: #B07A22;
  line-height: 1;
}

.cl-step-val {
  font-size: 14px;
  font-weight: 500;
  color: #15181C;
  min-width: 20px;
  text-align: center;
}

.cl-quota-bar {
  height: 6px;
  border-radius: 100px;
  background: #F2E5C6;
  overflow: hidden;
}

.cl-quota-fill {
  height: 100%;
  border-radius: 100px;
  opacity: 0.85;
}

.cl-quota-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cl-quota-used {
  font-size: 9.5px;
  font-weight: 500;
}

.cl-quota-left-text {
  font-size: 9.5px;
  color: #6B7378;
}

/* --- 额度规则 --- */
.cl-rule-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cl-rule-seg {
  display: flex;
  gap: 6px;
}

.cl-rule-pill {
  flex: 1;
  height: 34px;
  border-radius: 100px;
  background: #F3F5F6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-rule-pill.active {
  background: #FFF6E5;
}

.cl-rule-text {
  font-size: 11px;
  font-weight: 500;
  color: #6B7378;
}

.cl-rule-pill.active .cl-rule-text {
  color: #8A5A00;
  font-weight: 600;
}

.cl-rule-note {
  font-size: 9.5px;
  color: #9AA1A8;
}

/* --- 颜色：色相条 + 格子预览 --- */
.cl-color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cl-hue-bar {
  flex: 1;
  height: 40px;
  border-radius: 20px;
  position: relative;
  background: linear-gradient(to right, #E54849, #E57A3D, #D9A93A, #A8C24A, #4FB36B, #2FA37F, #3597B8, #3D6FCB, #6A5ACD, #8B54C0, #B0489F, #D2437A, #E54849);
}

.cl-hue-knob {
  position: absolute;
  top: 7px;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  border-radius: 50%;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(21, 24, 28, 0.2);
}

.cl-hue-knob-inner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}

.cl-cell-preview {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-shrink: 0;
}

.cl-cell-num {
  font-size: 13px;
  font-weight: 600;
}

.cl-cell-bar {
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

/* --- 保存 / 删除 --- */
.custom-save-btn {
  margin-top: 4px;
  height: 46px;
  border-radius: 23px;
  background: #0B5248;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-save-btn:active {
  opacity: 0.9;
}

.custom-save-text {
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}

.custom-delete-btn {
  display: flex;
  justify-content: center;
  padding: 2px 0;
}

.custom-delete-text {
  font-size: 13px;
  color: #C25B6E;
}
</style>
