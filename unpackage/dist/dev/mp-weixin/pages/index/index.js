"use strict";
const common_vendor = require("../../common/vendor.js");
const CustomHeader = () => "../../components/CustomHeader.js";
const HomeView = () => "../../components/HomeView.js";
const CustomTabBar = () => "../../components/CustomTabBar.js";
const _sfc_main = {
  components: {
    CustomHeader,
    HomeView,
    CustomTabBar
  },
  onShow() {
    if (this.$refs.home && this.$refs.home.initData) {
      this.$refs.home.initData();
    }
  }
};
if (!Array) {
  const _component_CustomHeader = common_vendor.resolveComponent("CustomHeader");
  const _component_HomeView = common_vendor.resolveComponent("HomeView");
  const _component_CustomTabBar = common_vendor.resolveComponent("CustomTabBar");
  (_component_CustomHeader + _component_HomeView + _component_CustomTabBar)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.sr("home", "1cf27b2a-1"),
    b: common_vendor.p({
      current: "home"
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-1cf27b2a"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/index/index.js.map
