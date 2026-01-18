"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_wioService = require("../../utils/wioService.js");
const CustomHeader = () => "../../components/CustomHeader.js";
const CustomTabBar = () => "../../components/CustomTabBar.js";
const _sfc_main = {
  components: {
    CustomHeader,
    CustomTabBar
  },
  data() {
    return {
      weekdays: ["日", "一", "二", "三", "四", "五", "六"],
      legends: [
        { label: "公司办公", color: "green", value: "company" },
        { label: "居家办公", color: "blue", value: "home" },
        { label: "休年假", color: "orange", value: "vacation" },
        { label: "调休", color: "cyan", value: "comp_off" },
        { label: "休病假", color: "purple", value: "sick" },
        { label: "无薪假", color: "gray", value: "unpaid" },
        { label: "公共假期", color: "red", value: "public" },
        { label: "清除", color: "dashed", value: "clear" },
        { label: "记录加班", color: "red-dot", value: "overtime_record" }
      ],
      currentDate: /* @__PURE__ */ new Date(),
      entries: {},
      overtimeEntries: {},
      // New: Store overtime data
      settings: {},
      stats: {
        companyDays: 0,
        homeDays: 0,
        vacationDays: 0,
        sickDays: 0,
        unpaidDays: 0,
        compOffDays: 0,
        publicDays: 0,
        totalRecorded: 0,
        workingDays: 0,
        totalOvertime: 0
      },
      selectedStatus: null,
      lastClickTime: 0,
      lastClickDay: null,
      // Overtime Modal
      showOvertimeModal: false,
      overtimeValue: 0,
      currentOvertimeDateStr: ""
    };
  },
  computed: {
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
      return this.settings.targetPercentage || 40;
    },
    wioPercentage() {
      const numerator = this.stats.companyDays;
      const denominator = this.stats.workingDays - this.stats.homeDays - this.stats.publicDays - this.stats.vacationDays - this.stats.sickDays - this.stats.unpaidDays - this.stats.compOffDays;
      if (denominator <= 0)
        return 0;
      return Math.round(numerator / denominator * 100);
    }
  },
  onShow() {
    this.loadData();
  },
  methods: {
    loadData() {
      this.settings = utils_wioService.wioService.getSettings();
      this.entries = utils_wioService.wioService.getEntries();
      this.overtimeEntries = utils_wioService.wioService.getOvertimeEntries();
      this.updateStats();
    },
    updateStats() {
      this.stats = utils_wioService.wioService.getMonthStats(this.currentYear, this.currentMonth);
    },
    changeMonth(delta) {
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
      if (this.selectedStatus === item.value) {
        this.selectedStatus = null;
      } else {
        this.selectedStatus = item.value;
      }
    },
    onDayClick(day) {
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
      if (this.selectedStatus === "clear") {
        utils_wioService.wioService.saveEntry(dateStr, null);
      } else if (this.selectedStatus === "overtime_record") {
        common_vendor.index.__f__("log", "at pages/calendar/index.vue:261", "Opening overtime modal for", dateStr);
        this.currentOvertimeDateStr = dateStr;
        try {
          const existing = utils_wioService.wioService.getOvertimeForDate(dateStr);
          this.overtimeValue = existing > 0 ? parseFloat(existing) : 0;
        } catch (e) {
          common_vendor.index.__f__("error", "at pages/calendar/index.vue:269", "Error getting existing overtime:", e);
          this.overtimeValue = 0;
        }
        this.showOvertimeModal = true;
        this.$forceUpdate();
        common_vendor.index.__f__("log", "at pages/calendar/index.vue:275", "Modal state set to true");
        return;
      } else {
        utils_wioService.wioService.saveEntry(dateStr, this.selectedStatus);
      }
      this.loadData();
    },
    changeOvertime(delta) {
      common_vendor.index.__f__("log", "at pages/calendar/index.vue:285", "changeOvertime called", delta, "current:", this.overtimeValue);
      let newVal = this.overtimeValue + delta;
      if (newVal < 0)
        newVal = 0;
      if (newVal > 12)
        newVal = 12;
      this.overtimeValue = parseFloat(newVal.toFixed(1));
      common_vendor.index.__f__("log", "at pages/calendar/index.vue:293", "new overtimeValue:", this.overtimeValue);
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
      common_vendor.index.__f__("log", "at pages/calendar/index.vue:320", `getOvertimeDisplay for ${dateStr}:`, val);
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
      if (status === "comp_off")
        return "status-comp-off";
      if (status === "sick")
        return "status-sick";
      if (status === "unpaid")
        return "status-unpaid";
      if (status === "public")
        return "status-public";
      if (!status) {
        const holiday = this.getHolidayInfo(day);
        if (holiday && holiday.isOffDay) {
          return "status-public";
        }
      }
      new Date(this.currentYear, this.currentMonth - 1, day).getDay();
      return "";
    }
  }
};
if (!Array) {
  const _component_CustomHeader = common_vendor.resolveComponent("CustomHeader");
  const _component_CustomTabBar = common_vendor.resolveComponent("CustomTabBar");
  (_component_CustomHeader + _component_CustomTabBar)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.stats.totalOvertime > 0
  }, $data.stats.totalOvertime > 0 ? {
    b: common_vendor.t($data.stats.totalOvertime)
  } : {}, {
    c: common_vendor.t($options.wioPercentage),
    d: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    e: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    f: common_vendor.t($options.targetPercentage),
    g: Math.min($options.wioPercentage, 100) + "%",
    h: $options.wioPercentage >= $options.targetPercentage ? "#4CAF50" : "#D32F2F",
    i: $options.wioPercentage < $options.targetPercentage
  }, $options.wioPercentage < $options.targetPercentage ? {} : {}, {
    j: $options.wioPercentage < $options.targetPercentage ? 1 : "",
    k: $options.wioPercentage >= $options.targetPercentage ? 1 : "",
    l: common_vendor.t($options.currentYear),
    m: common_vendor.t($options.currentMonth),
    n: common_vendor.o(($event) => $options.changeMonth(-1)),
    o: common_vendor.o(($event) => $options.changeMonth(1)),
    p: common_vendor.f($data.weekdays, (day, k0, i0) => {
      return {
        a: common_vendor.t(day),
        b: day
      };
    }),
    q: common_vendor.f($options.startEmptyDays, (n, k0, i0) => {
      return {
        a: "empty-" + n
      };
    }),
    r: common_vendor.f($options.daysInMonth, (day, k0, i0) => {
      return common_vendor.e({
        a: common_vendor.t(day),
        b: $options.getOvertimeDisplay(day)
      }, $options.getOvertimeDisplay(day) ? {
        c: common_vendor.t($options.getOvertimeDisplay(day))
      } : {}, {
        d: $options.getHolidayName(day)
      }, $options.getHolidayName(day) ? {
        e: common_vendor.t($options.getHolidayName(day)),
        f: $options.isHolidayWork(day) ? 1 : ""
      } : {}, {
        g: $options.isHolidayWork(day)
      }, $options.isHolidayWork(day) ? {} : {}, {
        h: common_vendor.n($options.getDayClass(day)),
        i: common_vendor.n({
          "today-highlight": $options.isToday(day)
        }),
        j: day,
        k: common_vendor.o(($event) => $options.onDayClick(day), day),
        l: common_vendor.o(($event) => $options.onDayLongPress(day), day)
      });
    }),
    s: common_vendor.f($data.legends, (item, index, i0) => {
      return {
        a: common_vendor.n(item.color),
        b: common_vendor.t(item.label),
        c: index,
        d: common_vendor.o(($event) => $options.selectLegend(item), index),
        e: $data.selectedStatus === item.value ? 1 : ""
      };
    }),
    t: $data.showOvertimeModal
  }, $data.showOvertimeModal ? {
    v: common_vendor.o((...args) => $options.closeOvertimeModal && $options.closeOvertimeModal(...args)),
    w: common_vendor.t($data.currentOvertimeDateStr),
    x: common_vendor.o(($event) => $options.changeOvertime(-0.5)),
    y: $data.overtimeValue <= 0 ? 1 : "",
    z: common_vendor.t($data.overtimeValue),
    A: common_vendor.o(($event) => $options.changeOvertime(0.5)),
    B: $data.overtimeValue >= 12 ? 1 : "",
    C: common_vendor.o(() => {
    }),
    D: common_vendor.o((...args) => $options.closeOvertimeModal && $options.closeOvertimeModal(...args))
  } : {}, {
    E: common_vendor.p({
      current: "calendar"
    })
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-3ceb4997"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/calendar/index.js.map
