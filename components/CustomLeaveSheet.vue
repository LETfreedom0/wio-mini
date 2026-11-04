<template>
  <view v-if="visible" class="cl-modal-mask" @click="close">
    <view class="cl-modal-card" @click.stop>
      <view class="cl-modal-head">
        <text class="cl-modal-title">{{ editingId ? i18n.profile.customSheetEdit : i18n.profile.customSheetAdd }}</text>
        <view class="cl-pro-chip"><text class="cl-pro-chip-text">{{ i18n.profile.customProChip }}</text></view>
      </view>

      <!-- 使用方式：放最前面，因为下面每个字段都跟着它变。
           左边的小图标是「一段」与「一天」的符号，光看形状就知道自己在哪个模式。 -->
      <view class="cl-mode-seg">
        <view class="cl-mode-item" :class="{ active: form.mode === 'range' }" @click="setMode('range')">
          <view class="cl-mode-icon cl-mode-icon-range">
            <view class="cl-mode-range-end l"></view>
            <view class="cl-mode-range-link"></view>
            <view class="cl-mode-range-end r"></view>
          </view>
          <text class="cl-mode-title">{{ i18n.profile.customModeRange }}</text>
        </view>
        <view class="cl-mode-item" :class="{ active: form.mode === 'day' }" @click="setMode('day')">
          <view class="cl-mode-icon cl-mode-icon-day"></view>
          <text class="cl-mode-title">{{ i18n.profile.customModeDay }}</text>
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
      </view>

      <!-- ===== 按天点选：只建额度，哪天休了点哪天 ===== -->
      <view v-else class="cl-range-card">
        <view class="cl-quota-head">
          <text class="cl-quota-cap">{{ i18n.profile.customQuotaCap }}</text>
          <text class="cl-quota-head-text">{{ quotaHeadText }}</text>
        </view>

        <!-- 数字只出现这一处：两个圆钮直接夹着它，改的时候不用满屏找数字 -->
        <view class="cl-stepper">
          <view class="cl-step-btn" :class="{ off: usage.unlimited }" @click="stepQuota(-1)"><text class="cl-step-sign">−</text></view>
          <view class="cl-step-num-row">
            <text class="cl-step-num" :class="{ word: usage.unlimited }">{{ quotaNumText }}</text>
            <text v-if="quotaUnitText" class="cl-step-unit">{{ quotaUnitText }}</text>
          </view>
          <view class="cl-step-btn" @click="stepQuota(1)"><text class="cl-step-sign">＋</text></view>
        </view>

        <view v-if="!usage.unlimited" class="cl-quota-bar">
          <view class="cl-quota-fill" :style="{ width: quotaPercent + '%', background: form.color }"></view>
        </view>

        <!-- 两枚 chip：加半天 / 不限额度。
             半天是给「上午请事假、下午照常上班」这类场景留的入口，
             不限额度则必须显式点，不能靠一路减到 0 误触。 -->
        <view class="cl-quota-chips">
          <view class="cl-quota-chip" :class="{ off: usage.unlimited }" @click="addHalfDay">
            <text class="cl-quota-chip-text">{{ i18n.profile.customQuotaAddHalf }}</text>
          </view>
          <view class="cl-quota-chip plain" :class="{ on: usage.unlimited }" @click="toggleUnlimited">
            <text class="cl-quota-chip-text">{{ i18n.profile.customQuotaUnlimited }}</text>
          </view>
        </view>
      </view>

      <!-- 额度规则：只对按天型有意义，区间型没有额度概念 -->
      <view v-if="form.mode === 'day'" class="cl-rule-seg">
        <view class="cl-rule-pill" :class="{ active: form.quotaRule === 'yearly' }" @click="setRule('yearly')">
          <text class="cl-rule-text">{{ i18n.profile.customRuleYearly }}</text>
        </view>
        <view class="cl-rule-pill" :class="{ active: form.quotaRule === 'total' }" @click="setRule('total')">
          <text class="cl-rule-text">{{ i18n.profile.customRuleTotal }}</text>
        </view>
      </view>

      <!-- 颜色：一组协调配色，点色块选中，点 ↻ 换下一组。
           比原来的色相条好在「挑出来的色一定配得上」：色相条能取任意色，
           也能轻易取出两个肉眼难分的相近色；这里每组都由人工配好关系。
           当前选中色永远留在行内（不在这一组就顶掉最后一格），
           否则换组之后选中态会凭空消失，看着像没选上。 -->
      <view class="cl-palette-row">
        <view class="cl-palette">
          <view
            v-for="(c, i) in paletteColors"
            :key="i + ':' + c"
            class="cl-swatch"
            hover-class="cl-swatch-hover"
            :style="swatchStyle(c)"
            @click="pickColor(c)"
          ></view>
        </view>
        <view class="cl-palette-refresh" hover-class="cl-palette-refresh-hover" @click="refreshPalette">
          <text class="cl-palette-refresh-icon" :style="{ transform: 'rotate(' + paletteTurns * 360 + 'deg)' }">↻</text>
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

// 一组颜色放在一起要「配得上」：每组 4 色取自不同色系，但共用同一冷暖调。
// 12 个旧色板色全部覆盖且各有 1~3 次出场——预设假期套色时能稳定落进某一组，
// 选中态不会因为「色不在当前组」而丢。
const PALETTES = [
  ['#0E6E62', '#3C6FB0', '#7A5AA8', '#D4A33F'], // 湖光
  ['#C25B6E', '#C97A3D', '#D4A33F', '#8A8F4A'], // 暖釉
  ['#2F8F6E', '#8A8F4A', '#0E6E62', '#6B7379'], // 林野
  ['#41598A', '#3C6FB0', '#6B7379', '#7A5AA8'], // 夜蓝
  ['#A93B78', '#8C4F86', '#7A5AA8', '#C25B6E'], // 莓紫
  ['#2F8F6E', '#D4A33F', '#41598A', '#C97A3D']  // 苔金
]

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
      // 当前展示的配色组下标；paletteTurns 只用来驱动 ↻ 每次转一整圈
      paletteIndex: 0,
      paletteTurns: 0,
      storedUsage: { used: 0 },
      // 上一次设过的有限额度：点「不限额度」退出时回到这个值，而不是归零
      lastQuota: 5
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
    // 大号数字：不限额度时显示「不限额度」，否则显示额度本身（可带 0.5）
    quotaNumText() {
      if (this.usage.unlimited) return this.i18n.profile.customQuotaUnlimited
      const q = Number(this.form.quota) || 0
      return String(Math.round(q * 10) / 10)
    },
    quotaUnitText() {
      return this.usage.unlimited ? '' : this.i18n.profile.customQuotaUnit
    },
    // 卡片右上角只留一处数字：有限额度看剩余，不限或超额了看已用
    quotaHeadText() {
      const u = this.usage
      if (u.unlimited || u.over > 0) return this.usedLabel
      return this.leftLabel
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
    // 当前组 4 色。选中色不在组里（刚套了预设，或是旧版色相条存的色）时
    // 顶掉最后一格——宁可少一个备选，也不能让选中态消失
    paletteColors() {
      const g = PALETTES[this.paletteIndex % PALETTES.length]
      const cur = String(this.form.color || '').toUpperCase()
      if (!cur || g.indexOf(cur) !== -1) return g
      return [g[0], g[1], g[2], cur]
    }
  },
  watch: {
    visible(v) {
      if (v) this.init()
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
        if (this.form.quota > 0) this.lastQuota = this.form.quota
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
      this.syncPaletteToColor()
    },
    // 打开/套预设/换组后，把 paletteIndex 定位到「含当前色的那一组」，
    // 找不到就留在第 0 组（此时 paletteColors 会顶掉最后一格保住选中态）
    syncPaletteToColor() {
      const cur = String(this.form.color || '').toUpperCase()
      let hit = -1
      for (let i = 0; i < PALETTES.length; i++) {
        if (PALETTES[i].indexOf(cur) !== -1) { hit = i; break }
      }
      if (hit > -1) this.paletteIndex = hit
      this.paletteTurns = 0
    },
    refreshPalette() {
      haptic('light')
      this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length
      this.paletteTurns += 1
    },
    pickColor(c) {
      const next = String(c || '').toUpperCase()
      if (!next || next === String(this.form.color || '').toUpperCase()) return
      haptic('light')
      this.form.color = next
    },
    // 选中态：色块本身 + 一圈同色外环，中间留一道白，浅色/深色底都看得清
    swatchStyle(c) {
      const sel = String(c).toUpperCase() === String(this.form.color || '').toUpperCase()
      return {
        background: c,
        boxShadow: sel ? `0 0 0 2px #FFFFFF, 0 0 0 3.5px ${c}` : '0 0 0 0 rgba(0,0,0,0)'
      }
    },
    // 额度步进：±1 天。下限卡在 0.5 —— 再往下就是「不限额度」了，
    // 那必须由用户显式点 chip，不该一路减 1 减 0 误触。
    // 不限状态下 ＋ 给 1 天（否则新建的按天假额度是 0，按钮全废没法调），
    // − 无意义（0 已经是下限）。
    stepQuota(delta) {
      haptic('light')
      const cur = Math.round((Number(this.form.quota) || 0) * 10) / 10
      if (cur <= 0) {
        if (delta < 0) return
        this.form.quota = 1
        this.lastQuota = 1
        return
      }
      let next = Math.round((cur + delta) * 10) / 10
      if (next < 0.5) next = 0.5
      if (next > 365) next = 365
      this.form.quota = next
      this.lastQuota = next
    },
    // 加半天：额度本身可以是 0.5 的倍数（半天假按 0.5 天扣）
    addHalfDay() {
      if (this.usage.unlimited) return
      haptic('light')
      const cur = Math.round((Number(this.form.quota) || 0) * 10) / 10
      let next = Math.round((cur + 0.5) * 10) / 10
      if (next > 365) next = 365
      this.form.quota = next
      this.lastQuota = next
    },
    // 不限额度：0 表示不限。退出时回到上一次设过的值
    toggleUnlimited() {
      haptic('light')
      if (this.usage.unlimited) {
        this.form.quota = this.lastQuota || 5
      } else {
        const q = Number(this.form.quota) || 0
        if (q > 0) this.lastQuota = q
        this.form.quota = 0
      }
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
      this.syncPaletteToColor()
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
        this.doSave(payload)
        return
      }
      payload.start = this.form.start
      payload.end = this.form.end
      // 连续休假是整天占用：区间内已有的出勤标记会按休假算。
      // 先讲清楚再保存，别让用户以为那几天的记录被悄悄改了（数据不删，取消假即恢复）
      const marked = wioService.countMarkedDays(this.form.start, this.form.end)
      if (marked > 0) {
        uni.showModal({
          title: this.i18n.profile.customRangeOverlapTitle,
          content: this.i18n.profile.customRangeOverlapBody.replace('{n}', marked),
          confirmText: this.i18n.common.confirm,
          cancelText: this.i18n.common.cancel,
          success: (res) => {
            if (res.confirm) this.doSave(payload)
          }
        })
        return
      }
      this.doSave(payload)
    },
    doSave(payload) {
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
  gap: 15px;
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
  border-radius: 12px;
  background: #EFF1F0;
}

.cl-mode-item {
  flex: 1;
  height: 40px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.cl-mode-item.active {
  background: #FFFFFF;
  box-shadow: 0 2px 9px rgba(14, 110, 98, 0.15);
}

/* 图标：区间 = 两端方块连一线，一天 = 一个点 */
.cl-mode-icon {
  flex-shrink: 0;
}

.cl-mode-icon-range {
  position: relative;
  width: 13px;
  height: 4.5px;
}

.cl-mode-range-end {
  position: absolute;
  top: 0;
  width: 4.5px;
  height: 4.5px;
  border-radius: 1.5px;
  background: #A9B2B8;
}

.cl-mode-range-end.l {
  left: 0;
}

.cl-mode-range-end.r {
  right: 0;
}

.cl-mode-range-link {
  position: absolute;
  left: 4.5px;
  top: 1.5px;
  width: 4px;
  height: 1.5px;
  border-radius: 0.75px;
  background: #A9B2B8;
}

.cl-mode-icon-day {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #A9B2B8;
}

.cl-mode-item.active .cl-mode-range-end,
.cl-mode-item.active .cl-mode-range-link,
.cl-mode-item.active .cl-mode-icon-day {
  background: #0E6E62;
}

.cl-mode-title {
  font-size: 13.5px;
  font-weight: 500;
  color: #9AA1A8;
}

.cl-mode-item.active .cl-mode-title {
  font-size: 14px;
  font-weight: 600;
  color: #0B5248;
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
  height: 46px;
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
  padding: 16px 14px 15px;
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

/* --- 额度 --- */
.cl-quota-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cl-quota-cap {
  font-size: 11.5px;
  color: #8A9299;
}

.cl-quota-head-text {
  font-size: 10.5px;
  color: #8A9299;
}

.cl-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.cl-step-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(21, 24, 28, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-step-btn.off {
  opacity: 0.4;
}

.cl-step-sign {
  font-size: 15px;
  font-weight: 500;
  color: #B07A22;
  line-height: 1;
}

.cl-step-num-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.cl-step-num {
  font-size: 30px;
  font-weight: 700;
  color: #15181C;
  line-height: 1.1;
}

.cl-step-num.word {
  font-size: 21px;
  font-weight: 600;
}

.cl-step-unit {
  font-size: 12px;
  color: #6B7378;
}

.cl-quota-bar {
  height: 5px;
  border-radius: 100px;
  background: #F2E5C6;
  overflow: hidden;
}

.cl-quota-fill {
  height: 100%;
  border-radius: 100px;
  opacity: 0.85;
}

.cl-quota-chips {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cl-quota-chip {
  height: 26px;
  padding: 0 11px;
  border-radius: 100px;
  background: #FFF3DC;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-quota-chip.off {
  opacity: 0.45;
}

.cl-quota-chip.plain {
  background: #F3F5F6;
}

.cl-quota-chip.plain.on {
  background: #FFF3DC;
}

.cl-quota-chip-text {
  font-size: 11px;
  font-weight: 500;
  color: #B07A22;
}

.cl-quota-chip.plain .cl-quota-chip-text {
  color: #6B7378;
}

.cl-quota-chip.plain.on .cl-quota-chip-text {
  color: #B07A22;
}

/* --- 额度规则 --- */
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

/* --- 颜色：一组协调配色 + 换一组 --- */
.cl-palette-row {
  display: flex;
  align-items: center;
}

.cl-palette {
  flex: 1;
  display: flex;
  gap: 6px;
  padding: 6px;
  border-radius: 15px;
  background: #F3F1EA;
}

.cl-swatch {
  flex: 1;
  height: 46px;
  border-radius: 11px;
  /* 换组时颜色从左到右依次淡入，比硬切有「morph」的连续感 */
  transition: background-color 0.34s ease, box-shadow 0.34s ease, transform 0.18s ease;
}

.cl-swatch-hover {
  transform: scale(0.94);
}

.cl-palette-refresh {
  margin-left: 8px;
  width: 44px;
  height: 46px;
  border-radius: 11px;
  background: #E9E4D6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-palette-refresh-hover {
  background: #DED7C5;
}

.cl-palette-refresh-icon {
  font-size: 20px;
  line-height: 1;
  color: #8A5A00;
  /* 每次换组转满 360°，停下来始终是正的 */
  transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
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
