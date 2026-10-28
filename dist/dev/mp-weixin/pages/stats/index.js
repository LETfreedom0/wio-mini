"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_wioService = require("../../utils/wioService.js");
const utils_safeArea = require("../../utils/safeArea.js");
const utils_auth = require("../../utils/auth.js");
const utils_locales = require("../../utils/locales.js");
const CHART_MAX_BAR = 90;
const _sfc_main = {
  data() {
    return {
      topSafeHeight: 0,
      year: (/* @__PURE__ */ new Date()).getFullYear(),
      annual: {
        year: 0,
        workingDays: 0,
        companyDays: 0,
        homeDays: 0,
        ratio: 0,
        overtimeHours: 0,
        overtimeDays: 0,
        commuteMinutes: 90,
        commuteSavedHours: 0,
        commuteSavedDays: 0,
        vacationDaysUsed: 0,
        birthdayDaysUsed: 0,
        sickDaysUsed: 0,
        vacationDaysTotal: 20,
        sickDaysTotal: 12,
        birthdayEnabled: false,
        monthly: []
      },
      showCommuteEditor: false,
      draftCommute: 90,
      selectedMonth: (/* @__PURE__ */ new Date()).getMonth() + 1
      // 柱状图默认选中当前月
    };
  },
  computed: {
    settings() {
      return utils_wioService.wioService.getSettings();
    },
    i18n() {
      return utils_locales.locales[this.settings.language] || utils_locales.locales["zh-CN"];
    },
    session() {
      return utils_auth.getAuth();
    },
    isPro() {
      if (utils_auth.isTrialActive())
        return true;
      const sub = this.session && this.session.subscription;
      if (!sub)
        return false;
      const exp = sub.expiresAt || sub.expires_at;
      return !!(exp && exp > Date.now());
    },
    canGoPrev() {
      return this.year > 2e3;
    },
    canGoNext() {
      return this.year < (/* @__PURE__ */ new Date()).getFullYear();
    },
    chartMax() {
      let max = 1;
      this.annual.monthly.forEach((m) => {
        max = Math.max(max, m.companyDays, m.targetDays);
      });
      return max;
    },
    commuteDisplay() {
      const h = this.draftCommute / 60;
      return `${parseFloat(h.toFixed(2))} ${this.i18n.profile.statsUnitHour}`;
    },
    commuteEstText() {
      return this.i18n.profile.statsCommuteEst.replace("{h}", parseFloat((this.annual.commuteMinutes / 60).toFixed(2)));
    }
  },
  onLoad() {
    this.topSafeHeight = utils_safeArea.getTopSafeArea().totalHeight;
  },
  onShow() {
    this.refresh();
  },
  methods: {
    refresh() {
      this.annual = utils_wioService.wioService.getAnnualStats(this.year);
      this.draftCommute = this.annual.commuteMinutes;
    },
    goBack() {
      common_vendor.index.navigateBack();
    },
    goBackToProfile() {
      common_vendor.index.switchTab({ url: "/pages/profile/index" });
    },
    changeYear(delta) {
      if (delta < 0 && !this.canGoPrev)
        return;
      if (delta > 0 && !this.canGoNext)
        return;
      common_vendor.index.vibrateShort && common_vendor.index.vibrateShort();
      this.year += delta;
      this.refresh();
    },
    isCurrentMonth(month) {
      const now = /* @__PURE__ */ new Date();
      return this.year === now.getFullYear() && month === now.getMonth() + 1;
    },
    barHeight(days) {
      return Math.round(days / this.chartMax * CHART_MAX_BAR);
    },
    // 点柱子：弹出/收起该月的回司天数气泡
    onBarTap(m) {
      common_vendor.index.vibrateShort && common_vendor.index.vibrateShort();
      this.selectedMonth = this.selectedMonth === m.month ? null : m.month;
    },
    leavePct(used, total) {
      if (!total)
        return 0;
      return Math.min(100, Math.round(used / total * 100));
    },
    onCommuteChanging(e) {
      this.draftCommute = e.detail.value;
    },
    saveCommute() {
      const settings = utils_wioService.wioService.getSettings();
      settings.commuteMinutes = this.draftCommute;
      utils_wioService.wioService.saveSettings(settings);
      this.showCommuteEditor = false;
      this.refresh();
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.topSafeHeight + "px",
    b: !$options.isPro
  }, !$options.isPro ? {
    c: common_vendor.o((...args) => $options.goBack && $options.goBack(...args)),
    d: common_vendor.t($options.i18n.profile.statsTitle),
    e: common_vendor.t($options.i18n.profile.statsLockedTitle),
    f: common_vendor.t($options.i18n.profile.statsLockedSub),
    g: common_vendor.t($options.i18n.profile.statsLockedCta),
    h: common_vendor.o((...args) => $options.goBackToProfile && $options.goBackToProfile(...args))
  } : common_vendor.e({
    i: common_vendor.o((...args) => $options.goBack && $options.goBack(...args)),
    j: common_vendor.t($options.i18n.profile.statsTitle),
    k: common_vendor.t($data.year),
    l: common_vendor.t($options.i18n.profile.statsUnitYear),
    m: !$options.canGoPrev ? 1 : "",
    n: common_vendor.o(($event) => $options.changeYear(-1)),
    o: !$options.canGoNext ? 1 : "",
    p: common_vendor.o(($event) => $options.changeYear(1)),
    q: common_vendor.t($data.annual.companyDays),
    r: common_vendor.t($data.annual.workingDays),
    s: common_vendor.t($options.i18n.profile.statsUnitDay),
    t: common_vendor.t($options.i18n.profile.statsOfTotal),
    v: common_vendor.t($data.annual.ratio),
    w: $data.annual.ratio + "%",
    x: common_vendor.t($options.i18n.profile.statsOtTotal),
    y: common_vendor.t($data.annual.overtimeHours),
    z: common_vendor.t($options.i18n.profile.statsUnitHour),
    A: common_vendor.t($data.annual.overtimeDays),
    B: common_vendor.t($options.i18n.profile.statsUnitDay),
    C: common_vendor.t($options.i18n.profile.statsCommuteSaved),
    D: common_vendor.t($options.commuteEstText),
    E: common_vendor.t($data.annual.commuteSavedHours),
    F: common_vendor.t($options.i18n.profile.statsUnitHour),
    G: common_vendor.t($data.annual.commuteSavedDays),
    H: common_vendor.t($options.i18n.profile.statsUnitDay),
    I: common_vendor.o(($event) => $data.showCommuteEditor = true),
    J: common_vendor.t($options.i18n.profile.statsTrendTitle),
    K: common_vendor.t($options.i18n.profile.statsTrendSub),
    L: common_vendor.f($data.annual.monthly, (m, k0, i0) => {
      return common_vendor.e({
        a: $data.selectedMonth === m.month && m.companyDays > 0
      }, $data.selectedMonth === m.month && m.companyDays > 0 ? {
        b: common_vendor.t(m.companyDays),
        c: common_vendor.t($options.i18n.profile.statsUnitDay),
        d: $options.barHeight(m.companyDays) + 6 + "px"
      } : {}, {
        e: $options.isCurrentMonth(m.month) ? 1 : "",
        f: $data.selectedMonth === m.month && !$options.isCurrentMonth(m.month) ? 1 : "",
        g: $options.barHeight(m.companyDays) + "px",
        h: m.month,
        i: common_vendor.o(($event) => $options.onBarTap(m), m.month)
      });
    }),
    M: common_vendor.f($data.annual.monthly, (m, k0, i0) => {
      return {
        a: common_vendor.t(m.month),
        b: m.month,
        c: $data.selectedMonth === m.month ? 1 : ""
      };
    }),
    N: common_vendor.t($options.i18n.profile.statsLegendMonth),
    O: common_vendor.t($options.i18n.profile.statsLegendCurrent),
    P: common_vendor.t($options.i18n.profile.statsLeaveTitle),
    Q: common_vendor.t($options.i18n.profile.vacationDays),
    R: $options.leavePct($data.annual.vacationDaysUsed, $data.annual.vacationDaysTotal) + "%",
    S: common_vendor.t($data.annual.vacationDaysUsed),
    T: common_vendor.t($data.annual.vacationDaysTotal),
    U: common_vendor.t($options.i18n.profile.sickDays),
    V: $options.leavePct($data.annual.sickDaysUsed, $data.annual.sickDaysTotal) + "%",
    W: common_vendor.t($data.annual.sickDaysUsed),
    X: common_vendor.t($data.annual.sickDaysTotal),
    Y: $data.annual.birthdayEnabled
  }, $data.annual.birthdayEnabled ? {
    Z: common_vendor.t($options.i18n.profile.birthdayLeave),
    aa: common_vendor.t($data.annual.birthdayDaysUsed)
  } : {}), {
    ab: $data.showCommuteEditor
  }, $data.showCommuteEditor ? {
    ac: common_vendor.t($options.i18n.profile.statsCommuteTitle),
    ad: common_vendor.t($options.commuteDisplay),
    ae: $data.draftCommute,
    af: common_vendor.o((...args) => $options.onCommuteChanging && $options.onCommuteChanging(...args)),
    ag: common_vendor.o((...args) => $options.onCommuteChanging && $options.onCommuteChanging(...args)),
    ah: common_vendor.t($options.i18n.profile.statsCommuteSave),
    ai: common_vendor.o((...args) => $options.saveCommute && $options.saveCommute(...args)),
    aj: common_vendor.o(() => {
    }),
    ak: common_vendor.o(($event) => $data.showCommuteEditor = false)
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-1fa681a1"]]);
wx.createPage(MiniProgramPage);
