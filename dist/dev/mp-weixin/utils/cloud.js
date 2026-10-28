"use strict";
const common_vendor = require("../common/vendor.js");
const utils_cloudConfig = require("./cloudConfig.js");
let inited = false;
function isCloudAvailable() {
  return typeof common_vendor.wx$1 !== "undefined" && !!common_vendor.wx$1.cloud;
}
function initCloud() {
  try {
    if (typeof common_vendor.wx$1 !== "undefined" && common_vendor.wx$1.cloud && !inited) {
      const env = utils_cloudConfig.CLOUD.CLOUDBASE_ENV && !utils_cloudConfig.CLOUD.CLOUDBASE_ENV.startsWith("YOUR_") ? utils_cloudConfig.CLOUD.CLOUDBASE_ENV : void 0;
      common_vendor.wx$1.cloud.init({ env, traceUser: true });
      inited = true;
    }
  } catch (e) {
    console.error("wx.cloud.init failed", e);
  }
}
function callCloud(name, data = {}) {
  return new Promise((resolve, reject) => {
    if (typeof common_vendor.wx$1 === "undefined" || !common_vendor.wx$1.cloud) {
      reject({ error: "cloud_unavailable" });
      return;
    }
    common_vendor.wx$1.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const r = res.result;
        if (r && r.ok === false) {
          reject(r);
        } else {
          resolve(r);
        }
      },
      fail: (err) => reject({ error: "cloud_call_failed", detail: err })
    });
  });
}
exports.callCloud = callCloud;
exports.initCloud = initCloud;
exports.isCloudAvailable = isCloudAvailable;
