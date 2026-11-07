// ============================================================
// 云同步（手动模式）断言
// 运行：node .workbuddy/shared-check/sync-flow.mjs
//
// 验证四件事：
//   1. 没有任何后台自动同步（markDirty 不发请求）
//   2. 只读检查不动本地数据
//   3. 差异算得准，合并上传不删云端独有记录
//   4. 恢复可撤销、乐观锁不会硬推
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }

// ---------- 环境：本地 storage ----------
function makeEnv() {
  const store = {}
  globalThis.uni = {
    getStorageSync: k => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = String(v) },
    removeStorageSync: k => { delete store[k] },
    $emit: () => {},
    $on: () => {},
    $off: () => {}
  }
  return {
    store,
    read(k) { try { return JSON.parse(store[k] || '{}') } catch (e) { return {} } },
    write(k, v) { store[k] = JSON.stringify(v) },
    login() { store.wio_auth = JSON.stringify({ user: { openid: 'test-openid' } }) },
    has(k) { return k in store }
  }
}

// ---------- 云端：与 sync 云函数同构 ----------
function makeCloud() {
  let row = null
  const calls = []
  return {
    calls,
    failPush: false,
    seed(data, version) { row = { data, data_version: version, synced_time: '2026-11-01T00:00:00Z' } },
    peek() { return row },
    async callCloud(name, arg) {
      calls.push(arg)
      if (arg.action === 'pull') {
        if (!row) return { ok: true, exists: false, data_version: 0, synced_time: null, subscription: null }
        return {
          ok: true, exists: true, data: row.data,
          data_version: row.data_version, synced_time: row.synced_time, subscription: null
        }
      }
      if (arg.action === 'push') {
        if (this.failPush) throw { error: 'cloud_call_failed' }
        const cur = row ? row.data_version : 0
        if (!arg.force && (arg.base_version || 0) !== cur) {
          throw { ok: false, conflict: true, cloudData: row ? row.data : null, data_version: cur, synced_time: 'T' }
        }
        row = { data: arg.data, data_version: cur + 1, synced_time: '2026-11-07T00:00:00Z' }
        return { ok: true, data_version: cur + 1, synced_time: row.synced_time }
      }
      throw { ok: false, code: 'bad_action' }
    }
  }
}

// ---------- 加载 syncService 真身（import 换成桩） ----------
async function loadSync(cloud) {
  let src = fs.readFileSync(path.join(root, 'utils/syncService.js'), 'utf8')
  src = src.replace(/^import .*$/gm, '')
  const stub = `
const callCloud = globalThis.__callCloud;
const isCloudAvailable = () => true;
const isLogin = () => globalThis.__isLogin();
const updateCachedSubscription = () => {};
const APP_VERSION = 'test';
`
  const entry = path.join(here, '.sync-entry.mjs')
  fs.writeFileSync(entry, stub + src, 'utf8')
  globalThis.__callCloud = cloud.callCloud.bind(cloud)
  globalThis.__isLogin = () => true
  const m = await import(pathToFileURL(entry).href + '?v=' + Math.random())
  fs.rmSync(entry, { force: true })
  return m
}

async function scenario(name, fn) {
  const env = makeEnv()
  const cloud = makeCloud()
  env.login()
  env.write('wio_settings', { language: 'zh-CN' })
  env.write('wio_entries', {})
  env.write('wio_overtime', {})
  const s = await loadSync(cloud)
  try { await fn({ env, cloud, s }) } catch (e) {
    fails.push(`${name} 抛异常: ${e && (e.stack || e)}`)
  }
  console.log(`  · ${name}`)
}

const snap = (entries, extra) => ({
  settings: Object.assign({ language: 'zh-CN' }, (extra && extra.settings) || {}),
  entries: entries || {},
  overtime: (extra && extra.overtime) || {}
})

// ---------- A. 不再有任何自动同步 ----------

await scenario('A1 markDirty 不发任何请求', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-11-01': 'company' })
  s.markDirty()
  ok(cloud.calls.length === 0, '★ 标脏不能触发网络请求（同步必须手动）')
  ok(env.read('wio_sync_state').dirty === true, '应记下「本机有未同步改动」')
})

await scenario('A2 改了数据也不会自己上传', async ({ env, cloud, s }) => {
  cloud.seed(snap({}), 3)
  env.write('wio_entries', { '2026-10-01': 'home' })
  s.markDirty()
  await new Promise(r => setTimeout(r, 10))
  ok(cloud.calls.length === 0, '★ 后台不得自动上传')
  ok(cloud.peek().data.entries['2026-10-01'] === undefined, '云端不应被改动')
})

// ---------- B. 只读检查 ----------

await scenario('B1 checkRemote 只读', async ({ env, cloud, s }) => {
  cloud.seed(snap({ '2026-09-01': 'vacation' }), 7)
  env.write('wio_entries', { '2026-08-01': 'company' })
  const r = await s.checkRemote()
  ok(r.ok && r.exists, '应能读到云端存在')
  ok(r.localCount === 1, '本机条数应为 1')
  ok(r.remoteCount === 1, '云端条数应为 1')
  ok(env.read('wio_entries')['2026-08-01'] === 'company', '★ 只读检查绝不能改本机数据')
  ok(env.read('wio_entries')['2026-09-01'] === undefined, '★ 也不能把云端数据写下来')
  ok(env.read('wio_sync_state').remoteCount === 1, '应缓存云端条数供卡片显示')
})

await scenario('B2 云端没数据时不算「更新」', async ({ env, cloud, s }) => {
  const r = await s.checkRemote()
  ok(r.ok && r.exists === false, '应返回云端为空')
  ok(r.remoteNewer === false, '空云端不能标成「有更新」')
})

// ---------- C. 差异计算 ----------

await scenario('C1 差异分类准确', async ({ env, cloud, s }) => {
  env.write('wio_sync_base', { __v: 1, settings: { language: 'zh-CN' }, entries: { '2026-01-01': 'company', '2026-01-02': 'home' }, overtime: {} })
  env.write('wio_entries', { '2026-01-01': 'vacation' })
  cloud.seed(snap({ '2026-01-01': 'company', '2026-01-02': 'home', '2026-01-03': 'sick', '2026-01-04': 'company' }), 4)

  const r = await s.prepareUpload()
  ok(r.ok, '应能算出差异')
  const p = r.plan
  const keys = arr => arr.map(x => x.key).sort().join(',')
  ok(keys(p.bothDiffer) === '2026-01-01', '★ 两边都有但不同 → bothDiffer')
  ok(keys(p.localDeleted) === '2026-01-02', '★ 本机删掉了基线里有的 → localDeleted')
  ok(keys(p.toUpload) === '', '本机没有云端也没有的记录')
  ok(keys(p.toDownload) === '2026-01-03,2026-01-04', '★ 云端独有、基线没有 → toDownload')
})

await scenario('C2 无基线时标记出来', async ({ env, cloud, s }) => {
  cloud.seed(snap({ '2026-01-01': 'company' }), 2)
  env.write('wio_entries', { '2026-01-05': 'home' })
  const r = await s.prepareUpload()
  ok(r.plan.noBaseline === true, '★ 没有基线必须告知用户「无法逐条比对」')
})

// ---------- D. 合并上传 ----------

await scenario('D1 合并上传：补本机、留云端、尊重删除', async ({ env, cloud, s }) => {
  env.write('wio_sync_base', { __v: 1, settings: { language: 'zh-CN' }, entries: { '2026-01-01': 'company', '2026-01-02': 'home' }, overtime: {} })
  env.write('wio_entries', { '2026-01-01': 'vacation', '2026-01-09': 'company' })
  cloud.seed(snap({ '2026-01-01': 'company', '2026-01-02': 'home', '2026-01-03': 'sick' }, { settings: { language: 'zh-CN', targetPercentage: 60 } }), 4)

  const r = await s.prepareUpload()
  const up = await s.uploadMerge(r.plan)
  ok(up.ok, '合并上传应成功')
  const c = cloud.peek().data.entries
  ok(c['2026-01-01'] === 'vacation', '★ 两边都有的记录采用本机')
  ok(c['2026-01-09'] === 'company', '★ 本机独有的记录补上去')
  ok(c['2026-01-03'] === 'sick', '★ 云端独有的记录必须保留（不删）')
  ok(c['2026-01-02'] === undefined, '★ 本机删过的记录不再推回去')
  ok(cloud.peek().data.settings.targetPercentage === 60, '★ 云端独有的设置项也要保留')
})

await scenario('D2 合并后两侧一致、基线更新', async ({ env, cloud, s }) => {
  env.write('wio_sync_base', { __v: 1, settings: {}, entries: { '2026-02-01': 'company' }, overtime: {} })
  env.write('wio_entries', { '2026-02-01': 'company', '2026-02-02': 'home' })
  cloud.seed(snap({ '2026-02-03': 'sick' }), 1)
  const r1 = await s.prepareUpload()
  await s.uploadMerge(r1.plan)

  const local = env.read('wio_entries')
  const remote = cloud.peek().data.entries
  ok(JSON.stringify(local) === JSON.stringify(remote), '★ 上传后两侧应完全一致')
  ok(env.read('wio_sync_state').dirty === false, '上传成功应清脏标记')

  const r2 = await s.prepareUpload()
  ok(r2.plan.toUpload.length === 0, '★ 基线更新后不应再算出待上传项')
  ok(r2.plan.bothDiffer.length === 0, '★ 也不应有分歧项')
})

await scenario('D3 整份覆盖会丢掉云端独有记录', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-03-01': 'home' })
  cloud.seed(snap({ '2026-03-02': 'sick', '2026-03-03': 'vacation' }), 5)
  const r = await s.prepareUpload()
  const up = await s.uploadOverwrite(r.plan)
  ok(up.ok, '覆盖上传应成功')
  const c = cloud.peek().data.entries
  ok(c['2026-03-01'] === 'home', '本机记录应上去')
  ok(c['2026-03-02'] === undefined && c['2026-03-03'] === undefined, '★ 覆盖模式下云端独有的记录会被删（弹层已警告）')
})

await scenario('D4 检查期间云端被改：不硬推', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-04-01': 'home' })
  cloud.seed(snap({ '2026-04-02': 'sick' }), 2)
  const r = await s.prepareUpload()
  cloud.seed(snap({ '2026-04-02': 'sick', '2026-04-03': 'company' }), 3)
  const up = await s.uploadMerge(r.plan)
  ok(up.ok === false && up.reason === 'cloud_changed', '★ 版本已变应让用户重新检查，而不是强推覆盖')
  ok(cloud.peek().data.entries['2026-04-03'] === 'company', '另一台设备的改动不能被吞掉')
})

await scenario('D5 推送失败时本机保持原样', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-04-10': 'home' })
  cloud.seed(snap({ '2026-04-11': 'sick' }), 4)
  const r = await s.prepareUpload()
  ok(r.plan.toDownload.length === 1, '云端独有记录应被识别')
  // 推送阶段断网
  cloud.failPush = true
  const up = await s.uploadMerge(r.plan)
  ok(up.ok === false, '断网时上传应失败')
  const local = env.read('wio_entries')
  ok(local['2026-04-11'] === undefined, '★ 推送失败不能把云端记录偷写进本机（不留半合并中间态）')
  ok(local['2026-04-10'] === 'home', '本机原有记录不能被改动')
})

// ---------- E. 恢复与撤销 ----------
await scenario('E1 从云端恢复 + 备份', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-05-01': 'company', '2026-05-02': 'home' })
  cloud.seed(snap({ '2026-06-01': 'vacation' }), 6)
  const r = await s.restoreFromCloud()
  ok(r.ok, '恢复应成功')
  const local = env.read('wio_entries')
  ok(local['2026-06-01'] === 'vacation', '云端数据应写入本机')
  ok(local['2026-05-01'] === undefined, '★ 恢复是整份覆盖：本机独有记录会消失')
  ok(env.has('wio_restore_backup'), '★ 覆盖前必须留备份')
  ok(env.read('wio_restore_backup').data.entries['2026-05-01'] === 'company', '备份里应是覆盖前的本机数据')
})

await scenario('E2 撤销恢复', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-05-01': 'company' })
  cloud.seed(snap({ '2026-06-01': 'vacation' }), 6)
  await s.restoreFromCloud()
  const u = await s.undoRestore()
  ok(u.ok, '撤销应成功')
  ok(env.read('wio_entries')['2026-05-01'] === 'company', '★ 撤销后本机数据要回来')
  ok(env.read('wio_entries')['2026-06-01'] === undefined, '云端那份应被撤掉')
  ok(env.has('wio_restore_backup') === false, '撤销后备份应清空（只允许撤销一次）')
})

await scenario('E3 云端为空时不能恢复', async ({ env, cloud, s }) => {
  env.write('wio_entries', { '2026-07-01': 'company' })
  const r = await s.restoreFromCloud()
  ok(r.ok === false && r.reason === 'empty', '★ 空云端不允许覆盖本机（否则一键清空）')
  ok(env.read('wio_entries')['2026-07-01'] === 'company', '本机数据不能被清掉')
})

// ---------- F. 摘要 ----------

await scenario('F1 摘要只读缓存', async ({ env, cloud, s }) => {
  cloud.seed(snap({ '2026-08-01': 'home' }), 9)
  env.write('wio_entries', { '2026-08-02': 'company', '2026-08-03': 'sick' })
  await s.checkRemote()
  const before = cloud.calls.length
  const sum = s.getSyncSummary()
  ok(cloud.calls.length === before, '★ 摘要不能发请求')
  ok(sum.localCount === 2, '本机条数应正确')
  ok(sum.remoteCount === 1, '云端条数应正确')
  ok(sum.remoteNewer === true, '云端版本更高时应标记有新数据')
})

console.log(`\n通过 ${pass} 条，失败 ${fails.length} 条`)
fails.forEach(f => console.log('  ✗ ' + f))
if (fails.length) process.exitCode = 1
