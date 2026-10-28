"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const common_vendor = require("./common/vendor.js");
const utils_cloud = require("./utils/cloud.js");
const utils_syncService = require("./utils/syncService.js");
if (!Math) {
  "./pages/index/index.js";
  "./pages/calendar/index.js";
  "./pages/profile/index.js";
  "./pages/stats/index.js";
}
const _sfc_main = {
  onLaunch: function() {
    console.log("App Launch");
    common_vendor.index.hideTabBar();
    utils_cloud.initCloud();
    utils_syncService.init().catch(() => {
    });
    if (typeof common_vendor.index.getUpdateManager === "function") {
      const updateManager = common_vendor.index.getUpdateManager();
      updateManager.onCheckForUpdate(function(res) {
        console.log("Has new version:", res.hasUpdate);
      });
      updateManager.onUpdateReady(function(res) {
        common_vendor.index.showModal({
          title: "更新提示",
          content: "新版本已经准备好，是否重启应用？",
          showCancel: false,
          success(res2) {
            if (res2.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });
      updateManager.onUpdateFailed(function(res) {
        common_vendor.index.showModal({
          title: "提示",
          content: "新版本下载失败，请检查网络设置",
          showCancel: false
        });
      });
    }
  },
  onShow: function() {
    console.log("App Show");
    common_vendor.index.hideTabBar();
  },
  onHide: function() {
    console.log("App Hide");
    utils_syncService.flush().catch(() => {
    });
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
