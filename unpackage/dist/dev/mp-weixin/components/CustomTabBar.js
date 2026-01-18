"use strict";
const common_vendor = require("../common/vendor.js");
const _sfc_main = {
  name: "CustomTabBar",
  props: {
    current: {
      type: String,
      default: "home"
    }
  },
  data() {
    const colorDefault = "%23999999";
    const colorActive = "%23007AFF";
    const pathHome = '<path d="M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>';
    const pathHomeFill = '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>';
    const pathCalendar = '<path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/>';
    const pathCalendarFillReal = '<path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>';
    const pathUser = '<path d="M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>';
    const pathUserFill = '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>';
    const svgPrefix = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="';
    return {
      icons: {
        home: `${svgPrefix}${colorDefault}">${pathHome}</svg>`,
        homeActive: `${svgPrefix}${colorActive}">${pathHomeFill}</svg>`,
        calendar: `${svgPrefix}${colorDefault}">${pathCalendar}</svg>`,
        calendarActive: `${svgPrefix}${colorActive}">${pathCalendarFillReal}</svg>`,
        user: `${svgPrefix}${colorDefault}">${pathUser}</svg>`,
        userActive: `${svgPrefix}${colorActive}">${pathUserFill}</svg>`
      }
    };
  },
  methods: {
    switchTab(path) {
      common_vendor.index.switchTab({
        url: path
      });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: $props.current === "home" ? $data.icons.homeActive : $data.icons.home,
    b: $props.current === "home" ? 1 : "",
    c: common_vendor.o(($event) => $options.switchTab("/pages/index/index")),
    d: $props.current === "calendar" ? $data.icons.calendarActive : $data.icons.calendar,
    e: $props.current === "calendar" ? 1 : "",
    f: common_vendor.o(($event) => $options.switchTab("/pages/calendar/index")),
    g: $props.current === "profile" ? $data.icons.userActive : $data.icons.user,
    h: $props.current === "profile" ? 1 : "",
    i: common_vendor.o(($event) => $options.switchTab("/pages/profile/index"))
  };
}
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-6def6a3b"]]);
wx.createComponent(Component);
//# sourceMappingURL=../../.sourcemap/mp-weixin/components/CustomTabBar.js.map
