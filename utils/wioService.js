import { holidays2026 } from './holidays.js';

const KEY_SETTINGS = 'wio_settings';
const KEY_ENTRIES = 'wio_entries';
const KEY_OVERTIME = 'wio_overtime';

const DEFAULT_SETTINGS = {
  username: 'ertong',
  targetPercentage: 40,
  vacationDays: 20,
  sickDays: 12
};

export default {
  // --- Settings ---
  getSettings() {
    try {
      const value = uni.getStorageSync(KEY_SETTINGS);
      if (value) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
      }
    } catch (e) {
      console.error('Error getting settings', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings) {
    try {
      uni.setStorageSync(KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings', e);
    }
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
        // isOffDay: false -> 调休上班 (是工作日)
        return !holiday.isOffDay;
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
      sick: 0,
      unpaid: 0,
      comp_off: 0,
      public: 0,
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
      if (this.isOfficialWorkingDay(date)) {
        stats.workingDays++;
      }

      // 2. Count Stats based on Entry OR Public Holiday default
      const entryStatus = entries[dateStr];
      if (entryStatus) {
        // User manually marked this day
        if (stats.hasOwnProperty(entryStatus)) {
          stats[entryStatus]++;
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
      sickDays: stats.sick,
      unpaidDays: stats.unpaid,
      compOffDays: stats.comp_off,
      publicDays: stats.public,
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
      sick: 0,
      totalOvertime: 0 // New: Total overtime hours for the year
    };
    
    // Calculate leave days
    Object.keys(entries).forEach(date => {
      if (date.startsWith(prefix)) {
        const status = entries[date];
        if (status === 'vacation') stats.vacation++;
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
      sickDaysUsed: stats.sick,
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
  }
}
