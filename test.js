const fs = require('fs');
const path = require('path');

global.localStorage = {
  _data: {},
  getItem(key) {
    return this._data[key] !== undefined ? this._data[key] : null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  },
  clear() {
    this._data = {};
  }
};

const storeCode = fs.readFileSync(path.join(__dirname, 'js/store.js'), 'utf8');
const modifiedCode = storeCode.replace('const Store = (function()', 'var Store = (function()');
eval(modifiedCode);

global.Store = Store;

console.log('=== 值班交接白板 - 功能测试 ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   错误: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

console.log('--- 1. 配置模块测试 ---\n');

test('创建样例数据', () => {
  const result = Store.createSampleData();
  assert(result === true, '创建样例数据应返回 true');
  
  const shifts = Store.Shifts.getAll();
  assert(shifts.length === 3, `应有 3 个班次，实际 ${shifts.length}`);
  
  const roles = Store.Roles.getAll();
  assert(roles.length === 3, `应有 3 个角色，实际 ${roles.length}`);
  
  const users = Store.Users.getAll();
  assert(users.length === 4, `应有 4 个用户，实际 ${users.length}`);
  
  const checkItems = Store.CheckItems.getAll();
  assert(checkItems.length === 5, `应有 5 个检查项，实际 ${checkItems.length}`);
});

test('班次 CRUD 操作', () => {
  const shifts = Store.Shifts.getAll();
  const originalCount = shifts.length;
  
  const newShift = { id: 'test_shift', name: '测试班', startTime: '09:00', endTime: '18:00' };
  const newShifts = [...shifts, newShift];
  Store.Shifts.saveAll(newShifts);
  
  const saved = Store.Shifts.getAll();
  assert(saved.length === originalCount + 1, '班次数量应增加');
  
  const found = Store.Shifts.getById('test_shift');
  assert(found !== null, '应能通过ID找到班次');
  assert(found.name === '测试班', '班次名称应匹配');
});

test('角色 CRUD 操作', () => {
  const roles = Store.Roles.getAll();
  const originalCount = roles.length;
  
  const newRole = { id: 'test_role', name: '测试角色', canCreate: true, canProcess: false, canClose: false, canConfirm: false };
  const newRoles = [...roles, newRole];
  Store.Roles.saveAll(newRoles);
  
  const saved = Store.Roles.getAll();
  assert(saved.length === originalCount + 1, '角色数量应增加');
  
  const found = Store.Roles.getById('test_role');
  assert(found !== null, '应能通过ID找到角色');
  assert(found.canCreate === true, '权限应正确保存');
});

console.log('\n--- 2. 事项管理测试 ---\n');

test('创建事项', () => {
  const creator = Store.Users.getById('user_zhang');
  assert(creator !== null, '应能找到创建者');
  
  const item = Store.Items.create({
    title: '测试事项',
    type: 'alert',
    description: '这是一个测试事项',
    shiftId: 'shift_morning',
    shiftDate: '2026-06-13',
    assigneeId: 'user_li',
    assigneeName: '李四'
  }, creator);
  
  assert(item.id, '事项应有ID');
  assert(item.status === 'new', '初始状态应为新建');
  assert(item.version === 1, '初始版本应为 1');
  assert(item.creatorName === '张三', '创建人名称应正确');
  assert(item.history.length === 1, '应有一条历史记录');
  assert(item.history[0].action === '创建事项', '历史记录类型应正确');
});

test('编辑事项', () => {
  const items = Store.Items.getByShiftAndDate('shift_morning', '2026-06-13');
  const item = items[0];
  const operator = Store.Users.getById('user_li');
  
  const result = Store.Items.update(item.id, {
    title: '修改后的标题',
    description: '修改后的描述'
  }, operator, item.version);
  
  assert(result.success === true, '编辑应成功');
  assert(result.item.version === item.version + 1, '版本号应递增');
  assert(result.item.title === '修改后的标题', '标题应已更新');
  assert(result.item.history.length === 2, '历史记录应增加');
});

test('版本冲突检测', () => {
  const items = Store.Items.getByShiftAndDate('shift_morning', '2026-06-13');
  const item = items[0];
  const user1 = Store.Users.getById('user_zhang');
  const user2 = Store.Users.getById('user_li');
  
  const baseVersion = item.version;
  
  const result1 = Store.Items.update(item.id, {
    title: '用户1修改'
  }, user1, baseVersion);
  assert(result1.success === true, '用户1的修改应成功');
  
  const result2 = Store.Items.update(item.id, {
    title: '用户2修改'
  }, user2, baseVersion);
  assert(result2.success === false, '用户2基于旧版本的修改应失败');
  assert(result2.conflict === true, '应返回冲突标记');
  assert(result2.latestVersion === baseVersion + 1, '应返回最新版本号');
  
  const freshItem = Store.Items.getById(item.id);
  assert(freshItem.title === '用户1修改', '用户1的修改不应被覆盖');
  assert(freshItem.version === baseVersion + 1, '版本号只应增加一次');
});

test('事项状态流转', () => {
  const items = Store.Items.getByShiftAndDate('shift_morning', '2026-06-13');
  const item = items[0];
  const operator = Store.Users.getById('user_zhang');
  
  let result = Store.Items.startProcessing(item.id, operator, item.version);
  assert(result.success === true, '开始处理应成功');
  assert(result.item.status === 'processing', '状态应为处理中');
  
  const v2 = result.item.version;
  result = Store.Items.submitForConfirm(item.id, operator, v2);
  assert(result.success === true, '提交确认应成功');
  assert(result.item.status === 'pending_confirm', '状态应为待接班确认');
  
  const v3 = result.item.version;
  result = Store.Items.receive(item.id, operator, v3);
  assert(result.success === true, '接收获应成功');
  assert(result.item.status === 'received', '状态应为已接收');
  
  const v4 = result.item.version;
  result = Store.Items.close(item.id, operator, '测试关闭原因', v4);
  assert(result.success === true, '关闭应成功');
  assert(result.item.status === 'closed', '状态应为已关闭');
  assert(result.item.closeReason === '测试关闭原因', '关闭原因应保存');
  assert(result.item.closeTime !== null, '关闭时间应设置');
});

console.log('\n--- 3. 权限校验测试 ---\n');

test('班长角色权限', () => {
  const adminRole = Store.Roles.getById('role_admin');
  assert(adminRole.canCreate === true, '班长应能创建事项');
  assert(adminRole.canProcess === true, '班长应能处理事项');
  assert(adminRole.canClose === true, '班长应能关闭事项');
  assert(adminRole.canConfirm === true, '班长应能接班确认');
});

test('运维值班员角色权限', () => {
  const opRole = Store.Roles.getById('role_operator');
  assert(opRole.canCreate === true, '值班员应能创建事项');
  assert(opRole.canProcess === true, '值班员应能处理事项');
  assert(opRole.canClose === false, '值班员不能关闭事项');
  assert(opRole.canConfirm === true, '值班员应能接班确认');
});

test('观察员角色权限', () => {
  const observerRole = Store.Roles.getById('role_observer');
  assert(observerRole.canCreate === false, '观察员不能创建事项');
  assert(observerRole.canProcess === false, '观察员不能处理事项');
  assert(observerRole.canClose === false, '观察员不能关闭事项');
  assert(observerRole.canConfirm === false, '观察员不能接班确认');
});

console.log('\n--- 4. 交接班记录测试 ---\n');

test('创建交接班记录', () => {
  const checkItems = Store.CheckItems.getAll();
  const checkResults = {};
  let checkedCount = 0;
  checkItems.forEach(item => {
    checkResults[item.id] = { checked: item.required, name: item.name, required: item.required };
    if (item.required) checkedCount++;
  });
  
  const items = Store.Items.getByShiftAndDate('shift_morning', '2026-06-13');
  const itemsSnapshot = items.map(i => ({
    id: i.id, title: i.title, type: i.type, status: i.status,
    description: i.description, assigneeName: i.assigneeName
  }));
  
  const record = Store.HandoverRecords.create({
    shiftId: 'shift_morning',
    shiftName: '白班',
    date: '2026-06-13',
    handoverUserId: 'user_zhang',
    handoverName: '张三',
    itemIds: items.map(i => i.id),
    checkResults,
    totalCount: checkItems.length,
    checkedCount,
    itemsSnapshot
  });
  
  assert(record.id, '记录应有ID');
  assert(record.status === 'pending', '初始状态应为待确认');
  assert(record.itemCount === items.length, '事项数量应正确');
});

test('确认交接班记录', () => {
  const records = Store.HandoverRecords.getAll();
  const record = records[0];
  const takeoverUser = Store.Users.getById('user_li');
  
  const confirmed = Store.HandoverRecords.confirm(record.id, takeoverUser);
  assert(confirmed !== null, '确认应成功');
  assert(confirmed.status === 'confirmed', '状态应为已确认');
  assert(confirmed.takeoverName === '李四', '接班人应正确');
  assert(confirmed.takeoverTime !== null, '接班时间应设置');
});

test('按班次筛选历史记录', () => {
  const morningRecords = Store.HandoverRecords.getByShift('shift_morning');
  assert(morningRecords.length >= 1, '应能找到白班记录');
  
  const eveningRecords = Store.HandoverRecords.getByShift('shift_evening');
  assert(eveningRecords.length === 0, '应找不到中班记录');
});

console.log('\n--- 5. 数据持久化测试 ---\n');

test('数据持久化 - 保存后重新读取', () => {
  const originalItems = Store.Items.getAll();
  const originalCount = originalItems.length;
  
  const serialized = global.localStorage.getItem('handover_items');
  assert(serialized !== null, '数据应已序列化到localStorage');
  
  const parsed = JSON.parse(serialized);
  assert(parsed.length === originalCount, '反序列化后数量应一致');
});

test('导出所有数据', () => {
  const data = Store.exportAllData();
  assert(data.shifts && Array.isArray(data.shifts), '应包含班次数据');
  assert(data.roles && Array.isArray(data.roles), '应包含角色数据');
  assert(data.users && Array.isArray(data.users), '应包含用户数据');
  assert(data.items && Array.isArray(data.items), '应包含事项数据');
  assert(data.version === '1.0', '应包含版本号');
  assert(data.exportTime, '应包含导出时间');
});

test('导入数据', () => {
  const data = Store.exportAllData();
  const originalItemCount = Store.Items.getAll().length;
  
  const testItem = {
    id: 'import_test_item',
    title: '导入测试事项',
    type: 'other',
    status: 'new',
    version: 1
  };
  data.items.push(testItem);
  
  const result = Store.importAllData(data);
  assert(result === true, '导入应成功');
  
  const items = Store.Items.getAll();
  assert(items.length === originalItemCount + 1, '事项数量应增加');
  
  const found = Store.Items.getById('import_test_item');
  assert(found !== null, '应能找到导入的事项');
  assert(found.title === '导入测试事项', '事项标题应正确');
});

console.log('\n--- 6. 检查项验证测试 ---\n');

test('必填检查项验证逻辑', () => {
  const checkItems = Store.CheckItems.getAll();
  const requiredItems = checkItems.filter(i => i.required);
  const optionalItems = checkItems.filter(i => !i.required);
  
  assert(requiredItems.length > 0, '应有必填检查项');
  assert(optionalItems.length > 0, '应有选填检查项');
  
  const requiredNames = requiredItems.map(i => i.name);
  assert(requiredNames.includes('告警平台巡检'), '告警平台巡检应为必填');
  assert(requiredNames.includes('服务器状态检查'), '服务器状态检查应为必填');
});

console.log('\n=== 测试结果总结 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 所有测试通过！');
} else {
  console.log('\n⚠️  有测试失败，请检查代码');
  process.exit(1);
}
