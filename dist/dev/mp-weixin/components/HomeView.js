"use strict";
const common_vendor = require("../common/vendor.js");
const utils_wioService = require("../utils/wioService.js");
const utils_locales = require("../utils/locales.js");
const _sfc_main = {
  name: "HomeView",
  data() {
    return {
      location: null,
      // 'home' | 'company' | null
      todayStr: "",
      showConfetti: false,
      showRocket: false,
      confettiPieces: [],
      settings: {},
      stats: {
        companyDays: 0,
        homeDays: 0,
        totalOvertime: 0,
        workingDays: 0,
        vacationDays: 0,
        birthdayDays: 0,
        sickDays: 0,
        unpaidDays: 0,
        compOffDays: 0,
        excludeWioDays: 0,
        weekendLeaves: 0
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0
      },
      recentRecords: []
    };
  },
  computed: {
    i18n() {
      return utils_locales.locales[this.settings.language] || utils_locales.locales["zh-CN"];
    },
    currentDateStr() {
      const now = /* @__PURE__ */ new Date();
      const month = now.getMonth() + 1;
      const date = now.getDate();
      const day = utils_locales.getWeekdayName(now.getDay(), this.settings.language);
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
        return `${months[month - 1]} ${date} · ${day}`;
      }
      return `${month}月${date}日 · 星期${day}`;
    },
    // 时段问候（无账号体系，不带用户名）
    greetingText() {
      const h = (/* @__PURE__ */ new Date()).getHours();
      const hh = this.i18n.home;
      if (h < 11)
        return hh.greetingMorning;
      if (h < 13)
        return hh.greetingNoon;
      if (h < 18)
        return hh.greetingAfternoon;
      return hh.greetingEvening;
    },
    targetPercentage() {
      const now = /* @__PURE__ */ new Date();
      return utils_wioService.wioService.getTargetForMonth(now.getFullYear(), now.getMonth() + 1);
    },
    // 与日历页保持同一套回公司率公式
    wioPercentage() {
      const denominator = this.denominator;
      if (denominator <= 0)
        return 0;
      return Math.round(this.stats.companyDays / denominator * 100);
    },
    denominator() {
      const totalDeductible = this.stats.vacationDays + this.stats.birthdayDays + this.stats.sickDays + this.stats.unpaidDays + this.stats.compOffDays + this.stats.excludeWioDays;
      const effectiveDeductible = totalDeductible - (this.stats.weekendLeaves || 0);
      return this.stats.workingDays - effectiveDeductible;
    },
    isAchieved() {
      return this.wioPercentage >= this.targetPercentage;
    },
    // 距离目标还差多少个「公司办公日」
    gapDays() {
      if (this.isAchieved)
        return 0;
      if (this.denominator <= 0)
        return 0;
      const needCompany = Math.ceil(this.targetPercentage / 100 * this.denominator);
      return Math.max(0, needCompany - this.stats.companyDays);
    },
    gapText() {
      if (this.isAchieved)
        return this.i18n.home.achieved;
      const u = this.i18n.home;
      return `${u.daysToGo} ${this.gapDays} ${u.daysToGoUnit}${u.achievedSuffix}`;
    },
    fillWidth() {
      return Math.max(0, Math.min(100, this.wioPercentage));
    },
    remainWorkDays() {
      return Math.max(0, this.denominator - this.stats.companyDays - this.stats.homeDays);
    },
    vacationTotal() {
      return this.settings.vacationDays || 0;
    },
    vacationUsed() {
      return this.yearStats.vacationDaysUsed || 0;
    },
    vacationLeft() {
      return Math.max(0, this.vacationTotal - this.vacationUsed);
    },
    vacationPercent() {
      if (!this.vacationTotal)
        return 0;
      return Math.max(0, Math.min(100, this.vacationLeft / this.vacationTotal * 100));
    }
  },
  mounted() {
    this.initData();
  },
  onShow() {
    this.settings = utils_wioService.wioService.getSettings();
    this.loadStats();
  },
  methods: {
    initData() {
      this.settings = utils_wioService.wioService.getSettings();
      this.todayStr = utils_wioService.wioService.getTodayDateStr();
      this.location = utils_wioService.wioService.getEntryForDate(this.todayStr);
      this.loadStats();
    },
    // 只读本月统计 + 年度假期统计 + 最近记录（不改动存储结构）
    loadStats() {
      const now = /* @__PURE__ */ new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      try {
        this.stats = utils_wioService.wioService.getMonthStats(year, month);
      } catch (e) {
        console.error("loadStats month failed", e);
      }
      try {
        this.yearStats = utils_wioService.wioService.getYearStats(year);
      } catch (e) {
        console.error("loadStats year failed", e);
      }
      this.buildRecentRecords();
    },
    buildRecentRecords() {
      const entries = utils_wioService.wioService.getEntries() || {};
      const lang = this.settings.language;
      const dates = Object.keys(entries).sort().reverse().slice(0, 3);
      const meta = {
        company: { label: this.i18n.home.workFromCompany, color: "#0E6E62", bg: "#E7F1EF" },
        home: { label: this.i18n.home.workFromHome, color: "#B26B18", bg: "#FBF0E2" },
        vacation: { label: this.i18n.calendar.legends.vacation, color: "#41598A", bg: "#E9EDF5" },
        birthday: { label: this.i18n.calendar.legends.birthday, color: "#C24A7E", bg: "#FBF0F4" },
        sick: { label: this.i18n.calendar.legends.sick, color: "#8C4F86", bg: "#F4ECF3" },
        unpaid: { label: this.i18n.calendar.legends.unpaid, color: "#6B7379", bg: "#EFF1F3" },
        comp_off: { label: this.i18n.calendar.legends.comp_off, color: "#1E7A8C", bg: "#E5F2F4" },
        public: { label: this.i18n.calendar.legends.public, color: "#B23A32", bg: "#F9EAE8" },
        exclude_wio: { label: this.i18n.calendar.legends.exclude_wio, color: "#8B95A1", bg: "#EFF1F3" }
      };
      this.recentRecords = dates.map((dateStr) => {
        const [y, m, d] = dateStr.split("-");
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        const weekday = utils_locales.getWeekdayName(dt.getDay(), lang);
        const dateLabel = lang === "en-US" ? `${utils_locales.getMonthName(Number(m), lang)} ${Number(d)}` : `${Number(m)}月${Number(d)}日 · 周${weekday}`;
        const status = entries[dateStr];
        const m2 = meta[status] || { label: status, color: "#6B7379", bg: "#EFF1F3" };
        return { dateLabel, label: m2.label, color: m2.color, bgColor: m2.bg };
      });
    },
    setStatus(status) {
      if (this.location !== status) {
        common_vendor.index.vibrateShort();
        if (status === "home")
          this.triggerConfetti();
        else if (status === "company")
          this.triggerRocket();
      }
      this.location = status;
      utils_wioService.wioService.saveEntry(this.todayStr, status);
      this.loadStats();
    },
    goCalendar() {
      common_vendor.index.switchTab({ url: "/pages/calendar/index" });
    },
    triggerConfetti() {
      const colors = ["#ff0055", "#00ddff", "#00ff99", "#9900ff", "#ffd300", "#ff8800"];
      const pieces = [];
      for (let i = 0; i < 80; i++) {
        const isLeft = i < 40;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const duration = 3 + Math.random() * 2;
        const delay = Math.random() * 0.3;
        const targetX = isLeft ? 10 + Math.random() * 50 : 40 + Math.random() * 50;
        const targetY = 5 + Math.random() * 30;
        const rotation = (Math.random() - 0.5) * 720;
        pieces.push({
          className: isLeft ? "confetti-left-anim" : "confetti-right-anim",
          style: {
            "--bg-color": color,
            "--target-x": `${targetX}%`,
            "--target-y": `${targetY}%`,
            "--rotation": `${rotation}deg`,
            "--duration": `${duration}s`,
            "--delay": `${delay}s`,
            backgroundColor: color,
            left: isLeft ? "0%" : "100%"
          }
        });
      }
      this.confettiPieces = pieces;
      this.showConfetti = false;
      this.$nextTick(() => {
        this.showConfetti = true;
        setTimeout(() => {
          this.showConfetti = false;
        }, 6e3);
      });
    },
    triggerRocket() {
      this.showRocket = false;
      this.$nextTick(() => {
        this.showRocket = true;
        setTimeout(() => {
          this.showRocket = false;
        }, 2500);
      });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.showConfetti
  }, $data.showConfetti ? {
    b: common_vendor.f($data.confettiPieces, (item, index, i0) => {
      return {
        a: index,
        b: common_vendor.n(item.className),
        c: common_vendor.s(item.style)
      };
    })
  } : {}, {
    c: $data.showRocket
  }, $data.showRocket ? {
    d: common_vendor.f(4, (n, k0, i0) => {
      return {
        a: n
      };
    })
  } : {}, {
    e: common_vendor.t($options.greetingText),
    f: common_vendor.t($options.currentDateStr),
    g: common_vendor.t($options.i18n.home.monthlyWio),
    h: common_vendor.t($options.i18n.home.targetLabel),
    i: common_vendor.t($options.targetPercentage),
    j: common_vendor.t($options.wioPercentage),
    k: common_vendor.t($options.gapText),
    l: $options.fillWidth + "%",
    m: common_vendor.t($data.stats.companyDays),
    n: common_vendor.t($options.i18n.home.countDays),
    o: common_vendor.t($options.i18n.home.workFromCompany),
    p: common_vendor.t($data.stats.homeDays),
    q: common_vendor.t($options.i18n.home.countDays),
    r: common_vendor.t($options.i18n.home.workFromHome),
    s: common_vendor.t($options.remainWorkDays),
    t: common_vendor.t($options.i18n.home.countDays),
    v: common_vendor.t($options.i18n.home.remainWorkDays),
    w: $options.isAchieved ? 1 : "",
    x: common_vendor.t($options.i18n.home.leaveLeft),
    y: common_vendor.t($options.i18n.home.leaveUsed),
    z: common_vendor.t($options.vacationUsed),
    A: common_vendor.t($options.vacationTotal),
    B: common_vendor.t($options.i18n.home.countDays),
    C: common_vendor.t($options.vacationLeft),
    D: common_vendor.t($options.i18n.home.countDays),
    E: $options.vacationPercent + "%",
    F: common_vendor.t($options.i18n.home.todayTitle),
    G: common_vendor.n($data.location === "company" ? "icon-company-on" : "icon-company-off"),
    H: common_vendor.t($options.i18n.home.workFromCompany),
    I: common_vendor.t($data.location === "company" ? $options.i18n.home.recorded : $options.i18n.home.tapToSwitch),
    J: $data.location === "company" ? 1 : "",
    K: $data.location === "company" ? 1 : "",
    L: common_vendor.o(($event) => $options.setStatus("company")),
    M: common_vendor.n($data.location === "home" ? "icon-home-on" : "icon-home-off"),
    N: common_vendor.t($options.i18n.home.workFromHome),
    O: common_vendor.t($data.location === "home" ? $options.i18n.home.recorded : $options.i18n.home.tapToSwitch),
    P: $data.location === "home" ? 1 : "",
    Q: $data.location === "home" ? 1 : "",
    R: common_vendor.o(($event) => $options.setStatus("home")),
    S: common_vendor.t($options.i18n.home.hint),
    T: common_vendor.t($options.i18n.home.recentRecords),
    U: common_vendor.t($options.i18n.home.viewAll),
    V: common_vendor.o((...args) => $options.goCalendar && $options.goCalendar(...args)),
    W: $data.recentRecords.length === 0
  }, $data.recentRecords.length === 0 ? {
    X: common_vendor.t($options.i18n.home.noRecord)
  } : {}, {
    Y: common_vendor.f($data.recentRecords, (item, index, i0) => {
      return {
        a: common_vendor.t(item.dateLabel),
        b: common_vendor.t(item.label),
        c: item.color,
        d: item.bgColor,
        e: index
      };
    })
  });
}
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-f29a63c4"]]);
wx.createComponent(Component);
