"use strict";
const common_vendor = require("../common/vendor.js");
const utils_cloud = require("./cloud.js");
const KEY_AUTH = "wio_auth";
async function login(profile = {}) {
  if (!utils_cloud.isCloudAvailable()) {
    throw { error: "cloud_unavailable", message: "云开发仅支持微信小程序端" };
  }
  const res = await utils_cloud.callCloud("login", profile);
  common_vendor.index.setStorageSync(KEY_AUTH, JSON.stringify(res));
  return res;
}
function getAuth() {
  try {
    const raw = common_vendor.index.getStorageSync(KEY_AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function isLogin() {
  const session = getAuth();
  return !!(session && session.user && session.user.openid);
}
function logout() {
  common_vendor.index.removeStorageSync(KEY_AUTH);
  common_vendor.index.removeStorageSync("wio_sync_state");
  common_vendor.index.removeStorageSync(KEY_TRIAL);
}
const KEY_TRIAL = "wio_pro_trial";
const REDEEM_CODES = {
  "WIO-PRO-7": 7,
  "WIO-PRO-30": 30,
  "WIO-PRO-365": 365
};
function getTrial() {
  try {
    const raw = common_vendor.index.getStorageSync(KEY_TRIAL);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function isTrialActive() {
  const t = getTrial();
  return !!(t && t.expiresAt && t.expiresAt > Date.now());
}
function redeemCode(code) {
  const days = REDEEM_CODES[String(code || "").trim().toUpperCase()];
  if (!days)
    return false;
  const prev = getTrial();
  const base = prev && prev.expiresAt > Date.now() ? prev.expiresAt : Date.now();
  const trial = {
    plan: "trial",
    source: "redeem",
    redeemedAt: Date.now(),
    expiresAt: base + days * 24 * 60 * 60 * 1e3
  };
  common_vendor.index.setStorageSync(KEY_TRIAL, JSON.stringify(trial));
  return true;
}
function uploadAvatar(tempFilePath) {
  if (!utils_cloud.isCloudAvailable()) {
    return Promise.reject({ error: "cloud_unavailable" });
  }
  const ext = (tempFilePath.split(".").pop() || "png").toLowerCase();
  const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1e4)}.${ext}`;
  return new Promise((resolve, reject) => {
    common_vendor.wx$1.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: (res) => resolve(res.fileID),
      fail: (err) => reject({ error: "upload_failed", detail: err })
    });
  });
}
exports.getAuth = getAuth;
exports.getTrial = getTrial;
exports.isLogin = isLogin;
exports.isTrialActive = isTrialActive;
exports.login = login;
exports.logout = logout;
exports.redeemCode = redeemCode;
exports.uploadAvatar = uploadAvatar;
