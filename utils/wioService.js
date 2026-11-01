import { holidays2026 } from './holidays.js';
import { markDirty } from './syncService.js';
import { isProUser } from './pro.js';

const KEY_SETTINGS = 'wio_settings';
const KEY_ENTRIES = 'wio_entries';
const KEY_OVERTIME = 'wio_overtime';

const DEFAULT_SETTINGS = {
  username: 'ertong',
  targetPercentage: 40,
  vacationDays: 20,
  sickDays: 12,
  language: 'zh-CN',
  birthdayEnabled: false,
  birthdayMonth: '',
  autoSync: true,
  // 每天往返通勤分钟数（用于年度统计「节约通勤」换算）
  commuteMinutes: 90,
  // 调休配置规则 (Key: 节日名称, Value: boolean 是否调休)
  // 默认只有春节调休
  compOffRules: {
      '春节': true
  }
};

/**
 * 由月度统计推导展示口径（首页率卡 / 分享卡共用，避免两套公式各算各的）
 *
 * 回公司率 = 公司天数 ÷ (全月工作日 − 有效休假)
 *   - 有效休假要扣掉落在非工作日的休假标记（weekendLeaves），否则分母会被多减
 *   剩余天 = 全月工作日 − 公司 − 居家 − 休假（= 还没过的日子 + 漏打卡的日子）
 *
 * @param {object} stats getMonthStats() 的返回值
 * @param {number} targetPercentage 当月目标比例
 */
export function computeMonthlyReport(stats, targetPercentage) {
  const s = stats || {}
  const leave = (s.vacationDays || 0) + (s.birthdayDays || 0) + (s.sickDays || 0)
              + (s.unpaidDays || 0) + (s.compOffDays || 0) + (s.excludeWioDays || 0)
              + (s.customLeaveDays || 0)
  const workingDays = s.workingDays || 0
  const company = s.companyDays || 0
  const home = s.homeDays || 0
  const target = targetPercentage || 0

  const denominator = Math.max(0, workingDays - (leave - (s.weekendLeaves || 0)))
  const rate = denominator > 0 ? Math.round((company / denominator) * 100) : 0
  const achieved = rate >= target
  const needCompany = Math.ceil((target / 100) * denominator)
  const gapDays = achieved ? 0 : Math.max(0, needCompany - company)
  const rest = Math.max(0, workingDays - company - home - leave)

  const otHours = s.totalOvertime || 0
  // 「≈ 多上 N 天班」：按 8 小时一个工作日折算，保留到 0.5 天
  const otDays = Math.round((otHours / 8) * 2) / 2

  const leaveTypes = [
    { key: 'vacation', days: s.vacationDays || 0 },
    { key: 'sick', days: s.sickDays || 0 },
    { key: 'comp_off', days: s.compOffDays || 0 },
    { key: 'birthday', days: s.birthdayDays || 0 },
    { key: 'unpaid', days: s.unpaidDays || 0 },
    { key: 'exclude_wio', days: s.excludeWioDays || 0 },
    { key: 'custom', days: s.customLeaveDays || 0 }
  ].filter(item => item.days > 0)

  return {
    rate, target, achieved,
    over: achieved ? rate - target : 0,
    gapDays,
    denominator, workingDays, company, home,
    leave, rest, leaveTypes,
    otHours, otDays
  }
}

export default {
  // --- Settings ---
  getSettings() {
    try {
      const value = uni.getStorageSync(KEY_SETTINGS);
      if (value) {
        const s = { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
        // 自愈：历史脏数据可能把比例写成 0/非法值，读取时归一
        s.targetPercentage = this._sanitizeRatio(s.targetPercentage, 40);
        // 多语言是 PRO 权益：权益失效（退出登录 / 到期）时读口降级回中文。
        // 只降级读取值、不改存储，重新开通后自动恢复原语言偏好。
        if (s.language && s.language !== 'zh-CN' && !isProUser()) {
          s.language = 'zh-CN';
        }
        return s;
      }
    } catch (e) {
      console.error('Error getting settings', e);
    }
    return DEFAULT_SETTINGS;
  },

  // 存储里未经降级的语言原文（用于避免把语言偏好写坏）
  _rawStoredLanguage() {
    try {
      const raw = uni.getStorageSync(KEY_SETTINGS);
      if (!raw) return '';
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (parsed && parsed.language) || '';
    } catch (e) {
      return '';
    }
  },

  // 合法比例：1~100 的数字，否则回退 fallback（fallback 可为 null 表示「无有效值」）
  _sanitizeRatio(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : fallback;
  },

  saveSettings(settings) {
    try {
      // WIO 目标比例按月快照（口径：上线时以当月为准建立快照；以后按月保存；
      // 未修改的月份沿用最近一次的比例；历史月份永不被追改）
      const existing = this.getSettings();
      // 快照历史一律以「已存储」为准，避免调用方传入不完整 settings 时丢失
      let history =
        existing.targetHistory && typeof existing.targetHistory.changes === 'object'
          ? {
              baseline: existing.targetHistory.baseline,
              changes: { ...existing.targetHistory.changes }
            }
          : null;

      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const newVal = this._sanitizeRatio(settings.targetPercentage, null);
      if (newVal !== null) {
        const oldEffective = history
          ? this.getTargetForMonth(now.getFullYear(), now.getMonth() + 1)
          : this._sanitizeRatio(existing.targetPercentage, 40);
        // 只有与「当月应生效比例」不同才记快照；首次改动建立 baseline（当月为准）
        if (newVal !== oldEffective) {
          if (!history) {
            history = { baseline: this._sanitizeRatio(existing.targetPercentage, 40), changes: {} };
          }
          history.changes[ym] = newVal;
        }
        settings = { ...settings, targetPercentage: newVal };
      }
      if (history) {
        settings = { ...settings, targetHistory: history };
      }
      // 无权益时 getSettings 会把语言降级成中文；若调用方只是改了别的设置
      // （拖动目标比例等），这里按存储原文保留语言偏好，避免被降级值覆盖。
      if (!isProUser()) {
        const rawLang = this._rawStoredLanguage();
        if (rawLang && rawLang !== 'zh-CN' && (!settings.language || settings.language === 'zh-CN')) {
          settings = { ...settings, language: rawLang };
        }
      }
      uni.setStorageSync(KEY_SETTINGS, JSON.stringify(settings));
      // 生日假配置（开关 / 月份）一旦变动，历史标记的生日假全部作废：
      // 生日假是与「生日月份」绑定的福利，改了月份或关掉后旧标记既无意义，
      // 还会继续扣减 WIO 分母、占用额度，必须清掉让用户在新月份重新标记。
      this._clearBirthdayEntriesIfChanged(existing, settings);
      markDirty();
      // 语言是全局偏好：从任一入口（我的 / 会员页）切换后广播，
      // 让已挂载的视图立即刷新文案——组件的 onShow 不保证被触发，不能各自等重读
      const prevLanguage = (existing && existing.language) || 'zh-CN';
      // 广播的必须是「实际生效」的语言：无权益时恒为中文
      const nextLanguage = isProUser() ? (settings.language || 'zh-CN') : 'zh-CN';
      if (nextLanguage !== prevLanguage) {
        uni.$emit('wio:language-changed', nextLanguage);
      }
    } catch (e) {
      console.error('Error saving settings', e);
    }
  },

  // 生日假配置变动 → 清空所有已标记的生日假（见 saveSettings 调用处说明）
  _clearBirthdayEntriesIfChanged(prev, next) {
    if (!prev || !next) return;
    const enabledChanged = !!next.birthdayEnabled !== !!prev.birthdayEnabled;
    const monthChanged = String(next.birthdayMonth || '') !== String(prev.birthdayMonth || '');
    if (!enabledChanged && !monthChanged) return;
    try {
      const entries = this.getEntries();
      let removed = 0;
      Object.keys(entries).forEach(d => {
        if (entries[d] === 'birthday') {
          delete entries[d];
          removed++;
        }
      });
      if (removed > 0) {
        uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      }
    } catch (e) {
      console.error('clear birthday entries failed', e);
    }
  },

  // 取某个「年-月」当时生效的 WIO 目标比例
  // targetHistory 结构：{ baseline: 首次改动前的比例, changes: { 'YYYY-MM': 比例 } }
  // 查找规则：取所有 changes 中月份 <= 目标月的最后一次改动；改动之前用 baseline
  // 非法值（如误存的 0）一律跳过，回退 baseline/当前设置——自愈历史脏数据
  getTargetForMonth(year, month) {
    const settings = this.getSettings();
    const fallback = this._sanitizeRatio(settings.targetPercentage, 40);
    const history = settings.targetHistory;
    if (!history || typeof history.changes !== 'object') return fallback;
    let ratio = history.baseline != null ? this._sanitizeRatio(history.baseline, fallback) : fallback;
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    Object.keys(history.changes)
      .sort()
      .forEach(key => {
        const v = this._sanitizeRatio(history.changes[key], null);
        if (v !== null && key <= ym) ratio = v;
      });
    return ratio;
  },

  // --- 自定义假期（公司福利假，按日期区间配置） ---
  // 结构：customLeaves: [{ id, name, color, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }]
  // 口径：区间内的工作日计入 WIO 分母扣减（与年假/病假同向）；周末/节假日不扣；
  //       用户手动标记的日期优先于自定义假期
  CUSTOM_LEAVE_COLORS: ['#0E6E62', '#41598A', '#8C4F86', '#C08A2D', '#C25B6E', '#C97A3D', '#6B7379'],

  // 法定假期预设（婚假/产假/陪产假/丧假）：一键填充名称 + 推荐色
  // 各地法定天数不同（如产假 158 天起、各省有差），本应用按日期区间配置，故不预填天数
  CUSTOM_LEAVE_PRESETS: [
    { name: '婚假', color: '#C25B6E' },
    { name: '产假', color: '#41598A' },
    { name: '陪产假', color: '#8C4F86' },
    { name: '丧假', color: '#6B7379' }
  ],

  _isValidDateStr(str) {
    return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + 'T00:00:00').getTime());
  },

  // 自定义假期是 PRO 权益：权益失效时消费端拿不到任何条目
  // （日历不再上色、不再扣分母，会员页列表变空），但存储里的原始数据保留，
  // 重新开通后原样恢复，不会因为退出登录丢配置。
  getCustomLeaves() {
    if (!isProUser()) return [];
    const s = this.getSettings();
    const list = Array.isArray(s.customLeaves) ? s.customLeaves : [];
    return list
      .filter(l => l && l.id && l.name && this._isValidDateStr(l.start) && this._isValidDateStr(l.end) && l.start <= l.end)
      .map(l => ({ id: l.id, name: String(l.name).slice(0, 12), color: l.color || '#0E6E62', start: l.start, end: l.end }));
  },

  // 新增或编辑（带 id 即编辑）；校验失败或无权返回 null
  saveCustomLeave(leave) {
    try {
      // 写入端同样校验权益：UI 被绕过（返回键/脚本）也写不进去
      if (!isProUser()) return null;
      const settings = this.getSettings();
      const list = Array.isArray(settings.customLeaves) ? settings.customLeaves.filter(Boolean) : [];
      const item = {
        id: leave.id || ('cl_' + Date.now().toString(36)),
        name: String(leave.name || '').trim().slice(0, 12),
        color: leave.color || '#0E6E62',
        start: leave.start,
        end: leave.end
      };
      if (!item.name || !this._isValidDateStr(item.start) || !this._isValidDateStr(item.end) || item.start > item.end) {
        return null;
      }
      const idx = list.findIndex(l => l && l.id === item.id);
      if (idx >= 0) {
        list[idx] = item;
      } else {
        list.push(item);
      }
      this.saveSettings({ ...settings, customLeaves: list });
      return item;
    } catch (e) {
      console.error('saveCustomLeave error', e);
      return null;
    }
  },

  deleteCustomLeave(id) {
    const settings = this.getSettings();
    const list = (Array.isArray(settings.customLeaves) ? settings.customLeaves : []).filter(l => l && l.id !== id);
    this.saveSettings({ ...settings, customLeaves: list });
  },

  // 某天命中的自定义假期（日历显示与统计扣减的数据源）
  getCustomLeaveForDate(dateStr) {
    if (!this._isValidDateStr(dateStr)) return null;
    const list = this.getCustomLeaves();
    for (const l of list) {
      if (dateStr >= l.start && dateStr <= l.end) return l;
    }
    return null;
  },

  // --- Entries (Date: Status) ---
  // Status types: 'company', 'home', 'vacation', 'sick', 'public', etc.
  getEntries() {
    try {
      const value = uni.getStorageSync(KEY_ENTRIES);
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      console.error('Error getting entries', e);
    }
    return {};
  },

  getEntryForDate(dateStr) {
    // dateStr format: YYYY-MM-DD
    const entries = this.getEntries();
    return entries[dateStr] || null;
  },

  saveEntry(dateStr, status) {
    try {
      const entries = this.getEntries();
      // 额度硬约束（不只做 UI 提示）：年假 / 病假用满后不允许再标记。
      // 放在数据层，返回键 / 脚本绕过 UI 时同样拦得住；清空操作始终放行。
      // 同一天重复标记同一状态是幂等的，不能因为「已用满」而拦掉。
      if (status === 'vacation' || status === 'sick') {
        if (entries[dateStr] !== status) {
          const quota = this.getLeaveQuota(status, String(dateStr).slice(0, 4));
          if (quota && quota.full) return false;
        }
      }
      if (status) {
        entries[dateStr] = status;
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      markDirty();
      return true;
    } catch (e) {
      console.error('Error saving entry', e);
      return false;
    }
  },

  // 年假 / 病假的年度额度（统计口径：全年所有该状态条目）
  // 返回 null 表示该状态不受额度约束
  getLeaveQuota(status, year) {
    const keyMap = { vacation: 'vacationDays', sick: 'sickDays' };
    const key = keyMap[status];
    if (!key) return null;
    const s = this.getSettings();
    const total = Math.max(0, Number(s[key]) || 0);
    let used = 0;
    try {
      const st = this.getYearStats(Number(year) || new Date().getFullYear());
      used = status === 'vacation' ? st.vacationDaysUsed : st.sickDaysUsed;
    } catch (e) {
      used = 0;
    }
    return { total, used, left: Math.max(0, total - used), full: used >= total };
  },

  // --- Overtime (Date: Hours) ---
  getOvertimeEntries() {
    try {
      const value = uni.getStorageSync(KEY_OVERTIME);
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      console.error('Error getting overtime entries', e);
    }
    return {};
  },

  getOvertimeForDate(dateStr) {
    const entries = this.getOvertimeEntries();
    return entries[dateStr] || 0;
  },

  saveOvertimeEntry(dateStr, hours) {
    try {
      const entries = this.getOvertimeEntries();
      if (hours && hours > 0) {
        entries[dateStr] = parseFloat(hours);
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_OVERTIME, JSON.stringify(entries));
      markDirty();
    } catch (e) {
      console.error('Error saving overtime entry', e);
    }
  },

  // --- Helpers ---
  getTodayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * 获取指定日期的公共假期信息
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {object|null} - { name, isOffDay, ... }
   */
  getPublicHoliday(dateStr) {
    if (!holidays2026 || !holidays2026.days) return null;
    return holidays2026.days.find(d => d.date === dateStr) || null;
  },

  /**
   * 获取所有节日信息列表
   * @returns {Array<{name: string, hasCompOff: boolean}>}
   */
  getHolidayInfoList() {
      if (!holidays2026 || !holidays2026.days) return [];
      
      const holidayMap = new Map();
      
      holidays2026.days.forEach(d => {
          if (!holidayMap.has(d.name)) {
              holidayMap.set(d.name, { name: d.name, hasCompOff: false });
          }
          
          // 如果某天不是休息日（即补班），则标记该节日有调休
          if (!d.isOffDay) {
              holidayMap.get(d.name).hasCompOff = true;
          }
      });
      
      return Array.from(holidayMap.values());
  },

  /**
   * 判断某天是否为法定工作日
   * @param {Date} date - Date object
   * @returns {boolean}
   */
  isOfficialWorkingDay(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const holiday = this.getPublicHoliday(dateStr);
    
    // 如果在假期安排中
    if (holiday) {
        // isOffDay: true -> 休息 (不是工作日)
        if (holiday.isOffDay) {
            return false;
        }
        
        // isOffDay: false -> 调休上班
        // 获取调休配置
        const settings = this.getSettings();
        const rules = settings.compOffRules || {};
        
        // 检查该节日的调休配置
        // 如果 rules 中有该节日配置，则使用配置值
        // 如果 rules 中没有，默认策略：春节为 true，其他为 false (保持兼容性)
        // 但我们在 DEFAULT_SETTINGS 里已经初始化了 '春节': true
        // 对于其他未配置的节日，undefined 视为 false
        
        if (rules[holiday.name]) {
            return true;
        } else {
            return false;
        }
    }

    // 默认: 周一至周五是工作日
    const day = date.getDay();
    return day !== 0 && day !== 6;
  },
  
  // Get stats for a specific month (YYYY-MM)
  getMonthStats(year, month) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    
    let stats = {
      company: 0,
      home: 0,
      vacation: 0,
      birthday: 0,
      sick: 0,
      unpaid: 0,
      comp_off: 0,
      public: 0,
      exclude_wio: 0,
      custom: 0, // 自定义假期（区间内工作日）
      totalRecorded: 0,
      workingDays: 0, // Mon-Fri
      totalOvertime: 0 // New: Total overtime hours
    };

    // Calculate Working Days (Official) in the month
    // Also calculate Public Holidays (if not overridden by user entry)
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      // 1. Calculate Working Days
      let isWorkingDay = this.isOfficialWorkingDay(date);
      
      const entryStatus = entries[dateStr];
      
      // Special handling:
      // A. If user marks a non-working day as 'company' or 'home', it becomes a working day (denominator +1)
      if (!isWorkingDay && (entryStatus === 'company' || entryStatus === 'home')) {
          isWorkingDay = true;
      }
      
      // B. If user marks a non-working day as any LEAVE type (vacation, sick, etc.),
      // it should NOT become a working day.
      // (The previous logic naturally handles this because isWorkingDay is false, 
      // and we only force it to true for 'company'/'home')

      if (isWorkingDay) {
        stats.workingDays++;
      } else {
        // Fix: If it is NOT a working day (e.g. weekend), but user marked it as LEAVE,
        // we must prevent it from being subtracted from the denominator in index.vue.
        // The formula in index.vue is: workingDays - vacationDays - sickDays...
        // If 'vacationDays' includes a weekend vacation, it will subtract 1 from workingDays.
        // But since workingDays didn't include this weekend, we end up with workingDays - 1, which is WRONG.
        
        // Solution: We separate "working day leaves" from "non-working day leaves".
        // However, changing the return structure might break index.vue.
        // A simpler hack: If user marks leave on a non-working day, we DO NOT count it towards the stats 
        // that are used for subtraction in index.vue, OR we handle the subtraction logic smarter.
        
        // Let's modify step 2 below to only count leaves if they are on working days?
        // No, user wants to track total leave usage too.
        
        // Better approach: Calculate 'deductibleDays' specifically for WIO calculation.
      }

      // 2. Count Stats based on Entry OR Public Holiday default
      // 2.0 自定义假期：仅在「无手动标记」的日期生效（手动标记优先）；
      //     工作日 → 分母扣减项；非工作日 → 计入 weekendLeaves 防止误扣分母
      if (!entryStatus) {
        const customLeave = this.getCustomLeaveForDate(dateStr);
        if (customLeave) {
          if (isWorkingDay) {
            stats.custom++;
          } else {
            if (!stats.weekendLeaves) stats.weekendLeaves = 0;
            stats.weekendLeaves++;
          }
        }
      }
      if (entryStatus) {
        // User manually marked this day
        if (stats.hasOwnProperty(entryStatus)) {
          stats[entryStatus]++;
          
          // New: Track if this status entry is on a non-working day (weekend/holiday)
          // so we can adjust the WIO calculation later.
          // We only care about statuses that are subtracted in the formula:
          // vacation, sick, unpaid, comp_off, exclude_wio
          const deductibleStatuses = ['vacation', 'birthday', 'sick', 'unpaid', 'comp_off', 'exclude_wio'];
          if (!isWorkingDay && deductibleStatuses.includes(entryStatus)) {
             // This is a "Weekend Leave". It shouldn't reduce the denominator.
             // We can record this in a new field or just NOT count it in the main stats?
             // But we need total vacation days for profile...
             
             // Let's add a new field: 'weekendLeaves' to track these "invalid" deductions
             if (!stats.weekendLeaves) stats.weekendLeaves = 0;
             stats.weekendLeaves++;
          }
        }
        stats.totalRecorded++;
      } else {
        // No manual entry, check if it's a public holiday (off day)
        const holiday = this.getPublicHoliday(dateStr);
        if (holiday && holiday.isOffDay) {
          stats.public++;
        }
      }

      // 3. Count Overtime
      const overtime = overtimeEntries[dateStr];
      if (overtime) {
        stats.totalOvertime += parseFloat(overtime);
      }
    }

    return {
      companyDays: stats.company,
      homeDays: stats.home,
      vacationDays: stats.vacation,
      birthdayDays: stats.birthday,
      sickDays: stats.sick,
      unpaidDays: stats.unpaid,
      compOffDays: stats.comp_off,
      publicDays: stats.public,
      excludeWioDays: stats.exclude_wio,
      customLeaveDays: stats.custom,
      weekendLeaves: stats.weekendLeaves || 0, // Return the count of leaves on non-working days
      totalRecorded: stats.totalRecorded,
      workingDays: stats.workingDays,
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
  },

  /** 某月的展示口径（率 / 达标 / 剩余 / 假期构成 / 加班），首页与分享卡共用 */
  getMonthlyReport(year, month) {
    let stats
    try {
      stats = this.getMonthStats(year, month)
    } catch (e) {
      console.error('getMonthlyReport failed', e)
      stats = {}
    }
    return computeMonthlyReport(stats, this.getTargetForMonth(year, month))
  },

  // Get stats for a specific year (YYYY)
  getYearStats(year) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries(); // Get overtime data
    const prefix = `${year}-`;
    
    let stats = {
      vacation: 0,
      birthday: 0,
      sick: 0,
      totalOvertime: 0 // New: Total overtime hours for the year
    };
    
    // Calculate leave days
    Object.keys(entries).forEach(date => {
      if (date.startsWith(prefix)) {
        const status = entries[date];
        if (status === 'vacation') stats.vacation++;
        if (status === 'birthday') stats.birthday++;
        if (status === 'sick') stats.sick++;
      }
    });

    // Calculate total overtime for the year
    Object.keys(overtimeEntries).forEach(date => {
      if (date.startsWith(prefix)) {
        stats.totalOvertime += parseFloat(overtimeEntries[date]);
      }
    });

    return {
      vacationDaysUsed: stats.vacation,
      birthdayDaysUsed: stats.birthday,
      sickDaysUsed: stats.sick,
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
  },

  // 年度聚合（高级统计页用）
  // - workingDays / companyDays / homeDays：12 个月累加
  // - ratio：公司办公日占全年工作日的百分比
  // - monthly[m-1].targetDays = 该月工作日 × 该月当期比例（getTargetForMonth，按月快照）
  // - 节约通勤 = 居家日 × commuteMinutes / 60 小时，再按 8 小时/天折算
  getAnnualStats(year) {
    const leaves = this.getYearStats(year);
    const settings = this.getSettings();

    let workingDays = 0;
    let companyDays = 0;
    let homeDays = 0;
    let overtimeHours = 0;
    const monthly = [];

    for (let m = 1; m <= 12; m++) {
      const s = this.getMonthStats(year, m);
      workingDays += s.workingDays;
      companyDays += s.companyDays;
      homeDays += s.homeDays;
      overtimeHours += s.totalOvertime;

      const ratio = this.getTargetForMonth(year, m);
      monthly.push({
        month: m,
        companyDays: s.companyDays,
        workingDays: s.workingDays,
        // 目标线高度按「该月工作日 × 该月当期比例」，年内改过比例即呈阶梯状
        targetDays: parseFloat((s.workingDays * ratio / 100).toFixed(1))
      });
    }

    overtimeHours = parseFloat(overtimeHours.toFixed(1));
    const commuteMinutes = settings.commuteMinutes || 90;
    const commuteSavedHours = parseFloat((homeDays * commuteMinutes / 60).toFixed(1));

    return {
      year,
      workingDays,
      companyDays,
      homeDays,
      ratio: workingDays > 0 ? Math.round(companyDays / workingDays * 100) : 0,
      overtimeHours,
      overtimeDays: parseFloat((overtimeHours / 8).toFixed(1)),
      commuteMinutes,
      commuteSavedHours,
      commuteSavedDays: parseFloat((commuteSavedHours / 8).toFixed(1)),
      vacationDaysUsed: leaves.vacationDaysUsed,
      birthdayDaysUsed: leaves.birthdayDaysUsed,
      sickDaysUsed: leaves.sickDaysUsed,
      vacationDaysTotal: settings.vacationDays || 20,
      sickDaysTotal: settings.sickDays || 12,
      birthdayEnabled: !!settings.birthdayEnabled,
      monthly
    };
  },

  // 生成年度 CSV 明细（导出用）：日期、星期、状态、加班小时
  buildYearCsv(year) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries();
    const statusKeys = {
      company: '公司办公', home: '居家办公', vacation: '年假',
      birthday: '生日假', sick: '病假', unpaid: '无薪假',
      comp_off: '调休', exclude_wio: '不计入'
    };
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const rows = ['日期,星期,状态,加班(小时)'];
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    Object.keys(entries)
      .filter(d => d >= start && d <= end)
      .sort()
      .forEach(dateStr => {
        const wd = weekdays[new Date(dateStr + 'T00:00:00').getDay()];
        const status = statusKeys[entries[dateStr]] || entries[dateStr];
        const ot = overtimeEntries[dateStr] || '';
        rows.push(`${dateStr},${wd},${status},${ot}`);
      });
    return rows.join('\n');
  }
}
