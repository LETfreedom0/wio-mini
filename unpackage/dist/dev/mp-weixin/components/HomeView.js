"use strict";
const common_vendor = require("../common/vendor.js");
const utils_wioService = require("../utils/wioService.js");
const utils_motivationQuotes = require("../utils/motivationQuotes.js");
const _sfc_main = {
  name: "HomeView",
  data() {
    return {
      location: null,
      // 'home' | 'company' | null
      todayStr: "",
      animateAvatar: false,
      thumbPosition: 6,
      // Initial left position (padding)
      trackWidth: 320,
      thumbWidth: 155,
      padding: 6,
      maxLeft: 0,
      isDragging: false,
      startX: 0,
      currentX: 0,
      isAvatarPressed: false,
      triggerTextAnim: false,
      showConfetti: false,
      showRocket: false,
      confettiPieces: [],
      currentQuote: ""
    };
  },
  computed: {
    statusText() {
      if (this.currentQuote)
        return this.currentQuote;
      if (this.location === "home") {
        return "在家办公，享受专注时光 ☕";
      } else if (this.location === "company") {
        return "元气满满，与团队并肩作战 🚀";
      }
      return "今天在哪儿办公呢？";
    },
    currentDateStr() {
      const now = /* @__PURE__ */ new Date();
      const month = now.getMonth() + 1;
      const date = now.getDate();
      const days = ["日", "一", "二", "三", "四", "五", "六"];
      const day = days[now.getDay()];
      return `${month}月${date}日 星期${day}`;
    },
    currentEmoji() {
      if (this.location === "home")
        return "🏠";
      if (this.location === "company")
        return "🏢";
      return "🤔";
    },
    bgClass() {
      if (this.location === "home")
        return "bg-home";
      if (this.location === "company")
        return "bg-company";
      return "";
    }
  },
  watch: {
    location(newVal) {
      this.triggerAnimation();
      this.updateThumbPosition(newVal);
    }
  },
  mounted() {
    this.maxLeft = this.trackWidth - this.thumbWidth - this.padding;
    this.initData();
  },
  methods: {
    initData() {
      this.todayStr = utils_wioService.wioService.getTodayDateStr();
      const entry = utils_wioService.wioService.getEntryForDate(this.todayStr);
      this.location = entry;
      this.updateThumbPosition(entry);
      if (entry) {
        this.currentQuote = utils_motivationQuotes.getRandomQuote(entry);
      } else {
        this.currentQuote = utils_motivationQuotes.getRandomQuote("default");
      }
    },
    triggerAnimation() {
      this.animateAvatar = true;
      setTimeout(() => {
        this.animateAvatar = false;
      }, 500);
    },
    updateThumbPosition(status) {
      if (status === "home") {
        this.thumbPosition = this.padding;
      } else if (status === "company") {
        this.thumbPosition = this.maxLeft;
      } else {
        this.thumbPosition = (this.trackWidth - this.thumbWidth) / 2;
      }
    },
    setStatus(status) {
      if (this.location !== status) {
        common_vendor.index.vibrateShort();
        this.currentQuote = utils_motivationQuotes.getRandomQuote(status);
        this.triggerTextAnim = true;
        setTimeout(() => {
          this.triggerTextAnim = false;
        }, 400);
        if (status === "home") {
          this.triggerConfetti();
        } else if (status === "company") {
          this.triggerRocket();
        }
      }
      this.location = status;
      utils_wioService.wioService.saveEntry(this.todayStr, status);
    },
    triggerConfetti() {
      const colors = ["#ff0055", "#00ddff", "#00ff99", "#9900ff", "#ffd300", "#ff8800"];
      const pieces = [];
      for (let i = 0; i < 80; i++) {
        const isLeft = i < 40;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const duration = 3 + Math.random() * 2;
        const delay = Math.random() * 0.3;
        const targetX = isLeft ? 10 + Math.random() * 50 : 40 + Math.random() * 50;
        const targetY = 5 + Math.random() * 30;
        const rotation = (Math.random() - 0.5) * 720;
        pieces.push({
          className: isLeft ? "confetti-left-anim" : "confetti-right-anim",
          style: {
            "--bg-color": color,
            "--target-x": `${targetX}%`,
            "--target-y": `${targetY}%`,
            "--rotation": `${rotation}deg`,
            "--duration": `${duration}s`,
            "--delay": `${delay}s`,
            backgroundColor: color,
            left: isLeft ? "0%" : "100%"
            // Start from edges
          }
        });
      }
      this.confettiPieces = pieces;
      this.showConfetti = false;
      this.$nextTick(() => {
        this.showConfetti = true;
        setTimeout(() => {
          this.showConfetti = false;
        }, 6e3);
      });
    },
    triggerRocket() {
      this.showRocket = false;
      this.$nextTick(() => {
        this.showRocket = true;
        setTimeout(() => {
          this.showRocket = false;
        }, 2500);
      });
    },
    onTouchStart(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        this.isDragging = true;
        this.startX = e.changedTouches[0].clientX;
        this.currentX = this.thumbPosition;
      }
    },
    onTouchMove(e) {
      if (!this.isDragging)
        return;
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchX = e.changedTouches[0].clientX;
        const diff = touchX - this.startX;
        let newPos = this.currentX + diff;
        if (newPos < this.padding)
          newPos = this.padding;
        if (newPos > this.maxLeft)
          newPos = this.maxLeft;
        this.thumbPosition = newPos;
      }
    },
    onTouchEnd(e) {
      if (!this.isDragging)
        return;
      this.isDragging = false;
      const centerPoint = this.trackWidth / 2;
      const thumbCenter = this.thumbPosition + this.thumbWidth / 2;
      if (thumbCenter < centerPoint) {
        this.setStatus("home");
      } else {
        this.setStatus("company");
      }
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.location === "home" ? 1 : "",
    b: $data.location === "company" ? 1 : "",
    c: !$data.location ? 1 : "",
    d: $data.showConfetti
  }, $data.showConfetti ? {
    e: common_vendor.f($data.confettiPieces, (item, index, i0) => {
      return {
        a: index,
        b: common_vendor.n(item.className),
        c: common_vendor.s(item.style)
      };
    })
  } : {}, {
    f: $data.showRocket
  }, $data.showRocket ? {
    g: common_vendor.f(4, (n, k0, i0) => {
      return {
        a: n
      };
    })
  } : {}, {
    h: common_vendor.t($options.currentDateStr),
    i: common_vendor.t($options.currentEmoji),
    j: $data.animateAvatar ? 1 : "",
    k: $data.isAvatarPressed ? 1 : "",
    l: common_vendor.o(($event) => $data.isAvatarPressed = true),
    m: common_vendor.o(($event) => $data.isAvatarPressed = false),
    n: common_vendor.t($options.statusText),
    o: $data.triggerTextAnim ? 1 : "",
    p: $data.location === "home" ? 1 : "",
    q: common_vendor.o(($event) => $options.setStatus("home")),
    r: $data.location === "company" ? 1 : "",
    s: common_vendor.o(($event) => $options.setStatus("company")),
    t: common_vendor.t($data.location === "home" ? "🏠" : $data.location === "company" ? "🏢" : "↔"),
    v: !$data.isDragging ? 1 : "",
    w: $data.thumbPosition + "px",
    x: common_vendor.o((...args) => $options.onTouchStart && $options.onTouchStart(...args)),
    y: common_vendor.o((...args) => $options.onTouchMove && $options.onTouchMove(...args)),
    z: common_vendor.o((...args) => $options.onTouchEnd && $options.onTouchEnd(...args))
  });
}
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-f29a63c4"]]);
wx.createComponent(Component);
//# sourceMappingURL=../../.sourcemap/mp-weixin/components/HomeView.js.map
