// ============================================================
// 云函数: sync
// 用户数据快照推/拉 + 乐观锁冲突检测 + 订阅状态
//
// action=pull → { ok, exists, data?, data_version?, synced_time?, subscription? }
// action=push { data, client_updated_at, base_version, force? }
//   ├─ base_version == 云端当前版本 → 接受，data_version+1
//   ├─ 落后且非 force → { ok:false, conflict:true, cloudData, data_version }
//   └─ force=true   → 强制覆盖（冲突弹窗「使用本机」后调用）
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024 // 快照体量保护

async function getSubscription(openid) {
  const sub = (await db.collection('subscriptions')
    .where({ openid, status: 'active', expires_at: _.gt(Date.now()) })
    .orderBy('expires_at', 'desc')
    .limit(1)
    .get()).data[0]
  return sub ? { plan: sub.plan, expiresAt: sub.expires_at } : null
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, code: 'no_openid', message: '无法获取用户身份' }

  try {
    const dataCol = db.collection('user_data')

    // 一个 openid 理论上只有一条数据文档。历史上并发 add() 可能留下重复文档，
    // 若 pull 与 push 命中的不是同一条，就会出现「删除成功、过一会又回来」
    // 的假象。所以统一按 data_version 倒序取，并顺手清掉多余的。
    const loadPrimary = async () => {
      const rows = (await dataCol.where({ openid: OPENID })
        .orderBy('data_version', 'desc')
        .orderBy('updated_at', 'desc')
        .limit(20)
        .get()).data || []
      if (!rows.length) return { row: null, extras: [] }
      return { row: rows[0], extras: rows.slice(1) }
    }

    const dropExtras = async extras => {
      for (const x of extras) {
        try { await dataCol.doc(x._id).remove() } catch (e) { /* 清不掉不影响本次结果 */ }
      }
    }

    // ---------- 拉取 ----------
    if (event.action === 'pull') {
      const { row, extras } = await loadPrimary()
      if (extras.length) await dropExtras(extras)
      const subscription = await getSubscription(OPENID)
      if (!row) return { ok: true, exists: false, subscription }
      return {
        ok: true,
        exists: true,
        data: row.data,
        data_version: row.data_version,
        synced_time: row.client_updated_at || row.updated_at,
        subscription
      }
    }

    // ---------- 推送 ----------
    if (event.action === 'push') {
      const { data, client_updated_at, base_version, force } = event
      if (!data || typeof data !== 'object') {
        return { ok: false, code: 'invalid_data', message: '快照数据缺失' }
      }
      if (JSON.stringify(data).length > MAX_SNAPSHOT_BYTES) {
        return { ok: false, code: 'payload_too_large', message: '快照超过 5MB' }
      }

      const { row, extras } = await loadPrimary()
      const currentVersion = row ? row.data_version : 0

      // 乐观锁：客户端基于旧版本推送 → 两端都改过 → 冲突
      if (!force && (base_version || 0) !== currentVersion) {
        return {
          ok: false,
          conflict: true,
          cloudData: row ? row.data : null,
          data_version: currentVersion
        }
      }

      const now = Date.now()
      if (row) {
        await dataCol.doc(row._id).update({
          data: { data, data_version: currentVersion + 1, client_updated_at: client_updated_at || now, updated_at: now }
        })
        if (extras.length) await dropExtras(extras)
      } else {
        await dataCol.add({
          data: { openid: OPENID, data, data_version: 1, client_updated_at: client_updated_at || now, updated_at: now }
        })
      }
      return { ok: true, data_version: currentVersion + 1, synced_time: client_updated_at || now }
    }

    return { ok: false, code: 'bad_action', message: '未知 action' }
  } catch (e) {
    return { ok: false, code: 'db_error', message: String(e) }
  }
}
