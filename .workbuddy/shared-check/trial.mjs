// ============================================================
// 首次登录送 7 天体验 · 离线验证
//
// 直接加载 cloudfunctions/login/index.js 的真实源码（不是复制逻辑），
// 用内存假库顶替 wx-server-sdk，验证四条路径：
//   1. 首次领取 → 发放 7 天，subscriptions 落一条 plan=trial
//   2. 重复领取 → 被 trial_grants 主键拦下，不重复入账
//   3. 已有付费订阅 → 不发（不白送）
//   4. 入账失败 → 回滚 trial_grants，下次还能领
// 另验证：不带 claimTrial 的静默刷新不产生任何写入
// ============================================================

import { createRequire } from 'module'
import Module from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FN_PATH = path.resolve(__dirname, '../../cloudfunctions/login/index.js')

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`) }
}

// ---------- 内存假库 ----------
let seq = 0
let tables = {}
let currentOpenid = 'o_test_001'
let failNextSubscriptionAdd = false

function reset() {
  seq = 0
  tables = { users: [], subscriptions: [], trial_grants: [] }
  failNextSubscriptionAdd = false
}

const gt = v => ({ __op: 'gt', val: v })

function matches(doc, q) {
  for (const k of Object.keys(q)) {
    const v = q[k]
    if (v && v.__op === 'gt') { if (!(Number(doc[k]) > v.val)) return false }
    else if (doc[k] !== v) return false
  }
  return true
}

class Query {
  constructor(name, q) { this.name = name; this.q = q || {}; this._limit = 100; this._order = null }
  where(q) { this.q = { ...this.q, ...q }; return this }
  orderBy(f, d) { this._order = { f, d }; return this }
  limit(n) { this._limit = n; return this }
  async get() {
    if (!tables[this.name]) throw new Error(`collection ${this.name} not exists`)
    let rows = tables[this.name].filter(d => matches(d, this.q))
    if (this._order) {
      const { f, d } = this._order
      rows = rows.slice().sort((a, b) => (d === 'desc' ? Number(b[f]) - Number(a[f]) : Number(a[f]) - Number(b[f])))
    }
    return { data: rows.slice(0, this._limit).map(r => ({ ...r })) }
  }
  async add({ data }) {
    if (!tables[this.name]) throw new Error(`collection ${this.name} not exists`)
    if (this.name === 'subscriptions' && failNextSubscriptionAdd) {
      failNextSubscriptionAdd = false
      throw new Error('simulated write failure')
    }
    if (data._id && tables[this.name].some(d => d._id === data._id)) {
      const e = new Error('duplicate key')
      e.errCode = -502001
      throw e
    }
    const id = data._id || `id_${++seq}`
    tables[this.name].push({ ...data, _id: id })
    return { _id: id }
  }
  doc(id) {
    const name = this.name
    return {
      async update({ data }) {
        const row = tables[name].find(d => d._id === id)
        if (!row) throw new Error('doc not found')
        Object.assign(row, data)
        return { stats: { updated: 1 } }
      },
      async remove() {
        const i = tables[name].findIndex(d => d._id === id)
        if (i === -1) return { stats: { removed: 0 } }
        tables[name].splice(i, 1)
        return { stats: { removed: 1 } }
      },
      async get() {
        const row = tables[name].find(d => d._id === id)
        if (!row) throw new Error('doc not found')
        return { data: { ...row } }
      }
    }
  }
}

const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'fake-env',
  init() {},
  getWXContext() { return { OPENID: currentOpenid } },
  database() {
    return {
      command: { gt },
      collection: name => new Query(name),
      async createCollection(name) {
        if (tables[name]) throw new Error('collection already exists')
        tables[name] = []
      }
    }
  }
}

// 拦截云函数里的 require('wx-server-sdk')
const requireCjs = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk
  return origLoad.call(this, request, parent, isMain)
}

const loginFn = requireCjs(FN_PATH)
const main = loginFn.main

const DAY = 24 * 3600 * 1000

async function run() {
  // ---- 1. 首次领取 ----
  reset()
  currentOpenid = 'o_new_user'
  await main({ nickname: '小王', claimTrial: true })
  console.log('1) 首次登录领取')
  ok(tables.trial_grants.length === 1, 'trial_grants 记了一条')
  ok(tables.trial_grants[0]._id === 'o_new_user', '记录主键 = openid')
  const subs1 = tables.subscriptions.filter(s => s.openid === 'o_new_user')
  ok(subs1.length === 1, 'subscriptions 落了一条')
  ok(subs1[0].plan === 'trial', 'plan = trial')
  ok(subs1[0].status === 'active', 'status = active')
  ok(subs1[0].wx_transaction_id === 'trial:o_new_user', 'wx_transaction_id 唯一（避开残留唯一索引）')
  const d1 = subs1[0].expires_at - subs1[0].started_at
  ok(Math.abs(d1 - 7 * DAY) < 1000, `有效期正好 7 天（实际 ${(d1 / DAY).toFixed(3)} 天）`)
  ok(tables.trial_grants[0].expires_at === subs1[0].expires_at, '领取记录回填了到期日')

  // 返回体里 subscription 必须带上刚发的 trial，否则前端要等下一次刷新
  const res1 = await main({ claimTrial: true })
  console.log('2) 重复领取（同一 openid）')
  ok(res1.trial && res1.trial.granted === false, '第二次返回 granted=false')
  ok(res1.trial.reason === 'already_claimed', `原因 = already_claimed（实际 ${res1.trial.reason}）`)
  ok(tables.subscriptions.filter(s => s.openid === 'o_new_user').length === 1, '订阅没有被重复写入')
  ok(res1.subscription && res1.subscription.plan === 'trial', '返回的 subscription 仍带着试用身份')

  // ---- 3. 已有付费订阅 ----
  reset()
  currentOpenid = 'o_paid_user'
  tables.users.push({ _id: 'u2', openid: 'o_paid_user', nickname: '', avatarFileID: '' })
  tables.subscriptions.push({
    _id: 's_paid', openid: 'o_paid_user', plan: 'month', status: 'active',
    expires_at: Date.now() + 20 * DAY, started_at: Date.now()
  })
  const res3 = await main({ claimTrial: true })
  console.log('3) 已有付费订阅的用户')
  ok(res3.trial && res3.trial.granted === false, '不发放')
  ok(res3.trial.reason === 'has_subscription', `原因 = has_subscription（实际 ${res3.trial.reason}）`)
  ok(tables.subscriptions.length === 1, '订阅表没有多出一条')
  ok(tables.trial_grants.length === 0, '也没占用领取记录')

  // ---- 4. 入账失败要回滚 ----
  reset()
  currentOpenid = 'o_flaky'
  tables.users.push({ _id: 'u3', openid: 'o_flaky', nickname: '', avatarFileID: '' })
  failNextSubscriptionAdd = true
  const res4 = await main({ claimTrial: true })
  console.log('4) 入账失败回滚')
  ok(res4.trial && res4.trial.granted === false, '本次不发放')
  ok(res4.trial.reason === 'grant_failed', `原因 = grant_failed（实际 ${res4.trial.reason}）`)
  ok(tables.trial_grants.length === 0, '占位记录已回滚（用户下次还能领）')
  const res4b = await main({ claimTrial: true })
  ok(res4b.trial && res4b.trial.granted === true, '紧接着重试可以成功领到')

  // ---- 5. 静默刷新不产生写入 ----
  reset()
  currentOpenid = 'o_refresh'
  tables.users.push({ _id: 'u4', openid: 'o_refresh', nickname: '', avatarFileID: '' })
  const before = JSON.stringify(tables)
  const res5 = await main({})
  console.log('5) 不带 claimTrial 的静默刷新')
  ok(res5.trial === null, '返回 trial=null')
  ok(JSON.stringify(tables) === before, '数据库完全没有变化（refreshSubscription 不会误发）')

  console.log(`\n${fail === 0 ? '全部通过' : '有失败'}：${pass} 通过 / ${fail} 失败`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch(e => {
  console.error('harness error', e)
  process.exit(1)
})
