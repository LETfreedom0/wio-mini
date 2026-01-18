"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const common_vendor = require("./common/vendor.js");
if (!Math) {
  "./pages/index/index.js";
  "./pages/calendar/index.js";
  "./pages/profile/index.js";
}
const _sfc_main = {
  onLaunch: function() {
    common_vendor.index.__f__("log", "at App.vue:4", "App Launch");
    common_vendor.index.hideTabBar();
  },
  onShow: function() {
    common_vendor.index.__f__("log", "at App.vue:8", "App Show");
    common_vendor.index.hideTabBar();
  },
  onHide: function() {
    common_vendor.index.__f__("log", "at App.vue:12", "App Hide");
  }
};
function createApp() {
  const app = common_vendor.createSSRApp(_sfc_main);
  return {
    app
  };
}
createApp().app.mount("#app");
exports.createApp = createApp;
//# sourceMappingURL=../.sourcemap/mp-weixin/app.js.map
