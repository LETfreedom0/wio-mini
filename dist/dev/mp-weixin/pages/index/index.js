"use strict";
const utils_safeArea = require("../../utils/safeArea.js");
const common_vendor = require("../../common/vendor.js");
const HomeView = () => "../../components/HomeView.js";
const CustomTabBar = () => "../../components/CustomTabBar.js";
const _sfc_main = {
  components: {
    HomeView,
    CustomTabBar
  },
  data() {
    return {
      topSafeHeight: 0
    };
  },
  onLoad() {
    this.topSafeHeight = utils_safeArea.getTopSafeArea().totalHeight;
  },
  onShow() {
    if (this.$refs.home && this.$refs.home.initData) {
      this.$refs.home.initData();
    }
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
  const _component_HomeView = common_vendor.resolveComponent("HomeView");
  const _component_CustomTabBar = common_vendor.resolveComponent("CustomTabBar");
  (_component_HomeView + _component_CustomTabBar)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: $data.topSafeHeight + "px",
    b: common_vendor.sr("home", "1cf27b2a-0"),
    c: common_vendor.p({
      current: "home"
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-1cf27b2a"]]);
_sfc_main.__runtimeHooks = 6;
wx.createPage(MiniProgramPage);
