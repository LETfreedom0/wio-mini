// ============================================================
// 退款链路 · 离线验证
//
// 直接加载 cloudfunctions/pay/index.js 真实源码，用内存假库顶替
// wx-server-sdk、用假 https 顶替出网请求，验证：
//   1. 首单发货 → subscriptions 一条 active
//   2. 第二笔在同一条链上顺延
//   3. 查单 status=5 → 订单 refunded + 订阅 revoked
//   4. 退前一笔时，后面的顺延段要整体前移（否则白送时长）
//   5. 重复退款推送幂等：不会二次前移
//   6. refundinfo 反映真实状态（退款后剩余 0 天）
//   7. refund 动作客户端不可调用、金额与状态校验
// ============================================================

import { createRequire } from 'module'
import Module from 'module'
import { EventEmitter } from 'events'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FN_PATH = path.resolve(__dirname, '../../cloudfunctions/pay/index.js')
const DAY = 24 * 3600 * 1000

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`) }
}

// ---------- 内存假库 ----------
let seq = 0
let tables = {}
let currentOpenid = ''

const OP = {
  gt: v => ({ __op: 'gt', val: v }),
  inc: v => ({ __op: 'inc', val: v })
}

function reset() {
  seq = 0
  tables = { payment_orders: [], subscriptions: [], sys_cache: [] }
  currentOpenid = ''
}

function matches(doc, q) {
  for (const k of Object.keys(q)) {
    const v = q[k]
    if (v && v.__op === 'gt') { if (!(Number(doc[k]) > v.val)) return false }
    else if (doc[k] !== v) return false
  }
  return true
}

function applyData(row, data) {
  for (const k of Object.keys(data)) {
    const v = data[k]
    if (v && v.__op === 'inc') row[k] = Number(row[k] || 0) + v.val
    else row[k] = v
  }
}

class Query {
  constructor(name) { this.name = name; this.q = {}; this._limit = 100; this._order = null }
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
    const id = data._id || `id_${++seq}`
    if (data._id && tables[this.name].some(d => d._id === data._id)) {
      const e = new Error('duplicate key')
      e.errCode = -502001
      throw e
    }
    tables[this.name].push({ ...data, _id: id })
    return { _id: id }
  }

  // 批量更新（pay 回收权益后前移顺延段用的就是这个）
  async update({ data }) {
    if (!tables[this.name]) throw new Error(`collection ${this.name} not exists`)
    const rows = tables[this.name].filter(d => matches(d, this.q))
    rows.forEach(r => applyData(r, data))
    return { stats: { updated: rows.length } }
  }

  doc(id) {
    const name = this.name
    return {
      async get() {
        const row = tables[name].find(d => d._id === id)
        if (!row) throw new Error('doc not found')
        return { data: { ...row } }
      },
      async set({ data }) {
        const row = tables[name].find(d => d._id === id)
        if (row) Object.assign(row, data)
        else tables[name].push({ ...data, _id: id })
        return { stats: { updated: 1 } }
      },
      async update({ data }) {
        const row = tables[name].find(d => d._id === id)
        if (!row) throw new Error('doc not found')
        applyData(row, data)
        return { stats: { updated: 1 } }
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
      command: OP,
      collection: name => new Query(name),
      async createCollection(name) {
        if (tables[name]) throw new Error('collection already exists')
        tables[name] = []
      }
    }
  },
  async callFunction() { throw new Error('not used in this test') }
}

// ---------- 假 https：只认几个固定路径 ----------
const net = { orderStatus: 2, refundErr: 0, calls: [] }

function route(pathname, body) {
  if (pathname.indexOf('/cgi-bin/token') === 0 || pathname.indexOf('/cgi-bin/stable_token') === 0) {
    return { access_token: 'TK', expires_in: 7200 }
  }
  if (pathname.indexOf('/sns/jscode2session') === 0) {
    return { session_key: 'SK' }
  }
  if (pathname.indexOf('/xpay/query_order') === 0) {
    let orderId = ''
    try { orderId = JSON.parse(body || '{}').order_id || '' } catch (e) { /* ignore */ }
    return { errcode: 0, order: { status: net.orderStatus, wx_order_id: 'WX_' + orderId } }
  }
  if (pathname.indexOf('/xpay/refund_order') === 0) {
    return net.refundErr ? { errcode: net.refundErr, errmsg: 'mock refund error' } : { errcode: 0 }
  }
  return { errcode: 0 }
}

const fakeHttps = {
  request(opts, cb) {
    const req = new EventEmitter()
    let body = ''
    req.write = (b) => { body += b }
    req.end = () => {
      const res = new EventEmitter()
      res.statusCode = 200
      net.calls.push({ path: opts.path, body })
      setImmediate(() => {
        res.emit('data', JSON.stringify(route(opts.path || '', body)))
        res.emit('end')
      })
      cb(res)
    }
    return req
  }
}

// 拦截 require
const requireCjs = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk
  if (request === 'https') return fakeHttps
  return origLoad.call(this, request, parent, isMain)
}

process.env.VIRTUAL_PAY_APPKEY = 'test-appkey'
process.env.WX_APP_SECRET = 'test-secret'
process.env.VIRTUAL_PAY_ITEM_MONTH = 'wio_pro_month'
process.env.VIRTUAL_PAY_ITEM_YEAR = 'wio_pro_year'

const payFn = requireCjs(FN_PATH)
const main = payFn.main

const OPENID = 'o_refund_user'

function seedOrder(id, outTradeNo, plan, amountFen) {
  tables.payment_orders.push({
    _id: id,
    openid: OPENID,
    out_trade_no: outTradeNo,
    plan,
    amount_fen: amountFen,
    status: 'pending',
    created_at: Date.now()
  })
}

function subs() { return tables.subscriptions.slice().sort((a, b) => a.started_at - b.started_at) }
function order(id) { return tables.payment_orders.find(o => o._id === id) }

async function run() {
  // ---------- 1. 首单发货 ----------
  reset()
  seedOrder('o1', 'WIO1', 'month', 600)
  net.orderStatus = 2
  let r = await main({ action: 'verify', openid: OPENID, outTradeNo: 'WIO1' })
  console.log('1) 首单发货')
  ok(r.ok && r.paid, '查单确认已支付后返回 paid')
  ok(tables.subscriptions.length === 1, 'subscriptions 落了一条')
  ok(subs()[0].status === 'active', '订阅状态 active')
  ok(order('o1').status === 'paid', '订单状态改为 paid')

  const firstExp = subs()[0].expires_at
  ok(Math.abs(firstExp - (Date.now() + 30 * DAY)) < 10000, '月卡有效期约 30 天', new Date(firstExp).toISOString())

  // ---------- 2. 第二笔顺延 ----------
  seedOrder('o2', 'WIO2', 'month', 600)
  await main({ action: 'verify', openid: OPENID, outTradeNo: 'WIO2' })
  console.log('2) 第二笔顺延')
  ok(tables.subscriptions.length === 2, '第二条订阅已落库')
  ok(subs()[1].expires_at - firstExp === 30 * DAY, '到期日在上一笔基础上顺延 30 天')

  const secondExpBefore = subs()[1].expires_at

  // ---------- 3. 退第一笔 ----------
  net.orderStatus = 5
  r = await main({ action: 'verify', openid: OPENID, outTradeNo: 'WIO1' })
  console.log('3) 退第一笔（查单 status=5）')
  ok(r.ok && r.refunded === true, '返回 refunded=true')
  ok(r.revoked === true, '同时收回这笔买的权益')
  ok(order('o1').status === 'refunded', '订单标记 refunded')
  ok(subs()[0].status === 'revoked', '对应订阅置为 revoked')

  const secondExpAfter = subs()[1].expires_at
  ok(secondExpBefore - secondExpAfter === 30 * DAY, '后一笔顺延段整体前移 30 天',
    `前 ${new Date(secondExpBefore).toISOString()} → 后 ${new Date(secondExpAfter).toISOString()}`)
  ok(secondExpAfter === firstExp, '前移后正好等于被退那笔的原到期日')

  // ---------- 4. 重复推送幂等 ----------
  r = await main({ action: 'verify', openid: OPENID, outTradeNo: 'WIO1' })
  console.log('4) 重复退款推送')
  ok(r.ok && r.refunded, '重复推送仍返回成功（平台不会无限重试）')
  ok(subs()[1].expires_at === secondExpAfter, '顺延段没有被二次前移')

  // ---------- 5. refundinfo ----------
  console.log('5) 退款问询取数')
  net.orderStatus = 5
  const info1 = await main({ action: 'refundinfo', orderRef: 'WIO1' })
  ok(info1.ok && info1.found, '按商户单号能查到订单')
  ok(info1.refunded === true, '已退款订单 refunded=true')
  ok(info1.remainDays === 0, '已退款订单剩余天数按 0 报（不会被误判成还能用）')

  const info2 = await main({ action: 'refundinfo', orderRef: 'WIO2' })
  ok(info2.delivered === true && info2.remainDays > 25, '未退款订单仍有剩余天数')
  ok(info2.refunded === false, '未退款订单 refunded=false')

  const info3 = await main({ action: 'refundinfo', orderRef: 'WX_WIO2' })
  ok(info3.ok && info3.found, '按平台单号也能查到订单')

  // ---------- 6. refund 动作鉴权 ----------
  console.log('6) refund 动作')
  seedOrder('o3', 'WIO3', 'year', 4800)
  net.orderStatus = 2
  await main({ action: 'verify', openid: OPENID, outTradeNo: 'WIO3' })

  currentOpenid = 'o_client'
  let fr = await main({ action: 'refund', outTradeNo: 'WIO3' })
  ok(fr.ok === false && fr.code === 'forbidden', '小程序端调用被拒（带 OPENID）')

  currentOpenid = ''
  fr = await main({ action: 'refund', outTradeNo: 'WIO3', refundFee: 9999 })
  ok(fr.ok === false && fr.code === 'bad_fee', '退款金额超过订单金额被拒')

  seedOrder('o4', 'WIO4', 'month', 600)
  fr = await main({ action: 'refund', outTradeNo: 'WIO4' })
  ok(fr.ok === false && fr.code === 'not_paid', '未支付订单不可退款')

  net.refundErr = 0
  fr = await main({ action: 'refund', outTradeNo: 'WIO3', reason: 3 })
  ok(fr.ok === true, '服务端调用可发起退款')
  ok(order('o3').refund_status === 'pending', '订单记录 refund_status=pending')
  ok(!!order('o3').refund_order_id, '生成退款单号')

  fr = await main({ action: 'refund', outTradeNo: 'WIO3' })
  ok(fr.ok === false && fr.code === 'refund_pending', '退款处理中的订单不会重复提交')

  console.log('')
  console.log(`通过 ${pass} 条，失败 ${fail} 条`)
  if (fail > 0) process.exitCode = 1
}

run().catch(e => {
  console.error('运行异常:', e)
  process.exitCode = 1
})
