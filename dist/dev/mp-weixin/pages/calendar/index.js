"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_wioService = require("../../utils/wioService.js");
const utils_locales = require("../../utils/locales.js");
const utils_safeArea = require("../../utils/safeArea.js");
const CustomTabBar = () => "../../components/CustomTabBar.js";
const holidayNameMap = {
  "元旦": "New Year's",
  "春节": "Spring Fest",
  "清明节": "Qingming",
  "劳动节": "Labor Day",
  "端午节": "Dragon Boat",
  "中秋节": "Mid-Autumn",
  "国庆节": "National Day"
};
const _sfc_main = {
  components: {
    CustomTabBar
  },
  data() {
    return {
      currentDate: /* @__PURE__ */ new Date(),
      topSafeHeight: 0,
      entries: {},
      overtimeEntries: {},
      settings: {},
      customLeaves: [],
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      stats: {
        companyDays: 0,
        homeDays: 0,
        vacationDays: 0,
        sickDays: 0,
        unpaidDays: 0,
        compOffDays: 0,
        publicDays: 0,
        excludeWioDays: 0,
        totalRecorded: 0,
        workingDays: 0,
        totalOvertime: 0
      },
      selectedStatus: null,
      lastClickTime: 0,
      lastClickDay: null,
      showOvertimeModal: false,
      overtimeValue: 0,
      currentOvertimeDateStr: "",
      lastNx: 0,
      scrollTimer: null
    };
  },
  computed: {
    i18n() {
      return utils_locales.locales[this.settings.language] || utils_locales.locales["zh-CN"];
    },
    weekdays() {
      return this.i18n.calendar.weekdays;
    },
    legends() {
      const lang = this.settings.language || "zh-CN";
      return [
        { label: utils_locales.t("calendar.legends.company", lang), color: "green", value: "company" },
        { label: utils_locales.t("calendar.legends.home", lang), color: "blue", value: "home" },
        { label: utils_locales.t("calendar.legends.vacation", lang), color: "orange", value: "vacation" },
        { label: utils_locales.t("calendar.legends.birthday", lang), color: "pink", value: "birthday" },
        { label: utils_locales.t("calendar.legends.comp_off", lang), color: "cyan", value: "comp_off" },
        { label: utils_locales.t("calendar.legends.sick", lang), color: "purple", value: "sick" },
        { label: utils_locales.t("calendar.legends.unpaid", lang), color: "gray", value: "unpaid" },
        { label: utils_locales.t("calendar.legends.public", lang), color: "red", value: "public" },
        { label: utils_locales.t("calendar.legends.overtime_record", lang), color: "purple-ot", value: "overtime_record" },
        { label: utils_locales.t("calendar.legends.exclude_wio", lang), color: "exclude", value: "exclude_wio" },
        { label: utils_locales.t("calendar.legends.clear", lang), color: "dashed", value: "clear" }
      ];
    },
    monthYearText() {
      if (this.settings.language === "en-US") {
        const months = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December"
        ];
        return `${months[this.currentMonth - 1]} ${this.currentYear}`;
      }
      return `${this.currentYear}年${this.currentMonth}月`;
    },
    currentYear() {
      return this.currentDate.getFullYear();
    },
    currentMonth() {
      return this.currentDate.getMonth() + 1;
    },
    daysInMonth() {
      return new Date(this.currentYear, this.currentMonth, 0).getDate();
    },
    startEmptyDays() {
      return new Date(this.currentYear, this.currentMonth - 1, 1).getDay();
    },
    targetPercentage() {
      return utils_wioService.wioService.getTargetForMonth(this.currentYear, this.currentMonth);
    },
    wioPercentage() {
      const numerator = this.stats.companyDays;
      const totalDeductible = this.stats.vacationDays + this.stats.birthdayDays + this.stats.sickDays + this.stats.unpaidDays + this.stats.compOffDays + this.stats.excludeWioDays + (this.stats.customLeaveDays || 0);
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);
      const denominator = this.stats.workingDays - effectiveDeductible;
      if (denominator <= 0)
        return 0;
      return Math.round(numerator / denominator * 100);
    },
    filteredLegends() {
      const order = [
        "company",
        "home",
        "vacation",
        "sick",
        "overtime_record",
        "public",
        "comp_off",
        "unpaid",
        "exclude_wio"
      ];
      let result = order.map((key) => this.legends.find((item) => item.value === key)).filter(Boolean);
      if (this.settings.birthdayEnabled && this.settings.birthdayMonth) {
        const currentMonthStr = String(this.currentMonth).padStart(2, "0");
        if (currentMonthStr === this.settings.birthdayMonth) {
          const birthdayLegend = this.legends.find((item) => item.value === "birthday");
          if (birthdayLegend) {
            const insertIndex = 3;
            result.splice(insertIndex, 0, birthdayLegend);
          }
        }
      }
      const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
      const monthStart = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-01`;
      const monthEnd = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      (this.customLeaves || []).forEach((l) => {
        if (l.end >= monthStart && l.start <= monthEnd) {
          result.push({ label: l.name, color: "custom-dot", value: "custom_" + l.id, dotColor: l.color, isCustom: true });
        }
      });
      return result;
    },
    remainingVacationDays() {
      const total = this.settings.vacationDays || 20;
      const used = this.yearStats.vacationDaysUsed || 0;
      return Math.max(0, total - used);
    },
    // 距离目标还差多少个「公司办公日」
    gapDays() {
      if (this.wioPercentage >= this.targetPercentage)
        return 0;
      const totalDeductible = this.stats.vacationDays + this.stats.birthdayDays + this.stats.sickDays + this.stats.unpaidDays + this.stats.compOffDays + this.stats.excludeWioDays + (this.stats.customLeaveDays || 0);
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);
      const denominator = this.stats.workingDays - effectiveDeductible;
      if (denominator <= 0)
        return 0;
      const needCompany = Math.ceil(this.targetPercentage / 100 * denominator);
      return Math.max(0, needCompany - this.stats.companyDays);
    },
    gapText() {
      if (this.wioPercentage >= this.targetPercentage) {
        return this.i18n.home.achieved;
      }
      const u = this.i18n.home;
      return `${u.daysToGo} ${this.gapDays} ${u.daysToGoUnit}`;
    },
    showBirthdayReminder() {
      if (!this.settings.birthdayEnabled || !this.settings.birthdayMonth) {
        return false;
      }
      const currentMonthStr = String(this.currentMonth).padStart(2, "0");
      if (currentMonthStr !== this.settings.birthdayMonth) {
        return false;
      }
      return !this.hasBirthdayInMonth();
    }
  },
  onShareAppMessage(res) {
    const title = this.settings.language === "en-US" ? `This month's office rate: ${this.wioPercentage}% - Did you reach WIO target?` : `本月回公司率: ${this.wioPercentage}% - WIO 达标了吗`;
    return {
      title,
      path: "/pages/index/index"
    };
  },
  onShareTimeline(res) {
    const title = this.settings.language === "en-US" ? `This month's office rate: ${this.wioPercentage}% - Did you reach WIO target?` : `本月回公司率: ${this.wioPercentage}% - WIO 达标了吗`;
    return {
      title
    };
  },
  onLoad() {
    this.topSafeHeight = utils_safeArea.getTopSafeArea().totalHeight;
  },
  onShow() {
    this.loadData();
  },
  onPageScroll(e) {
    const ny = Math.max(-1, Math.min(1, e.scrollTop / 400));
    this.emitGaze(this.lastNx, ny, true);
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      common_vendor.index.$emit("wio-gaze", { nx: 0, ny: 0, active: false });
    }, 300);
  },
  methods: {
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const w = common_vendor.index.getSystemInfoSync().windowWidth;
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)));
      }
    },
    onTouchEnd() {
      setTimeout(() => {
        this.lastNx = 0;
      }, 600);
    },
    emitGaze(nx, ny, active) {
      common_vendor.index.$emit("wio-gaze", { nx, ny, active });
    },
    loadData() {
      this.settings = utils_wioService.wioService.getSettings();
      this.entries = utils_wioService.wioService.getEntries();
      this.overtimeEntries = utils_wioService.wioService.getOvertimeEntries();
      this.customLeaves = utils_wioService.wioService.getCustomLeaves();
      this.yearStats = utils_wioService.wioService.getYearStats((/* @__PURE__ */ new Date()).getFullYear());
      this.updateStats();
    },
    updateStats() {
      this.stats = utils_wioService.wioService.getMonthStats(this.currentYear, this.currentMonth);
    },
    changeMonth(delta) {
      common_vendor.index.vibrateShort();
      const newDate = new Date(this.currentDate);
      newDate.setMonth(newDate.getMonth() + delta);
      this.currentDate = newDate;
      this.updateStats();
    },
    isToday(day) {
      const now = /* @__PURE__ */ new Date();
      return now.getDate() === day && now.getMonth() === this.currentDate.getMonth() && now.getFullYear() === this.currentDate.getFullYear();
    },
    selectLegend(item) {
      if (item.isCustom)
        return;
      common_vendor.index.vibrateShort({
        success: function() {
          console.log("success");
        }
      });
      this.selectedStatus = item.value;
      if (item.value === "clear") {
        common_vendor.index.showToast({
          title: utils_locales.t("calendar.clickToClear", this.settings.language),
          icon: "none",
          duration: 1500
        });
      }
    },
    selectBirthdayLegend() {
      common_vendor.index.vibrateShort();
      this.selectedStatus = "birthday";
      common_vendor.index.showToast({
        title: this.i18n.calendar.clickDateToMark,
        icon: "none",
        duration: 1500
      });
    },
    onDayClick(day) {
      common_vendor.index.vibrateShort();
      const currentTime = (/* @__PURE__ */ new Date()).getTime();
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (this.lastClickDay === day && currentTime - this.lastClickTime < 300) {
        utils_wioService.wioService.saveEntry(dateStr, null);
        common_vendor.index.vibrateShort();
        this.loadData();
        this.lastClickTime = 0;
        this.lastClickDay = null;
        return;
      }
      this.lastClickTime = currentTime;
      this.lastClickDay = day;
      if (!this.selectedStatus) {
        return;
      }
      if (this.selectedStatus === "birthday") {
        if (this.hasBirthdayInMonth()) {
          common_vendor.index.showToast({
            title: this.i18n.calendar.birthdayLimit,
            icon: "none",
            duration: 2e3
          });
          return;
        }
      }
      if (this.selectedStatus === "clear") {
        utils_wioService.wioService.saveEntry(dateStr, null);
      } else if (this.selectedStatus === "overtime_record") {
        console.log("Opening overtime modal for", dateStr);
        this.currentOvertimeDateStr = dateStr;
        try {
          const existing = utils_wioService.wioService.getOvertimeForDate(dateStr);
          this.overtimeValue = existing > 0 ? parseFloat(existing) : 0;
        } catch (e) {
          console.error("Error getting existing overtime:", e);
          this.overtimeValue = 0;
        }
        this.showOvertimeModal = true;
        this.$forceUpdate();
        console.log("Modal state set to true");
        return;
      } else {
        utils_wioService.wioService.saveEntry(dateStr, this.selectedStatus);
      }
      this.loadData();
    },
    changeOvertime(delta) {
      console.log("changeOvertime called", delta, "current:", this.overtimeValue);
      let newVal = this.overtimeValue + delta;
      if (newVal < 0)
        newVal = 0;
      if (newVal > 12)
        newVal = 12;
      this.overtimeValue = parseFloat(newVal.toFixed(1));
      console.log("new overtimeValue:", this.overtimeValue);
      this.saveOvertime();
      common_vendor.index.vibrateShort();
    },
    saveOvertime() {
      const hours = this.overtimeValue;
      if (hours > 0) {
        utils_wioService.wioService.saveOvertimeEntry(this.currentOvertimeDateStr, hours);
      } else {
        utils_wioService.wioService.saveOvertimeEntry(this.currentOvertimeDateStr, 0);
      }
      this.entries = utils_wioService.wioService.getEntries();
      this.overtimeEntries = { ...utils_wioService.wioService.getOvertimeEntries() };
      this.updateStats();
      this.$forceUpdate();
    },
    closeOvertimeModal() {
      this.showOvertimeModal = false;
    },
    getOvertimeDisplay(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const val = this.overtimeEntries[dateStr];
      console.log(`getOvertimeDisplay for ${dateStr}:`, val);
      return val ? `${val}` : "";
    },
    onDayLongPress(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      utils_wioService.wioService.saveEntry(dateStr, null);
      common_vendor.index.vibrateShort();
      this.loadData();
    },
    getHolidayInfo(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return utils_wioService.wioService.getPublicHoliday(dateStr);
    },
    getHolidayName(day) {
      const info = this.getHolidayInfo(day);
      return info ? info.name : "";
    },
    getHolidayDisplayName(day) {
      const name = this.getHolidayName(day);
      if (this.settings.language === "en-US") {
        return holidayNameMap[name] || name;
      }
      return name;
    },
    isHolidayWork(day) {
      const info = this.getHolidayInfo(day);
      return info ? !info.isOffDay : false;
    },
    getDayClass(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const status = this.entries[dateStr];
      if (status === "company")
        return "company-office";
      if (status === "home")
        return "home-office";
      if (status === "vacation")
        return "status-vacation";
      if (status === "birthday")
        return "status-birthday";
      if (status === "comp_off")
        return "status-comp-off";
      if (status === "sick")
        return "status-sick";
      if (status === "unpaid")
        return "status-unpaid";
      if (status === "public")
        return "status-public";
      if (status === "exclude_wio")
        return "status-exclude-wio";
      if (!status) {
        if (this.getCustomLeaveInfo(day)) {
          return "status-custom";
        }
        const holiday = this.getHolidayInfo(day);
        if (holiday && holiday.isOffDay) {
          return "status-public";
        }
      }
      new Date(this.currentYear, this.currentMonth - 1, day).getDay();
      return "";
    },
    // 自定义假期：取该日命中的假期（用于格子着色与图例）
    getCustomLeaveInfo(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return utils_wioService.wioService.getCustomLeaveForDate(dateStr);
    },
    // 手动标记优先：有手动状态的日期不套自定义假期配色
    getCustomStyle(day) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (this.entries[dateStr])
        return null;
      const cl = utils_wioService.wioService.getCustomLeaveForDate(dateStr);
      if (!cl)
        return null;
      return { background: this.hexToRgba(cl.color, 0.16), color: cl.color };
    },
    hexToRgba(hex, alpha) {
      const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex || "");
      if (!m)
        return "";
      const n = parseInt(m[1], 16);
      return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
    },
    hasBirthdayInMonth() {
      const prefix = `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}`;
      return Object.keys(this.entries).some((key) => key.startsWith(prefix) && this.entries[key] === "birthday");
    }
  }
};
if (!Array) {
  const _component_CustomTabBar = common_vendor.resolveComponent("CustomTabBar");
  _component_CustomTabBar();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.topSafeHeight + "px",
    b: common_vendor.t($options.i18n.calendar.monthlyWio),
    c: common_vendor.t($options.wioPercentage),
    d: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    e: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    f: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    g: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    h: common_vendor.t($options.i18n.calendar.target),
    i: common_vendor.t($options.targetPercentage),
    j: common_vendor.t($options.gapText),
    k: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    l: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    m: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    n: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    o: Math.min($options.wioPercentage, 100) + "%",
    p: Math.min($options.targetPercentage, 100) + "%",
    q: common_vendor.t($options.i18n.home.workFromCompany),
    r: common_vendor.t($data.stats.companyDays),
    s: common_vendor.t($options.i18n.home.countDays),
    t: common_vendor.t($options.i18n.home.workFromHome),
    v: common_vendor.t($data.stats.homeDays),
    w: common_vendor.t($options.i18n.home.countDays),
    x: common_vendor.t($options.i18n.calendar.ot),
    y: common_vendor.t($data.stats.totalOvertime),
    z: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    A: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    B: $options.showBirthdayReminder
  }, $options.showBirthdayReminder ? {
    C: common_vendor.t($options.i18n.calendar.birthdayReminderTitle),
    D: common_vendor.t($options.i18n.calendar.birthdayReminderDesc),
    E: common_vendor.t($options.i18n.calendar.markToday),
    F: common_vendor.o((...args) => $options.selectBirthdayLegend && $options.selectBirthdayLegend(...args))
  } : {}, {
    G: common_vendor.t($options.monthYearText),
    H: common_vendor.o(($event) => $options.changeMonth(-1)),
    I: common_vendor.o(($event) => $options.changeMonth(1)),
    J: common_vendor.f($options.weekdays, (day, index, i0) => {
      return {
        a: common_vendor.t(day),
        b: index
      };
    }),
    K: common_vendor.f($options.startEmptyDays, (n, k0, i0) => {
      return {
        a: "empty-" + n
      };
    }),
    L: common_vendor.f($options.daysInMonth, (day, k0, i0) => {
      return common_vendor.e({
        a: common_vendor.t(day),
        b: $options.getOvertimeDisplay(day)
      }, $options.getOvertimeDisplay(day) ? {
        c: common_vendor.t($options.getOvertimeDisplay(day))
      } : {}, {
        d: $options.getHolidayName(day)
      }, $options.getHolidayName(day) ? {
        e: common_vendor.t($options.getHolidayDisplayName(day)),
        f: $options.isHolidayWork(day) ? 1 : "",
        g: $data.settings.language === "en-US" ? 1 : ""
      } : {}, {
        h: $options.isHolidayWork(day)
      }, $options.isHolidayWork(day) ? {
        i: common_vendor.t($options.i18n.calendar.workBadge)
      } : {}, {
        j: common_vendor.n($options.getDayClass(day)),
        k: common_vendor.n({
          "today-highlight": $options.isToday(day)
        }),
        l: common_vendor.s($options.getCustomStyle(day)),
        m: day,
        n: common_vendor.o(($event) => $options.onDayClick(day), day),
        o: common_vendor.o(($event) => $options.onDayLongPress(day), day)
      });
    }),
    M: common_vendor.t($options.i18n.calendar.legendTitle),
    N: common_vendor.t($options.i18n.calendar.legendTip),
    O: common_vendor.t($options.i18n.calendar.legends.clear),
    P: common_vendor.o(($event) => $options.selectLegend({
      value: "clear"
    })),
    Q: $data.selectedStatus === "clear" ? 1 : "",
    R: common_vendor.f($options.filteredLegends, (item, index, i0) => {
      return {
        a: common_vendor.n(item.color),
        b: common_vendor.s(item.dotColor ? {
          background: item.dotColor
        } : null),
        c: common_vendor.t(item.label),
        d: index,
        e: common_vendor.o(($event) => $options.selectLegend(item), index),
        f: $data.selectedStatus === item.value ? 1 : ""
      };
    }),
    S: $data.showOvertimeModal
  }, $data.showOvertimeModal ? {
    T: common_vendor.o((...args) => $options.closeOvertimeModal && $options.closeOvertimeModal(...args)),
    U: common_vendor.t($options.i18n.calendar.overtime),
    V: common_vendor.t($data.currentOvertimeDateStr),
    W: common_vendor.o(($event) => $options.changeOvertime(-0.5)),
    X: $data.overtimeValue <= 0 ? 1 : "",
    Y: common_vendor.t($data.overtimeValue),
    Z: common_vendor.t($options.i18n.common.hour),
    aa: common_vendor.o(($event) => $options.changeOvertime(0.5)),
    ab: $data.overtimeValue >= 12 ? 1 : "",
    ac: common_vendor.o(() => {
    }),
    ad: common_vendor.o((...args) => $options.closeOvertimeModal && $options.closeOvertimeModal(...args))
  } : {}, {
    ae: common_vendor.p({
      current: "calendar"
    }),
    af: common_vendor.o((...args) => $options.onTouchMove && $options.onTouchMove(...args)),
    ag: common_vendor.o((...args) => $options.onTouchEnd && $options.onTouchEnd(...args))
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-3ceb4997"]]);
_sfc_main.__runtimeHooks = 7;
wx.createPage(MiniProgramPage);
