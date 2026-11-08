// ============================================================
// 兑换码核销 · 离线验证（含名额并发）
//
// 直接加载 cloudfunctions/redeem/index.js 的真实源码，用内存假库顶替
// wx-server-sdk，重点验证这几条：
//   1. 正常核销 → 权益落 subscriptions，used_count +1
//   2. 同一人重复核销 → code_used，且不能白吃名额（used_count 退回）
//   3. 单人码已被别人用掉 → code_exhausted
//   4. 两人并发抢同一个单人码 → 只有一个人拿到（原子占额）
//   5. max_uses=0 不限次数 → 多人全过
//   6. 停用 / 过期 / 不存在
//   7. 入账失败 → 名额与日志一起回滚，用户可以再试
//   8. 已有会员 → 到期日顺延
// ============================================================

import Module from 'module'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FN_PATH = path.resolve(__dirname, '../../cloudfunctions/redeem/index.js')

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`) }
}

// ---------- 内存假库 ----------
let seq = 0
let tables = {}
let openidQueue = []
let failNextSubscriptionAdd = false

function reset() {
  seq = 0
  tables = { redeem_codes: [], redeem_logs: [], subscriptions: [] }
  openidQueue = []
  failNextSubscriptionAdd = false
}

const gt = v => ({ __op: 'gt', val: v })
const lt = v => ({ __op: 'lt', val: v })
const inc = v => ({ __op: 'inc', val: v })

function matches(doc, q) {
  for (const k of Object.keys(q)) {
    const v = q[k]
    if (v && v.__op === 'gt') { if (!(Number(doc[k]) > v.val)) return false }
    else if (v && v.__op === 'lt') { if (!(Number(doc[k]) < v.val)) return false }
    else if (doc[k] !== v) return false
  }
  return true
}

function applyPatch(row, data) {
  for (const k of Object.keys(data)) {
    const v = data[k]
    if (v && v.__op === 'inc') row[k] = Number(row[k] || 0) + v.val
    else row[k] = v
  }
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
  // 条件更新：CloudBase 的 where().update() 返回 stats.updated
  async update({ data }) {
    if (!tables[this.name]) throw new Error(`collection ${this.name} not exists`)
    const rows = tables[this.name].filter(d => matches(d, this.q))
    for (const row of rows) applyPatch(row, data)
    return { stats: { updated: rows.length } }
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
        applyPatch(row, data)
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
  // 并发测试：按调用顺序分配 openid，模拟两个不同用户同时进来
  getWXContext() {
    const next = openidQueue.length > 1
      ? openidQueue.shift()
      : (openidQueue.length ? openidQueue[0] : '')
    return { OPENID: next }
  },
  database() {
    return {
      command: { gt, lt, inc },
      collection: name => new Query(name),
      async createCollection(name) {
        if (tables[name]) throw new Error('collection already exists')
        tables[name] = []
      }
    }
  }
}

const requireCjs = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk
  return origLoad.call(this, request, parent, isMain)
}

const main = requireCjs(FN_PATH).main
const DAY = 24 * 3600 * 1000

function addCode(over) {
  const doc = Object.assign({
    _id: `c_${++seq}`,
    code: 'WIO-TEST-0001',
    days: 30,
    max_uses: 1,
    used_count: 0,
    enabled: true,
    expires_at: 0
  }, over || {})
  tables.redeem_codes.push(doc)
  return doc
}

async function run() {
  // ---- 1. 正常核销 ----
  reset()
  openidQueue = ['o_a']
  const c1 = addCode({ days: 30, max_uses: 1 })
  const r1 = await main({ action: 'redeem', code: c1.code })
  console.log('1) 正常核销')
  ok(r1.ok === true, '返回 ok')
  ok(r1.days === 30, '天数 30')
  ok(tables.subscriptions.length === 1, 'subscriptions 落了一条')
  ok(tables.subscriptions[0].plan === 'code', 'plan = code')
  ok(tables.redeem_codes[0].used_count === 1, 'used_count = 1')
  ok(tables.redeem_logs.length === 1, '日志一条')
  ok(tables.redeem_logs[0]._id === 'o_a_WIO-TEST-0001', '日志主键 = openid_code')
  ok(tables.redeem_logs[0].expires_at > 0, '日志回填了到期日')

  // ---- 2. 同一人重复核销：必须退回名额 ----
  console.log('2) 同一人重复核销')
  const r2 = await main({ action: 'redeem', code: 'wio-test-0001' }) // 顺带验大小写容错
  ok(r2.ok === false && r2.code === 'code_used', `返回 code_used（实际 ${r2.code}）`)
  ok(tables.redeem_codes[0].used_count === 1, 'used_count 没有被二次消耗（仍为 1）')
  ok(tables.subscriptions.length === 1, '没有重复入账')

  // ---- 3. 单人码被别人用掉 ----
  console.log('3) 单人码已被占用')
  openidQueue = ['o_b']
  const r3 = await main({ action: 'redeem', code: c1.code })
  ok(r3.ok === false && r3.code === 'code_exhausted', `返回 code_exhausted（实际 ${r3.code}）`)
  ok(tables.subscriptions.length === 1, '没有给 B 发权益')

  // ---- 4. 并发抢同一个单人码 ----
  console.log('4) 两人并发抢单人码')
  reset()
  const c2 = addCode({ code: 'WIO-RACE-0001', max_uses: 1 })
  openidQueue = ['o_race_a', 'o_race_b']
  const [ra, rb] = await Promise.all([
    main({ action: 'redeem', code: c2.code }),
    main({ action: 'redeem', code: c2.code })
  ])
  const winners = [ra, rb].filter(r => r && r.ok)
  ok(winners.length === 1, `只有一个人成功（实际 ${winners.length}）`)
  ok(tables.redeem_codes[0].used_count === 1, `used_count 恰好 1（实际 ${tables.redeem_codes[0].used_count}）`)
  ok(tables.subscriptions.length === 1, '只发了一份权益')

  // ---- 5. 不限次数（max_uses=0）----
  console.log('5) max_uses=0 不限次数')
  reset()
  const c3 = addCode({ code: 'WIO-OPEN-0001', max_uses: 0, days: 7 })
  for (let i = 0; i < 5; i++) {
    openidQueue = [`o_free_${i}`]
    await main({ action: 'redeem', code: c3.code })
  }
  ok(tables.subscriptions.length === 5, `5 个人都领到（实际 ${tables.subscriptions.length}）`)
  ok(tables.redeem_codes[0].used_count === 0, '不限次数的码不做计数')

  // ---- 6. 停用 / 过期 / 不存在 ----
  console.log('6) 无效码')
  reset()
  addCode({ code: 'WIO-OFF-0001', enabled: false })
  openidQueue = ['o_x']
  const r6a = await main({ action: 'redeem', code: 'WIO-OFF-0001' })
  ok(r6a.ok === false && r6a.code === 'bad_code', `停用 → bad_code（实际 ${r6a.code}）`)

  reset()
  addCode({ code: 'WIO-EXP-0001', expires_at: Date.now() - 1000 })
  openidQueue = ['o_x']
  const r6b = await main({ action: 'redeem', code: 'WIO-EXP-0001' })
  ok(r6b.ok === false && r6b.code === 'code_expired', `过期 → code_expired（实际 ${r6b.code}）`)

  reset()
  openidQueue = ['o_x']
  const r6c = await main({ action: 'redeem', code: 'WIO-NONE-9999' })
  ok(r6c.ok === false && r6c.code === 'bad_code', `不存在 → bad_code（实际 ${r6c.code}）`)

  // ---- 7. 入账失败：名额与日志都要回滚 ----
  console.log('7) 入账失败回滚')
  reset()
  const c4 = addCode({ code: 'WIO-FAIL-0001', max_uses: 1 })
  openidQueue = ['o_fail']
  failNextSubscriptionAdd = true
  const r7 = await main({ action: 'redeem', code: c4.code })
  ok(r7.ok === false, '本次失败')
  ok(tables.redeem_codes[0].used_count === 0, `名额已退回（实际 ${tables.redeem_codes[0].used_count}）`)
  ok(tables.redeem_logs.length === 0, '日志已删除，用户还能重试')

  // 紧接着重试应该成功
  const r7b = await main({ action: 'redeem', code: 'WIO-FAIL-0001' })
  ok(r7b.ok === true, '重试成功')
  ok(tables.subscriptions.length === 1, '这次入账成功')

  // ---- 8. 已有会员顺延 ----
  console.log('8) 已有会员顺延')
  reset()
  const future = Date.now() + 10 * DAY
  tables.subscriptions.push({
    _id: 's_old', openid: 'o_vip', plan: 'month', status: 'active',
    started_at: Date.now(), expires_at: future
  })
  addCode({ code: 'WIO-VIP-0001', days: 30 })
  openidQueue = ['o_vip']
  const r8 = await main({ action: 'redeem', code: 'WIO-VIP-0001' })
  ok(r8.ok === true, '核销成功')
  const diff = r8.expiresAt - future
  ok(Math.abs(diff - 30 * DAY) < 2000, `在原到期日上加 30 天（实际 +${(diff / DAY).toFixed(2)} 天）`)

  // ---- 9. 无 openid ----
  console.log('9) 未登录调用')
  reset()
  openidQueue = ['']
  const r9 = await main({ action: 'redeem', code: 'WIO-X' })
  ok(r9.ok === false && r9.code === 'no_openid', `返回 no_openid（实际 ${r9.code}）`)

  // ---- 10. 发码接口未配置口令时关闭 ----
  console.log('10) issue 未配置口令')
  reset()
  const r10 = await main({ action: 'issue', token: 'anything', count: 1 })
  ok(r10.ok === false && r10.code === 'admin_disabled', `返回 admin_disabled（实际 ${r10.code}）`)

  console.log(`\n${fail === 0 ? '全部通过' : '存在失败'}：${pass} 通过 / ${fail} 失败`)
  if (fail > 0) process.exitCode = 1
}

run().catch(e => {
  console.error('运行异常：', e)
  process.exitCode = 1
})
