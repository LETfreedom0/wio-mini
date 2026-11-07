import { holidays2026 } from './holidays.js';
import { holidays2027 } from './holidays2027.js';
import { markDirty } from './syncService.js';
import { isProUser } from './pro.js';

const KEY_SETTINGS = 'wio_settings';
const KEY_ENTRIES = 'wio_entries';
const KEY_OVERTIME = 'wio_overtime';

const DEFAULT_SETTINGS = {
  username: 'ertong',
  targetPercentage: 40,
  vacationDays: 20,
  sickDays: 12,
  language: 'zh-CN',
  birthdayEnabled: false,
  birthdayMonth: '',
  // 已废弃：早期版本用它做「打开 App 自动同步」。现在同步是纯手动动作，
  // 字段只为兼容老数据保留，任何地方都不再读它。
  autoSync: true,
  // 半天出勤计法：'half' = 按半天（0.5 天，默认）；'full' = 视同一整天
  // 逐日选择存在 settings.halfFullDays（日期 → true），这里只留全局默认值兼容
  halfDayAttendance: 'half',
  // 哪些日子的半天出勤按一整天算（逐日选择，标记时当场确认）
  halfFullDays: {},
  // 每天往返通勤分钟数（用于年度统计「节约通勤」换算）
  commuteMinutes: 90,
  // 调休配置规则 (Key: 节日名称, Value: boolean 是否调休)
  // 默认只有春节调休
  compOffRules: {
      '春节': true
  }
};

// ============================================================
// 半天记录模型
//
// entries[dateStr] 允许两种形态：
//   字符串 'company'    —— 整天标记（老数据与普通标记都用这个）
//   对象 { am, pm }     —— 上下午不同（PRO 的半天标记）
//
// 规整约定：am === pm 时一律存成字符串。好处是
//   ① 体积最小；② 老版本客户端（1.4.0）读到字符串照常显示，不会白屏。
//
// 折算口径（用户拍板）：
//   半天出勤 → 该日的 halfFullDays 标记决定 0.5 天还是 1 天（标记时当场确认）
//   半天居家 / 半天假期 → 恒定 0.5 天（不受开关影响，保证开关只影响达标率）
// ============================================================

const HALF = 0.5;
/** 计入分母扣减的假期状态 */
const DAY_LEAVE_KEYS = ['vacation', 'birthday', 'sick', 'unpaid', 'comp_off', 'exclude_wio'];

// 按天型自定义假在 entries 里的写法：'custom:<leaveId>'
// 这样它就能像年假/病假一样参与上下午两段（上午公司 + 下午育儿假），
// 不必再单独维护一套 customMarks —— 老数据仍然读得到，只是不再写入。
const CUSTOM_PREFIX = 'custom:';

export function isCustomEntry(v) {
  return typeof v === 'string' && v.indexOf(CUSTOM_PREFIX) === 0;
}

export function customIdOf(v) {
  return isCustomEntry(v) ? v.slice(CUSTOM_PREFIX.length) : null;
}

/** 存储原始值 → { am, pm }；老字符串自动补成两段相同 */
export function parseDayParts(raw) {
  if (!raw) return { am: null, pm: null };
  if (typeof raw === 'string') return { am: raw, pm: raw };
  if (typeof raw === 'object') {
    return { am: raw.am || null, pm: raw.pm || null };
  }
  return { am: null, pm: null };
}

/** { am, pm } → 存储值；两段相同规整为字符串，都为空返回 null（等于清除） */
export function packDayParts(am, pm) {
  const a = am || null;
  const p = pm || null;
  if (!a && !p) return null;
  if (a === p) return a;
  return { am: a, pm: p };
}

/** 是否属于「上下午不同」的半天标记 */
export function isSplitDay(raw) {
  const p = parseDayParts(raw);
  return !!p.am && !!p.pm && p.am !== p.pm;
}

/**
 * 单日分段折算：把 { am, pm } 变成各项统计的天数贡献
 *
 * @param {string|object} raw 存储原始值
 * @param {object} opts
 *   halfDayAsFull  true = 半天出勤视同一整天（PRO 开关打开）
 *   isWorkingDay   该日是否计入分母；false 时假期不扣分母（沿用 weekendLeaves 口径）
 * @returns {object} company / home / leave{状态:天数} / leaveTotal /
 *                   deductible（从分母扣减的天数）/ weekendLeave / hasEntry / companyParts
 */
export function evaluateDayParts(raw, opts) {
  const parts = parseDayParts(raw);
  const halfAsFull = !!(opts && opts.halfDayAsFull);
  const isWorkingDay = !opts || opts.isWorkingDay !== false;

  const out = {
    company: 0, home: 0,
    leave: {}, leaveTotal: 0,
    deductible: 0, weekendLeave: 0,
    hasEntry: false, companyParts: 0, homeParts: 0,
    // 按天假各自用了多少天（额度校验按 id 分开算，半天 0.5）
    customUsed: {}
  };

  ['am', 'pm'].forEach(k => {
    const s = parts[k];
    if (!s) return;
    out.hasEntry = true;
    if (s === 'company') { out.companyParts++; return; }
    if (s === 'home') { out.homeParts++; out.home += HALF; return; }
    if (isCustomEntry(s)) {
      const id = customIdOf(s);
      out.leave.custom = (out.leave.custom || 0) + HALF;
      out.leaveTotal += HALF;
      out.customUsed[id] = (out.customUsed[id] || 0) + HALF;
      return;
    }
    if (DAY_LEAVE_KEYS.indexOf(s) !== -1) {
      out.leave[s] = (out.leave[s] || 0) + HALF;
      out.leaveTotal += HALF;
    }
  });

  // 出勤折算：整天出勤 = 1；半天出勤看开关
  if (out.companyParts >= 2) out.company = 1;
  else if (out.companyParts === 1) out.company = halfAsFull ? 1 : HALF;

  // 分母扣减的三种豁免：
  //   a) 非工作日标记的假期 —— 本来就不在分母里（weekendLeaves 口径）
  //   b) 开关打开 + 半天出勤 —— 这天已算完整出勤日，不能同时再扣掉半天，否则率会超过 100%
  if (!isWorkingDay) {
    out.weekendLeave = out.leaveTotal;
    out.deductible = 0;
  } else if (halfAsFull && out.companyParts === 1) {
    out.deductible = 0;
  } else {
    out.deductible = out.leaveTotal;
  }
  return out;
}

/** 保留 1 位小数：0.5 的累加是精确的，这里只防未来引入 1/3 类权重时出现 0.30000000000000004 */
export function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * 日期条的槽位（连续休假表单用）
 *
 * ≤7 天逐日铺开；更长则折叠成「前 5 天 + 空档 + 末日」。
 * 不折叠的话，10 天婚假、158 天产假都会被画成 7 格，让人误以为假期只有 7 天。
 *
 * @returns {Array<{key,weekday,day,weekend,gap}>} gap=true 的那格是省略号占位
 */
export function buildWeekStrip(start, end, maxSlots = 7) {
  const valid = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!valid(start) || !valid(end) || end < start) return [];
  const base = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  const total = Math.round((last.getTime() - base.getTime()) / 86400000) + 1;
  const mk = (d, gap) => {
    if (gap) return { key: 'gap', weekday: '', day: '', weekend: false, gap: true };
    const wd = d.getDay();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      key: `${y}-${m}-${dd}`,
      weekday: '日一二三四五六'[wd],
      day: d.getDate(),
      weekend: wd === 0 || wd === 6,
      gap: false
    };
  };
  const out = [];
  if (total <= maxSlots) {
    for (let i = 0; i < total; i++) out.push(mk(new Date(base.getTime() + i * 86400000), false));
    return out;
  }
  for (let i = 0; i < maxSlots - 2; i++) out.push(mk(new Date(base.getTime() + i * 86400000), false));
  out.push(mk(null, true));
  out.push(mk(last, false));
  return out;
}

/**
 * 由月度统计推导展示口径（首页率卡 / 分享卡共用，避免两套公式各算各的）
 *
 * 回公司率 = 公司天数 ÷ (全月工作日 − 有效休假)
 *   - 有效休假要扣掉落在非工作日的休假标记（weekendLeaves），否则分母会被多减
 *   剩余天 = 全月工作日 − 公司 − 居家 − 休假（= 还没过的日子 + 漏打卡的日子）
 *
 * @param {object} stats getMonthStats() 的返回值
 * @param {number} targetPercentage 当月目标比例
 */
export function computeMonthlyReport(stats, targetPercentage) {
  const s = stats || {}
  const leave = (s.vacationDays || 0) + (s.birthdayDays || 0) + (s.sickDays || 0)
              + (s.unpaidDays || 0) + (s.compOffDays || 0) + (s.excludeWioDays || 0)
              + (s.customLeaveDays || 0)
  const workingDays = s.workingDays || 0
  const company = s.companyDays || 0
  const home = s.homeDays || 0
  const target = targetPercentage || 0

  // 分母扣减优先用逐日算好的 deductibleLeave（半天口径下才是准确的）；
  // 老调用方 / 构造数据里没有这个字段时，退回原来的「假期 − 非工作日假期」
  const deductible = s.deductibleLeave != null
    ? s.deductibleLeave
    : Math.max(0, leave - (s.weekendLeaves || 0))
  const denominator = Math.max(0, workingDays - deductible)
  const rate = denominator > 0 ? Math.round((company / denominator) * 100) : 0
  const achieved = rate >= target
  const needCompany = Math.ceil((target / 100) * denominator)
  // 半天口径下 company 会是小数，差额要向上取整：
  // 「还差 3.5 天」没有意义，人只会按整天安排什么时候去公司
  const gapDays = achieved ? 0 : Math.max(0, Math.ceil(needCompany - company))
  const rest = Math.max(0, workingDays - company - home - leave)

  const otHours = s.totalOvertime || 0
  // 「≈ 多上 N 天班」：按 8 小时一个工作日折算，保留到 0.5 天
  const otDays = Math.round((otHours / 8) * 2) / 2

  const leaveTypes = [
    { key: 'vacation', days: s.vacationDays || 0 },
    { key: 'sick', days: s.sickDays || 0 },
    { key: 'comp_off', days: s.compOffDays || 0 },
    { key: 'birthday', days: s.birthdayDays || 0 },
    { key: 'unpaid', days: s.unpaidDays || 0 },
    { key: 'exclude_wio', days: s.excludeWioDays || 0 },
    { key: 'custom', days: s.customLeaveDays || 0 }
  ].filter(item => item.days > 0)

  return {
    rate, target, achieved,
    over: achieved ? rate - target : 0,
    gapDays,
    denominator, workingDays, company, home,
    leave, rest, leaveTypes,
    otHours, otDays
  }
}

export default {
  // --- Settings ---
  getSettings() {
    try {
      const value = uni.getStorageSync(KEY_SETTINGS);
      if (value) {
        const s = { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
        // 自愈：历史脏数据可能把比例写成 0/非法值，读取时归一
        s.targetPercentage = this._sanitizeRatio(s.targetPercentage, 40);
        // 多语言是 PRO 权益：权益失效（退出登录 / 到期）时读口降级回中文。
        // 只降级读取值、不改存储，重新开通后自动恢复原语言偏好。
        if (s.language && s.language !== 'zh-CN' && !isProUser()) {
          s.language = 'zh-CN';
        }
        // 半天出勤计法已改为「标记当时逐日确认」（settings.halfFullDays），
        // 不再作为 PRO 权益：这里只保留老字段的归一，避免脏值读出来
        if (s.halfDayAttendance !== 'full') s.halfDayAttendance = 'half';
        return s;
      }
    } catch (e) {
      console.error('Error getting settings', e);
    }
    return DEFAULT_SETTINGS;
  },

  // 存储里未经降级的语言原文（用于避免把语言偏好写坏）
  _rawStoredLanguage() {
    try {
      const raw = uni.getStorageSync(KEY_SETTINGS);
      if (!raw) return '';
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (parsed && parsed.language) || '';
    } catch (e) {
      return '';
    }
  },

  // 存储里的原始 halfDayAttendance（不经权益降级），供 saveSettings 回写保护用
  _rawStoredHalfDay() {
    try {
      const raw = uni.getStorageSync(KEY_SETTINGS);
      if (!raw) return '';
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (parsed && parsed.halfDayAttendance) || '';
    } catch (e) {
      return '';
    }
  },

  // 合法比例：1~100 的数字，否则回退 fallback（fallback 可为 null 表示「无有效值」）
  _sanitizeRatio(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : fallback;
  },

  // ---- 操作时间（最近记录的排序依据） ----
  // 记录「某一天最后一次被操作」的时间戳，与那一天本身是几号无关：
  // 今天补标去年 3 月的一天，它也该排在最前面。
  getTouchedAt() {
    const s = this.getSettings();
    const raw = s.touchedAt && typeof s.touchedAt === 'object' ? s.touchedAt : {};
    const out = {};
    Object.keys(raw).forEach(d => {
      const t = Number(raw[d]);
      if (this._isValidDateStr(d) && Number.isFinite(t) && t > 0) out[d] = t;
    });
    return out;
  },

  // 打一个操作时间戳，只保留最近的 300 天：settings 会跟着云同步走，不能无限长
  _withTouch(base, dateStr, ts) {
    if (!this._isValidDateStr(dateStr)) return base;
    const src = base && typeof base === 'object' ? base : {};
    const next = { ...src, [dateStr]: Number(ts) || Date.now() };
    const keys = Object.keys(next);
    if (keys.length > 300) {
      keys
        .sort((a, b) => (Number(next[a]) || 0) - (Number(next[b]) || 0))
        .slice(0, keys.length - 300)
        .forEach(k => { delete next[k]; });
    }
    return next;
  },

  saveSettings(settings) {
    try {
      // WIO 目标比例按月快照（口径：上线时以当月为准建立快照；以后按月保存；
      // 未修改的月份沿用最近一次的比例；历史月份永不被追改）
      const existing = this.getSettings();
      // 快照历史一律以「已存储」为准，避免调用方传入不完整 settings 时丢失
      let history =
        existing.targetHistory && typeof existing.targetHistory.changes === 'object'
          ? {
              baseline: existing.targetHistory.baseline,
              changes: { ...existing.targetHistory.changes }
            }
          : null;

      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const newVal = this._sanitizeRatio(settings.targetPercentage, null);
      if (newVal !== null) {
        const oldEffective = history
          ? this.getTargetForMonth(now.getFullYear(), now.getMonth() + 1)
          : this._sanitizeRatio(existing.targetPercentage, 40);
        // 只有与「当月应生效比例」不同才记快照；首次改动建立 baseline（当月为准）
        if (newVal !== oldEffective) {
          if (!history) {
            history = { baseline: this._sanitizeRatio(existing.targetPercentage, 40), changes: {} };
          }
          history.changes[ym] = newVal;
        }
        settings = { ...settings, targetPercentage: newVal };
      }
      if (history) {
        settings = { ...settings, targetHistory: history };
      }
      // 无权益时 getSettings 会把语言降级成中文；若调用方只是改了别的设置
      // （拖动目标比例等），这里按存储原文保留语言偏好，避免被降级值覆盖。
      if (!isProUser()) {
        const rawLang = this._rawStoredLanguage();
        if (rawLang && rawLang !== 'zh-CN' && (!settings.language || settings.language === 'zh-CN')) {
          settings = { ...settings, language: rawLang };
        }
        // 半天出勤计法同理：无权益时 getSettings 把 'full' 降级读成 'half'，
        // 如果调用方（只改了目标比例等）把降级值写回，会员的原始选择就被抹掉了
        if (this._rawStoredHalfDay() === 'full' && settings.halfDayAttendance !== 'full') {
          settings = { ...settings, halfDayAttendance: 'full' };
        }
      }
      uni.setStorageSync(KEY_SETTINGS, JSON.stringify(settings));
      // 生日假配置（开关 / 月份）一旦变动，历史标记的生日假全部作废：
      // 生日假是与「生日月份」绑定的福利，改了月份或关掉后旧标记既无意义，
      // 还会继续扣减 WIO 分母、占用额度，必须清掉让用户在新月份重新标记。
      this._clearBirthdayEntriesIfChanged(existing, settings);
      markDirty();
      // 语言是全局偏好：从任一入口（我的 / 会员页）切换后广播，
      // 让已挂载的视图立即刷新文案——组件的 onShow 不保证被触发，不能各自等重读
      const prevLanguage = (existing && existing.language) || 'zh-CN';
      // 广播的必须是「实际生效」的语言：无权益时恒为中文
      const nextLanguage = isProUser() ? (settings.language || 'zh-CN') : 'zh-CN';
      if (nextLanguage !== prevLanguage) {
        uni.$emit('wio:language-changed', nextLanguage);
      }
    } catch (e) {
      console.error('Error saving settings', e);
    }
  },

  // 生日假配置变动 → 清空所有已标记的生日假（见 saveSettings 调用处说明）
  _clearBirthdayEntriesIfChanged(prev, next) {
    if (!prev || !next) return;
    const enabledChanged = !!next.birthdayEnabled !== !!prev.birthdayEnabled;
    const monthChanged = String(next.birthdayMonth || '') !== String(prev.birthdayMonth || '');
    if (!enabledChanged && !monthChanged) return;
    try {
      const entries = this.getEntries();
      let removed = 0;
      Object.keys(entries).forEach(d => {
        if (entries[d] === 'birthday') {
          delete entries[d];
          removed++;
        }
      });
      if (removed > 0) {
        uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      }
    } catch (e) {
      console.error('clear birthday entries failed', e);
    }
  },

  // 取某个「年-月」当时生效的 WIO 目标比例
  // targetHistory 结构：{ baseline: 首次改动前的比例, changes: { 'YYYY-MM': 比例 } }
  // 查找规则：取所有 changes 中月份 <= 目标月的最后一次改动；改动之前用 baseline
  // 非法值（如误存的 0）一律跳过，回退 baseline/当前设置——自愈历史脏数据
  getTargetForMonth(year, month) {
    const settings = this.getSettings();
    const fallback = this._sanitizeRatio(settings.targetPercentage, 40);
    const history = settings.targetHistory;
    if (!history || typeof history.changes !== 'object') return fallback;
    let ratio = history.baseline != null ? this._sanitizeRatio(history.baseline, fallback) : fallback;
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    Object.keys(history.changes)
      .sort()
      .forEach(key => {
        const v = this._sanitizeRatio(history.changes[key], null);
        if (v !== null && key <= ym) ratio = v;
      });
    return ratio;
  },

  // --- 自定义假期 ---
  // 一条记录两种落地方式，用 mode 区分：
  //   range  给起止日期，区间内每个工作日自动上色并计入分母扣减（老形态）
  //   day    只建额度不铺日历，哪天休了在日历上点哪天，标一天扣一天
  // 老数据没有 mode 字段，一律按 range 处理——零迁移，老用户无感知。
  //
  // 按天型的标记单独存 settings.customMarks：{ 'YYYY-MM-DD': { id, part } }
  // part 为 'full' | 'am' | 'pm'，半天扣 0.5 天。
  // 为什么独立存、不塞进 entries：entries 的状态是固定枚举（company/home/vacation…），
  // 塞进去会污染出勤类型判断；两者并存时 entries 优先（手动打卡优先于假期标记）。
  //
  // 口径：range 区间内的工作日、day 模式手动标记的日子，都计入 WIO 分母扣减（与年假/病假同向）；
  //       周末/节假日不扣；用户手动标记的日期优先于自定义假期。
  // 12 色按色相冷→暖排列。日历里假期色是唯一识别手段（16% 淡底 + 原色字），
  // 所以色板要保证两两可辨：相邻两色刻意在明度/饱和度上拉开（如 #A93B78 与 #C25B6E、
  // #D4A33F 与 #C97A3D）。前 7 色是历史色板，保持不变，避免老数据选中态丢失。
  CUSTOM_LEAVE_COLORS: [
    '#0E6E62', '#2F8F6E', '#3C6FB0', '#41598A',
    '#7A5AA8', '#8C4F86', '#A93B78', '#C25B6E',
    '#C97A3D', '#D4A33F', '#8A8F4A', '#6B7379'
  ],

  // 预设法定期限，按「使用方式」分组——这一步是必须的：
  //   range 组是一次事件一段连续日子（婚假连休 10 天、产假连休 158 天）
  //   day   组是零星发放的额度（每月 1 天关爱假、生日当月 1 天、季度福利）
  // 如果把婚假放进「按天点选」的预设里，用户会以为婚假要一天天去日历上点。
  // defaultRule 表达「这类假期天然是什么额度规则」，选预设时自动带过去：
  // 婚产陪丧一辈子或每次事件一次，谈年度重置没意义；关爱假/生日假按年发放。
  // 各地法定天数差异很大（产假 158 天起、各省不同），所以不预填额度，让用户自己填。
  CUSTOM_LEAVE_PRESETS: {
    // 区间型＝「一次性连续休」的公休假：婚产陪探亲都含周末与法定节假日，
    // 按自然日整段占用（skipOffDays: false），不顺延、不加天数。
    range: [
      { key: 'marriage', color: '#C25B6E', skipOffDays: false },
      { key: 'maternity', color: '#8C4F86', skipOffDays: false },
      { key: 'paternity', color: '#41598A', skipOffDays: false },
      { key: 'family', color: '#C97A3D', skipOffDays: false }
    ],
    // 按天型＝零星请的福利假，逐天点选、按额度扣
    day: [
      { key: 'volunteer', color: '#2F8F6E', quotaRule: 'yearly' },
      { key: 'childcare', color: '#D4A33F', quotaRule: 'yearly' }
    ]
  },

  _isValidDateStr(str) {
    return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + 'T00:00:00').getTime());
  },

  // 单条记录规整：老数据补 mode，脏数据返回 null（丢掉一条，不让整份配置一起坏掉）
  _normalizeCustomLeave(l) {
    if (!l || !l.id || !l.name) return null;
    const mode = l.mode === 'day' ? 'day' : 'range';
    const base = {
      id: l.id,
      name: String(l.name).slice(0, 12),
      color: l.color || '#0E6E62',
      mode
    };
    if (mode === 'day') {
      const q = Number(l.quota);
      return {
        ...base,
        start: this._isValidDateStr(l.start) ? l.start : '',
        end: this._isValidDateStr(l.end) ? l.end : '',
        // quota 为 0 表示不限额度：有些福利假本来就没明确天数
        quota: Number.isFinite(q) && q > 0 ? round1(q) : 0,
        quotaRule: l.quotaRule === 'total' ? 'total' : 'yearly'
      };
    }
    if (!this._isValidDateStr(l.start) || !this._isValidDateStr(l.end) || l.start > l.end) return null;
    // skipOffDays：区间里只算工作日（婚假 10 天、产假这类「不含周末的公休假」）。
    // 老数据没有这个字段，默认 false = 按自然日整段占用，零迁移
    return { ...base, start: l.start, end: l.end, skipOffDays: !!l.skipOffDays };
  },

  /** 某天是否被这段区间假「有效占用」（已考虑 skipOffDays） */
  _rangeHits(l, dateStr) {
    if (!l || l.mode === 'day') return false;
    if (dateStr < l.start || dateStr > l.end) return false;
    if (l.skipOffDays && !this.isOfficialWorkingDay(new Date(dateStr + 'T00:00:00'))) return false;
    return true;
  },

  // 自定义假期是 PRO 权益：权益失效时消费端拿不到任何条目
  // （日历不再上色、不再扣分母，会员页列表变空），但存储里的原始数据保留，
  // 重新开通后原样恢复，不会因为退出登录丢配置。
  getCustomLeaves() {
    if (!isProUser()) return [];
    const s = this.getSettings();
    const list = Array.isArray(s.customLeaves) ? s.customLeaves : [];
    return list.map(l => this._normalizeCustomLeave(l)).filter(Boolean);
  },

  getCustomLeaveById(id) {
    return this.getCustomLeaves().find(l => l.id === id) || null;
  },

  // 新增或编辑（带 id 即编辑）；校验失败或无权返回 null
  saveCustomLeave(leave) {
    try {
      // 写入端同样校验权益：UI 被绕过（返回键/脚本）也写不进去
      if (!isProUser()) return null;
      const settings = this.getSettings();
      const list = Array.isArray(settings.customLeaves) ? settings.customLeaves.filter(Boolean) : [];
      const mode = leave.mode === 'day' ? 'day' : 'range';
      const item = {
        id: leave.id || ('cl_' + Date.now().toString(36)),
        name: String(leave.name || '').trim().slice(0, 12),
        color: leave.color || '#0E6E62',
        mode
      };
      if (!item.name) return null;
      if (mode === 'day') {
        const q = Number(leave.quota);
        item.quota = Number.isFinite(q) && q > 0 ? round1(q) : 0;
        item.quotaRule = leave.quotaRule === 'total' ? 'total' : 'yearly';
        // 按天型不需要日期区间，getCustomLeaveForDate 也不会拿它去铺日历
        if (this._isValidDateStr(leave.start)) item.start = leave.start;
        if (this._isValidDateStr(leave.end)) item.end = leave.end;
      } else {
        item.start = leave.start;
        item.end = leave.end;
        // 只对区间型有意义：开了就跳过周末与法定假日（公休假按工作日算）
        item.skipOffDays = !!leave.skipOffDays;
        if (!this._isValidDateStr(item.start) || !this._isValidDateStr(item.end) || item.start > item.end) {
          return null;
        }
      }
      const idx = list.findIndex(l => l && l.id === item.id);
      if (idx >= 0) {
        list[idx] = item;
      } else {
        list.push(item);
      }
      // 区间假在最近记录里只占开始日一条，所以操作时间也记在开始日
      const touchedAt = mode === 'range'
        ? this._withTouch(settings.touchedAt, item.start)
        : settings.touchedAt;
      this.saveSettings({ ...settings, customLeaves: list, touchedAt });
      return item;
    } catch (e) {
      console.error('saveCustomLeave error', e);
      return null;
    }
  },

  deleteCustomLeave(id) {
    const settings = this.getSettings();
    const list = (Array.isArray(settings.customLeaves) ? settings.customLeaves : []).filter(l => l && l.id !== id);
    // 连带清掉这个假期的所有按天标记，否则会留下指向不存在假期的孤儿记录
    const marks = { ...(settings.customMarks || {}) };
    Object.keys(marks).forEach(d => {
      const m = this._readMark(marks[d]);
      if (!m || m.id === id) delete marks[d];
    });
    // entries 里的 custom:<id> 同样要清：留着的话统计会继续按假期扣分母，
    // 日历却已经找不到这个假，用户会觉得「这天凭空少了一天」
    const entries = this.getEntries();
    let entriesChanged = false;
    const tag = CUSTOM_PREFIX + id;
    Object.keys(entries).forEach(d => {
      const p = parseDayParts(entries[d]);
      if (p.am !== tag && p.pm !== tag) return;
      const next = packDayParts(p.am === tag ? null : p.am, p.pm === tag ? null : p.pm);
      if (next) entries[d] = next;
      else delete entries[d];
      entriesChanged = true;
    });
    if (entriesChanged) {
      uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      markDirty();
    }
    this.saveSettings({ ...settings, customLeaves: list, customMarks: marks });
  },

  // 把指向已删除按天假的段清掉（历史脏数据兜底）：否则「孤儿值」会被当成假期扣分母
  _sanitizeCustomSegments(raw, dayIds) {
    if (!raw) return raw;
    const p = parseDayParts(raw);
    const fix = v => (isCustomEntry(v) && dayIds.indexOf(customIdOf(v)) === -1 ? null : v);
    const am = fix(p.am);
    const pm = fix(p.pm);
    if (am === p.am && pm === p.pm) return raw;
    return packDayParts(am, pm);
  },

  // 区间内已有标记的天数（含出勤/假期/老按天标记）
  // 建连续休假前用它提示「这几天原本的记录会按休假算」，
  // 不去删用户已有数据——取消这段假，原标记原样回来
  countMarkedDays(start, end, opts) {
    if (!this._isValidDateStr(start) || !this._isValidDateStr(end) || start > end) return 0;
    const skipOff = !!(opts && opts.skipOffDays);
    const entries = this.getEntries();
    const marks = this.getCustomMarks();
    let n = 0;
    const last = new Date(end + 'T00:00:00').getTime();
    for (let t = new Date(start + 'T00:00:00').getTime(); t <= last; t += 86400000) {
      const d = new Date(t);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // 跳过模式只关心工作日：周末上的出勤标记不会被这段假覆盖，
      // 拿去弹「有 N 天已被标记」会让用户以为周末记录被改了
      if (skipOff && !this.isOfficialWorkingDay(d)) continue;
      if (entries[dateStr] || marks[dateStr]) n++;
    }
    return n;
  },

  // 区间内实际要扣分母的天数（工作日，排除法定节假日、含调休上班）
  // 与 getMonthStats 用同一套 isOfficialWorkingDay 口径，
  // 否则表单上写「扣 8 天」、统计里扣 6 天（撞上国庆），用户会以为算错了
  countDeductibleDays(start, end) {
    if (!this._isValidDateStr(start) || !this._isValidDateStr(end) || start > end) return 0;
    let n = 0;
    const last = new Date(end + 'T00:00:00').getTime();
    for (let t = new Date(start + 'T00:00:00').getTime(); t <= last; t += 86400000) {
      if (this.isOfficialWorkingDay(new Date(t))) n++;
    }
    return n;
  },

  // 某天命中的区间型自定义假期（日历显示与统计扣减的数据源）
  // 按天型不参与：它们只认 customMarks，绝不能被当作"整段都在休假"
  getCustomLeaveForDate(dateStr) {
    if (!this._isValidDateStr(dateStr)) return null;
    const list = this.getCustomLeaves();
    for (const l of list) {
      if (this._rangeHits(l, dateStr)) return l;
    }
    return null;
  },

  // --- 按天标记（只有 mode:'day' 的假期用） ---
  // 兼容早期可能写入的纯字符串（只存了 id），读的时候补成整天
  _readMark(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return { id: raw, part: 'full' };
    if (typeof raw === 'object' && raw.id) {
      return { id: raw.id, part: raw.part === 'am' || raw.part === 'pm' ? raw.part : 'full' };
    }
    return null;
  },

  getCustomMarks() {
    if (!isProUser()) return {};
    const s = this.getSettings();
    const raw = s.customMarks && typeof s.customMarks === 'object' ? s.customMarks : {};
    const out = {};
    Object.keys(raw).forEach(d => {
      const m = this._readMark(raw[d]);
      if (m && this._isValidDateStr(d)) out[d] = m;
    });
    return out;
  },

  // 某天的按天标记，连假期对象一起返回（日历要取颜色，避免二次查找）
  // 快照参数 marks/leaves 可外部传入，getMonthStats 逐日循环时用它避免反复读存储
  getCustomMarkForDate(dateStr, marks, leaves) {
    if (!this._isValidDateStr(dateStr)) return null;
    const allMarks = marks || this.getCustomMarks();
    const m = allMarks[dateStr];
    if (!m) return null;
    const list = leaves || this.getCustomLeaves();
    const leave = list.find(l => l.id === m.id && l.mode === 'day');
    if (!leave) return null;
    return { ...m, leave };
  },

  // 标记/取消某天：part 传 'full' | 'am' | 'pm'，leaveId 传空等于取消
  setCustomMark(dateStr, leaveId, part) {
    if (!isProUser()) return false;
    if (!this._isValidDateStr(dateStr)) return false;
    // 区间假涵盖的日子不允许再叠按天标记（整天占用优先）
    if (leaveId && this.getCustomLeaveForDate(dateStr)) return false;
    const settings = this.getSettings();
    const marks = { ...(settings.customMarks || {}) };
    if (!leaveId || !part) {
      delete marks[dateStr];
    } else {
      const leave = this.getCustomLeaves().find(l => l.id === leaveId && l.mode === 'day');
      if (!leave) return false;
      marks[dateStr] = { id: leaveId, part: part === 'am' || part === 'pm' ? part : 'full' };
    }
    const touchedAt = leaveId && part
      ? this._withTouch(settings.touchedAt, dateStr)
      : settings.touchedAt;
    this.saveSettings({ ...settings, customMarks: marks, touchedAt });
    return true;
  },

  clearCustomMark(dateStr) {
    return this.setCustomMark(dateStr, null, null);
  },

  // 额度用量：yearly 只统计当年，total 统计全部；半天记 0.5 天
  // 两个数据源：新的 entries（custom:<id>，支持上下午拆开）优先，
  // 老 customMarks 只补 entries 里没有的日期，同一天绝不重复计。
  getCustomLeaveUsage(leaveId) {
    const leave = this.getCustomLeaveById(leaveId);
    if (!leave || leave.mode !== 'day') {
      return { used: 0, quota: 0, remaining: 0, over: 0, unlimited: true };
    }
    const quota = leave.quota || 0;
    const prefix = `${new Date().getFullYear()}-`;
    const inPeriod = d => leave.quotaRule !== 'yearly' || String(d).startsWith(prefix);
    let used = 0;
    const taken = {};

    const entries = this.getEntries();
    Object.keys(entries).forEach(d => {
      const p = parseDayParts(entries[d]);
      const segs = [p.am, p.pm].filter(isCustomEntry);
      if (!segs.length) return;
      taken[d] = true;
      if (!inPeriod(d)) return;
      // 非工作日不计额度：和 getYearStats 同一口径，周末标假只作展示
      if (!this.isOfficialWorkingDay(new Date(d + 'T00:00:00'))) return;
      segs.forEach(s => {
        if (customIdOf(s) === leaveId) used += HALF;
      });
    });

    const marks = this.getCustomMarks();
    Object.keys(marks).forEach(d => {
      if (taken[d]) return;
      const m = marks[d];
      if (!m || m.id !== leaveId) return;
      if (!inPeriod(d)) return;
      if (!this.isOfficialWorkingDay(new Date(d + 'T00:00:00'))) return;
      used += (m.part === 'am' || m.part === 'pm') ? HALF : 1;
    });

    used = round1(used);
    return {
      used,
      quota,
      remaining: quota > 0 ? round1(Math.max(0, quota - used)) : 0,
      // 超额不拦截：个人记录工具拦截会让真实请的假记不进去，只提示
      over: quota > 0 && used > quota ? round1(used - quota) : 0,
      unlimited: quota <= 0
    };
  },

  // --- Entries (Date: Status) ---
  // Status types: 'company', 'home', 'vacation', 'sick', 'public', etc.
  getEntries() {
    try {
      const value = uni.getStorageSync(KEY_ENTRIES);
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      console.error('Error getting entries', e);
    }
    return {};
  },

  getEntryForDate(dateStr) {
    // dateStr format: YYYY-MM-DD
    const entries = this.getEntries();
    return entries[dateStr] || null;
  },

  saveEntry(dateStr, status) {
    try {
      const entries = this.getEntries();
      // 连续休假（区间型）覆盖的日子里不允许再标任何出勤方式；
      // 清空操作放行，用户想改口径得先取消那段假
      if (status && this.getCustomLeaveForDate(dateStr)) return false;
      // 额度硬约束（不只做 UI 提示）：年假 / 病假用满后不允许再标记。
      // 放在数据层，返回键 / 脚本绕过 UI 时同样拦得住；清空操作始终放行。
      // 同一天重复标记同一状态是幂等的，不能因为「已用满」而拦掉。
      if (status === 'vacation' || status === 'sick') {
        if (entries[dateStr] !== status) {
          const quota = this.getLeaveQuota(status, String(dateStr).slice(0, 4));
          if (quota && quota.full) return false;
        }
      }
      // 按天型自定义假（福利假）走同一条路：图例直标整天，额度同样硬约束
      if (isCustomEntry(status)) {
        // 整套是 PRO 权益，非会员连整天标记也不放行
        if (!isProUser()) return false;
        const id = customIdOf(status);
        const leave = this.getCustomLeaveById(id);
        // 引用了不存在（或已改成区间型）的假就拒绝写入，避免留下孤儿值
        if (!leave || leave.mode !== 'day') return false;
        // 同一天重复标同一个假是幂等的，不能因为「已用满」而拦掉
        if (entries[dateStr] !== status) {
          const usage = this.getCustomLeaveUsage(id);
          if (!usage.unlimited && usage.remaining <= 0) return false;
        }
      }
      if (status) {
        entries[dateStr] = status;
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      markDirty();
      // 标了东西才记操作时间；清空是撤销，把那天的时间戳一起删掉，
      // 免得 settings 里留一堆已经撤销的日期
      const settings = this.getSettings();
      if (status) {
        this.saveSettings({ ...settings, touchedAt: this._withTouch(settings.touchedAt, dateStr) });
      } else if (settings.touchedAt && settings.touchedAt[dateStr]) {
        const nextTouched = { ...settings.touchedAt };
        delete nextTouched[dateStr];
        this.saveSettings({ ...settings, touchedAt: nextTouched });
      }
      return true;
    } catch (e) {
      console.error('Error saving entry', e);
      return false;
    }
  },

  // --- 半天标记（PRO） ---
  /** 当前生效的半天出勤计法（老全局字段，仅作默认值读兼容） */
  getHalfDayAttendanceMode() {
    return this.getSettings().halfDayAttendance === 'full' ? 'full' : 'half';
  },

  /** 逐日「半天按一整天算」的表：{ 'YYYY-MM-DD': true|false } */
  getHalfFullDays() {
    const s = this.getSettings();
    const raw = s.halfFullDays && typeof s.halfFullDays === 'object' ? s.halfFullDays : {};
    const out = {};
    Object.keys(raw).forEach(d => {
      // false 也要保留：它表示用户当天显式选了「按半天」，要盖掉旧的全局默认值
      if (typeof raw[d] === 'boolean' && this._isValidDateStr(d)) out[d] = raw[d];
    });
    return out;
  },

  /** 某天的半天出勤是否按一整天算（逐日优先，没有逐日记录时用老的全局默认） */
  isHalfDayAsFullAttendance(dateStr) {
    if (this._isValidDateStr(dateStr)) {
      const map = this.getHalfFullDays();
      if (typeof map[dateStr] === 'boolean') return map[dateStr];
    }
    return this.getHalfDayAttendanceMode() === 'full';
  },

  /** 写某天「半天按一天算」 */
  setHalfFullDay(dateStr, full) {
    if (!this._isValidDateStr(dateStr)) return false;
    const s = this.getSettings();
    const map = { ...(s.halfFullDays && typeof s.halfFullDays === 'object' ? s.halfFullDays : {}) };
    map[dateStr] = !!full;
    this.saveSettings({ ...s, halfFullDays: map });
    return true;
  },

  /** 读某天的上下午（老字符串自动补成两段相同） */
  getDayParts(dateStr) {
    const entries = this.getEntries();
    return parseDayParts(entries[dateStr]);
  },

  /** 是否会员专属的「上下午不同」标记 */
  isSplitDayFor(dateStr) {
    return isSplitDay(this.getEntries()[dateStr]);
  },

  /**
   * 写某天的上下午
   *
   * 会员闸门放在数据层：只要 am !== pm（真的拆了半天）就要求 PRO。
   * 会员过期后已标的半天照常显示与参与统计，只是不能再新增/修改。
   *
   * @returns {boolean} false = 被拦截（非会员拆半天，或假期额度用满）
   */
  saveDayParts(dateStr, am, pm) {
    try {
      const entries = this.getEntries();
      const prev = parseDayParts(entries[dateStr]);
      const nextAm = am || null;
      const nextPm = pm || null;

      // 连续休假（区间型）是「整天占用」：这几天人不在，不允许再标任何出勤方式。
      // 这里拦在数据层，返回键 / 脚本绕过 UI 时同样拦得住；清空操作始终放行。
      if ((nextAm || nextPm) && this.getCustomLeaveForDate(dateStr)) return false;

      // 拆半天是 PRO 能力：整天标记（两段相同）永远免费
      if (nextAm !== nextPm && !isProUser()) return false;

      // 按天型自定义假整套是 PRO 权益：非会员连整天标记也不放行
      const customSegs = [nextAm, nextPm].filter(isCustomEntry);
      if (customSegs.length && !isProUser()) return false;
      // 引用了不存在（或已被删）的按天假就拒绝写入，避免留下孤儿值
      for (let i = 0; i < customSegs.length; i++) {
        const leave = this.getCustomLeaveById(customIdOf(customSegs[i]));
        if (!leave || leave.mode !== 'day') return false;
      }

      // 假期额度硬约束：按折算天数（半天 = 0.5）与「改动前后」的差额判断，
      // 同一天重复保存同一状态是幂等的，不能因为已用满而拦掉。
      const year = String(dateStr).slice(0, 4);
      const deltaByStatus = this._leaveDelta(prev, { am: nextAm, pm: nextPm });
      const keys = Object.keys(deltaByStatus);
      for (let i = 0; i < keys.length; i++) {
        const status = keys[i];
        const delta = deltaByStatus[status];
        if (delta <= 0) continue;
        // 按天型自定义假单独算：额度统计在 getCustomLeaveUsage（entries + 老 marks 合并），
        // 不能走 getLeaveQuota（那只认年假/病假）。口径与图例直标、面板置灰一致：
        // 剩余为 0 才拒绝；还有 0.5 时允许标（超额只提示不拦，个人记录工具不该卡住真实请假）
        if (isCustomEntry(status)) {
          const usage = this.getCustomLeaveUsage(customIdOf(status));
          if (!usage.unlimited && usage.remaining <= 0) return false;
          continue;
        }
        const quota = this.getLeaveQuota(status, year);
        // quota.used 已包含改动前的占用，所以只要 增加量 <= 剩余 就是合法的
        if (quota && delta > quota.left + 1e-9) return false;
      }

      const packed = packDayParts(nextAm, nextPm);
      if (packed) {
        entries[dateStr] = packed;
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      markDirty();
      // 半天面板是另一条写入路径（不走 saveEntry），操作时间同样要记：
      // 否则从面板标的半天不会顶到最近记录最前面
      const halfSettings = this.getSettings();
      if (packed) {
        this.saveSettings({ ...halfSettings, touchedAt: this._withTouch(halfSettings.touchedAt, dateStr) });
      } else if (halfSettings.touchedAt && halfSettings.touchedAt[dateStr]) {
        const nextTouched = { ...halfSettings.touchedAt };
        delete nextTouched[dateStr];
        this.saveSettings({ ...halfSettings, touchedAt: nextTouched });
      }
      return true;
    } catch (e) {
      console.error('Error saving day parts', e);
      return false;
    }
  },

  /** 改动前后各假期状态的折算天数差额（正 = 多用） */
  _leaveDelta(prev, next) {
    const delta = {};
    const add = (map, sign) => {
      ['am', 'pm'].forEach(k => {
        const s = map[k];
        // 年假 / 病假等固定状态与按天假（custom:<id>）都要参与额度差额计算
        if (s && (DAY_LEAVE_KEYS.indexOf(s) !== -1 || isCustomEntry(s))) {
          delta[s] = (delta[s] || 0) + sign * HALF;
        }
      });
    };
    add(prev, -1);
    add(next, 1);
    Object.keys(delta).forEach(k => {
      if (Math.abs(delta[k]) < 1e-9) delete delta[k];
    });
    return delta;
  },

  // 年假 / 病假的年度额度（统计口径：全年所有该状态条目）
  // 返回 null 表示该状态不受额度约束
  getLeaveQuota(status, year) {
    const keyMap = { vacation: 'vacationDays', sick: 'sickDays' };
    const key = keyMap[status];
    if (!key) return null;
    const s = this.getSettings();
    const total = Math.max(0, Number(s[key]) || 0);
    let used = 0;
    try {
      const st = this.getYearStats(Number(year) || new Date().getFullYear());
      used = status === 'vacation' ? st.vacationDaysUsed : st.sickDaysUsed;
    } catch (e) {
      used = 0;
    }
    return { total, used, left: Math.max(0, total - used), full: used >= total };
  },

  // --- Overtime (Date: Hours) ---
  getOvertimeEntries() {
    try {
      const value = uni.getStorageSync(KEY_OVERTIME);
      if (value) {
        return JSON.parse(value);
      }
    } catch (e) {
      console.error('Error getting overtime entries', e);
    }
    return {};
  },

  getOvertimeForDate(dateStr) {
    const entries = this.getOvertimeEntries();
    return entries[dateStr] || 0;
  },

  saveOvertimeEntry(dateStr, hours) {
    try {
      const entries = this.getOvertimeEntries();
      if (hours && hours > 0) {
        entries[dateStr] = parseFloat(hours);
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_OVERTIME, JSON.stringify(entries));
      markDirty();
      // 加班单独存在 wio_overtime 里，不经过 saveEntry，操作时间得在这里补
      if (hours && hours > 0) {
        const settings = this.getSettings();
        this.saveSettings({ ...settings, touchedAt: this._withTouch(settings.touchedAt, dateStr) });
      }
    } catch (e) {
      console.error('Error saving overtime entry', e);
    }
  },

  // --- Helpers ---
  getTodayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * 全量假日日（跨年合并）：首页的「下个假期」要能从 12 月看到 1 月的元旦。
   * 新年份的数据文件建好后往数组里加一项即可。
   */
  _allHolidayDays() {
    const list = [];
    [holidays2026, holidays2027].forEach(y => {
      if (y && Array.isArray(y.days)) list.push(...y.days);
    });
    return list;
  },

  /**
   * 获取指定日期的公共假期信息
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {object|null} - { name, isOffDay, ... }
   */
  getPublicHoliday(dateStr) {
    const days = this._allHolidayDays();
    if (!days.length) return null;
    return days.find(d => d.date === dateStr) || null;
  },

  /**
   * 下一个法定假期：fromStr（含当天）起第一个休息日。
   * 今天就在假里时返回 days: 0，调用方据此显示「正在放假」。
   * @param {string} [fromStr] - YYYY-MM-DD，缺省取今天
   * @returns {null|{name: string, date: string, days: number}}
   */
  getNextHoliday(fromStr) {
    const days = this._allHolidayDays();
    if (!days.length) return null;
    const from = String(fromStr || this.getTodayDateStr() || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
    const offs = days
      .filter(d => d && d.isOffDay && d.date >= from)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!offs.length) return null;
    const first = offs[0];
    const ms = new Date(first.date + 'T00:00:00') - new Date(from + 'T00:00:00');
    return { name: first.name, date: first.date, days: Math.max(0, Math.round(ms / 86400000)) };
  },

  /**
   * 获取所有节日信息列表
   * @returns {Array<{name: string, hasCompOff: boolean}>}
   */
  getHolidayInfoList() {
      const days = this._allHolidayDays();
      if (!days.length) return [];

      const holidayMap = new Map();

      days.forEach(d => {
          if (!holidayMap.has(d.name)) {
              holidayMap.set(d.name, { name: d.name, hasCompOff: false });
          }
          
          // 如果某天不是休息日（即补班），则标记该节日有调休
          if (!d.isOffDay) {
              holidayMap.get(d.name).hasCompOff = true;
          }
      });
      
      return Array.from(holidayMap.values());
  },

  /**
   * 判断某天是否为法定工作日
   * @param {Date} date - Date object
   * @returns {boolean}
   */
  isOfficialWorkingDay(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const holiday = this.getPublicHoliday(dateStr);
    
    // 如果在假期安排中
    if (holiday) {
        // isOffDay: true -> 休息 (不是工作日)
        if (holiday.isOffDay) {
            return false;
        }
        
        // isOffDay: false -> 调休上班
        // 获取调休配置
        const settings = this.getSettings();
        const rules = settings.compOffRules || {};
        
        // 检查该节日的调休配置
        // 如果 rules 中有该节日配置，则使用配置值
        // 如果 rules 中没有，默认策略：春节为 true，其他为 false (保持兼容性)
        // 但我们在 DEFAULT_SETTINGS 里已经初始化了 '春节': true
        // 对于其他未配置的节日，undefined 视为 false
        
        if (rules[holiday.name]) {
            return true;
        } else {
            return false;
        }
    }

    // 默认: 周一至周五是工作日
    const day = date.getDay();
    return day !== 0 && day !== 6;
  },
  
  // Get stats for a specific month (YYYY-MM)
  getMonthStats(year, month) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries();
    // 半天出勤计法逐日读：用户在标记那天当场选的「按一天 / 按半天」，
    // 没有逐日记录时退回老的全局默认值（历史行为不变）
    const halfFullMap = this.getHalfFullDays();
    const halfDefaultFull = this.getHalfDayAttendanceMode() === 'full';
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    
    let stats = {
      company: 0,
      home: 0,
      vacation: 0,
      birthday: 0,
      sick: 0,
      unpaid: 0,
      comp_off: 0,
      public: 0,
      exclude_wio: 0,
      custom: 0, // 自定义假期（区间内工作日）
      totalRecorded: 0,
      workingDays: 0, // Mon-Fri
      totalOvertime: 0, // New: Total overtime hours
      weekendLeaves: 0, // 落在非工作日的假期（不扣分母）
      deductibleLeave: 0 // 从分母扣减的假期折算天数（半天口径的唯一准确来源）
    };

    // 自定义假期整月只读一次存储：逐日循环里再读会做 60 次 JSON.parse
    const customLeavesAll = this.getCustomLeaves();
    const customMarksAll = this.getCustomMarks();
    const customDayIds = customLeavesAll.filter(l => l.mode === 'day').map(l => l.id);

    // Calculate Working Days (Official) in the month
    // Also calculate Public Holidays (if not overridden by user entry)
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      // 1. Calculate Working Days
      let isWorkingDay = this.isOfficialWorkingDay(date);
      
      const rawEntry = this._sanitizeCustomSegments(entries[dateStr], customDayIds);

      // 0. 区间型自定义假（连续休假）是「整天占用」，优先级最高：
      //    这几天人不在，当天残留的出勤标记一律不参与统计（不删数据，删假即恢复）。
      //    跨月时只对本月内被覆盖的日期生效——未被覆盖的工作日照常进分母，
      //    该回公司的天数一天都不会少。
      const rangeLeave = customLeavesAll.find(l => this._rangeHits(l, dateStr));

      // 周末 / 法定节假日：不论标了什么（公司、居家、假期）都不进 WIO 口径，
      // 只有加班（OT）单独统计。这里绝不把标记过的周末「拉回分母」——
      // 那样周末随手补个居家就会把分母 +1、比率被拉低，和「周末不算 WIO」矛盾。
      // 调休上班日由 isOfficialWorkingDay 判为工作日，照常计入。
      const ev = rangeLeave ? null : evaluateDayParts(rawEntry, {
        halfDayAsFull: typeof halfFullMap[dateStr] === 'boolean' ? halfFullMap[dateStr] : halfDefaultFull,
        isWorkingDay
      });

      if (isWorkingDay) {
        stats.workingDays++;
      }

      // 2. Count Stats based on Entry OR Public Holiday default
      // 优先级：区间假（整天占用） > 当天两段标记 > 按天假老标记 > 法定假日
      //   工作日 → 记 custom 并扣分母；非工作日 → 记 weekendLeaves 防止误扣
      //   按天标记半天记 0.5 天（额度按天扣，半天自然扣半）
      if (rangeLeave) {
        if (isWorkingDay) {
          stats.custom += 1;
          stats.deductibleLeave += 1;
        } else {
          stats.weekendLeaves += 1;
        }
      } else if (ev.hasEntry) {
        if (isWorkingDay) {
          // 按段折算：半天出勤看开关，居家与各类假期恒定 0.5 天
          stats.company += ev.company;
          stats.home += ev.home;
          Object.keys(ev.leave).forEach(k => {
            if (stats.hasOwnProperty(k)) stats[k] += ev.leave[k];
          });
          stats.deductibleLeave += ev.deductible;
        } else {
          // 非工作日的标记只落到 weekendLeaves（用于「这假本不该扣分母」的自检），
          // 不进 company / home / 各类假期：否则「剩余未记录」会被周末虚耗掉
          stats.weekendLeaves += ev.weekendLeave;
        }
        stats.totalRecorded++;
      } else {
        // 没有当天的两段标记：老版本按天标记仍然生效（只读兼容，不再写入）
        const mark = this.getCustomMarkForDate(dateStr, customMarksAll, customLeavesAll);
        if (mark) {
          const weight = (mark.part === 'am' || mark.part === 'pm') ? HALF : 1;
          if (isWorkingDay) {
            stats.custom += weight;
            stats.deductibleLeave += weight;
          } else {
            stats.weekendLeaves += weight;
          }
        } else {
          // No manual entry, check if it's a public holiday (off day)
          const holiday = this.getPublicHoliday(dateStr);
          if (holiday && holiday.isOffDay) {
            stats.public++;
          }
        }
      }

      // 3. Count Overtime
      const overtime = overtimeEntries[dateStr];
      if (overtime) {
        stats.totalOvertime += parseFloat(overtime);
      }
    }

    return {
      companyDays: round1(stats.company),
      homeDays: round1(stats.home),
      vacationDays: round1(stats.vacation),
      birthdayDays: round1(stats.birthday),
      sickDays: round1(stats.sick),
      unpaidDays: round1(stats.unpaid),
      compOffDays: round1(stats.comp_off),
      publicDays: stats.public,
      excludeWioDays: round1(stats.exclude_wio),
      customLeaveDays: stats.custom,
      weekendLeaves: round1(stats.weekendLeaves), // 落在非工作日的假期（不扣分母）
      deductibleLeave: round1(stats.deductibleLeave), // 分母扣减项（半天口径的唯一准确来源）
      totalRecorded: stats.totalRecorded,
      workingDays: stats.workingDays,
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
  },

  /** 某月的展示口径（率 / 达标 / 剩余 / 假期构成 / 加班），首页与分享卡共用 */
  getMonthlyReport(year, month) {
    let stats
    try {
      stats = this.getMonthStats(year, month)
    } catch (e) {
      console.error('getMonthlyReport failed', e)
      stats = {}
    }
    return computeMonthlyReport(stats, this.getTargetForMonth(year, month))
  },

  // Get stats for a specific year (YYYY)
  getYearStats(year) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries(); // Get overtime data
    const prefix = `${year}-`;
    
    let stats = {
      vacation: 0,
      birthday: 0,
      sick: 0,
      totalOvertime: 0 // New: Total overtime hours for the year
    };
    
    // Calculate leave days（按段折算：半天假期 = 0.5 天）
    // 假期折算与「半天出勤开关」无关，所以这里固定传 halfDayAsFull: false
    Object.keys(entries).forEach(date => {
      if (!date.startsWith(prefix)) return;
      // 周末 / 法定假日标的假不消耗额度：那天本来就不上班，
      // 记成「已用年假」只会让配额虚高，与统计口径（非工作日只落 weekendLeaves）也矛盾
      if (!this.isOfficialWorkingDay(new Date(date + 'T00:00:00'))) return;
      const ev = evaluateDayParts(entries[date], { halfDayAsFull: false, isWorkingDay: true });
      if (ev.leave.vacation) stats.vacation += ev.leave.vacation;
      if (ev.leave.birthday) stats.birthday += ev.leave.birthday;
      if (ev.leave.sick) stats.sick += ev.leave.sick;
    });

    // Calculate total overtime for the year
    Object.keys(overtimeEntries).forEach(date => {
      if (date.startsWith(prefix)) {
        stats.totalOvertime += parseFloat(overtimeEntries[date]);
      }
    });

    return {
      vacationDaysUsed: round1(stats.vacation),
      birthdayDaysUsed: round1(stats.birthday),
      sickDaysUsed: round1(stats.sick),
      totalOvertime: parseFloat(stats.totalOvertime.toFixed(1))
    };
  },

  // 年度聚合（高级统计页用）
  // - workingDays / companyDays / homeDays：12 个月累加
  // - ratio：公司办公日占全年工作日的百分比
  // - monthly[m-1].targetDays = 该月工作日 × 该月当期比例（getTargetForMonth，按月快照）
  // - 节约通勤 = 居家日 × commuteMinutes / 60 小时，再按 8 小时/天折算
  getAnnualStats(year) {
    const leaves = this.getYearStats(year);
    const settings = this.getSettings();

    let workingDays = 0;
    let companyDays = 0;
    let homeDays = 0;
    let overtimeHours = 0;
    const monthly = [];

    for (let m = 1; m <= 12; m++) {
      const s = this.getMonthStats(year, m);
      workingDays += s.workingDays;
      companyDays += s.companyDays;
      homeDays += s.homeDays;
      overtimeHours += s.totalOvertime;

      const ratio = this.getTargetForMonth(year, m);
      monthly.push({
        month: m,
        companyDays: s.companyDays,
        workingDays: s.workingDays,
        // 目标线高度按「该月工作日 × 该月当期比例」，年内改过比例即呈阶梯状
        targetDays: parseFloat((s.workingDays * ratio / 100).toFixed(1)),
        // 折线图数据：每月加班小时（统计页的加班趋势卡）
        overtimeHours: s.totalOvertime
      });
    }

    overtimeHours = parseFloat(overtimeHours.toFixed(1));
    const commuteMinutes = settings.commuteMinutes || 90;
    const commuteSavedHours = parseFloat((homeDays * commuteMinutes / 60).toFixed(1));

    // 自定义假期统计：按天型看「已用 / 额度」，区间型看这段假占用了几个工作日
    // （区间型的起止是自然日，直接报自然日数会把周末也算进去）
    const customLeaves = this.getCustomLeaves().map(l => {
      if (l.mode === 'day') {
        const u = this.getCustomLeaveUsage(l.id);
        return {
          id: l.id, name: l.name, color: l.color, mode: 'day',
          quota: l.quota || 0, used: u.used
        };
      }
      return {
        id: l.id, name: l.name, color: l.color, mode: 'range',
        days: this.countDeductibleDays(l.start, l.end)
      };
    });

    return {
      year,
      workingDays,
      companyDays,
      homeDays,
      ratio: workingDays > 0 ? Math.round(companyDays / workingDays * 100) : 0,
      overtimeHours,
      overtimeDays: parseFloat((overtimeHours / 8).toFixed(1)),
      commuteMinutes,
      commuteSavedHours,
      commuteSavedDays: parseFloat((commuteSavedHours / 8).toFixed(1)),
      vacationDaysUsed: leaves.vacationDaysUsed,
      birthdayDaysUsed: leaves.birthdayDaysUsed,
      sickDaysUsed: leaves.sickDaysUsed,
      vacationDaysTotal: settings.vacationDays || 20,
      sickDaysTotal: settings.sickDays || 12,
      birthdayEnabled: !!settings.birthdayEnabled,
      customLeaves,
      monthly
    };
  },

  // 生成年度 CSV 明细（导出用）：日期、星期、状态、加班小时
  buildYearCsv(year) {
    const entries = this.getEntries();
    const overtimeEntries = this.getOvertimeEntries();
    const statusKeys = {
      company: '公司办公', home: '居家办公', vacation: '年假',
      birthday: '生日假', sick: '病假', unpaid: '无薪假',
      comp_off: '调休', exclude_wio: '不计入'
    };
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const rows = ['日期,星期,状态,加班(小时)'];
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    Object.keys(entries)
      .filter(d => d >= start && d <= end)
      .sort()
      .forEach(dateStr => {
        const wd = weekdays[new Date(dateStr + 'T00:00:00').getDay()];
        const parts = parseDayParts(entries[dateStr]);
        const label = s => statusKeys[s] || s || '';
        // 上下午不同写成「公司办公(上午) 年假(下午)」——不用逗号，免得破列
        const status = parts.am === parts.pm
          ? label(parts.am)
          : `${label(parts.am)}(上午) ${label(parts.pm)}(下午)`;
        const ot = overtimeEntries[dateStr] || '';
        rows.push(`${dateStr},${wd},${status},${ot}`);
      });
    return rows.join('\n');
  }
}
