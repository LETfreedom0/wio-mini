// ============================================================
// 云函数: redeem
// 会员兑换码 · 服务端核销（替代旧的「前端本地码表」）
//
// action=redeem（默认）  用户核销：验码 → 记日志 → 写 subscriptions
// action=issue          发码（仅管理员，需 REDEEM_ADMIN_TOKEN）
//
// 为什么搬到服务端：
//   旧的 REDEEM_CODES 写在前端代码里——任何人解包小程序都能看到全部码，
//   且核销只写本地存储，清缓存就能重复领。现在码在数据库、核销在服务端，
//   发出去的权益与虚拟支付写的是同一张 subscriptions 表、同一套顺延规则，
//   所以「兑换 30 天」与「买月卡」在会员页表现完全一致。
//
// 环境变量（云开发控制台 → 云函数 → redeem → 配置）：
//   REDEEM_ADMIN_TOKEN   发码口令；不配则 issue 动作自动关闭（线上更安全）
//
// 数据表：
//   redeem_codes  { code, days, max_uses, used_count, enabled, expires_at, note, created_at }
//   redeem_logs   { _id: openid_code, openid, code, days, expires_at, created_at }
//                 —— _id 固定拼法，靠主键唯一天然实现「一人一码只能用一次」
//   subscriptions 与 pay 云函数共用
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const DAY_MS = 24 * 3600 * 1000
const ADMIN_TOKEN = process.env.REDEEM_ADMIN_TOKEN || ''

// 不用 0/O/1/I，避免用户把小票上的码看错
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const ensured = new Set()
async function ensureCollections() {
  for (const name of ['redeem_codes', 'redeem_logs', 'subscriptions']) {
    if (ensured.has(name)) continue
    try {
      await db.createCollection(name)
    } catch (e) {
      // 已存在会抛错，忽略
    }
    ensured.add(name)
  }
}

/** 用户输入容错：去空格、统一大写（「wio-pro-30」与「WIO PRO 30」都认） */
function normalizeCode(input) {
  return String(input || '').trim().toUpperCase().replace(/\s+/g, '')
}

function randomCode(prefix) {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`
}

function logId(openid, code) {
  return `${openid}_${code}`
}

/**
 * 入账：与 pay 云函数 deliver() 同一套逻辑——有效期在现有到期日上顺延。
 * 幂等键用 wx_transaction_id（集合上残留的唯一索引），写成 redeem:<code>:<openid>。
 */
async function grant(openid, days, code) {
  const last = (await db.collection('subscriptions')
    .where({ openid, status: 'active', expires_at: _.gt(Date.now()) })
    .orderBy('expires_at', 'desc').limit(1).get()).data[0]

  const base = last ? last.expires_at : Date.now()
  const expiresAt = base + days * DAY_MS
  const key = `redeem:${code}:${openid}`

  await db.collection('subscriptions').add({
    data: {
      openid,
      plan: 'code',
      status: 'active',
      wx_order_id: key,
      wx_transaction_id: key,
      out_trade_no: key,
      source: 'redeem',
      redeem_code: code,
      started_at: Date.now(),
      expires_at: expiresAt
    }
  })
  return expiresAt
}

/** 核销主流程 */
async function doRedeem(openid, rawCode) {
  const code = normalizeCode(rawCode)
  if (!code || code.length < 4 || code.length > 64) {
    return { ok: false, code: 'bad_code', message: '兑换码格式不正确' }
  }

  const doc = (await db.collection('redeem_codes').where({ code }).limit(1).get()).data[0]
  if (!doc) return { ok: false, code: 'bad_code', message: '兑换码不存在' }
  if (doc.enabled === false) return { ok: false, code: 'bad_code', message: '兑换码已停用' }

  const now = Date.now()
  if (doc.expires_at && doc.expires_at < now) {
    return { ok: false, code: 'code_expired', message: '兑换码已过期' }
  }
  // 一人一码一次：主键冲突即已领过
  const lid = logId(openid, code)

  // 先认人、再看码余量。
  // 单人码被本人用完之后，余额检查会先命中并回「已被领完」——对用户来说是错的提示
  //（他明明是自己用过的）。所以这里先查一眼自己的核销记录，语义优先。
  try {
    const mine = (await db.collection('redeem_logs').doc(lid).get()).data
    if (mine) {
      return {
        ok: false,
        code: 'code_used',
        message: '这个兑换码你已经用过',
        expiresAt: mine.expires_at || 0
      }
    }
  } catch (e) {
    // 没有记录：正常路径，继续往下走
  }

  // 0 表示不限次数（活动码）。这里不能用 `doc.max_uses || 1`——
  // 0 是合法值，`0 || 1` 会把它悄悄变成「只能领一次」。
  const maxUses = doc.max_uses == null ? 1 : Number(doc.max_uses)
  if (maxUses > 0 && Number(doc.used_count || 0) >= maxUses) {
    return { ok: false, code: 'code_exhausted', message: '兑换码已被领完' }
  }

  const days = Math.max(1, Math.min(3650, Number(doc.days || 30)))

  // ① 原子占名额。
  // 旧写法「先查 used_count 是否 < max_uses，再写库」有竞态窗口：
  // 两个人几乎同时核销同一个 max_uses=1 的码，两边都读到 0，于是都发权益，
  // used_count 变成 2 —— 单次码被超发。改成带条件的原子自增，
  // 只有把 used_count 停在仍有余量的那一次才算抢到名额。
  let quotaTaken = false
  try {
    if (doc.used_count == null) {
      // 手工插进库的码可能没有 used_count 字段，条件更新匹配不到它，先补 0
      await db.collection('redeem_codes').doc(doc._id).update({ data: { used_count: 0 } })
    }
    if (maxUses > 0) {
      const r = await db.collection('redeem_codes')
        .where({ _id: doc._id, used_count: _.lt(maxUses) })
        .update({ data: { used_count: _.inc(1), last_used_at: now } })
      // 明确回 0 才是没抢到；拿不到统计信息时退回旧行为，宁可少拦也不误伤用户
      const updated = r && r.stats && typeof r.stats.updated === 'number' ? r.stats.updated : null
      if (updated === 0) {
        return { ok: false, code: 'code_exhausted', message: '兑换码已被领完' }
      }
      quotaTaken = true
    } else {
      // max_uses=0 表示不限次数，不占额，只记录最近使用时间
      await db.collection('redeem_codes').doc(doc._id).update({ data: { last_used_at: now } })
    }
  } catch (e) {
    // 计数写失败不阻断核销：宁可多给一次，也不能让用户拿着有效码领不到
  }

  const rollbackQuota = async () => {
    if (!quotaTaken) return
    try {
      await db.collection('redeem_codes').doc(doc._id).update({ data: { used_count: _.inc(-1) } })
    } catch (e) { /* 回滚失败最多浪费一个名额 */ }
  }

  // ② 占人：主键唯一
  try {
    await db.collection('redeem_logs').add({
      data: {
        _id: lid,
        openid,
        code,
        days: 0,
        expires_at: 0,
        created_at: now
      }
    })
  } catch (e) {
    let old = null
    try {
      old = (await db.collection('redeem_logs').doc(lid).get()).data
    } catch (e2) {
      old = null
    }
    if (old) {
      // 本人重复核销：把刚占的名额退回去，别白白吃掉一次
      await rollbackQuota()
      return {
        ok: false,
        code: 'code_used',
        message: '这个兑换码你已经用过',
        expiresAt: old.expires_at || 0
      }
    }
    await rollbackQuota()
    throw e
  }

  // ③ 入账；失败要把名额与日志一起退掉，否则用户既没拿到权益又占了名额
  let expiresAt
  try {
    expiresAt = await grant(openid, days, code)
  } catch (e) {
    await rollbackQuota()
    try { await db.collection('redeem_logs').doc(lid).remove() } catch (e2) { /* 忽略 */ }
    throw e
  }

  // ④ 回写日志（计数已在 ① 完成，这里不再 inc，避免重复计数）
  try {
    await db.collection('redeem_logs').doc(lid).update({ data: { days, expires_at: expiresAt } })
  } catch (e) { /* 忽略 */ }

  return { ok: true, days, plan: 'code', expiresAt, code }
}

/** 发码（管理员） */
async function doIssue(event) {
  if (!ADMIN_TOKEN) {
    return { ok: false, code: 'admin_disabled', message: '未配置 REDEEM_ADMIN_TOKEN，发码功能已关闭' }
  }
  if (event.token !== ADMIN_TOKEN) {
    return { ok: false, code: 'bad_token', message: '口令错误' }
  }

  const days = Math.max(1, Math.min(3650, Number(event.days || 30)))
  // max_uses=0 表示不限次数（活动码）
  const maxUses = Math.max(0, Math.min(100000, Number(event.maxUses == null ? 1 : event.maxUses)))
  const count = Math.max(1, Math.min(50, Number(event.count || 1)))
  const prefix = String(event.prefix || 'WIO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'WIO'
  const expiresAt = event.expiresAt ? Number(event.expiresAt) : 0

  const codes = []
  for (let i = 0; i < count; i++) {
    let code = ''
    // 极小概率撞码，撞了就重抽
    for (let t = 0; t < 5; t++) {
      const candidate = randomCode(prefix)
      if (!(await db.collection('redeem_codes').where({ code: candidate }).limit(1).get()).data[0]) {
        code = candidate
        break
      }
    }
    if (!code) continue

    await db.collection('redeem_codes').add({
      data: {
        code,
        days,
        max_uses: maxUses,
        used_count: 0,
        enabled: true,
        expires_at: expiresAt,
        note: String(event.note || ''),
        created_at: Date.now()
      }
    })
    codes.push(code)
  }

  return { ok: true, days, maxUses, count: codes.length, codes }
}

exports.main = async (event = {}) => {
  try {
    await ensureCollections()

    if (event.action === 'issue') return await doIssue(event)

    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return { ok: false, code: 'no_openid', message: '请先登录' }

    if (event.action === 'redeem' || !event.action) {
      return await doRedeem(OPENID, event.code)
    }

    return { ok: false, code: 'bad_action', message: '未知 action' }
  } catch (e) {
    return { ok: false, code: 'internal', message: String(e && e.message ? e.message : e) }
  }
}
