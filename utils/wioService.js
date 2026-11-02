import { holidays2026 } from './holidays.js';
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
  autoSync: true,
  // 半天出勤计法：'half' = 按半天（0.5 天，默认）；'full' = 视同一整天
  // 这是 PRO 权益，非会员读取时降级回 'half'（见 getSettings）
  halfDayAttendance: 'half',
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
//   半天出勤 → 开关 halfDayAttendance 决定 0.5 天还是 1 天
//   半天居家 / 半天假期 → 恒定 0.5 天（不受开关影响，保证开关只影响达标率）
// ============================================================

const HALF = 0.5;
/** 计入分母扣减的假期状态 */
const DAY_LEAVE_KEYS = ['vacation', 'birthday', 'sick', 'unpaid', 'comp_off', 'exclude_wio'];

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
    hasEntry: false, companyParts: 0, homeParts: 0
  };

  ['am', 'pm'].forEach(k => {
    const s = parts[k];
    if (!s) return;
    out.hasEntry = true;
    if (s === 'company') { out.companyParts++; return; }
    if (s === 'home') { out.homeParts++; out.home += HALF; return; }
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
        // 半天出勤计法是 PRO 权益：同语言降级套路，只降级读取值、不改存储，
        // 重新开通后原来的选择自动回来。
        if (s.halfDayAttendance === 'full' && !isProUser()) {
          s.halfDayAttendance = 'half';
        }
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
    range: [
      { key: 'marriage', color: '#C25B6E' },
      { key: 'maternity', color: '#41598A' },
      { key: 'paternity', color: '#8C4F86' },
      { key: 'bereavement', color: '#6B7379' }
    ],
    day: [
      { key: 'care', color: '#A93B78', quotaRule: 'yearly' },
      { key: 'birthday', color: '#C97A3D', quotaRule: 'yearly' },
      { key: 'quarter', color: '#0E6E62', quotaRule: 'total' },
      { key: 'compOff', color: '#3C6FB0', quotaRule: 'total' }
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
    return { ...base, start: l.start, end: l.end };
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
      this.saveSettings({ ...settings, customLeaves: list });
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
    this.saveSettings({ ...settings, customLeaves: list, customMarks: marks });
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
      if (l.mode === 'day') continue;
      if (dateStr >= l.start && dateStr <= l.end) return l;
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
    const settings = this.getSettings();
    const marks = { ...(settings.customMarks || {}) };
    if (!leaveId || !part) {
      delete marks[dateStr];
    } else {
      const leave = this.getCustomLeaves().find(l => l.id === leaveId && l.mode === 'day');
      if (!leave) return false;
      marks[dateStr] = { id: leaveId, part: part === 'am' || part === 'pm' ? part : 'full' };
    }
    this.saveSettings({ ...settings, customMarks: marks });
    return true;
  },

  clearCustomMark(dateStr) {
    return this.setCustomMark(dateStr, null, null);
  },

  // 额度用量：yearly 只统计当年，total 统计全部；半天记 0.5 天
  getCustomLeaveUsage(leaveId) {
    const leave = this.getCustomLeaveById(leaveId);
    if (!leave || leave.mode !== 'day') {
      return { used: 0, quota: 0, remaining: 0, over: 0, unlimited: true };
    }
    const quota = leave.quota || 0;
    const marks = this.getCustomMarks();
    const prefix = `${new Date().getFullYear()}-`;
    let used = 0;
    Object.keys(marks).forEach(d => {
      const m = marks[d];
      if (!m || m.id !== leaveId) return;
      if (leave.quotaRule === 'yearly' && !d.startsWith(prefix)) return;
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
      // 额度硬约束（不只做 UI 提示）：年假 / 病假用满后不允许再标记。
      // 放在数据层，返回键 / 脚本绕过 UI 时同样拦得住；清空操作始终放行。
      // 同一天重复标记同一状态是幂等的，不能因为「已用满」而拦掉。
      if (status === 'vacation' || status === 'sick') {
        if (entries[dateStr] !== status) {
          const quota = this.getLeaveQuota(status, String(dateStr).slice(0, 4));
          if (quota && quota.full) return false;
        }
      }
      if (status) {
        entries[dateStr] = status;
      } else {
        delete entries[dateStr];
      }
      uni.setStorageSync(KEY_ENTRIES, JSON.stringify(entries));
      markDirty();
      return true;
    } catch (e) {
      console.error('Error saving entry', e);
      return false;
    }
  },

  // --- 半天标记（PRO） ---
  /** 当前生效的半天出勤计法（非会员恒为 'half'） */
  getHalfDayAttendanceMode() {
    return this.getSettings().halfDayAttendance === 'full' ? 'full' : 'half';
  },

  /** 半天出勤是否按一整天算 */
  isHalfDayAsFullAttendance() {
    return this.getHalfDayAttendanceMode() === 'full';
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

      // 拆半天是 PRO 能力：整天标记（两段相同）永远免费
      if (nextAm !== nextPm && !isProUser()) return false;

      // 假期额度硬约束：按折算天数（半天 = 0.5）与「改动前后」的差额判断，
      // 同一天重复保存同一状态是幂等的，不能因为已用满而拦掉。
      const year = String(dateStr).slice(0, 4);
      const deltaByStatus = this._leaveDelta(prev, { am: nextAm, pm: nextPm });
      const keys = Object.keys(deltaByStatus);
      for (let i = 0; i < keys.length; i++) {
        const status = keys[i];
        const delta = deltaByStatus[status];
        if (delta <= 0) continue;
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
        if (s && DAY_LEAVE_KEYS.indexOf(s) !== -1) {
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
   * 获取指定日期的公共假期信息
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {object|null} - { name, isOffDay, ... }
   */
  getPublicHoliday(dateStr) {
    if (!holidays2026 || !holidays2026.days) return null;
    return holidays2026.days.find(d => d.date === dateStr) || null;
  },

  /**
   * 获取所有节日信息列表
   * @returns {Array<{name: string, hasCompOff: boolean}>}
   */
  getHolidayInfoList() {
      if (!holidays2026 || !holidays2026.days) return [];
      
      const holidayMap = new Map();
      
      holidays2026.days.forEach(d => {
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
    const halfDayAsFull = this.isHalfDayAsFullAttendance();
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

    // Calculate Working Days (Official) in the month
    // Also calculate Public Holidays (if not overridden by user entry)
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      // 1. Calculate Working Days
      let isWorkingDay = this.isOfficialWorkingDay(date);
      
      const rawEntry = entries[dateStr];
      // 先按「是工作日」探一次，用来判断要不要把这天拉回分母（规则 A）
      const probe = evaluateDayParts(rawEntry, { halfDayAsFull, isWorkingDay: true });

      // Special handling:
      // A. 非工作日只要有出勤段（公司 / 居家），这天就拉回分母（workingDays +1）
      if (!isWorkingDay && (probe.companyParts > 0 || probe.homeParts > 0)) {
        isWorkingDay = true;
      }
      // B. 非工作日标假期不会变成工作日——保持 false 即可

      // 用最终的是否工作日再算一次，deductible 才算得准
      const ev = evaluateDayParts(rawEntry, { halfDayAsFull, isWorkingDay });

      if (isWorkingDay) {
        stats.workingDays++;
      }

      // 2. Count Stats based on Entry OR Public Holiday default
      // 2.0 自定义假期：仅在「无手动标记」的日期生效（手动标记优先）
      //     按天标记 > 区间型假期；工作日 → 分母扣减项；非工作日 → weekendLeaves 防止误扣
      //     半天标记记 0.5 天（额度按天扣，半天自然扣半）
      if (!ev.hasEntry) {
        const mark = this.getCustomMarkForDate(dateStr, customMarksAll, customLeavesAll);
        const rangeLeave = mark
          ? null
          : customLeavesAll.find(l => l.mode !== 'day' && dateStr >= l.start && dateStr <= l.end);
        if (mark || rangeLeave) {
          const weight = mark && (mark.part === 'am' || mark.part === 'pm') ? HALF : 1;
          if (isWorkingDay) {
            stats.custom += weight;
            stats.deductibleLeave += weight;
          } else {
            stats.weekendLeaves += weight;
          }
        }
      }
      if (ev.hasEntry) {
        // 按段折算：半天出勤看开关，居家与各类假期恒定 0.5 天
        stats.company += ev.company;
        stats.home += ev.home;
        Object.keys(ev.leave).forEach(k => {
          if (stats.hasOwnProperty(k)) stats[k] += ev.leave[k];
        });
        stats.weekendLeaves += ev.weekendLeave;
        stats.deductibleLeave += ev.deductible;
        stats.totalRecorded++;
      } else {
        // No manual entry, check if it's a public holiday (off day)
        const holiday = this.getPublicHoliday(dateStr);
        if (holiday && holiday.isOffDay) {
          stats.public++;
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
        targetDays: parseFloat((s.workingDays * ratio / 100).toFixed(1))
      });
    }

    overtimeHours = parseFloat(overtimeHours.toFixed(1));
    const commuteMinutes = settings.commuteMinutes || 90;
    const commuteSavedHours = parseFloat((homeDays * commuteMinutes / 60).toFixed(1));

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
