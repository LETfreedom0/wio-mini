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

      <!-- 预设跟随模式换整行：婚产陪丧探亲是一次性连休（含周末），
           公益/育儿/节育是零星按天请 -->
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
              <text class="cl-duration-text">{{ durationText }}</text>
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
              :class="{ off: d.off }"
              :style="d.off ? '' : { background: form.color }"
            >
              <text class="cl-week-num" :class="{ off: d.off }">{{ d.day }}</text>
            </view>
          </view>
        </view>
        <!-- 跳过周末与公共假期：婚假、产假这类「公休假」是按工作日给的，
             区间横跨两个周末时按自然日算会虚报 4 天，日历上也会把周末涂成假期色 -->
        <view class="cl-skip-row">
          <view class="cl-skip-texts">
            <text class="cl-skip-title">{{ i18n.profile.customSkipOffDays }}</text>
            <text class="cl-skip-sub">{{ skipHint }}</text>
          </view>
          <view class="cl-switch" @click="toggleSkipOffDays">
            <view class="cl-switch-track" :class="{ on: form.skipOffDays }">
              <view class="cl-switch-thumb"></view>
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 按天点选：只建额度，哪天休了点哪天 ===== -->
      <view v-else class="cl-day-card">
        <view class="cl-card-head">
          <text class="cl-card-title">{{ i18n.profile.customQuotaCap }}</text>
          <!-- 规则是「额度怎么算」的修饰，收进标题右侧，不再单独占一整行；
               两枚小药丸比一整行「每年重置 / 一次性」省 20px 高度 -->
          <view class="cl-rule-mini">
            <view class="cl-rule-mini-pill" :class="{ active: form.quotaRule === 'yearly' }" @click="setRule('yearly')">
              <text class="cl-rule-mini-text">{{ i18n.profile.customRuleYearly }}</text>
            </view>
            <view class="cl-rule-mini-pill" :class="{ active: form.quotaRule === 'total' }" @click="setRule('total')">
              <text class="cl-rule-mini-text">{{ i18n.profile.customRuleTotal }}</text>
            </view>
          </view>
        </view>

        <!-- 数字只出现这一处：两个圆钮直接夹着它，从 0 往上点，改的时候不用满屏找数字 -->
        <view class="cl-stepper">
          <view class="cl-step-btn" @click="stepQuota(-0.5)"><text class="cl-step-sign">−</text></view>
          <view class="cl-step-num-row">
            <text class="cl-step-num">{{ quotaNumText }}</text>
            <text class="cl-step-unit">{{ quotaUnitText }}</text>
          </view>
          <view class="cl-step-btn" @click="stepQuota(0.5)"><text class="cl-step-sign">＋</text></view>
        </view>

        <view class="cl-quota-bar">
          <view class="cl-quota-fill" :style="{ width: quotaPercent + '%', background: form.color }"></view>
        </view>
        <!-- 进度条两端各标一个数：只画条不标数，用户还得自己反推剩多少 -->
        <view class="cl-quota-scale">
          <text class="cl-quota-scale-text">{{ usedLabel }}</text>
          <text class="cl-quota-scale-text">{{ leftLabel }}</text>
        </view>
      </view>

      <!-- 颜色：一组协调配色，点色块选中，点 ↻ 换下一组。
           标题和色名都不要了——色块自己会说话，↻ 也一看就懂。 -->
      <view class="cl-day-card">
        <view class="cl-palette-row">
          <view
            v-for="(c, i) in paletteColors"
            :key="i"
            class="cl-swatch"
            :class="{ morph: morphing }"
            hover-class="cl-swatch-hover"
            :style="swatchStyle(c)"
            @click="pickColor(c)"
          ></view>
          <!-- ↻ 和色块同格等大：五个格子一起均分整行 -->
          <view class="cl-palette-refresh-btn" hover-class="cl-palette-refresh-hover" @click="refreshPalette">
            <text class="cl-palette-refresh-icon" :style="{ transform: 'rotate(' + paletteTurns * 360 + 'deg)' }">↻</text>
          </view>
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

// 收缩到位 → 换色 → 弹回：与 keyframes 里的 42% / 58% 同源（0.52s * 0.48 ≈ 250ms）
const MORPH_SWAP_MS = 250
const MORPH_END_MS = 540

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
      form: { mode: 'range', name: '', color: '#0E6E62', start: '', end: '', quota: 0, quotaRule: 'yearly', skipOffDays: false },
      editingId: null,
      // 当前展示的配色组下标；paletteTurns 只用来驱动 ↻ 每次转一整圈
      paletteIndex: 0,
      paletteTurns: 0,
      // 换组动画进行中：色块正在收缩/回弹，此间不响应点选
      morphing: false,
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
        family: this.i18n.profile.presetFamily,
        volunteer: this.i18n.profile.presetVolunteer,
        childcare: this.i18n.profile.presetChildcare,
        sterilM: this.i18n.profile.presetSterilM,
        sterilF: this.i18n.profile.presetSterilF
      }
      const group = (wioService.CUSTOM_LEAVE_PRESETS || {})[this.form.mode] || []
      return group.map(p => ({ ...p, name: dict[p.key] || p.key }))
    },
    days() {
      const { start, end } = this.form
      if (!start || !end || end < start) return 1
      return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
    },
    // 区间里真正算休假的天数（周末 / 法定假日已经剔掉）。
    // 婚假 10 天、产假这类公休假，日历横跨两个周末时用自然日会报出 14 天
    workdays() {
      const { start, end } = this.form
      if (!start || !end || end < start) return 0
      return wioService.countDeductibleDays(start, end)
    },
    // 开启「跳过」后主数字换成工作日，并在下面补一句自然日作为对照
    durationText() {
      const p = this.i18n.profile
      if (!this.form.skipOffDays) return p.customDaysText.replace('{n}', this.days)
      return p.customWorkDaysText.replace('{n}', this.workdays)
    },
    durationSub() {
      if (!this.form.skipOffDays) return ''
      return this.i18n.profile.customNaturalDaysText.replace('{n}', this.days)
    },
    // 区间里的周末/假日，用来做「跳过」开关的说明（0 时不用提）
    offDays() {
      return Math.max(0, this.days - this.workdays)
    },
    skipHint() {
      const p = this.i18n.profile
      // 区间里一个周末都没有时，「跳过」开关没有实际作用，别报「已剔除 0 天」
      if (!this.offDays) return p.customSkipOffNone
      const tpl = this.form.skipOffDays ? p.customSkipOffOn : p.customSkipOffHint
      return tpl.replace('{n}', this.offDays)
    },
    // 日期条：≤7 天逐日显示；超过 7 天折叠成「前 5 天 + … + 末日」
    // 勾了「跳过周末与公共假日」后，非工作日（周末 + 法定假日，调休上班日除外）
    // 一律不着色——跟日历那边的口径保持一致，否则条上有色、日历上没色。
    weekStrip() {
      const skip = this.form.skipOffDays
      return buildWeekStrip(this.form.start, this.form.end).map(d => {
        if (d.gap) return { ...d, off: false }
        const off = skip
          ? !wioService.isOfficialWorkingDay(new Date(d.key + 'T00:00:00'))
          : d.weekend
        return { ...d, off }
      })
    },
    // 大号数字：直接显示额度本身（可带 0.5），新建时从 0 起步
    quotaNumText() {
      const q = Number(this.form.quota) || 0
      return String(Math.round(q * 10) / 10)
    },
    quotaUnitText() {
      return this.i18n.profile.customQuotaUnit
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
      const tpl = this.form.quotaRule === 'total'
        ? this.i18n.profile.customLeftTotal
        : this.i18n.profile.customLeft
      return tpl.replace('{n}', u.remaining)
    },
    // 当前组 4 色。选中色不在组里（刚套了预设，或是旧版色相条存的色）时
    // 顶掉最后一格——宁可少一个备选，也不能让选中态消失
    // 当前展示的就是整组四色：点 ↻ 四个一起换，不会留一个旧色在原地，
    // 否则看起来像「只换了一半」。当前选中的颜色因此可能不在新组里，
    // 此时四个色块都是「未选中」状态，form.color 不受影响（保存的仍是原色）。
    paletteColors() {
      return PALETTES[this.paletteIndex % PALETTES.length]
    }
  },
  watch: {
    visible(v) {
      if (v) this.init()
    }
  },
  beforeUnmount() {
    this.clearMorphTimers()
  },
  methods: {
    todayStr() {
      const n = new Date()
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    },
    init() {
      // 面板重开时把上一轮没跑完的换色动画清干净，否则定时器会在新面板上改色
      this.clearMorphTimers()
      this.morphing = false
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
          quotaRule: l.quotaRule || 'yearly',
          skipOffDays: !!l.skipOffDays
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
          quotaRule: 'yearly',
          // 新建区间假默认跳过周末：公休假按工作日给，这个默认值更贴近真实用法
          skipOffDays: true
        }
        this.storedUsage = { used: 0 }
      }
      this.syncPaletteToColor()
    },
    // 打开/套预设后，把 paletteIndex 定位到「含当前色的那一组」，这样一进来
    // 就有一个色块是选中态。换组本身不再回定位——用户要的是四个一起换。
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
      if (this.morphing) return
      haptic('light')
      this.paletteTurns += 1
      this.morphing = true
      // 色块先收成圆点，在「收拢」的那一小段里换色，再弹回方块。
      // 两个时刻必须跟 CSS keyframes 的 42%/58% 对齐，否则会看到
      // 「还没缩到位颜色就变了」或者「弹回来才变色」。
      this.clearMorphTimers()
      this._morphTimers = [
        setTimeout(() => {
          this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length
        }, MORPH_SWAP_MS),
        setTimeout(() => { this.morphing = false }, MORPH_END_MS)
      ]
    },
    clearMorphTimers() {
      ;(this._morphTimers || []).forEach(t => clearTimeout(t))
      this._morphTimers = []
    },
    // 动画期间不接受点选：此刻格子是缩着的，点下去也容易点到隔壁
    pickColor(c) {
      if (this.morphing) return
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
    // 额度步进：±0.5 天（半天假按 0.5 天给），下限 0。
    // 没有「不限额度」这种假——0 只是新建时的起点，保存前必须加到 0.5 以上。
    stepQuota(delta) {
      haptic('light')
      const cur = Math.round((Number(this.form.quota) || 0) * 10) / 10
      let next = Math.round((cur + delta) * 10) / 10
      if (next < 0) next = 0
      if (next > 365) next = 365
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
    // 跳过周末与公共假期：只影响区间型，按天型本来就在日历上逐日点
    toggleSkipOffDays() {
      haptic('light')
      this.form.skipOffDays = !this.form.skipOffDays
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
      // 预设法定期限自带额度规则：公益假/育儿假按年发，节育假一次性
      if (p.quotaRule) this.form.quotaRule = p.quotaRule
      // 区间型预设都是一次性连休：含周末与法定节假日，按自然日整段占用
      if (p.skipOffDays != null) this.form.skipOffDays = !!p.skipOffDays
      this.syncPaletteToColor()
      haptic('light')
    },
    save() {
      haptic('medium')
      if (!this.form.name.trim()) {
        uni.showToast({ title: this.i18n.profile.customNameRequired, icon: 'none', duration: 1500 })
        return
      }
      // 没有不限额度的假：0 只是编辑起点，保存前必须加到 1 天以上
      if (this.form.mode === 'day' && (Number(this.form.quota) || 0) <= 0) {
        uni.showToast({ title: this.i18n.profile.customQuotaRequired, icon: 'none', duration: 1500 })
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
      payload.skipOffDays = this.form.skipOffDays
      // 连续休假是整天占用：区间内已有的出勤标记会按休假算。
      // 先讲清楚再保存，别让用户以为那几天的记录被悄悄改了（数据不删，取消假即恢复）
      const marked = wioService.countMarkedDays(this.form.start, this.form.end, {
        skipOffDays: this.form.skipOffDays
      })
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
  padding: 0 18px;
  box-sizing: border-box;
}

.cl-modal-card {
  width: 100%;
  box-sizing: border-box;
  background: #FFFDF8;
  border: 1px solid rgba(192, 138, 45, 0.28);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: modal-pop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
  max-height: 86vh;
  /* 按天模式现在有三张卡（额度 / 颜色 / 预览），小屏会顶到上限；
     允许滚动，并锁住子项不被 flex 压扁，否则卡片会被挤成一条 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* WXSS 不支持通配选择器（`*` 会在编译期报 error at token），
   所以把卡片里的直接子项显式列出来锁住高度 */
.cl-modal-head,
.cl-mode-seg,
.custom-preset-row,
.custom-input,
.cl-range-card,
.cl-day-card,
.custom-save-btn,
.custom-delete-btn {
  flex-shrink: 0;
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
  font-size: 15px;
  font-weight: 500;
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
  height: 38px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cl-mode-item.active {
  background: #FFFFFF;
  border: 1px solid #DDE6E3;
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
  font-size: 12px;
  font-weight: 400;
  color: #6B7379;
}

.cl-mode-item.active .cl-mode-title {
  font-size: 12px;
  font-weight: 500;
  color: #0E6E62;
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
  background: #F1EBDC;
  border: 1px solid #F1EBDC;
}

.custom-preset-chip.active {
  background: #FFFFFF;
  border-color: #CFE0DB;
}

.custom-preset-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.custom-preset-text {
  font-size: 11px;
  color: #8A7A5C;
  font-weight: 400;
}

.custom-preset-chip.active .custom-preset-text {
  color: #0E6E62;
  font-weight: 500;
}

.custom-input {
  height: 44px;
  border: 1px solid #EDE6D4;
  border-radius: 12px;
  background: #F8F5EC;
  padding: 0 14px;
  font-size: 13px;
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
  width: 86px;
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
  padding: 0 8px;
  border-radius: 100px;
  background: linear-gradient(135deg, #D9A947, #A97A1F);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* 两位数工作日（如「17 个工作日」）刚好挤满 72px 会折行，压死单行 */
  max-width: 100%;
}

.cl-duration-text {
  font-size: 10px;
  font-weight: 700;
  color: #FFFFFF;
  white-space: nowrap;
  line-height: 21px;
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

.cl-week-dot.off {
  background: #FFFFFF;
  border: 1px solid #E0D5B7;
}

.cl-week-num {
  font-size: 10px;
  font-weight: 500;
  color: #FFFFFF;
}

.cl-week-num.off {
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

/* --- 跳过周末与公共假期 --- */
.cl-skip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px dashed #EDE7DA;
}

.cl-skip-texts {
  display: flex;
  flex-direction: column;
  padding-right: 12px;
}

.cl-skip-title {
  font-size: 12px;
  color: #3A4148;
}

.cl-skip-sub {
  font-size: 10px;
  color: #A0A6AD;
  margin-top: 2px;
}

.cl-switch {
  flex-shrink: 0;
  padding: 2px;
}

.cl-switch-track {
  width: 40px;
  height: 23px;
  border-radius: 12px;
  background-color: #D8D2C4;
  position: relative;
  transition: background-color 0.25s;
}

.cl-switch-track.on {
  background-color: #0E6E62;
}

.cl-switch-thumb {
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background-color: #FFFFFF;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: left 0.25s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.cl-switch-track.on .cl-switch-thumb {
  left: 20px;
}

/* --- 按天卡：额度 / 颜色共用一套卡片骨架（数值取自设计稿） --- */
.cl-day-card {
  background: #FAF7EF;
  border: 1px solid rgba(192, 138, 45, 0.2);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cl-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cl-card-title {
  font-size: 11px;
  color: #8A9299;
  letter-spacing: 0.3px;
}

/* 规则药丸：两枚各自带米底，选中的那枚浮白底 + 绿边（设计稿口径） */
.cl-rule-mini {
  display: flex;
  gap: 6px;
}

.cl-rule-mini-pill {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: #F1EBDC;
  border: 1px solid #F1EBDC;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-rule-mini-pill.active {
  background: #FFFFFF;
  border-color: #CFE0DB;
}

.cl-rule-mini-text {
  font-size: 11px;
  color: #8A7A5C;
  line-height: 1;
}

.cl-rule-mini-pill.active .cl-rule-mini-text {
  color: #0E6E62;
  font-weight: 500;
}

.cl-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 0 12px;
}

.cl-step-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #FFFFFF;
  border: 1px solid #E3DAC4;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cl-step-sign {
  font-size: 18px;
  font-weight: 400;
  color: #6B5A38;
  line-height: 1;
}

.cl-step-num-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.cl-step-num {
  font-size: 34px;
  font-weight: 500;
  color: #15181C;
  line-height: 1;
  letter-spacing: -0.5px;
}

.cl-step-num.word {
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0;
}

.cl-step-unit {
  font-size: 13px;
  color: #8A7A5C;
}

.cl-quota-bar {
  height: 6px;
  border-radius: 3px;
  background: #EAE3D0;
  overflow: hidden;
}

.cl-quota-fill {
  height: 100%;
  border-radius: 3px;
}

.cl-quota-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 紧贴进度条，读成「条 + 两端刻度」一整块 */
  margin-top: -6px;
}

.cl-quota-scale-text {
  font-size: 11px;
  color: #8A7A5C;
  line-height: 1;
}

/* --- 颜色：四个色块 + ↻ 五格均分，等宽等高 --- */
.cl-palette-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cl-swatch {
  flex: 1;
  height: 52px;
  border-radius: 14px;
  /* 换色本身也留过渡：动画收拢时颜色是「化」过去的，不是硬切 */
  transition: background-color 0.34s ease, box-shadow 0.34s ease, transform 0.18s ease;
}

.cl-swatch.morph {
  animation: swatch-morph 0.52s cubic-bezier(0.4, 0, 0.2, 1) both;
}

/* 换组动效：方形 → 圆点（此时换色）→ 弹回方形。
   0.52s 里 42%~58% 是「缩到位」的静止窗口，JS 在 250ms 换色正好落在这段 */
@keyframes swatch-morph {
  0%   { border-radius: 14px; transform: scale(1); }
  42%  { border-radius: 50%; transform: scale(0.24); }
  58%  { border-radius: 50%; transform: scale(0.24); }
  100% { border-radius: 14px; transform: scale(1); }
}

.cl-swatch-hover {
  transform: scale(0.94);
}

.cl-palette-refresh-btn {
  flex: 1;
  height: 52px;
  border-radius: 14px;
  background: #EFE9D8;
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
  margin-top: 2px;
  height: 46px;
  border-radius: 14px;
  background: #0E6E62;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-save-btn:active {
  opacity: 0.9;
}

.custom-save-text {
  font-size: 14px;
  font-weight: 500;
  color: #FFFFFF;
}

.custom-delete-btn {
  display: flex;
  justify-content: center;
  padding: 6px 0 2px;
}

.custom-delete-text {
  font-size: 11px;
  color: #9AA1A8;
}
</style>
