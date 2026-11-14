// ============================================================
// 看广告换 PRO 体验 · 离线验证（pay 的 action: 'adReward'）
//
// 权益只能由服务端发放，客户端 isEnded 可伪造——所以这个动作的
// 安全边界全在云函数里：已拥有有效会员拒绝、终身上限 3 次、
// 发放写入 subscriptions（plan:'ad'）。这些规则在这里逐条验证。
//
// 运行：node .workbuddy/shared-check/adreward.mjs
// ============================================================

import Module from 'module'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FN_PATH = path.resolve(__dirname, '../../cloudfunctions/pay/index.js')

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`) }
}

// ---------- 内存假库（支持 gt 比较 / count） ----------
let tables = {}
let currentOpenid = ''

function matches(doc, q) {
  for (const k of Object.keys(q)) {
    const want = q[k]
    if (want && typeof want === 'object' && want.__gt !== undefined) {
      if (!(Number(doc[k]) > want.__gt)) return false
    } else if (doc[k] !== want) {
      return false
    }
  }
  return true
}

class Query {
  constructor(name) { this.name = name; this.q = {}; this._limit = 100 }
  where(q) { this.q = { ...this.q, ...q }; return this }
  limit(n) { this._limit = n; return this }
  orderBy() { return this }
  async get() {
    if (!tables[this.name]) throw new Error(`collection ${this.name} not exists`)
    const rows = tables[this.name].filter((d) => matches(d, this.q))
    return { data: rows.slice(0, this._limit).map((r) => ({ ...r })) }
  }
  async count() {
    if (!tables[this.name]) throw new Error(`collection ${this.name} not exists`)
    return { total: tables[this.name].filter((d) => matches(d, this.q)).length }
  }
  async add({ data }) {
    tables[this.name].push({ _id: this.name + '_' + (tables[this.name].length + 1), ...data })
    return { _id: data._id || 'new' }
  }
}

const fakeDb = {
  createCollection: async () => { throw new Error('exists') },
  command: { gt: (v) => ({ __gt: v }) },
  collection: (name) => new Query(name)
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init: () => {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: currentOpenid })
}

process.env.VIRTUAL_PAY_APPKEY = 'test_appkey'
process.env.WX_APP_SECRET = 'test_secret'
process.env.VIRTUAL_PAY_ITEM_MONTH = 'test_month_item'
process.env.VIRTUAL_PAY_ITEM_YEAR = 'test_year_item'

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeCloud
  return origLoad.apply(this, arguments)
}

const mod = require(FN_PATH)
const handler = mod.main || mod

function reset() {
  tables = { payment_orders: [], subscriptions: [], sys_cache: [] }
  currentOpenid = 'o_me'
}

const DAY_MS = 24 * 3600 * 1000

console.log('\n1) 正常发放')
reset()
{
  const t0 = Date.now()
  const r = await handler({ action: 'adReward' })
  ok(r.ok === true, '发放成功', r)
  ok(r.plan === 'ad' && r.days === 3, 'plan=ad，3 天', r)
  ok(r.expiresAt >= t0 + 3 * DAY_MS - 2000 && r.expiresAt <= t0 + 3 * DAY_MS + 2000, '到期时间 = now + 3 天', r.expiresAt - t0)
  ok(r.remaining === 2, '剩余次数 2', r.remaining)
  const row = tables.subscriptions[0]
  ok(row && row.openid === 'o_me' && row.status === 'active', 'subscriptions 写入 active 行')
  ok(row.source === 'ad' && row.plan === 'ad', '来源标记 ad，便于审计')
  ok(!!row.wx_transaction_id && !!row.wx_order_id, '唯一索引字段都写上了（历史索引的坑）')
}

console.log('\n2) 已有有效会员 → 拒绝')
reset()
{
  tables.subscriptions.push({ openid: 'o_me', plan: 'month', status: 'active', expires_at: Date.now() + 10 * DAY_MS })
  const r = await handler({ action: 'adReward' })
  ok(r.ok === false && r.code === 'has_pro', '有效期内拒绝发放', r)
  ok(tables.subscriptions.length === 1, '没有多写行')
}
{
  // 过期的不算有效会员
  reset()
  tables.subscriptions.push({ openid: 'o_me', plan: 'month', status: 'active', expires_at: Date.now() - DAY_MS })
  const r = await handler({ action: 'adReward' })
  ok(r.ok === true, '过期订阅不算有效会员，可以体验', r.code)
}

console.log('\n3) 终身上限 3 次')
reset()
{
  for (let i = 0; i < 3; i++) {
    const r = await handler({ action: 'adReward' })
    ok(r.ok === true, `第 ${i + 1} 次发放成功`)
    // 每次发完立刻「过期」，模拟体验期结束后再来领
    const row = tables.subscriptions[tables.subscriptions.length - 1]
    row.expires_at = Date.now() - 1000
  }
  const r4 = await handler({ action: 'adReward' })
  ok(r4.ok === false && r4.code === 'limit_reached', '第 4 次被限额拦下', r4)
  ok(r4.used === 3, '限额按历史行数计', r4.used)
  ok(tables.subscriptions.length === 3, '没有偷偷写第 4 行')
}

console.log('\n4) 限额计入所有 ad 行（含 revoked）')
reset()
{
  tables.subscriptions.push({ openid: 'o_me', plan: 'ad', status: 'revoked', expires_at: Date.now() - DAY_MS })
  tables.subscriptions.push({ openid: 'o_me', plan: 'ad', status: 'revoked', expires_at: Date.now() - 2 * DAY_MS })
  tables.subscriptions.push({ openid: 'o_me', plan: 'ad', status: 'revoked', expires_at: Date.now() - 3 * DAY_MS })
  const r = await handler({ action: 'adReward' })
  ok(r.ok === false && r.code === 'limit_reached', '撤销过的体验也占终身额度', r)
}

console.log('\n5) 用户隔离')
reset()
{
  tables.subscriptions.push({ openid: 'o_other', plan: 'ad', status: 'revoked', expires_at: 1 })
  tables.subscriptions.push({ openid: 'o_other', plan: 'ad', status: 'revoked', expires_at: 2 })
  tables.subscriptions.push({ openid: 'o_other', plan: 'ad', status: 'revoked', expires_at: 3 })
  const r = await handler({ action: 'adReward' })
  ok(r.ok === true, '别人的 3 次不影响自己', r.code)
  currentOpenid = ''
  const r2 = await handler({ action: 'adReward' })
  ok(r2.ok === false && r2.code === 'no_openid', '无 openid 拒绝', r2.code)
}

console.log(`\nadreward: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
