"use strict";
const common_vendor = require("../common/vendor.js");
const utils_holidays = require("./holidays.js");
const utils_syncService = require("./syncService.js");
const KEY_SETTINGS = "wio_settings";
const KEY_ENTRIES = "wio_entries";
const KEY_OVERTIME = "wio_overtime";
const DEFAULT_SETTINGS = {
  username: "ertong",
  targetPercentage: 40,
  vacationDays: 20,
  sickDays: 12,
  language: "zh-CN",
  birthdayEnabled: false,
  birthdayMonth: "",
  autoSync: true,
  // 每天往返通勤分钟数（用于年度统计「节约通勤」换算）
  commuteMinutes: 90,
  // 调休配置规则 (Key: 节日名称, Value: boolean 是否调休)
  // 默认只有春节调休
  compOffRules: {
    "春节": true
  }
};
const wioService = {
  // --- Settings ---
  getSettings() {
    try {
      const value = common_vendor.index.getStorageSync(KEY_SETTINGS);
      if (value) {
        const s = { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
        s.targetPercentage = this._sanitizeRatio(s.targetPercentage, 40);
        return s;
      }
    } catch (e) {
      console.error("Error getting settings", e);
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
      const existing = this.getSettings();
      let history = existing.targetHistory && typeof existing.targetHistory.changes === "object" ? {
        baseline: existing.targetHistory.baseline,
        changes: { ...existing.targetHistory.changes }
      } : null;
      const now = /* @__PURE__ */ new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const newVal = this._sanitizeRatio(settings.targetPercentage, null);
      if (newVal !== null) {
        const oldEffective = history ? this.getTargetForMonth(now.getFullYear(), now.getMonth() + 1) : this._sanitizeRatio(existing.targetPercentage, 40);
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
      common_vendor.index.setStorageSync(KEY_SETTINGS, JSON.stringify(settings));
      utils_syncService.markDirty();
    } catch (e) {
      console.error("Error saving settings", e);
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
    if (!history || typeof history.changes !== "object")
      return fallback;
    let ratio = history.baseline != null ? this._sanitizeRatio(history.baseline, fallback) : fallback;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    Object.keys(history.changes).sort().forEach((key) => {
      const v = this._sanitizeRatio(history.changes[key], null);
      if (v !== null && key <= ym)
        ratio = v;
    });
    return ratio;
  },
  // --- 自定义假期（公司福利假，按日期区间配置） ---
  // 结构：customLeaves: [{ id, name, color, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }]
  // 口径：区间内的工作日计入 WIO 分母扣减（与年假/病假同向）；周末/节假日不扣；
  //       用户手动标记的日期优先于自定义假期
  CUSTOM_LEAVE_COLORS: ["#0E6E62", "#41598A", "#8C4F86", "#C08A2D", "#C25B6E", "#C97A3D", "#6B7379"],
  // 法定假期预设（婚假/产假/陪产假/丧假）：一键填充名称 + 推荐色
  // 各地法定天数不同（如产假 158 天起、各省有差），本应用按日期区间配置，故不预填天数
  CUSTOM_LEAVE_PRESETS: [
    { name: "婚假", color: "#C25B6E" },
    { name: "产假", color: "#41598A" },
    { name: "陪产假", color: "#8C4F86" },
    { name: "丧假", color: "#6B7379" }
  ],
  _isValidDateStr(str) {
    return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN((/* @__PURE__ */ new Date(str + "T00:00:00")).getTime());
  },
  getCustomLeaves() {
    const s = this.getSettings();
    const list = Array.isArray(s.customLeaves) ? s.customLeaves : [];
    return list.filter((l) => l && l.id && l.name && this._isValidDateStr(l.start) && this._isValidDateStr(l.end) && l.start <= l.end).map((l) => ({ id: l.id, name: String(l.name).slice(0, 12), color: l.color || "#0E6E62", start: l.start, end: l.end }));
  },
  // 新增或编辑（带 id 即编辑）；校验失败返回 null
  saveCustomLeave(leave) {
    try {
      const settings = this.getSettings();
      const list = Array.isArray(settings.customLeaves) ? settings.customLeaves.filter(Boolean) : [];
      const item = {
        id: leave.id || "cl_" + Date.now().toString(36),
        name: String(leave.name || "").trim().slice(0, 12),
        color: leave.color || "#0E6E62",
        start: leave.start,
        end: leave.end
      };
      if (!item.name || !this._isValidDateStr(item.start) || !this._isValidDateStr(item.end) || item.start > item.end) {
        return null;
      }
      const idx = list.findIndex((l) => l && l.id === item.id);
      if (idx >= 0) {
        list[idx] = item;
      } else {
        list.push(item);
      }
      this.saveSettings({ ...settings, customLeaves: list });
      return item;
    } catch (e) {
      console.error("saveCustomLeave error", e);
      return null;
    }
  },
  deleteCustomLeave(id) {
    const settings = this.getSettings();
    const list = (Array.isArray(settings.customLeaves) ? settings.customLeaves : []).filter((l) => l && l.id !== id);
    this.saveSettings({ ...settings, customLeaves: list });
  },
  // 某天命中的自定义假期（日历显示与统计扣减的数据源）
  getCustomLeaveForDate(dateStr) {
    if (!this._isValidDateStr(dateStr))
      return null;
    const list = this.getCustomLeaves();
    for (const l of list) {
      if (dateStr >= l.start && dateStr <= l.end)
        return l;
    }
    return null;
  },
  // --- Entries (Date: Status) ---
  // Status types: 'company', 'home', 'vacation', 'sick', 'public', etc.
  getEntries() {
    try {
      const value = common_vendor.index.getStorageSync(KEY_ENTRIES);
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      console.error("Error getting entries", e);
    }
    return {};
  },
  getEntryForDate(dateStr) {
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
      common_vendor.index.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      utils_syncService.markDirty();
    } catch (e) {
      console.error("Error saving entry", e);
    }
  },
  // --- Overtime (Date: Hours) ---
  getOvertimeEntries() {
    try {
      const value = common_vendor.index.getStorageSync(KEY_OVERTIME);
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      console.error("Error getting overtime entries", e);
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
      common_vendor.index.setStorageSync(KEY_OVERTIME, JSON.stringify(entries));
      utils_syncService.markDirty();
    } catch (e) {
      console.error("Error saving overtime entry", e);
    }
  },
  // --- Helpers ---
  getTodayDateStr() {
    const now = /* @__PURE__ */ new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
  /**
   * 获取指定日期的公共假期信息
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {object|null} - { name, isOffDay, ... }
   */
  getPublicHoliday(dateStr) {
    if (!utils_holidays.holidays2026 || !utils_holidays.holidays2026.days)
      return null;
    return utils_holidays.holidays2026.days.find((d) => d.date === dateStr) || null;
  },
  /**
   * 获取所有节日信息列表
   * @returns {Array<{name: string, hasCompOff: boolean}>}
   */
  getHolidayInfoList() {
    if (!utils_holidays.holidays2026 || !utils_holidays.holidays2026.days)
      return [];
    const holidayMap = /* @__PURE__ */ new Map();
    utils_holidays.holidays2026.days.forEach((d) => {
      if (!holidayMap.has(d.name)) {
        holidayMap.set(d.name, { name: d.name, hasCompOff: false });
      }
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
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const holiday = this.getPublicHoliday(dateStr);
    if (holiday) {
      if (holiday.isOffDay) {
        return false;
      }
      const settings = this.getSettings();
      const rules = settings.compOffRules || {};
      if (rules[holiday.name]) {
        return true;
      } else {
        return false;
      }
    }
    const day = date.getDay();
    return day !== 0 && day !== 6;
  },
  // Get stats for a specific month (YYYY-MM)
  getMonthStats(year, month) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries();
    `${year}-${String(month).padStart(2, "0")}`;
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
      custom: 0,
      // 自定义假期（区间内工作日）
      totalRecorded: 0,
      workingDays: 0,
      // Mon-Fri
      totalOvertime: 0
      // New: Total overtime hours
    };
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      let isWorkingDay = this.isOfficialWorkingDay(date);
      const entryStatus = entries[dateStr];
      if (!isWorkingDay && (entryStatus === "company" || entryStatus === "home")) {
        isWorkingDay = true;
      }
      if (isWorkingDay) {
        stats.workingDays++;
      }
      if (!entryStatus) {
        const customLeave = this.getCustomLeaveForDate(dateStr);
        if (customLeave) {
          if (isWorkingDay) {
            stats.custom++;
          } else {
            if (!stats.weekendLeaves)
              stats.weekendLeaves = 0;
            stats.weekendLeaves++;
          }
        }
      }
      if (entryStatus) {
        if (stats.hasOwnProperty(entryStatus)) {
          stats[entryStatus]++;
          const deductibleStatuses = ["vacation", "birthday", "sick", "unpaid", "comp_off", "exclude_wio"];
          if (!isWorkingDay && deductibleStatuses.includes(entryStatus)) {
            if (!stats.weekendLeaves)
              stats.weekendLeaves = 0;
            stats.weekendLeaves++;
          }
        }
        stats.totalRecorded++;
      } else {
        const holiday = this.getPublicHoliday(dateStr);
        if (holiday && holiday.isOffDay) {
          stats.public++;
        }
      }
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
      weekendLeaves: stats.weekendLeaves || 0,
      // Return the count of leaves on non-working days
      totalRecorded: stats.totalRecorded,
      workingDays: stats.workingDays,
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
  },
  // Get stats for a specific year (YYYY)
  getYearStats(year) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries();
    const prefix = `${year}-`;
    let stats = {
      vacation: 0,
      birthday: 0,
      sick: 0,
      totalOvertime: 0
      // New: Total overtime hours for the year
    };
    Object.keys(entries).forEach((date) => {
      if (date.startsWith(prefix)) {
        const status = entries[date];
        if (status === "vacation")
          stats.vacation++;
        if (status === "birthday")
          stats.birthday++;
        if (status === "sick")
          stats.sick++;
      }
    });
    Object.keys(overtimeEntries).forEach((date) => {
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
      company: "公司办公",
      home: "居家办公",
      vacation: "年假",
      birthday: "生日假",
      sick: "病假",
      unpaid: "无薪假",
      comp_off: "调休",
      exclude_wio: "不计入"
    };
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const rows = ["日期,星期,状态,加班(小时)"];
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    Object.keys(entries).filter((d) => d >= start && d <= end).sort().forEach((dateStr) => {
      const wd = weekdays[(/* @__PURE__ */ new Date(dateStr + "T00:00:00")).getDay()];
      const status = statusKeys[entries[dateStr]] || entries[dateStr];
      const ot = overtimeEntries[dateStr] || "";
      rows.push(`${dateStr},${wd},${status},${ot}`);
    });
    return rows.join("\n");
  }
};
exports.wioService = wioService;
