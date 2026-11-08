// ============================================================
// 订单列表动作 · 离线验证（pay 的 action: 'orders'）
//
// 这是「小程序订单中心」页的数据源，用户从微信钱包账单点进来会直接调它，
// 所以三件事必须成立：只给本人的单、只给展示字段、脏数据不能把页面搞坏。
//
// 运行：node .workbuddy/shared-check/orders.mjs
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

// ---------- 内存假库 ----------
let tables = {}
let currentOpenid = ''

function matches(doc, q) {
  for (const k of Object.keys(q)) {
    if (doc[k] !== q[k]) return false
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
}

const fakeDb = {
  createCollection: async () => { throw new Error('exists') },
  collection: (name) => new Query(name)
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init: () => {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: currentOpenid })
}

// 云函数有环境变量闸门，缺一个就直接返回 not_configured；这里给测试用的假值
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

function addOrder(patch) {
  tables.payment_orders.push({
    _id: 'id' + (tables.payment_orders.length + 1),
    openid: 'o_me',
    plan: 'month',
    product_id: 'secret_product_id',
    amount_fen: 600,
    status: 'paid',
    out_trade_no: 'WIO' + Date.now() + tables.payment_orders.length,
    wx_order_id: 'wx_secret_order',
    created_at: 1700000000000 + tables.payment_orders.length * 1000,
    paid_at: 1700000005000,
    ...patch
  })
}

console.log('\n1) 只返回本人订单')
reset()
addOrder({ created_at: 3000, out_trade_no: 'MINA1' })
addOrder({ created_at: 1000, out_trade_no: 'MINA2' })
addOrder({ created_at: 9000, out_trade_no: 'OTHER1', openid: 'o_someone_else' })
{
  const r = await handler({ action: 'orders' })
  if (!r.ok) console.log('    debug:', JSON.stringify(r))
  ok(r.ok === true, '返回 ok')
  ok(r.orders.length === 2, '别人的订单不出现在列表里', r.orders.length)
  ok(!r.orders.some((o) => o.outTradeNo === 'OTHER1'), '确认没有越权数据')
}

console.log('\n2) 按下单时间倒序')
{
  const r = await handler({ action: 'orders' })
  ok(r.orders[0].outTradeNo === 'MINA1', '最新的排第一', r.orders.map((o) => o.outTradeNo))
  ok(r.orders[1].outTradeNo === 'MINA2', '旧的排第二')
}

console.log('\n3) 只回传展示字段（敏感字段不出服务端）')
{
  const r = await handler({ action: 'orders' })
  const keys = Object.keys(r.orders[0]).sort()
  ok(!keys.includes('openid'), '不含 openid')
  ok(!keys.includes('product_id'), '不含 product_id')
  ok(!keys.includes('wx_order_id'), '不含 wx_order_id')
  ok(keys.join(',') === 'amountFen,createdAt,outTradeNo,paidAt,plan,refundStatus,refundedAt,status',
    '字段集合就是展示所需的那八个', keys)
}

console.log('\n4) 脏数据与边界')
{
  reset()
  addOrder({ out_trade_no: '' })
  addOrder({ out_trade_no: 'OK1' })
  addOrder({ amount_fen: undefined })
  const r = await handler({ action: 'orders' })
  ok(r.orders.length === 2, '没有订单号的脏记录被过滤掉', r.orders.length)
  ok(r.orders.some((o) => o.amountFen === 0), '金额缺失按 0 返回，不返回 NaN')
  ok(r.orders.every((o) => Number.isFinite(o.createdAt)), '时间缺失也返回数字')
}

{
  reset()
  for (let i = 0; i < 60; i++) addOrder({ created_at: 1000 + i })
  const r = await handler({ action: 'orders', limit: 999 })
  ok(r.orders.length === 50, 'limit 上限压到 50，不会被刷爆', r.orders.length)
  const r2 = await handler({ action: 'orders', limit: 3 })
  ok(r2.orders.length === 3, 'limit 生效', r2.orders.length)
}

console.log('\n5) 未登录直接拒')
{
  reset()
  currentOpenid = ''
  const r = await handler({ action: 'orders' })
  ok(r.ok === false && r.code === 'no_openid', '无 openid 返回 no_openid', r.code)
}

Module._load = origLoad
console.log('\n' + '─'.repeat(46))
console.log(`通过 ${pass} 条，失败 ${fail} 条`)
if (fail > 0) process.exit(1)
