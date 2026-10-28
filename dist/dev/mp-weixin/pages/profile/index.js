"use strict";
const utils_wioService = require("../../utils/wioService.js");
const utils_safeArea = require("../../utils/safeArea.js");
const common_vendor = require("../../common/vendor.js");
const ProfileView = () => "../../components/ProfileView.js";
const CustomTabBar = () => "../../components/CustomTabBar.js";
const _sfc_main = {
  components: {
    ProfileView,
    CustomTabBar
  },
  data() {
    return {
      language: "zh-CN",
      topSafeHeight: 0
    };
  },
  onLoad() {
    this.topSafeHeight = utils_safeArea.getTopSafeArea().totalHeight;
  },
  onShow() {
    this.language = utils_wioService.wioService.getSettings().language || "zh-CN";
  },
  onShareAppMessage(res) {
    return {
      title: "WIO 达标了吗 - 实时追踪回公司办公达标率",
      path: "/pages/index/index"
    };
  },
  onShareTimeline(res) {
    return {
      title: "WIO 达标了吗 - 实时追踪回公司办公达标率"
    };
  }
};
if (!Array) {
  const _component_ProfileView = common_vendor.resolveComponent("ProfileView");
  const _component_CustomTabBar = common_vendor.resolveComponent("CustomTabBar");
  (_component_ProfileView + _component_CustomTabBar)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: $data.topSafeHeight + "px",
    b: common_vendor.p({
      current: "profile"
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-201c0da5"]]);
_sfc_main.__runtimeHooks = 6;
wx.createPage(MiniProgramPage);
