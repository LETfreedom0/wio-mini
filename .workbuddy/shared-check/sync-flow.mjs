// ============================================================
// 同步链路端到端断言（离线模拟云数据库 + 乐观锁）
// 运行：node .workbuddy/shared-check/sync-flow.mjs
//
// 目的：验证「本地改动一定推得上去，绝不会被云端旧值静默覆盖」。
// 做法：把 syncService.js 真身的 import 换成桩，注入假 callFunction
//       实现与 cloudfunctions/sync/index.js 一致的 pull/push 乐观锁；
//       setTimeout 接管成手动触发，精确模拟 3s 防抖与推送并发。
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }

// ---------- 环境：本地 storage / 事件总线 ----------
function makeEnv() {
  const store = {}
  const events = []
  globalThis.uni = {
    getStorageSync: k => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = String(v) },
    removeStorageSync: k => { delete store[k] },
    $emit: (name, payload) => events.push({ name, payload }),
    $on: () => {},
    $off: () => {}
  }
  return {
    store, events,
    read(k) { try { return JSON.parse(store[k] || '{}') } catch (e) { return {} } },
    write(k, v) { store[k] = JSON.stringify(v) },
    login(v) { store.wio_auth = v ? JSON.stringify({ user: { openid: 'test-openid' } }) : '' }
  }
}

// ---------- 云端：与 sync 云函数同构 ----------
function makeCloud() {
  let row = null
  let holdPush = null
  let releaseFn = null
  const calls = []
  return {
    calls,
    seed(data, version) { row = { data, data_version: version } },
    row: () => row,
    hold() { holdPush = new Promise(r => { releaseFn = r }) },
    release() { if (releaseFn) { releaseFn(); releaseFn = null } },
    async callCloud(name, arg) {
      calls.push(arg.action)
      if (arg.action === 'pull') {
        if (!row) return { ok: true, exists: false, subscription: null }
        return { ok: true, exists: true, data: row.data, data_version: row.data_version, synced_time: 't', subscription: null }
      }
      if (arg.action === 'push') {
        const cur = row ? row.data_version : 0
        if (!arg.force && (arg.base_version || 0) !== cur) {
          throw { ok: false, conflict: true, cloudData: row ? row.data : null, data_version: cur, synced_time: 't' }
        }
        if (holdPush) { await holdPush; holdPush = null }
        row = { data: arg.data, data_version: cur + 1 }
        return { ok: true, data_version: cur + 1, synced_time: 't' }
      }
      throw { ok: false, code: 'bad_action' }
    }
  }
}

// ---------- 加载 syncService 真身（import 换成桩） ----------
async function loadSync(env, cloud) {
  let src = fs.readFileSync(path.join(root, 'utils/syncService.js'), 'utf8')
  src = src.replace(/^import .*$/gm, '')
  const stub = `
const callCloud = globalThis.__callCloud;
const isCloudAvailable = () => true;
const isLogin = () => globalThis.__isLogin();
const updateCachedSubscription = () => {};
const isProUser = () => true;
const APP_VERSION = 'test';
`
  const entry = path.join(here, '.sync-entry.mjs')
  fs.writeFileSync(entry, stub + src, 'utf8')
  globalThis.__callCloud = cloud.callCloud.bind(cloud)
  globalThis.__isLogin = () => !!env.store.wio_auth
  const m = await import(pathToFileURL(path.join(here, '.sync-entry.mjs')).href + '?v=' + Math.random())
  fs.rmSync(entry, { force: true })
  return m
}

// ---------- 接管定时器 ----------
let timers = []
globalThis.setTimeout = (fn, ms) => { const id = { fn, ms, alive: true }; timers.push(id); return id }
globalThis.clearTimeout = (id) => { if (id) id.alive = false }
async function fireTimers() {
  const due = timers.filter(t => t.alive)
  timers = []
  for (const t of due) if (t.alive) await t.fn()
}

async function scenario(name, fn) {
  timers = []
  const env = makeEnv()
  const cloud = makeCloud()
  env.login(true)
  env.write('wio_settings', { autoSync: true })
  env.write('wio_entries', {})
  env.write('wio_overtime', {})
  const s = await loadSync(env, cloud)
  try { await fn({ env, cloud, s }) } catch (e) { fails.push(`${name} 抛异常: ${e && (e.stack || e)}`) }
  console.log(`  · ${name}`)
}

const baseSnapshot = () => ({ settings: { autoSync: true }, entries: {}, overtime: {} })

// S1 正常：改历史数据 → 3s 防抖推上去
await scenario('S1 正常推送', async ({ env, cloud, s }) => {
  cloud.seed(baseSnapshot(), 1)
  env.write('wio_sync_state', { dataVersion: 1, dirty: false })
  env.write('wio_entries', { '2026-09-03': 'company' })
  s.markDirty()
  ok(env.read('wio_sync_state').dirty === true, '本地改动必须标脏')
  await fireTimers()
  ok(cloud.row().data.entries['2026-09-03'] === 'company', '云端应收到历史数据修改')
  ok(env.read('wio_sync_state').dirty === false, '推送成功后应清脏')
  ok(env.read('wio_sync_state').dataVersion === 2, '推送成功后应抬高本地版本')
})

// S2 改完立刻切回前台（pull 早于 3s 防抖）：绝不能反向覆盖
await scenario('S2 改完立刻切回前台', async ({ env, cloud, s }) => {
  cloud.seed(baseSnapshot(), 1)
  env.write('wio_sync_state', { dataVersion: 1, dirty: false })
  env.write('wio_entries', { '2026-08-11': 'home' })
  s.markDirty()
  await s.pull()
  ok(cloud.row().data.entries['2026-08-11'] === 'home', 'pull 遇脏数据应改为上传，而不是下拉')
  ok(env.read('wio_entries')['2026-08-11'] === 'home', '本地历史改动不能被覆盖')
})

// S3 云端版本更高 + 本地有脏数据：必须走冲突，不能静默下拉
await scenario('S3 双方都改过', async ({ env, cloud, s }) => {
  cloud.seed({ settings: { autoSync: true }, entries: { '2026-10-01': 'company' }, overtime: {} }, 7)
  env.write('wio_sync_state', { dataVersion: 6, dirty: false })
  env.write('wio_entries', { '2026-07-20': 'home' })
  s.markDirty()
  const r = await s.pull()
  ok(r.conflict === true, '两端都改过应判冲突')
  ok(env.read('wio_entries')['2026-07-20'] === 'home', '冲突期间本地改动不能被覆盖')
  ok(s.hasPendingConflict() === true, 'App 层兜底探针要能发现未被接管的冲突')
  ok(!!s.takePendingConflict(), '冲突必须暂存，等页面接管')
  ok(s.hasPendingConflict() === false, '页面取走后不该再重复提示')
})

// S4 【竞态】push 尚未返回时又改一条历史数据
await scenario('S4 推送途中的二次修改', async ({ env, cloud, s }) => {
  cloud.seed(baseSnapshot(), 1)
  env.write('wio_sync_state', { dataVersion: 1, dirty: false })
  env.write('wio_entries', { '2026-06-01': 'company' })
  s.markDirty()
  cloud.hold()
  const p1 = s.push()               // 打包的是只含 6/1 的旧快照，云端挂起
  env.write('wio_entries', { '2026-06-01': 'company', '2026-06-02': 'home' })
  s.markDirty()                     // 推送期间又改了 6/2
  cloud.release()
  await p1
  ok(cloud.row().data.entries['2026-06-02'] === undefined, '第一次上传的是旧快照（预期）')
  ok(env.read('wio_sync_state').dirty === true, '★ 推送期间的新改动必须保持脏标记等待补推')
  await fireTimers()
  ok(cloud.row().data.entries['2026-06-02'] === 'home', '★ 后续必须把新改动补推上去')
})

// S5 【漏标脏兜底】写入路径万一没打 markDirty，也不能被云端静默覆盖
await scenario('S5 未标脏的改动', async ({ env, cloud, s }) => {
  cloud.seed(baseSnapshot(), 1)
  env.write('wio_sync_state', { dataVersion: 1, dirty: false })
  // 先成功同步一次，建立「上次同步基线」
  env.write('wio_entries', { '2026-05-01': 'company' })
  s.markDirty()
  await fireTimers()
  ok(cloud.row().data.entries['2026-05-01'] === 'company', '基线同步成功')
  // 另一台设备推了一版（云端版本变高），本机又直接改了历史且没标脏
  cloud.seed({ settings: { autoSync: true }, entries: { '2026-05-01': 'company' }, overtime: {} }, 3)
  env.write('wio_entries', { '2026-05-01': 'company', '2026-04-09': 'home' })
  const r = await s.pull()
  ok(env.read('wio_entries')['2026-04-09'] === 'home', '★ 未标脏的本地改动不能被下拉覆盖')
  ok(r.conflict === true && !!s.takePendingConflict(), '★ 应转交冲突弹窗由用户裁决，而不是静默下拉')
  // 用户在弹窗里选「使用本机」：本地改动必须原样推上云端
  await s.resolveConflict('local', { cloudVersion: 3 })
  ok(cloud.row().data.entries['2026-04-09'] === 'home', '★ 选本机后历史改动要能推上去')
})

// S6 正常恢复：本地干净、云端更新时，仍要能拉下来
await scenario('S6 正常恢复', async ({ env, cloud, s }) => {
  cloud.seed({ settings: { autoSync: true }, entries: { '2026-03-03': 'home' }, overtime: {} }, 5)
  env.write('wio_sync_state', { dataVersion: 4, dirty: false })
  const r = await s.pull()
  ok(r.action === 'restored', '本地干净且云端更新时应正常恢复')
  ok(env.read('wio_entries')['2026-03-03'] === 'home', '云端数据应写入本地')
})

console.log(`\n通过 ${pass} 条，失败 ${fails.length} 条`)
fails.forEach(f => console.log('  ✗ ' + f))
if (fails.length) process.exitCode = 1
