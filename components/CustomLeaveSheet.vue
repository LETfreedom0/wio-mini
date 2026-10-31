<template>
  <view v-if="visible" class="cl-modal-mask" @click="close">
    <view class="cl-modal-card" @click.stop>
      <view class="cl-modal-head">
        <text class="cl-modal-title">{{ editingId ? i18n.profile.customSheetEdit : i18n.profile.customSheetAdd }}</text>
        <view class="cl-pro-chip"><text class="cl-pro-chip-text">{{ i18n.profile.customProChip }}</text></view>
      </view>

      <view v-if="!editingId" class="cl-field">
        <text class="cl-field-label">{{ i18n.profile.customPresetLabel }}</text>
        <view class="custom-preset-row">
          <view
            v-for="p in presets"
            :key="p.name"
            class="custom-preset-chip"
            :class="{ active: form.name === p.name }"
            @click="applyPreset(p)"
          >
            <text class="custom-preset-text">{{ p.name }}</text>
          </view>
        </view>
      </view>

      <view class="cl-field">
        <text class="cl-field-label">{{ i18n.profile.customFieldName }}</text>
        <input class="custom-input" :value="form.name" :placeholder="i18n.profile.customNamePh" maxlength="12" @input="onName" />
      </view>

      <view class="cl-field">
        <text class="cl-field-label">{{ i18n.profile.customDateRange }}</text>
        <view class="cl-range-card">
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
            <view v-for="d in weekStrip" :key="d.date" class="cl-week-cell">
              <view class="cl-week-dot" :class="{ weekend: d.weekend }" :style="d.weekend ? '' : { background: form.color }">
                <text class="cl-week-num" :class="{ weekend: d.weekend }">{{ d.day }}</text>
              </view>
            </view>
          </view>
          <text class="cl-range-note">{{ i18n.profile.customRangeNote }}</text>
        </view>
      </view>

      <view class="cl-field">
        <text class="cl-field-label">{{ i18n.profile.customColorLabel }}</text>
        <view class="custom-color-row">
          <view
            v-for="c in colors"
            :key="c"
            class="custom-color-dot"
            :class="{ selected: form.color === c }"
            :style="{ background: c }"
            @click="selectColor(c)"
          ></view>
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
import wioService from '@/utils/wioService.js'
import { locales } from '@/utils/locales.js'
import { tap as haptic } from '@/utils/haptic.js'

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
      form: { name: '', color: '#0E6E62', start: '', end: '' },
      editingId: null,
      colors: [],
      presets: []
    }
  },
  computed: {
    i18n() {
      return locales[this.settings.language] || locales['zh-CN']
    },
    days() {
      const { start, end } = this.form
      if (!start || !end || end < start) return 1
      return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
    },
    weekStrip() {
      // 起始日起最多 7 天：工作日用假期色，周末弱化（不扣分母的口径可视化）
      const start = this.form.start
      if (!start) return []
      const base = new Date(start + 'T00:00:00')
      const n = Math.min(this.days, 7)
      const out = []
      for (let i = 0; i < n; i++) {
        const d = new Date(base.getTime() + i * 86400000)
        const wd = d.getDay()
        out.push({
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          day: d.getDate(),
          weekend: wd === 0 || wd === 6
        })
      }
      return out
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
      this.colors = wioService.CUSTOM_LEAVE_COLORS
      // 法定假期预设名称随语言切换
      const names = [
        this.i18n.profile.presetMarriage,
        this.i18n.profile.presetMaternity,
        this.i18n.profile.presetPaternity,
        this.i18n.profile.presetBereavement
      ]
      this.presets = wioService.CUSTOM_LEAVE_PRESETS.map((p, i) => ({ ...p, name: names[i] || p.name }))

      const l = this.leave
      if (l && l.id) {
        this.editingId = l.id
        this.form = { name: l.name, color: l.color, start: l.start, end: l.end }
      } else {
        const today = this.todayStr()
        this.editingId = null
        this.form = { name: '', color: wioService.CUSTOM_LEAVE_COLORS[0], start: today, end: today }
      }
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
    selectColor(c) {
      this.form.color = c
      haptic('light')
    },
    applyPreset(p) {
      this.form.name = p.name
      this.form.color = p.color
      haptic('light')
    },
    save() {
      haptic('medium')
      if (!this.form.name.trim()) {
        uni.showToast({ title: this.i18n.profile.customNameRequired, icon: 'none', duration: 1500 })
        return
      }
      const saved = wioService.saveCustomLeave({
        id: this.editingId || undefined,
        name: this.form.name,
        color: this.form.color,
        start: this.form.start,
        end: this.form.end
      })
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
  animation: modal-pop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
  max-height: 80vh;
}

@keyframes modal-pop {
  from { transform: scale(0.94); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.cl-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
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

.cl-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.cl-field-label {
  font-size: 11px;
  color: #9AA1A8;
}

/* --- 预设 chips --- */
.custom-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-preset-chip {
  padding: 0 14px;
  height: 28px;
  display: flex;
  align-items: center;
  border-radius: 100px;
  background: #F3F5F6;
  border: 1px solid #F3F5F6;
}

.custom-preset-chip.active {
  background: #EAF3F1;
  border-color: #0E6E62;
}

.custom-preset-text {
  font-size: 11.5px;
  color: #3C444B;
  font-weight: 500;
}

.custom-preset-chip.active .custom-preset-text {
  color: #0B5248;
  font-weight: 600;
}

.custom-input {
  height: 42px;
  border: 1px solid #E7E9EB;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: #15181C;
  box-sizing: border-box;
}

/* --- 鎏金日期范围卡 --- */
.cl-range-card {
  background: linear-gradient(180deg, #FFFAED, #FFF3DD);
  border: 1px solid #F0DBA7;
  border-radius: 14px;
  padding: 13px 14px 11px;
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

.cl-week-strip {
  display: flex;
  gap: 5px;
}

.cl-week-cell {
  flex: 1;
  display: flex;
  justify-content: center;
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

.cl-range-note {
  font-size: 9.5px;
  color: #B07A22;
  text-align: center;
}

/* --- 颜色 --- */
.custom-color-row {
  display: flex;
  gap: 12px;
  padding: 4px 0 2px;
}

.custom-color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
}

.custom-color-dot.selected {
  box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 3.5px #0B5248;
}

/* --- 保存 / 删除 --- */
.custom-save-btn {
  margin-top: 14px;
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
  margin-top: 10px;
  display: flex;
  justify-content: center;
  padding: 6px 0 2px;
}

.custom-delete-text {
  font-size: 13px;
  color: #C25B6E;
}
</style>
