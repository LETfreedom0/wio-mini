"use strict";
const common_vendor = require("../common/vendor.js");
const utils_wioService = require("../utils/wioService.js");
const _sfc_main = {
  name: "ProfileView",
  data() {
    return {
      settings: {
        username: "",
        targetPercentage: 40,
        vacationDays: 20,
        sickDays: 12
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      }
    };
  },
  mounted() {
    this.loadSettings();
  },
  onShow() {
    this.loadSettings();
  },
  methods: {
    loadSettings() {
      this.settings = utils_wioService.wioService.getSettings();
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      this.yearStats = utils_wioService.wioService.getYearStats(currentYear);
    },
    getUsagePercentage(used, total) {
      if (!total || total === 0)
        return 0;
      return Math.min(100, Math.round(used / total * 100));
    },
    onSliderChange(e, key) {
      this.settings[key] = e.detail.value;
      this.save();
    },
    onSliderChanging(e, key) {
      this.settings[key] = e.detail.value;
      common_vendor.index.vibrateShort();
    },
    save() {
      utils_wioService.wioService.saveSettings(this.settings);
      common_vendor.index.showToast({
        title: "已保存",
        icon: "none"
      });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.t($data.settings.targetPercentage),
    b: $data.settings.targetPercentage,
    c: common_vendor.o(($event) => $options.onSliderChange($event, "targetPercentage")),
    d: common_vendor.o(($event) => $options.onSliderChanging($event, "targetPercentage")),
    e: common_vendor.t($data.settings.vacationDays),
    f: common_vendor.t($data.settings.vacationDays - $data.yearStats.vacationDaysUsed),
    g: $data.settings.vacationDays,
    h: common_vendor.o(($event) => $options.onSliderChange($event, "vacationDays")),
    i: common_vendor.o(($event) => $options.onSliderChanging($event, "vacationDays")),
    j: $options.getUsagePercentage($data.yearStats.vacationDaysUsed, $data.settings.vacationDays) + "%",
    k: common_vendor.t($data.yearStats.vacationDaysUsed),
    l: common_vendor.t($data.settings.sickDays),
    m: common_vendor.t($data.settings.sickDays - $data.yearStats.sickDaysUsed),
    n: $data.settings.sickDays,
    o: common_vendor.o(($event) => $options.onSliderChange($event, "sickDays")),
    p: common_vendor.o(($event) => $options.onSliderChanging($event, "sickDays")),
    q: $options.getUsagePercentage($data.yearStats.sickDaysUsed, $data.settings.sickDays) + "%",
    r: common_vendor.t($data.yearStats.sickDaysUsed)
  };
}
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-1f40da7f"]]);
wx.createComponent(Component);
//# sourceMappingURL=../../.sourcemap/mp-weixin/components/ProfileView.js.map
