"use strict";
const common_vendor = require("../common/vendor.js");
const utils_wioService = require("../utils/wioService.js");
const utils_locales = require("../utils/locales.js");
const utils_auth = require("../utils/auth.js");
const utils_syncService = require("../utils/syncService.js");
const holidayNameMap = {
  "元旦": "New Year's",
  "春节": "Spring Fest",
  "清明节": "Qingming",
  "劳动节": "Labor Day",
  "端午节": "Dragon Boat",
  "中秋节": "Mid-Autumn",
  "国庆节": "National Day"
};
const _sfc_main = {
  name: "ProfileView",
  data() {
    return {
      settings: {
        username: "",
        targetPercentage: 40,
        vacationDays: 20,
        sickDays: 12,
        language: "zh-CN",
        birthdayEnabled: false,
        birthdayMonth: ""
      },
      yearStats: {
        vacationDaysUsed: 0,
        sickDaysUsed: 0,
        totalOvertime: 0
      },
      holidayList: [],
      // 完整节日列表
      showRuleSheet: false,
      showBirthdaySheet: false,
      // ===== 自定义假期 =====
      customLeaves: [],
      customPresets: [],
      customColors: [],
      showCustomSheet: false,
      customEditingId: null,
      // null=新增，否则为编辑
      customForm: { name: "", color: "#0E6E62", start: "", end: "" },
      // ===== 账号 / 同步 / 付费 =====
      session: null,
      // { openid, user, subscription }
      showAuthSheet: false,
      showPaywall: false,
      trialStamp: 0,
      // 兑换码核销后 +1，触发 isPro 重算
      payPlan: "year",
      conflictInfo: null,
      // { localTime, cloudTime, cloudData, data_version }
      lastSyncAt: 0,
      authMode: "login",
      // 'login' 首次登录 | 'edit' 完善资料
      authForm: {
        nickname: "",
        avatarTemp: "",
        agreed: false
      },
      lastNx: 0,
      months: [
        { value: "01", label: "1月", labelEn: "Jan" },
        { value: "02", label: "2月", labelEn: "Feb" },
        { value: "03", label: "3月", labelEn: "Mar" },
        { value: "04", label: "4月", labelEn: "Apr" },
        { value: "05", label: "5月", labelEn: "May" },
        { value: "06", label: "6月", labelEn: "Jun" },
        { value: "07", label: "7月", labelEn: "Jul" },
        { value: "08", label: "8月", labelEn: "Aug" },
        { value: "09", label: "9月", labelEn: "Sep" },
        { value: "10", label: "10月", labelEn: "Oct" },
        { value: "11", label: "11月", labelEn: "Nov" },
        { value: "12", label: "12月", labelEn: "Dec" }
      ]
    };
  },
  computed: {
    i18n() {
      return utils_locales.locales[this.settings.language] || utils_locales.locales["zh-CN"];
    },
    monthOptions() {
      const isEn = this.settings.language === "en-US";
      return this.months.map((m) => ({
        value: m.value,
        label: isEn ? m.labelEn : m.label
      }));
    },
    targetTicks() {
      return [0, 20, 40, 60, 80, 100];
    },
    // ===== 账号 / 同步 =====
    isLogin() {
      return !!(this.session && this.session.user && this.session.user.openid);
    },
    isPro() {
      void this.trialStamp;
      const trial = utils_auth.getTrial();
      if (trial && trial.expiresAt && trial.expiresAt > Date.now())
        return true;
      const sub = this.session && this.session.subscription;
      if (!sub)
        return false;
      const exp = sub.expiresAt || sub.expires_at;
      return !!(exp && exp > Date.now());
    },
    accountName() {
      if (!this.isLogin)
        return this.i18n.profile.accountNotLogin;
      const u = this.session.user || {};
      return u.nickname || this.i18n.profile.defaultName;
    },
    // 会员到期日（登录订阅优先，兑换码试用兜底）
    renewDate() {
      const sub = this.session && this.session.subscription;
      let exp = sub && (sub.expiresAt || sub.expires_at);
      if (!exp || exp <= Date.now()) {
        const trial = utils_auth.getTrial();
        exp = trial && trial.expiresAt;
      }
      if (!exp)
        return "—";
      const d = new Date(exp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    },
    accountSub() {
      const lang = this.settings.language;
      if (this.isPro) {
        if (!this.isLogin)
          return utils_locales.t("profile.proMemTrial", lang);
        const sub = this.session && this.session.subscription;
        const plan = sub && sub.plan || "trial";
        return plan === "year" ? utils_locales.t("profile.proMemYear", lang) : plan === "month" ? utils_locales.t("profile.proMemMonth", lang) : utils_locales.t("profile.proMemTrial", lang);
      }
      if (!this.isLogin)
        return this.i18n.profile.accountLoginHint;
      return "";
    },
    // PRO 卡「云端同步」行的说明文案（按登录/订阅状态切换）
    syncRowSub() {
      if (!this.isLogin)
        return this.i18n.profile.syncNeedLogin;
      if (!this.isPro)
        return this.i18n.profile.syncProBenefit;
      return this.i18n.profile.autoSyncSub;
    },
    avatarSrc() {
      if (!this.isLogin)
        return "";
      const u = this.session.user || {};
      return u.avatarFileID || "";
    },
    lastSyncText() {
      if (!this.lastSyncAt)
        return "—";
      const d = new Date(this.lastSyncAt);
      const pad = (n) => String(n).padStart(2, "0");
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    conflictLocalTime() {
      return this.conflictInfo ? this.formatTime(Date.now()) : "";
    },
    conflictCloudTime() {
      return this.conflictInfo ? this.formatTime(this.conflictInfo.syncedTime) : "";
    }
  },
  mounted() {
    this.loadSettings();
    this.holidayList = utils_wioService.wioService.getHolidayInfoList();
    this.session = utils_auth.getAuth();
    this.lastSyncAt = utils_syncService.getLastSyncTime();
    common_vendor.index.$on("wio:sync-conflict", this.onSyncConflict);
    common_vendor.index.$on("wio:data-restored", this.onDataRestored);
  },
  destroyed() {
    common_vendor.index.$off("wio:sync-conflict", this.onSyncConflict);
    common_vendor.index.$off("wio:data-restored", this.onDataRestored);
  },
  onShow() {
    this.loadSettings();
  },
  methods: {
    onScroll(e) {
      const ny = Math.max(-1, Math.min(1, e.detail.scrollTop / 400));
      common_vendor.index.$emit("wio-gaze", { nx: this.lastNx, ny, active: true });
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => {
        common_vendor.index.$emit("wio-gaze", { nx: 0, ny: 0, active: false });
      }, 300);
    },
    onTouchMove(e) {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const w = common_vendor.index.getSystemInfoSync().windowWidth;
        this.lastNx = Math.max(-1, Math.min(1, (t.clientX - w / 2) / (w / 2)));
      }
    },
    onTouchEnd() {
      setTimeout(() => {
        this.lastNx = 0;
      }, 600);
    },
    loadSettings() {
      this.settings = utils_wioService.wioService.getSettings();
      if (!this.settings.compOffRules) {
        this.settings.compOffRules = { "春节": true };
      }
      if (!this.settings.language) {
        this.settings.language = "zh-CN";
      }
      this.customLeaves = utils_wioService.wioService.getCustomLeaves();
      if (!this.customColors || this.customColors.length === 0) {
        this.customColors = utils_wioService.wioService.CUSTOM_LEAVE_COLORS;
      }
      const presetNames = [this.i18n.profile.presetMarriage, this.i18n.profile.presetMaternity, this.i18n.profile.presetPaternity, this.i18n.profile.presetBereavement];
      this.customPresets = utils_wioService.wioService.CUSTOM_LEAVE_PRESETS.map((p, i) => ({ ...p, name: presetNames[i] || p.name }));
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      this.yearStats = utils_wioService.wioService.getYearStats(currentYear);
    },
    // ===== 自定义假期 =====
    _todayStr() {
      const n = /* @__PURE__ */ new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    },
    fmtCustomRange(l) {
      return `${l.start.slice(5).replace("-", "/")} ~ ${l.end.slice(5).replace("-", "/")}`;
    },
    openCustomAdd() {
      const today = this._todayStr();
      this.customEditingId = null;
      this.customForm = { name: "", color: utils_wioService.wioService.CUSTOM_LEAVE_COLORS[0], start: today, end: today };
      this.showCustomSheet = true;
    },
    openCustomEdit(l) {
      this.customEditingId = l.id;
      this.customForm = { name: l.name, color: l.color, start: l.start, end: l.end };
      this.showCustomSheet = true;
    },
    onCustomName(e) {
      this.customForm.name = e.detail.value;
    },
    onCustomStart(e) {
      this.customForm.start = e.detail.value;
      if (this.customForm.end && this.customForm.end < e.detail.value) {
        this.customForm.end = e.detail.value;
      }
    },
    onCustomEnd(e) {
      let v = e.detail.value;
      if (this.customForm.start && v < this.customForm.start) {
        v = this.customForm.start;
        common_vendor.index.showToast({ title: this.i18n.profile.customRangeFixed, icon: "none", duration: 1500 });
      }
      this.customForm.end = v;
    },
    selectCustomColor(c) {
      this.customForm.color = c;
      common_vendor.index.vibrateShort();
    },
    applyCustomPreset(p) {
      this.customForm.name = p.name;
      this.customForm.color = p.color;
      common_vendor.index.vibrateShort();
    },
    saveCustom() {
      if (!this.customForm.name.trim()) {
        common_vendor.index.showToast({ title: this.i18n.profile.customNameRequired, icon: "none", duration: 1500 });
        return;
      }
      const saved = utils_wioService.wioService.saveCustomLeave({
        id: this.customEditingId || void 0,
        name: this.customForm.name,
        color: this.customForm.color,
        start: this.customForm.start,
        end: this.customForm.end
      });
      if (!saved) {
        common_vendor.index.showToast({ title: this.i18n.profile.customNameRequired, icon: "none", duration: 1500 });
        return;
      }
      this.showCustomSheet = false;
      this.customLeaves = utils_wioService.wioService.getCustomLeaves();
      common_vendor.index.showToast({ title: this.i18n.profile.customSaved, icon: "success" });
    },
    removeCustom() {
      common_vendor.index.showModal({
        title: this.i18n.profile.customDelete,
        content: this.i18n.profile.customDeleteConfirm.replace("{n}", this.customForm.name),
        success: (res) => {
          if (res.confirm) {
            utils_wioService.wioService.deleteCustomLeave(this.customEditingId);
            this.showCustomSheet = false;
            this.customLeaves = utils_wioService.wioService.getCustomLeaves();
            common_vendor.index.showToast({ title: this.i18n.profile.customDeleted, icon: "none", duration: 1500 });
          }
        }
      });
    },
    getUsagePercentage(used, total) {
      if (!total || total === 0)
        return 0;
      return Math.min(100, Math.round(used / total * 100));
    },
    // 设计稿格式：剩余 15 天 · 已用 5 天
    remainUsedText(used, total) {
      const remain = Math.max(0, (total || 0) - (used || 0));
      return this.i18n.profile.remainUsed.replace("{r}", remain).replace("{u}", used || 0);
    },
    getCompOffStatus(name) {
      return !!this.settings.compOffRules[name];
    },
    getHolidayName(item) {
      if (this.settings.language === "en-US") {
        return holidayNameMap[item.name] || item.name;
      }
      return item.name;
    },
    toggleCompOff(item) {
      if (!item.hasCompOff) {
        return;
      }
      const name = item.name;
      const current = this.getCompOffStatus(name);
      this.settings.compOffRules[name] = !current;
      common_vendor.index.vibrateShort();
      this.save();
    },
    setLanguage(lang) {
      if (lang !== "zh-CN" && !this.isPro) {
        this.showPaywall = true;
        return;
      }
      this.settings.language = lang;
      common_vendor.index.vibrateShort();
      this.save();
    },
    onStatsTap() {
      common_vendor.index.vibrateShort();
      if (this.isPro) {
        common_vendor.index.navigateTo({ url: "/pages/stats/index" });
      } else {
        this.showPaywall = true;
      }
    },
    toggleLanguage() {
      const newLang = this.settings.language === "zh-CN" ? "en-US" : "zh-CN";
      this.setLanguage(newLang);
    },
    toggleBirthdayEnabled() {
      this.settings.birthdayEnabled = !this.settings.birthdayEnabled;
      if (!this.settings.birthdayEnabled) {
        this.settings.birthdayMonth = "";
      }
      common_vendor.index.vibrateShort();
      this.save();
    },
    selectBirthdayMonth(value) {
      this.settings.birthdayMonth = value;
      common_vendor.index.vibrateShort();
      this.save();
    },
    onSliderChange(e, key) {
      this.settings[key] = e.detail.value;
      this.save();
    },
    onSliderChanging(e, key) {
      this.settings[key] = e.detail.value;
      common_vendor.index.vibrateShort();
    },
    save() {
      utils_wioService.wioService.saveSettings(this.settings);
      common_vendor.index.showToast({
        title: utils_locales.t("profile.saved", this.settings.language),
        icon: "none"
      });
    },
    // ===== 账号卡 =====
    onAccountCardTap() {
      if (!this.isLogin) {
        this.openAuthSheet("login");
        return;
      }
      const lang = this.settings.language;
      common_vendor.index.showActionSheet({
        itemList: [utils_locales.t("profile.accountEditProfile", lang), utils_locales.t("profile.accountLogout", lang)],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.openAuthSheet("edit");
          } else if (res.tapIndex === 1) {
            this.onLogout();
          }
        }
      });
    },
    onLogout() {
      utils_auth.logout();
      this.session = null;
      common_vendor.index.showToast({ title: utils_locales.t("profile.logoutSuccess", this.settings.language), icon: "none" });
    },
    // ===== 授权登录 / 完善资料弹层 =====
    openAuthSheet(mode = "login") {
      const cached = this.session && this.session.user ? this.session.user : {};
      this.authMode = mode;
      this.authForm = {
        nickname: cached.nickname || "",
        // 编辑模式回显现有头像（cloud:// fileID 可直接作为 image src）
        avatarTemp: mode === "edit" ? cached.avatarFileID || "" : "",
        agreed: false
      };
      this.showAuthSheet = true;
    },
    closeAuthSheet() {
      this.showAuthSheet = false;
    },
    onChooseAvatar(e) {
      console.log("[auth] chooseAvatar detail:", e && e.detail);
      if (e && e.detail && e.detail.avatarUrl) {
        this.authForm.avatarTemp = e.detail.avatarUrl;
      }
    },
    onNicknameInput(e) {
      this.authForm.nickname = e.detail.value;
    },
    onNicknameBlur(e) {
      this.authForm.nickname = e.detail.value || this.authForm.nickname;
    },
    async onSubmitLogin() {
      const isLoginMode = this.authMode === "login";
      if (isLoginMode && !this.authForm.agreed) {
        common_vendor.index.showToast({ title: utils_locales.t("profile.needAgree", this.settings.language), icon: "none" });
        return;
      }
      if (!this.authForm.nickname || !this.authForm.nickname.trim()) {
        common_vendor.index.showToast({ title: utils_locales.t("profile.nicknameRequired", this.settings.language), icon: "none" });
        return;
      }
      common_vendor.index.showLoading({ title: "" });
      try {
        let avatarFileId = "";
        if (this.authForm.avatarTemp) {
          try {
            avatarFileId = await utils_auth.uploadAvatar(this.authForm.avatarTemp);
            console.log("[auth] avatar uploaded:", avatarFileId);
          } catch (err) {
            common_vendor.index.hideLoading();
            console.error("[auth] avatar upload failed:", err);
            common_vendor.index.showToast({ title: utils_locales.t("profile.avatarUploadFail", this.settings.language), icon: "none" });
            return;
          }
        }
        this.session = await utils_auth.login({
          nickname: this.authForm.nickname,
          avatarFileID: avatarFileId
        });
        common_vendor.index.hideLoading();
        this.showAuthSheet = false;
        common_vendor.index.showToast({ title: utils_locales.t("profile.loginSuccess", this.settings.language), icon: "success" });
        if (isLoginMode) {
          utils_syncService.pull().catch(() => {
          });
        }
      } catch (err) {
        common_vendor.index.hideLoading();
        console.error("login failed", err);
        common_vendor.index.showToast({ title: utils_locales.t("profile.loginFailed", this.settings.language), icon: "none" });
      }
    },
    // ===== 同步卡 =====
    toggleAutoSync() {
      this.settings.autoSync = !this.settings.autoSync;
      common_vendor.index.vibrateShort();
      this.save();
      utils_syncService.init();
    },
    async onSyncNow() {
      common_vendor.index.showLoading({ title: "" });
      try {
        await utils_syncService.syncNow();
        this.lastSyncAt = utils_syncService.getLastSyncTime();
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: utils_locales.t("profile.syncDone", this.settings.language), icon: "success" });
      } catch (err) {
        common_vendor.index.hideLoading();
        console.error("sync failed", err);
        common_vendor.index.showToast({ title: utils_locales.t("profile.syncFail", this.settings.language), icon: "none" });
      }
    },
    // ===== 冲突处理 =====
    onSyncConflict(info) {
      this.conflictInfo = info || null;
    },
    async onResolveLocal() {
      const info = this.conflictInfo;
      this.conflictInfo = null;
      try {
        await utils_syncService.resolveConflict("local", info);
      } catch (err) {
        console.error("resolve conflict(local) failed", err);
      }
    },
    async onResolveCloud() {
      const info = this.conflictInfo;
      this.conflictInfo = null;
      try {
        await utils_syncService.resolveConflict("cloud", info);
      } catch (err) {
        console.error("resolve conflict(cloud) failed", err);
      }
    },
    onDataRestored() {
      this.loadSettings();
      this.lastSyncAt = utils_syncService.getLastSyncTime();
      this.session = utils_auth.getAuth();
    },
    // ===== 付费墙 =====
    onPayTap() {
      common_vendor.index.showToast({ title: utils_locales.t("profile.payComingSoon", this.settings.language), icon: "none" });
    },
    onRedeemTap() {
      const lang = this.settings.language;
      common_vendor.index.showModal({
        title: utils_locales.t("profile.redeemTitle", lang),
        editable: true,
        placeholderText: utils_locales.t("profile.redeemPlaceholder", lang),
        success: (res) => {
          if (!res.confirm)
            return;
          const ok = utils_auth.redeemCode(res.content);
          if (!ok) {
            common_vendor.index.showToast({ title: utils_locales.t("profile.redeemFail", lang), icon: "none" });
            return;
          }
          this.trialStamp++;
          const trial = utils_auth.getTrial();
          const d = new Date(trial.expiresAt);
          const until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          this.showPaywall = false;
          common_vendor.index.showToast({ title: `${utils_locales.t("profile.redeemOk", lang)} ${until}`, icon: "none", duration: 2500 });
        }
      });
    },
    formatTime(ts) {
      if (!ts)
        return "—";
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $options.avatarSrc
  }, $options.avatarSrc ? {
    b: $options.avatarSrc
  } : {
    c: common_vendor.t($options.isLogin ? "W" : "?")
  }, {
    d: $options.isPro ? 1 : "",
    e: common_vendor.t($options.accountName),
    f: $options.accountSub
  }, $options.accountSub ? {
    g: common_vendor.t($options.accountSub),
    h: $options.isPro ? 1 : ""
  } : {}, {
    i: !$options.isLogin
  }, !$options.isLogin ? {
    j: common_vendor.t($options.i18n.profile.loginAction),
    k: common_vendor.o(($event) => $options.openAuthSheet("login"))
  } : {}, {
    l: common_vendor.o((...args) => $options.onAccountCardTap && $options.onAccountCardTap(...args)),
    m: common_vendor.t($options.i18n.profile.proCardTitle),
    n: common_vendor.t($options.isPro ? $options.i18n.profile.proCardSubOn : $options.i18n.profile.proCardSubOff),
    o: $options.isPro
  }, $options.isPro ? {
    p: common_vendor.t($options.i18n.profile.proCardUnlocked)
  } : {}, {
    q: common_vendor.t($options.i18n.profile.benefitSync),
    r: common_vendor.t($options.syncRowSub),
    s: $options.isLogin && $options.isPro
  }, $options.isLogin && $options.isPro ? {
    t: $data.settings.autoSync ? 1 : "",
    v: common_vendor.o((...args) => $options.toggleAutoSync && $options.toggleAutoSync(...args))
  } : {
    w: common_vendor.t($options.isLogin ? $options.i18n.profile.proLockedShort : $options.i18n.profile.proLoginShort)
  }, {
    x: $options.isLogin && $options.isPro
  }, $options.isLogin && $options.isPro ? {
    y: common_vendor.t($options.i18n.profile.lastSync),
    z: common_vendor.t($options.lastSyncText),
    A: common_vendor.t($options.i18n.profile.syncNow),
    B: common_vendor.o((...args) => $options.onSyncNow && $options.onSyncNow(...args))
  } : {}, {
    C: common_vendor.t($options.i18n.profile.proLangTitle),
    D: common_vendor.t($options.i18n.profile.benefitLangSub),
    E: !$options.isPro
  }, !$options.isPro ? {
    F: common_vendor.t($options.i18n.profile.proLockedShort)
  } : {}, {
    G: $data.settings.language === "zh-CN" ? 1 : "",
    H: common_vendor.o(($event) => $options.setLanguage("zh-CN")),
    I: !$options.isPro
  }, !$options.isPro ? {} : {}, {
    J: $data.settings.language === "en-US" ? 1 : "",
    K: !$options.isPro ? 1 : "",
    L: common_vendor.o(($event) => $options.setLanguage("en-US")),
    M: common_vendor.t($options.i18n.profile.statsEntry),
    N: common_vendor.t($options.i18n.profile.statsEntrySub),
    O: $options.isPro
  }, $options.isPro ? {
    P: common_vendor.t($options.i18n.profile.statsEntryOpen)
  } : {
    Q: common_vendor.t($options.i18n.profile.proLockedShort)
  }, {
    R: common_vendor.o((...args) => $options.onStatsTap && $options.onStatsTap(...args)),
    S: $options.isPro
  }, $options.isPro ? {
    T: common_vendor.t($options.i18n.profile.renewValidUntil),
    U: common_vendor.t($options.renewDate),
    V: common_vendor.t($options.i18n.profile.renewAction),
    W: common_vendor.o(($event) => $data.showPaywall = true)
  } : {}, {
    X: !$options.isPro
  }, !$options.isPro ? {
    Y: common_vendor.t($options.i18n.profile.upgradeProCta),
    Z: common_vendor.o(($event) => $data.showPaywall = true)
  } : {}, {
    aa: !$options.isPro ? 1 : "",
    ab: common_vendor.t($options.i18n.profile.wioTarget),
    ac: common_vendor.t($options.i18n.profile.wioTargetHint),
    ad: common_vendor.t($data.settings.targetPercentage),
    ae: $data.settings.targetPercentage,
    af: common_vendor.o(($event) => $options.onSliderChange($event, "targetPercentage")),
    ag: common_vendor.o(($event) => $options.onSliderChanging($event, "targetPercentage")),
    ah: $options.i18n.profile.wioTarget,
    ai: common_vendor.f($options.targetTicks, (tick, k0, i0) => {
      return {
        a: common_vendor.t(tick),
        b: tick,
        c: $data.settings.targetPercentage === tick ? 1 : ""
      };
    }),
    aj: common_vendor.t($options.i18n.profile.leaveCard),
    ak: common_vendor.t($options.i18n.profile.leaveResetHint),
    al: common_vendor.t($options.i18n.profile.vacationDays),
    am: common_vendor.t($data.settings.vacationDays),
    an: common_vendor.t($options.i18n.profile.quotaUnit),
    ao: common_vendor.t($options.remainUsedText($data.yearStats.vacationDaysUsed, $data.settings.vacationDays)),
    ap: $data.settings.vacationDays,
    aq: common_vendor.o(($event) => $options.onSliderChange($event, "vacationDays")),
    ar: common_vendor.o(($event) => $options.onSliderChanging($event, "vacationDays")),
    as: $options.i18n.profile.vacationDays,
    at: common_vendor.t($options.i18n.profile.sickDays),
    av: common_vendor.t($data.settings.sickDays),
    aw: common_vendor.t($options.i18n.profile.quotaUnit),
    ax: common_vendor.t($options.remainUsedText($data.yearStats.sickDaysUsed, $data.settings.sickDays)),
    ay: $data.settings.sickDays,
    az: common_vendor.o(($event) => $options.onSliderChange($event, "sickDays")),
    aA: common_vendor.o(($event) => $options.onSliderChanging($event, "sickDays")),
    aB: $options.i18n.profile.sickDays,
    aC: common_vendor.t($options.i18n.profile.birthdayLeave),
    aD: common_vendor.o(($event) => $data.showBirthdaySheet = true),
    aE: $data.settings.birthdayEnabled ? 1 : "",
    aF: common_vendor.o((...args) => $options.toggleBirthdayEnabled && $options.toggleBirthdayEnabled(...args)),
    aG: $data.settings.birthdayEnabled
  }, $data.settings.birthdayEnabled ? {
    aH: common_vendor.f($options.monthOptions, (month, k0, i0) => {
      return {
        a: common_vendor.t(month.label),
        b: month.value,
        c: $data.settings.birthdayMonth === month.value ? 1 : "",
        d: common_vendor.o(($event) => $options.selectBirthdayMonth(month.value), month.value)
      };
    }),
    aI: common_vendor.t($options.i18n.profile.birthdayCardHint)
  } : {
    aJ: common_vendor.t($options.i18n.profile.birthdayEnableHint)
  }, {
    aK: common_vendor.t($options.i18n.profile.customLeaveTitle),
    aL: common_vendor.t($options.i18n.profile.customLeaveHint),
    aM: common_vendor.f($data.customLeaves, (l, k0, i0) => {
      return {
        a: l.color,
        b: common_vendor.t(l.name),
        c: common_vendor.t($options.fmtCustomRange(l)),
        d: l.id,
        e: common_vendor.o(($event) => $options.openCustomEdit(l), l.id)
      };
    }),
    aN: $data.customLeaves.length === 0
  }, $data.customLeaves.length === 0 ? {
    aO: common_vendor.t($options.i18n.profile.customLeaveEmpty)
  } : {}, {
    aP: common_vendor.t($options.i18n.profile.customLeaveAdd),
    aQ: common_vendor.o((...args) => $options.openCustomAdd && $options.openCustomAdd(...args)),
    aR: common_vendor.t($options.i18n.profile.customLeaveCounted),
    aS: common_vendor.t($options.i18n.profile.compOffSettings),
    aT: common_vendor.o(($event) => $data.showRuleSheet = true),
    aU: common_vendor.f($data.holidayList, (item, k0, i0) => {
      return {
        a: common_vendor.t($options.getHolidayName(item)),
        b: item.name,
        c: $options.getCompOffStatus(item.name) ? 1 : "",
        d: !item.hasCompOff ? 1 : "",
        e: common_vendor.o(($event) => $options.toggleCompOff(item), item.name)
      };
    }),
    aV: $data.holidayList.length === 0
  }, $data.holidayList.length === 0 ? {
    aW: common_vendor.t($options.i18n.profile.noHoliday)
  } : {}, {
    aX: common_vendor.o((...args) => $options.onScroll && $options.onScroll(...args)),
    aY: common_vendor.o((...args) => $options.onTouchMove && $options.onTouchMove(...args)),
    aZ: common_vendor.o((...args) => $options.onTouchEnd && $options.onTouchEnd(...args)),
    ba: $data.showRuleSheet
  }, $data.showRuleSheet ? {
    bb: common_vendor.t($options.i18n.profile.compOffSheetTitle),
    bc: common_vendor.t($options.i18n.profile.compOffSheetBody),
    bd: common_vendor.t($options.i18n.profile.gotIt),
    be: common_vendor.o(($event) => $data.showRuleSheet = false),
    bf: common_vendor.o(() => {
    }),
    bg: common_vendor.o(($event) => $data.showRuleSheet = false)
  } : {}, {
    bh: $data.showBirthdaySheet
  }, $data.showBirthdaySheet ? {
    bi: common_vendor.t($options.i18n.profile.birthdaySheetTitle),
    bj: common_vendor.t($options.i18n.profile.birthdaySheetBody),
    bk: common_vendor.t($options.i18n.profile.gotIt),
    bl: common_vendor.o(($event) => $data.showBirthdaySheet = false),
    bm: common_vendor.o(() => {
    }),
    bn: common_vendor.o(($event) => $data.showBirthdaySheet = false)
  } : {}, {
    bo: $data.showCustomSheet
  }, $data.showCustomSheet ? common_vendor.e({
    bp: common_vendor.t($data.customEditingId ? $options.i18n.profile.customSheetEdit : $options.i18n.profile.customSheetAdd),
    bq: !$data.customEditingId
  }, !$data.customEditingId ? {
    br: common_vendor.t($options.i18n.profile.customPresetLabel),
    bs: common_vendor.f($data.customPresets, (p, k0, i0) => {
      return {
        a: common_vendor.t(p.name),
        b: p.name,
        c: $data.customForm.name === p.name ? 1 : "",
        d: common_vendor.o(($event) => $options.applyCustomPreset(p), p.name)
      };
    })
  } : {}, {
    bt: common_vendor.t($options.i18n.profile.customFieldName),
    bv: $data.customForm.name,
    bw: $options.i18n.profile.customNamePh,
    bx: common_vendor.o((...args) => $options.onCustomName && $options.onCustomName(...args)),
    by: common_vendor.t($options.i18n.profile.customDateRange),
    bz: common_vendor.t($data.customForm.start),
    bA: $data.customForm.start,
    bB: common_vendor.o((...args) => $options.onCustomStart && $options.onCustomStart(...args)),
    bC: common_vendor.t($data.customForm.end),
    bD: $data.customForm.end,
    bE: common_vendor.o((...args) => $options.onCustomEnd && $options.onCustomEnd(...args)),
    bF: common_vendor.t($options.i18n.profile.customColorLabel),
    bG: common_vendor.f($data.customColors, (c, k0, i0) => {
      return {
        a: c,
        b: $data.customForm.color === c ? 1 : "",
        c,
        d: common_vendor.o(($event) => $options.selectCustomColor(c), c)
      };
    }),
    bH: common_vendor.t($options.i18n.profile.customLeaveCounted),
    bI: common_vendor.t($options.i18n.profile.customSave),
    bJ: common_vendor.o((...args) => $options.saveCustom && $options.saveCustom(...args)),
    bK: $data.customEditingId
  }, $data.customEditingId ? {
    bL: common_vendor.t($options.i18n.profile.customDelete),
    bM: common_vendor.o((...args) => $options.removeCustom && $options.removeCustom(...args))
  } : {}, {
    bN: common_vendor.o(() => {
    }),
    bO: common_vendor.o(($event) => $data.showCustomSheet = false)
  }) : {}, {
    bP: $data.showAuthSheet
  }, $data.showAuthSheet ? common_vendor.e({
    bQ: common_vendor.t($data.authMode === "login" ? $options.i18n.profile.authSheetTitle : $options.i18n.profile.profileEditTitle),
    bR: $data.authForm.avatarTemp
  }, $data.authForm.avatarTemp ? {
    bS: $data.authForm.avatarTemp
  } : {}, {
    bT: common_vendor.o((...args) => $options.onChooseAvatar && $options.onChooseAvatar(...args)),
    bU: common_vendor.t($options.i18n.profile.useAvatar),
    bV: common_vendor.t($options.i18n.profile.nicknameTapHint),
    bW: common_vendor.t($options.i18n.profile.wechatNickname),
    bX: $data.authForm.nickname,
    bY: $options.i18n.profile.nicknamePlaceholder,
    bZ: common_vendor.o((...args) => $options.onNicknameInput && $options.onNicknameInput(...args)),
    ca: common_vendor.o((...args) => $options.onNicknameBlur && $options.onNicknameBlur(...args)),
    cb: $data.authMode === "login"
  }, $data.authMode === "login" ? common_vendor.e({
    cc: $data.authForm.agreed
  }, $data.authForm.agreed ? {} : {}, {
    cd: $data.authForm.agreed ? 1 : "",
    ce: common_vendor.t($options.i18n.profile.privacyAgree),
    cf: common_vendor.t($options.i18n.profile.userAgreement),
    cg: common_vendor.t($options.i18n.profile.andText),
    ch: common_vendor.t($options.i18n.profile.privacyPolicy),
    ci: common_vendor.o(($event) => $data.authForm.agreed = !$data.authForm.agreed)
  }) : {}, {
    cj: common_vendor.t($data.authMode === "login" ? $options.i18n.profile.authBtn : $options.i18n.profile.authSave),
    ck: common_vendor.o((...args) => $options.onSubmitLogin && $options.onSubmitLogin(...args)),
    cl: common_vendor.t($options.i18n.profile.cancel),
    cm: common_vendor.o((...args) => $options.closeAuthSheet && $options.closeAuthSheet(...args)),
    cn: common_vendor.o(() => {
    }),
    co: common_vendor.o((...args) => $options.closeAuthSheet && $options.closeAuthSheet(...args))
  }) : {}, {
    cp: $data.showPaywall
  }, $data.showPaywall ? {
    cq: common_vendor.t($options.i18n.profile.paywallTitle),
    cr: common_vendor.t($options.i18n.profile.paywallSub),
    cs: common_vendor.t($options.i18n.profile.benefitSync),
    ct: common_vendor.t($options.i18n.profile.benefitSyncSub),
    cv: common_vendor.t($options.i18n.profile.benefitBackup),
    cw: common_vendor.t($options.i18n.profile.benefitBackupSub),
    cx: common_vendor.t($options.i18n.profile.benefitStats),
    cy: common_vendor.t($options.i18n.profile.benefitStatsSub),
    cz: common_vendor.t($options.i18n.profile.benefitLang),
    cA: common_vendor.t($options.i18n.profile.benefitLangSub),
    cB: common_vendor.t($options.i18n.profile.benefitMore),
    cC: common_vendor.t($options.i18n.profile.benefitMoreSub),
    cD: common_vendor.t($options.i18n.profile.comingSoon),
    cE: common_vendor.t($options.i18n.profile.planMonth),
    cF: common_vendor.t($options.i18n.profile.planMonthSub),
    cG: $data.payPlan === "month" ? 1 : "",
    cH: common_vendor.o(($event) => $data.payPlan = "month"),
    cI: common_vendor.t($options.i18n.profile.planSave),
    cJ: common_vendor.t($options.i18n.profile.planYear),
    cK: common_vendor.t($options.i18n.profile.planYearSub),
    cL: $data.payPlan === "year" ? 1 : "",
    cM: common_vendor.o(($event) => $data.payPlan = "year"),
    cN: common_vendor.t($data.payPlan === "year" ? $options.i18n.profile.payCta : $options.i18n.profile.payCtaMonth),
    cO: common_vendor.o((...args) => $options.onPayTap && $options.onPayTap(...args)),
    cP: common_vendor.t($options.i18n.profile.payFine),
    cQ: common_vendor.t($options.i18n.profile.redeemEntry),
    cR: common_vendor.o((...args) => $options.onRedeemTap && $options.onRedeemTap(...args)),
    cS: common_vendor.o(() => {
    }),
    cT: common_vendor.o(($event) => $data.showPaywall = false)
  } : {}, {
    cU: $data.conflictInfo
  }, $data.conflictInfo ? {
    cV: common_vendor.t($options.i18n.profile.conflictTitle),
    cW: common_vendor.t($options.i18n.profile.conflictBody),
    cX: common_vendor.t($options.i18n.profile.localData),
    cY: common_vendor.t($options.i18n.profile.updatedAt),
    cZ: common_vendor.t($options.conflictLocalTime),
    da: common_vendor.o((...args) => $options.onResolveLocal && $options.onResolveLocal(...args)),
    db: common_vendor.t($options.i18n.profile.cloudData),
    dc: common_vendor.t($options.i18n.profile.updatedAt),
    dd: common_vendor.t($options.conflictCloudTime),
    de: common_vendor.o((...args) => $options.onResolveCloud && $options.onResolveCloud(...args)),
    df: common_vendor.t($options.i18n.profile.keepLocal),
    dg: common_vendor.o((...args) => $options.onResolveLocal && $options.onResolveLocal(...args)),
    dh: common_vendor.t($options.i18n.profile.keepCloud),
    di: common_vendor.o((...args) => $options.onResolveCloud && $options.onResolveCloud(...args)),
    dj: common_vendor.o(() => {
    }),
    dk: common_vendor.o(() => {
    })
  } : {});
}
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-1f40da7f"]]);
wx.createComponent(Component);
