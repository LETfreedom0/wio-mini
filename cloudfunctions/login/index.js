// ============================================================
// 云函数: login
// 登录 / 资料 / 订阅状态查询
// openid 由微信云开发自动注入（getWXContext），无需 AppSecret
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
        : null
    }
  } catch (e) {
    return { ok: false, code: 'db_error', message: String(e) }
  }
}
