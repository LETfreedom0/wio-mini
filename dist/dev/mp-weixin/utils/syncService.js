"use strict";
const common_vendor = require("../common/vendor.js");
const utils_cloud = require("./cloud.js");
const utils_auth = require("./auth.js");
const KEY_SYNC_STATE = "wio_sync_state";
const KEY_BACKUP = "wio_backup";
let pushTimer = null;
let pushing = false;
function getSyncState() {
  try {
    return JSON.parse(common_vendor.index.getStorageSync(KEY_SYNC_STATE) || "{}");
  } catch (e) {
    return {};
  }
}
function setSyncState(state) {
  common_vendor.index.setStorageSync(KEY_SYNC_STATE, JSON.stringify(state));
}
function readKey(key) {
  try {
    const raw = common_vendor.index.getStorageSync(key);
    const val = raw ? JSON.parse(raw) : null;
    return val == null ? {} : val;
  } catch (e) {
    return {};
  }
}
function buildSnapshot() {
  return {
    version: 1,
    settings: readKey("wio_settings"),
    entries: readKey("wio_entries"),
    overtime: readKey("wio_overtime"),
    meta: {
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      appVersion: "1.1.0"
    }
  };
}
function markDirty() {
  if (!utils_auth.isLogin())
    return;
  const s = getSyncState();
  s.dirty = true;
  setSyncState(s);
  schedulePush();
}
function schedulePush(delay = 3e3) {
  if (!utils_auth.isLogin())
    return;
  if (pushTimer)
    clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    push().catch(() => {
    });
  }, delay);
}
async function push(force = false) {
  if (!utils_cloud.isCloudAvailable() || !utils_auth.isLogin() || pushing)
    return { ok: false, reason: "skip" };
  const s = getSyncState();
  if (!s.dirty && !force)
    return { ok: true, skipped: true };
  pushing = true;
  try {
    const res = await utils_cloud.callCloud("sync", {
      action: "push",
      data: buildSnapshot(),
      client_updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      base_version: s.dataVersion || 0,
      force
    });
    applyServerState(res);
    return { ok: true };
  } catch (e) {
    if (e && e.conflict) {
      common_vendor.index.$emit("wio:sync-conflict", {
        cloud: e.cloudData,
        cloudVersion: e.data_version,
        syncedTime: e.synced_time
      });
      return { ok: false, conflict: true };
    }
    return { ok: false, reason: e && e.code || "network" };
  } finally {
    pushing = false;
  }
}
async function pull() {
  if (!utils_cloud.isCloudAvailable() || !utils_auth.isLogin())
    return { ok: false, reason: "skip" };
  try {
    const res = await utils_cloud.callCloud("sync", { action: "pull" });
    if (res.subscription) {
      const session = getAuth();
      if (session) {
        session.subscription = res.subscription;
        common_vendor.index.setStorageSync("wio_auth", JSON.stringify(session));
      }
    }
    if (!res.exists) {
      const s2 = getSyncState();
      s2.dirty = true;
      setSyncState(s2);
      return await push();
    }
    const s = getSyncState();
    if (s.dirty) {
      return await push();
    }
    if ((res.data_version || 0) > (s.dataVersion || 0)) {
      await applyCloud(res);
      return { ok: true, action: "restored" };
    }
    return { ok: true, action: "up-to-date" };
  } catch (e) {
    return { ok: false, reason: e && e.code || "network" };
  }
}
async function applyCloud(res) {
  try {
    common_vendor.index.setStorageSync(KEY_BACKUP, JSON.stringify(buildSnapshot()));
  } catch (e) {
  }
  const d = res.data || {};
  if (d.settings)
    common_vendor.index.setStorageSync("wio_settings", JSON.stringify(d.settings));
  if (d.entries)
    common_vendor.index.setStorageSync("wio_entries", JSON.stringify(d.entries));
  if (d.overtime)
    common_vendor.index.setStorageSync("wio_overtime", JSON.stringify(d.overtime));
  applyServerState(res);
  common_vendor.index.$emit("wio:data-restored", {});
}
async function resolveConflict(choice, conflictInfo) {
  if (choice === "local") {
    try {
      const res = await utils_cloud.callCloud("sync", {
        action: "push",
        data: buildSnapshot(),
        client_updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        base_version: conflictInfo && conflictInfo.cloudVersion || getSyncState().dataVersion || 0,
        force: true
      });
      applyServerState(res);
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }
  try {
    await applyCloud({
      data: conflictInfo.cloud,
      data_version: conflictInfo.cloudVersion,
      synced_time: conflictInfo.syncedTime
    });
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}
function init() {
  if (!utils_auth.isLogin())
    return Promise.resolve({ ok: false, reason: "not_login" });
  return pull();
}
function flush() {
  const s = getSyncState();
  if (!utils_auth.isLogin() || !s.dirty)
    return Promise.resolve({ ok: true });
  if (pushTimer)
    clearTimeout(pushTimer);
  return push(true);
}
async function syncNow() {
  const s = getSyncState();
  if (s.dirty)
    return push(true);
  return pull();
}
function getLastSyncTime() {
  return getSyncState().lastSyncAt || null;
}
function applyServerState(res) {
  const s = getSyncState();
  s.dataVersion = res.data_version;
  s.dirty = false;
  s.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
  setSyncState(s);
}
exports.flush = flush;
exports.getLastSyncTime = getLastSyncTime;
exports.init = init;
exports.markDirty = markDirty;
exports.pull = pull;
exports.resolveConflict = resolveConflict;
exports.syncNow = syncNow;
