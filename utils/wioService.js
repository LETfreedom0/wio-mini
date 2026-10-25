import { holidays2026 } from './holidays.js';
import { markDirty } from './syncService.js';

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

export default {
  // --- Settings ---
  getSettings() {
    try {
      const value = uni.getStorageSync(KEY_SETTINGS);
      if (value) {
        const s = { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
        // 自愈：历史脏数据可能把比例写成 0/非法值，读取时归一
        s.targetPercentage = this._sanitizeRatio(s.targetPercentage, 40);
        return s;
      }
    } catch (e) {
      console.error('Error getting settings', e);
    }
    return DEFAULT_SETTINGS;
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
      uni.setStorageSync(KEY_SETTINGS, JSON.stringify(settings));
      markDirty();
    } catch (e) {
      console.error('Error saving settings', e);
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
      if (status) {
        entries[dateStr] = status;
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      markDirty();
    } catch (e) {
      console.error('Error saving entry', e);
    }
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
      weekendLeaves: stats.weekendLeaves || 0, // Return the count of leaves on non-working days
      totalRecorded: stats.totalRecorded,
      workingDays: stats.workingDays,
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
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
