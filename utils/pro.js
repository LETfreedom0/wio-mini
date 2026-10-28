// ============================================================
// PRO 权益判定 · 唯一口径
//
// 为什么要有这个文件：
//   此前 ProfileView / MemberView / stats 各写一份 isPro，且都依赖
//   组件 data 里的 session 快照。快照一旦过期（登录、退出、核销后
//   未刷新），三个地方就会给出不同答案——头像显示「会员体验中」而
//   会员页仍是 locked。
//
// 规则：
//   - 每次调用都实时读本地存储，不做任何缓存
//   - 云端订阅（subscriptions 表）优先；本地兑换码试用仅作为
//     未登录/离线时的兜底（测试通道，上线前会移除）
//   - 时间戳兼容数字、毫秒字符串、ISO 字符串、Date
// ============================================================

// 本文件不 import auth.js：只读原始存储，避免任何循环依赖
export const PRO_CHANGED_EVENT = 'wio:pro-changed'

/** 广播权益变化，让页面重算 isPro */
export function notifyProChanged() {
  try {
    uni.$emit(PRO_CHANGED_EVENT)
  } catch (e) {
    // 非小程序环境（构建期）忽略
  }
}

/** 任意时间表示 → 毫秒时间戳，无法解析返回 0 */
export function toTimestamp(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  const n = Number(v)
  if (!Number.isNaN(n)) return n
  const d = new Date(v).getTime()
  return Number.isNaN(d) ? 0 : d
}

/**
 * 读取当前 PRO 状态（实时，无过期缓存）
 *
 * 缓存策略：只缓存「解析结果」，键为两份存储的原始字符串。
 * 登录 / 退出 / 核销都会改写存储 → 键变化 → 自动失效，
 * 因此不需要依赖事件就能保证正确；是否过期仍按当前时间实时判断。
 */
export function getProState() {
  const rawAuth = readRaw('wio_auth')
  const rawTrial = readRaw('wio_pro_trial')

  if (cache.state && cache.key === rawAuth + '|' + rawTrial) {
    return decorate(cache.state)
  }

  let session = null
  let trial = null
  try {
    session = rawAuth ? JSON.parse(rawAuth) : null
  } catch (e) {
    session = null
  }
  try {
    trial = rawTrial ? JSON.parse(rawTrial) : null
  } catch (e) {
    trial = null
  }

  const base = {
    session,
    subExp: toTimestamp(session && session.subscription && (session.subscription.expiresAt || session.subscription.expires_at)),
    subPlan: (session && session.subscription && session.subscription.plan) || 'trial',
    hasSub: !!(session && session.subscription),
    trialExp: toTimestamp(trial && trial.expiresAt),
    hasTrial: !!trial
  }
  cache.key = rawAuth + '|' + rawTrial
  cache.state = base
  return decorate(base)
}

const cache = { key: null, state: null }

function readRaw(key) {
  try {
    const v = uni.getStorageSync(key)
    return typeof v === 'string' ? v : v ? JSON.stringify(v) : ''
  } catch (e) {
    return ''
  }
}

/** 把解析结果 + 当前时间合成对外状态（时间判定不缓存） */
function decorate(b) {
  const session = b.session
  const isLogin = !!(session && session.user && session.user.openid)
  const now = Date.now()

  if (b.hasSub && b.subExp > now) {
    return {
      isPro: true,
      isLogin,
      plan: b.subPlan,
      expiresAt: b.subExp,
      session,
      source: 'cloud'
    }
  }
  if (b.hasTrial && b.trialExp > now) {
    return {
      isPro: true,
      isLogin,
      plan: 'trial',
      expiresAt: b.trialExp,
      session,
      source: 'trial'
    }
  }
  return { isPro: false, isLogin, plan: '', expiresAt: 0, session, source: 'none' }
}

/** 当前是否拥有 PRO 权益 */
export function isProUser() {
  return getProState().isPro
}

/** 会员到期日 YYYY-MM-DD，无权益返回 '—' */
export function proExpireDate() {
  const { expiresAt } = getProState()
  if (!expiresAt) return '—'
  const d = new Date(expiresAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
