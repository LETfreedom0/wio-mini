"use strict";
const common_vendor = require("../../common/vendor.js");
const CustomHeader = () => "../../components/CustomHeader.js";
const ProfileView = () => "../../components/ProfileView.js";
const CustomTabBar = () => "../../components/CustomTabBar.js";
const _sfc_main = {
  components: {
    CustomHeader,
    ProfileView,
    CustomTabBar
  }
};
if (!Array) {
  const _component_CustomHeader = common_vendor.resolveComponent("CustomHeader");
  const _component_ProfileView = common_vendor.resolveComponent("ProfileView");
  const _component_CustomTabBar = common_vendor.resolveComponent("CustomTabBar");
  (_component_CustomHeader + _component_ProfileView + _component_CustomTabBar)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.p({
      current: "profile"
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-201c0da5"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/profile/index.js.map
