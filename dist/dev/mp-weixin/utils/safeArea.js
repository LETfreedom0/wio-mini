"use strict";
const common_vendor = require("../common/vendor.js");
let cached = null;
function getWindowInfoSafe() {
  try {
    if (typeof common_vendor.wx$1 !== "undefined" && common_vendor.wx$1.getWindowInfo) {
      return common_vendor.wx$1.getWindowInfo();
    }
  } catch (e) {
  }
  try {
    return common_vendor.index.getSystemInfoSync();
  } catch (e) {
    return {};
  }
}
function getTopSafeArea() {
  if (cached)
    return cached;
  const win = getWindowInfoSafe();
  const statusBarHeight = win.statusBarHeight || 20;
  let navBarHeight = 44;
  try {
    let rect = null;
    if (typeof common_vendor.wx$1 !== "undefined" && common_vendor.wx$1.getMenuButtonBoundingClientRect) {
      rect = common_vendor.wx$1.getMenuButtonBoundingClientRect();
    }
    if (rect && rect.height) {
      const gap = rect.top - statusBarHeight;
      navBarHeight = rect.height + Math.max(gap, 0) * 2;
    }
  } catch (e) {
  }
  const safeAreaBottom = win.safeArea && win.screenHeight ? Math.max(0, win.screenHeight - win.safeArea.bottom) : 0;
  cached = {
    statusBarHeight,
    navBarHeight: Math.round(navBarHeight),
    totalHeight: Math.round(statusBarHeight + navBarHeight),
    safeAreaBottom
  };
  return cached;
}
exports.getTopSafeArea = getTopSafeArea;
