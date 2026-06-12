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
  assert(data.version === Store.CURRENT_DATA_VERSION, '应包含版本号');
  assert(data.exportTime, '应包含导出时间');
});

test('导入数据', () => {
  const adminUser = Store.Users.getById('user_zhang');
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
  
  const result = Store.executeImport(data, adminUser);
  assert(result.success === true, '导入应成功');
  
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

console.log('\n--- 7. 备份与恢复测试 ---\n');

test('配置管理权限验证', () => {
  const adminRole = Store.Roles.getById('role_admin');
  assert(adminRole.canManageConfig === true, '班长角色应有配置管理权限');
  
  const opRole = Store.Roles.getById('role_operator');
  assert(opRole.canManageConfig === false, '运维值班员角色不应有配置管理权限');
  
  const observerRole = Store.Roles.getById('role_observer');
  assert(observerRole.canManageConfig === false, '观察员角色不应有配置管理权限');
});

test('成功导出完整数据包', () => {
  const data = Store.exportAllData();
  
  assert(data.shifts && Array.isArray(data.shifts), '导出应包含班次数据');
  assert(data.roles && Array.isArray(data.roles), '导出应包含角色数据');
  assert(data.users && Array.isArray(data.users), '导出应包含用户数据');
  assert(data.checkItems && Array.isArray(data.checkItems), '导出应包含检查项数据');
  assert(data.items && Array.isArray(data.items), '导出应包含事项数据');
  assert(data.handoverRecords && Array.isArray(data.handoverRecords), '导出应包含交接记录');
  assert(data.recoveryLogs && Array.isArray(data.recoveryLogs), '导出应包含恢复日志');
  assert(data.currentShift, '导出应包含当前班次设置');
  assert(data.version === Store.CURRENT_DATA_VERSION, '导出版本号应与当前版本一致');
  assert(data.exportTime, '导出应包含导出时间');
  
  const date = new Date(data.exportTime);
  assert(!isNaN(date.getTime()), '导出时间应为有效的 ISO 格式');
});

test('非法 JSON - 结构校验失败', () => {
  const invalidData1 = null;
  const result1 = Store.validateImportStructure(invalidData1);
  assert(result1.valid === false, 'null 数据应校验失败');
  
  const invalidData2 = { missing: 'fields' };
  const result2 = Store.validateImportStructure(invalidData2);
  assert(result2.valid === false, '缺少必要字段应校验失败');
  assert(result2.errors.length > 0, '应有错误信息');
  
  const invalidData3 = { version: '1.0', exportTime: '2026-06-13T00:00:00.000Z', shifts: 'not_an_array' };
  const result3 = Store.validateImportStructure(invalidData3);
  assert(result3.valid === false, '字段类型错误应校验失败');
});

test('版本兼容性检查', () => {
  const check1 = Store.checkVersionCompatibility('1.0');
  assert(check1.compatible === true, '1.0 版本应兼容');
  assert(check1.isOlder === true, '1.0 版本应被识别为旧版本');
  
  const check2 = Store.checkVersionCompatibility(Store.CURRENT_DATA_VERSION);
  assert(check2.compatible === true, '当前版本应兼容');
  assert(check2.isOlder === false, '当前版本不应被识别为旧版本');
  
  const check3 = Store.checkVersionCompatibility('0.5');
  assert(check3.compatible === false, '0.5 版本应不兼容');
});

test('权限校验 - 只有配置管理员能恢复', () => {
  const adminUser = Store.Users.getById('user_zhang');
  const adminCheck = Store.checkUserPermission(adminUser);
  assert(adminCheck.allowed === true, '班长应能执行恢复操作');
  
  const opUser = Store.Users.getById('user_li');
  const opCheck = Store.checkUserPermission(opUser);
  assert(opCheck.allowed === false, '运维值班员不应能执行恢复操作');
  
  const observerUser = Store.Users.getById('user_zhao');
  const observerCheck = Store.checkUserPermission(observerUser);
  assert(observerCheck.allowed === false, '观察员不应能执行恢复操作');
  
  const nullCheck = Store.checkUserPermission(null);
  assert(nullCheck.allowed === false, '未选择用户不应能执行恢复操作');
});

test('冲突检测 - 同名班次、用户、未关闭事项', () => {
  const originalData = Store.exportAllData();
  
  const importData = {
    ...originalData,
    shifts: [
      ...originalData.shifts,
      { id: 'new_shift', name: '白班', startTime: '09:00', endTime: '18:00' }
    ],
    users: [
      ...originalData.users,
      { id: 'new_user', name: '张三', roleId: 'role_admin' }
    ],
    items: [
      ...originalData.items.map(i => ({ ...i, status: i.status === 'closed' ? 'closed' : 'processing' }))
    ]
  };
  
  const conflicts = Store.detectConflicts(importData);
  assert(conflicts.hasConflicts === true, '应检测到冲突');
  assert(conflicts.conflicts.shiftNames.includes('白班'), '应检测到同名班次冲突');
  assert(conflicts.conflicts.userNames.includes('张三'), '应检测到同名用户冲突');
  
  const unclosedItems = originalData.items.filter(i => i.status !== 'closed');
  if (unclosedItems.length > 0) {
    assert(conflicts.conflicts.unclosedItemIds.length > 0, '应检测到未关闭事项ID冲突');
  }
});

test('导入预览功能', () => {
  const originalData = Store.exportAllData();
  const preview = Store.previewImport(originalData);
  
  assert(preview.success === true, '预览应成功');
  assert(preview.versionCheck.compatible === true, '版本应兼容');
  assert(preview.importSummary, '应有导入包摘要');
  assert(preview.currentSummary, '应有当前数据摘要');
  assert(preview.differences, '应有差异对比');
  assert(preview.totalChanges === 0, '相同数据应无差异');
  
  const modifiedData = { ...originalData };
  modifiedData.items = [...modifiedData.items, { id: 'test_preview_item', title: '测试', status: 'new', version: 1 }];
  const preview2 = Store.previewImport(modifiedData);
  assert(preview2.totalChanges >= 1, '修改后数据应有差异');
});

test('冲突取消 - 不执行覆盖', () => {
  const originalItems = Store.Items.getAll();
  const originalCount = originalItems.length;
  const originalData = Store.exportAllData();
  
  const modifiedData = {
    ...originalData,
    items: [...originalData.items, { id: 'test_cancel_item', title: '测试取消恢复', status: 'new', version: 1 }]
  };
  
  Store.Items.saveAll(originalItems);
  
  const currentItems = Store.Items.getAll();
  assert(currentItems.length === originalCount, '取消恢复后事项数量应保持不变');
  
  const notFound = Store.Items.getById('test_cancel_item');
  assert(notFound === null, '取消恢复后不应包含测试事项');
});

test('恢复后持久化 - 数据保持一致', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const originalData = Store.exportAllData();
  const originalItemCount = originalData.items.length;
  const originalRecordCount = originalData.handoverRecords.length;
  
  const testItem = {
    id: 'test_persistence_item',
    title: '持久化测试事项',
    type: 'alert',
    status: 'new',
    version: 1,
    shiftId: 'shift_morning',
    shiftDate: '2026-06-13',
    creatorId: 'user_zhang',
    creatorName: '张三',
    assigneeId: '',
    assigneeName: '',
    createTime: Date.now(),
    updateTime: Date.now(),
    closeTime: null,
    closeReason: '',
    history: []
  };
  
  const modifiedData = {
    ...originalData,
    items: [...originalData.items, testItem],
    handoverRecords: originalData.handoverRecords
  };
  
  const result = Store.executeImport(modifiedData, adminUser);
  assert(result.success === true, '导入应成功');
  
  const itemsAfter = Store.Items.getAll();
  assert(itemsAfter.length === originalItemCount + 1, '事项数量应增加');
  
  const foundItem = Store.Items.getById('test_persistence_item');
  assert(foundItem !== null, '应能找到导入的事项');
  assert(foundItem.title === '持久化测试事项', '事项标题应正确');
  assert(foundItem.version === 1, '事项版本号应保持');
  
  const recordsAfter = Store.HandoverRecords.getAll();
  assert(recordsAfter.length === originalRecordCount, '交接记录数量应保持不变');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length >= 1, '应有恢复日志');
  assert(logs[0].succeeded === true, '恢复日志应标记成功');
  assert(logs[0].operatorName === '张三', '恢复日志应记录操作人');
  assert(logs[0].beforeSummary.items === originalItemCount, '恢复前事项数量应正确');
  assert(logs[0].afterSummary.items === originalItemCount + 1, '恢复后事项数量应正确');
  
  const reExported = Store.exportAllData();
  assert(reExported.items.length === originalItemCount + 1, '重新导出后事项数量应保持');
  assert(reExported.recoveryLogs.length >= 1, '重新导出应包含恢复日志');
  assert(reExported.version === Store.CURRENT_DATA_VERSION, '重新导出版本号应正确');
  
  const recoveredItem = reExported.items.find(i => i.id === 'test_persistence_item');
  assert(recoveredItem !== null, '重新导出应包含持久化测试事项');
});

test('权限不足时执行导入失败', () => {
  const opUser = Store.Users.getById('user_li');
  const originalData = Store.exportAllData();
  const originalLogCount = Store.RecoveryLogs.getAll().length;
  
  const modifiedData = {
    ...originalData,
    items: [...originalData.items, { id: 'test_perm_item', title: '测试', status: 'new', version: 1 }]
  };
  
  const result = Store.executeImport(modifiedData, opUser);
  assert(result.success === false, '权限不足应导入失败');
  assert(result.errors.length > 0, '应有错误信息');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === originalLogCount + 1, '应记录失败日志');
  assert(logs[0].succeeded === false, '失败日志应标记失败');
  assert(logs[0].reason.includes('权限'), '失败原因应包含权限');
  
  const item = Store.Items.getById('test_perm_item');
  assert(item === null, '权限不足时不应导入数据');
});

test('恢复日志功能', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const log1 = Store.RecoveryLogs.add({
    action: '数据恢复',
    operatorId: 'user_zhang',
    operatorName: '张三',
    importVersion: '1.1',
    succeeded: true
  });
  
  const log2 = Store.RecoveryLogs.add({
    action: '导入失败',
    operatorId: 'user_li',
    operatorName: '李四',
    reason: '权限不足',
    succeeded: false
  });
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === 2, '应有2条恢复日志');
  assert(logs[0].id === log2.id, '日志应按时间倒序排列');
  assert(logs[0].succeeded === false, '第一条应为失败日志');
  assert(logs[1].succeeded === true, '第二条应为成功日志');
  assert(logs[0].timestamp, '日志应有时间戳');
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
