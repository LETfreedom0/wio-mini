// 自定义假期统计口径单测：mock global.uni + file:// 导入 wioService
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = 'D:/work/wio-mini';

const store = {};
global.uni = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  vibrateShort: () => {},
  showToast: () => {},
  showModal: () => {},
  getSystemInfoSync: () => ({ windowWidth: 375 })
};

const svc = (await import(pathToFileURL(path.join(projectRoot, 'utils/wioService.js')).href)).default;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('PASS:', msg);
}

// 2026-06-01 是周一。6月有30天，周末+端午(2026-06-19?)以 isOfficialWorkingDay 为准，这里只关心自定义假期的扣减方向
// 1) 保存一个区间 06-02 ~ 06-06（周二~周六）
const saved = svc.saveCustomLeave({ name: '婚假', color: '#C25B6E', start: '2026-06-02', end: '2026-06-06' });
assert(saved && saved.id, 'saveCustomLeave 返回带 id 的对象');

const s = svc.getMonthStats(2026, 6);
assert(typeof s.customLeaveDays === 'number' && s.customLeaveDays > 0, `区间工作日计入 customLeaveDays（=${s.customLeaveDays}）`);
assert(s.customLeaveDays <= 5, '扣减不超过区间长度');
assert(s.weekendLeaves === (s.weekendLeaves || 0), 'weekendLeaves 字段存在');

// 2) 手动标记优先：区间内某天标记 company，customLeaveDays 应减 1
const before = svc.getMonthStats(2026, 6).customLeaveDays;
store['wio_entries'] = JSON.stringify({ '2026-06-03': 'company' });
const after = svc.getMonthStats(2026, 6).customLeaveDays;
assert(after === before - 1, `手动标记 company 后 customLeaveDays ${before}->${after}（优先级正确）`);
store['wio_entries'] = JSON.stringify({});

// 3) 编辑 + 删除
const edited = svc.saveCustomLeave({ id: saved.id, name: '婚假', color: '#0E6E62', start: '2026-06-02', end: '2026-06-03' });
assert(edited && edited.end === '2026-06-03', '编辑：end 更新生效');
assert(svc.getCustomLeaveForDate('2026-06-05') === null, '编辑后区间外日期不再命中');
svc.deleteCustomLeave(saved.id);
assert(svc.getCustomLeaves().length === 0, '删除后列表为空');
assert(svc.getMonthStats(2026, 6).customLeaveDays === 0, '删除后分母扣减归零');

// 4) 非法输入拒绝
assert(svc.saveCustomLeave({ name: '', start: '2026-06-01', end: '2026-06-02' }) === null, '空名称拒绝');
assert(svc.saveCustomLeave({ name: 'x', start: 'bad', end: '2026-06-02' }) === null, '非法日期拒绝');
assert(svc.saveCustomLeave({ name: 'x', start: '2026-06-05', end: '2026-06-01' }) === null, 'start>end 拒绝');

// 5) 目标比例快照未被破坏
const ratio = svc.getTargetForMonth(2026, 6);
assert(ratio >= 1 && ratio <= 100, `getTargetForMonth 正常（=${ratio}）`);
console.log('done');
