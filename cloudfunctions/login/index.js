// ============================================================
// 云函数: login
// 登录 / 资料 / 订阅状态查询 / 首次登录送体验
// openid 由微信云开发自动注入（getWXContext），无需 AppSecret
//
// event.claimTrial === true 时才尝试发放 7 天体验：
//   仅「用户主动登录」时携带，refreshSubscription() 的静默刷新不带，
//   否则每次进会员页都会多查一次表、多一次主键冲突。
//
// 数据表：
//   users / subscriptions （既有）
//   trial_grants { _id: openid, openid, days, expires_at, created_at }
//   —— _id 固定为 openid，靠主键唯一天然实现「一人只能领一次」，
//      与 redeem_logs 的 openid_code 是同一手法，不需要事务。
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const DAY_MS = 24 * 3600 * 1000
const TRIAL_DAYS = 7

let trialColReady = false
async function ensureTrialCollection() {
  if (trialColReady) return
  try {
    await db.createCollection('trial_grants')
  } catch (e) {
    // 已存在会抛错，忽略
  }
  trialColReady = true
}

/**
 * 首次登录发 7 天体验
 * 规则：已有有效订阅（买过 / 兑过）就不发；一人一 openid 一次。
 * @returns {{granted:boolean, days?:number, expiresAt?:number, reason?:string}}
 */
async function claimTrial(openid) {
  await ensureTrialCollection()
  const now = Date.now()

  // 先看领取记录：试用还在有效期内时重复点，应该回「已经领过」而不是
  // 「已是会员」，否则提示语会误导用户
  const claimed = (await db.collection('trial_grants').where({ openid }).limit(1).get()).data[0]
  if (claimed) return { granted: false, reason: 'already_claimed' }

  // 已经是会员就不白送（续费走付费墙 / 兑换码）
  const active = (await db.collection('subscriptions')
    .where({ openid, status: 'active', expires_at: _.gt(now) })
    .limit(1)
    .get()).data[0]
  if (active) return { granted: false, reason: 'has_subscription' }

  // 先占位：主键冲突 = 这个 openid 领过
  try {
    await db.collection('trial_grants').add({
      data: { _id: openid, openid, days: TRIAL_DAYS, expires_at: 0, created_at: now }
    })
  } catch (e) {
    return { granted: false, reason: 'already_claimed' }
  }

  const expiresAt = now + TRIAL_DAYS * DAY_MS
  // 集合上残留 wx_transaction_id 唯一索引（空值只许一条），
  // 所以每次入账都要写一个唯一值——与 pay / redeem 同一约定
  const key = `trial:${openid}`
  try {
    await db.collection('subscriptions').add({
      data: {
        openid,
        plan: 'trial',
        status: 'active',
        wx_order_id: key,
        wx_transaction_id: key,
        out_trade_no: key,
        source: 'trial',
        started_at: now,
        expires_at: expiresAt
      }
    })
  } catch (e) {
    // 入账失败就把占位撤掉，否则这个用户永久失去体验资格
    try {
      await db.collection('trial_grants').doc(openid).remove()
    } catch (e2) { /* 忽略 */ }
    return { granted: false, reason: 'grant_failed' }
  }

  try {
    await db.collection('trial_grants').doc(openid).update({ data: { expires_at: expiresAt } })
  } catch (e) { /* 只是记录，失败不影响权益 */ }

  return { granted: true, days: TRIAL_DAYS, expiresAt }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { ok: false, code: 'no_openid', message: '无法获取用户身份' }
  }

  try {
    const usersCol = db.collection('users')
    let user = (await usersCol.where({ openid: OPENID }).limit(1).get()).data[0]

    // 建用户 / 更新资料
    if (!user) {
      const now = Date.now()
      const addRes = await usersCol.add({
        data: {
          openid: OPENID,
          nickname: event.nickname || '',
          avatarFileID: event.avatarFileID || '',
          created_at: now,
          updated_at: now
        }
      })
      user = { _id: addRes._id, openid: OPENID, nickname: event.nickname || '', avatarFileID: event.avatarFileID || '' }
    } else if (event.nickname || event.avatarFileID) {
      const patch = { updated_at: Date.now() }
      if (event.nickname) patch.nickname = event.nickname
      if (event.avatarFileID) patch.avatarFileID = event.avatarFileID
      await usersCol.doc(user._id).update({ data: patch })
      user = { ...user, ...patch }
    }

    // 首次登录送体验：必须在查订阅之前跑，返回的 subscription 才会带上刚发的 trial
    let trial = null
    if (event.claimTrial) {
      try {
        trial = await claimTrial(OPENID)
      } catch (e) {
        trial = { granted: false, reason: 'error' }
      }
    }

    // 有效订阅
    const sub = (await db.collection('subscriptions')
      .where({ openid: OPENID, status: 'active', expires_at: _.gt(Date.now()) })
      .orderBy('expires_at', 'desc')
      .limit(1)
      .get()).data[0]

    return {
      ok: true,
      user: {
        openid: OPENID,
        nickname: user.nickname || '',
        avatarFileID: user.avatarFileID || ''
      },
      subscription: sub
        ? { plan: sub.plan, expiresAt: sub.expires_at }
        : null,
      trial
    }
  } catch (e) {
    return { ok: false, code: 'db_error', message: String(e) }
  }
}
