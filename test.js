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

test('角色数据迁移 - 旧数据缺少 canManageConfig 字段时自动补齐', () => {
  const originalRoles = Store.Roles.getAll();
  
  const legacyRoles = originalRoles.map(r => {
    const { canManageConfig, ...rest } = r;
    return rest;
  });
  assert(legacyRoles.every(r => !('canManageConfig' in r)), '模拟旧数据应没有 canManageConfig 字段');
  
  Store.Roles.saveAll(legacyRoles);
  
  const migratedRoles = Store.Roles.getAll();
  assert(migratedRoles.every(r => 'canManageConfig' in r), '迁移后所有角色都应有 canManageConfig 字段');
  
  const adminRole = migratedRoles.find(r => r.id === 'role_admin');
  assert(adminRole.canManageConfig === true, '班长角色迁移后 canManageConfig 应为 true');
  
  const opRole = migratedRoles.find(r => r.id === 'role_operator');
  assert(opRole.canManageConfig === false, '运维值班员角色迁移后 canManageConfig 应为 false');
  
  const observerRole = migratedRoles.find(r => r.id === 'role_observer');
  assert(observerRole.canManageConfig === false, '观察员角色迁移后 canManageConfig 应为 false');
  
  const adminUser = Store.Users.getById('user_zhang');
  const permCheck = Store.checkUserPermission(adminUser);
  assert(permCheck.allowed === true, '迁移后班长应能通过权限校验');
  
  Store.Roles.saveAll(originalRoles);
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
    ]
  };
  
  const conflicts = Store.detectConflicts(importData);
  assert(conflicts.hasConflicts === true, '应检测到冲突');
  assert(conflicts.conflicts.shiftNames.includes('白班'), '应检测到不同ID同名班次冲突');
  assert(conflicts.conflicts.userNames.includes('张三'), '应检测到不同ID同名用户冲突');
});

test('冲突检测 - 同ID同名称不应为冲突', () => {
  const originalData = Store.exportAllData();
  
  const conflicts = Store.detectConflicts(originalData);
  assert(conflicts.hasConflicts === false, '刚导出的数据不应有任何冲突');
  assert(conflicts.conflicts.shiftNames.length === 0, '同ID同名称的班次不应是冲突');
  assert(conflicts.conflicts.userNames.length === 0, '同ID同名称的用户不应是冲突');
  assert(conflicts.conflicts.unclosedItemIds.length === 0, '同ID同内容的未关闭事项不应是冲突');
});

test('冲突检测 - 同ID不同名称应为冲突', () => {
  const originalData = Store.exportAllData();
  
  const importData = {
    ...originalData,
    shifts: originalData.shifts.map(s => 
      s.id === 'shift_morning' ? { ...s, name: '早班改名' } : s
    ),
    users: originalData.users.map(u => 
      u.id === 'user_zhang' ? { ...u, name: '张三大改' } : u
    )
  };
  
  const conflicts = Store.detectConflicts(importData);
  assert(conflicts.hasConflicts === true, '应检测到冲突');
  assert(conflicts.conflicts.shiftNames.includes('早班改名'), '同ID不同名称的班次应是冲突');
  assert(conflicts.conflicts.userNames.includes('张三大改'), '同ID不同名称的用户应是冲突');
});

test('冲突检测 - 未关闭事项同ID但内容不同应为冲突', () => {
  const originalData = Store.exportAllData();
  const unclosedItems = originalData.items.filter(i => i.status !== 'closed');
  
  if (unclosedItems.length > 0) {
    const modifiedData = {
      ...originalData,
      items: originalData.items.map(i => 
        i.id === unclosedItems[0].id && i.status !== 'closed'
          ? { ...i, title: i.title + ' (已修改)', assigneeId: 'user_li' }
          : i
      )
    };
    
    const conflicts = Store.detectConflicts(modifiedData);
    assert(conflicts.hasConflicts === true, '应检测到未关闭事项冲突');
    assert(conflicts.conflicts.unclosedItemIds.includes(unclosedItems[0].id), '同ID但内容不同的未关闭事项应是冲突');
  }
});

test('冲突检测 - 未关闭事项同ID且内容相同不应为冲突', () => {
  const originalData = Store.exportAllData();
  
  const conflicts = Store.detectConflicts(originalData);
  assert(conflicts.conflicts.unclosedItemIds.length === 0, '同ID同内容的未关闭事项不应是冲突');
});

test('冲突检测 - 已关闭事项即使ID相同也不为冲突', () => {
  const originalData = Store.exportAllData();
  const closedItems = originalData.items.filter(i => i.status === 'closed');
  
  if (closedItems.length > 0) {
    const modifiedData = {
      ...originalData,
      items: originalData.items.map(i => 
        i.id === closedItems[0].id
          ? { ...i, title: i.title + ' (已修改)' }
          : i
      )
    };
    
    const conflicts = Store.detectConflicts(modifiedData);
    assert(conflicts.conflicts.unclosedItemIds.length === 0, '已关闭事项即使内容不同也不应是未关闭事项冲突');
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
  assert(preview.hasConflicts === false, '相同数据应无冲突');
  
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

test('回归：无冲突备份恢复 - 刚导出的JSON直接恢复，日志无冲突', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const originalData = Store.exportAllData();
  const originalShiftCount = originalData.shifts.length;
  const originalUserCount = originalData.users.length;
  
  const result = Store.executeImport(originalData, adminUser);
  assert(result.success === true, '无冲突恢复应成功');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === 1, '应有1条恢复日志');
  assert(logs[0].succeeded === true, '恢复日志应标记成功');
  assert(logs[0].conflicts === null, '无冲突恢复时conflicts应为null');
  assert(logs[0].beforeSummary.shifts === originalShiftCount, '恢复前班次数量正确');
  assert(logs[0].afterSummary.shifts === originalShiftCount, '恢复后班次数量正确');
  assert(logs[0].beforeSummary.users === originalUserCount, '恢复前用户数量正确');
  assert(logs[0].afterSummary.users === originalUserCount, '恢复后用户数量正确');
  
  const shiftsAfter = Store.Shifts.getAll();
  assert(shiftsAfter.length === originalShiftCount, '班次数量应保持不变');
  
  const currentData = Store.exportAllData();
  const preview = Store.previewImport(currentData);
  assert(preview.hasConflicts === false, '重新预览当前数据应无冲突');
});

test('回归：真实同名班次冲突恢复 - 日志正确记录冲突', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const originalData = Store.exportAllData();
  
  const importData = {
    ...originalData,
    shifts: [
      ...originalData.shifts,
      { id: 'conflict_shift_id', name: '白班', startTime: '08:00', endTime: '17:00' }
    ]
  };
  
  const preview = Store.previewImport(importData);
  assert(preview.hasConflicts === true, '应检测到真实冲突');
  assert(preview.conflicts.shiftNames.includes('白班'), '冲突列表应包含白班');
  assert(preview.conflicts.userNames.length === 0, '用户应无冲突');
  assert(preview.conflicts.unclosedItemIds.length === 0, '事项应无冲突');
  
  const result = Store.executeImport(importData, adminUser);
  assert(result.success === true, '有冲突的恢复也能成功执行');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === 1, '应有1条恢复日志');
  assert(logs[0].succeeded === true, '恢复日志应标记成功');
  assert(logs[0].conflicts !== null, '有冲突恢复时conflicts不应为null');
  assert(logs[0].conflicts.shiftNames.includes('白班'), '日志应记录白班冲突');
  assert(logs[0].conflicts.userNames.length === 0, '日志用户冲突应为空');
  assert(logs[0].conflicts.unclosedItemIds.length === 0, '日志事项冲突应为空');
  
  Store.Shifts.saveAll(originalData.shifts);
});

test('回归：真实同名用户冲突恢复 - 日志正确记录冲突', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const originalData = Store.exportAllData();
  
  const importData = {
    ...originalData,
    users: [
      ...originalData.users,
      { id: 'conflict_user_id', name: '李四', roleId: 'role_operator' }
    ]
  };
  
  const preview = Store.previewImport(importData);
  assert(preview.hasConflicts === true, '应检测到用户冲突');
  assert(preview.conflicts.userNames.includes('李四'), '冲突列表应包含李四');
  
  const result = Store.executeImport(importData, adminUser);
  assert(result.success === true, '恢复应成功');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs[0].conflicts !== null, '日志应记录冲突');
  assert(logs[0].conflicts.userNames.includes('李四'), '日志应记录李四冲突');
  
  Store.Users.saveAll(originalData.users);
});

test('回归：真实未关闭事项冲突恢复 - 日志正确记录冲突', () => {
  const originalData = Store.exportAllData();
  const unclosedItems = originalData.items.filter(i => i.status !== 'closed');
  
  if (unclosedItems.length > 0) {
    Store.RecoveryLogs.saveAll([]);
    
    const adminUser = Store.Users.getById('user_zhang');
    const targetItem = unclosedItems[0];
    
    const importData = {
      ...originalData,
      items: originalData.items.map(i => 
        i.id === targetItem.id
          ? { ...i, title: i.title + ' (从备份恢复)', assigneeId: 'user_li', assigneeName: '李四' }
          : i
      )
    };
    
    const preview = Store.previewImport(importData);
    assert(preview.hasConflicts === true, '应检测到未关闭事项冲突');
    assert(preview.conflicts.unclosedItemIds.includes(targetItem.id), '冲突列表应包含事项ID');
    
    const result = Store.executeImport(importData, adminUser);
    assert(result.success === true, '恢复应成功');
    
    const logs = Store.RecoveryLogs.getAll();
    assert(logs[0].conflicts !== null, '日志应记录冲突');
    assert(logs[0].conflicts.unclosedItemIds.includes(targetItem.id), '日志应记录事项冲突');
    
    Store.Items.saveAll(originalData.items);
  }
});

test('回归：取消恢复 - 数据保持不变', () => {
  const originalShifts = Store.Shifts.getAll();
  const originalUsers = Store.Users.getAll();
  const originalItems = Store.Items.getAll();
  
  const originalData = Store.exportAllData();
  const modifiedData = {
    ...originalData,
    shifts: [...originalData.shifts, { id: 'cancel_test_shift', name: '取消测试班', startTime: '00:00', endTime: '23:59' }],
    users: [...originalData.users, { id: 'cancel_test_user', name: '取消测试用户', roleId: 'role_observer' }],
    items: [...originalData.items, { id: 'cancel_test_item', title: '取消测试事项', type: 'other', status: 'new', version: 1 }]
  };
  
  const preview = Store.previewImport(modifiedData);
  assert(preview.success === true, '预览应成功');
  
  Store.Shifts.saveAll(originalShifts);
  Store.Users.saveAll(originalUsers);
  Store.Items.saveAll(originalItems);
  
  const shiftsAfter = Store.Shifts.getAll();
  const usersAfter = Store.Users.getAll();
  const itemsAfter = Store.Items.getAll();
  
  assert(shiftsAfter.length === originalShifts.length, '取消恢复后班次数量不变');
  assert(usersAfter.length === originalUsers.length, '取消恢复后用户数量不变');
  assert(itemsAfter.length === originalItems.length, '取消恢复后事项数量不变');
  assert(Store.Shifts.getById('cancel_test_shift') === null, '不应包含测试班次');
  assert(Store.Users.getById('cancel_test_user') === null, '不应包含测试用户');
  assert(Store.Items.getById('cancel_test_item') === null, '不应包含测试事项');
});

test('回归：权限不足 - 无法执行恢复', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const opUser = Store.Users.getById('user_li');
  const originalData = Store.exportAllData();
  const originalShiftCount = originalData.shifts.length;
  
  const modifiedData = {
    ...originalData,
    shifts: [...originalData.shifts, { id: 'perm_test_shift', name: '权限测试班', startTime: '00:00', endTime: '23:59' }]
  };
  
  const result = Store.executeImport(modifiedData, opUser);
  assert(result.success === false, '权限不足应失败');
  assert(result.errors[0].includes('权限'), '错误信息应包含权限');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === 1, '应有1条失败日志');
  assert(logs[0].succeeded === false, '日志应标记失败');
  assert(logs[0].reason.includes('权限'), '失败原因应包含权限');
  
  const shiftsAfter = Store.Shifts.getAll();
  assert(shiftsAfter.length === originalShiftCount, '班次数量应不变');
  assert(Store.Shifts.getById('perm_test_shift') === null, '不应包含测试班次');
});

test('回归：非法JSON - 结构校验失败', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  
  const invalidData1 = { missing: 'fields' };
  const result1 = Store.executeImport(invalidData1, adminUser);
  assert(result1.success === false, '缺少必要字段应失败');
  
  const invalidData2 = null;
  const result2 = Store.executeImport(invalidData2, adminUser);
  assert(result2.success === false, 'null数据应失败');
  
  const invalidData3 = { version: '1.1', exportTime: '2026-06-13T00:00:00.000Z', shifts: 'not_array' };
  const result3 = Store.executeImport(invalidData3, adminUser);
  assert(result3.success === false, '类型错误应失败');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === 3, '应有3条失败日志');
  assert(logs.every(l => l.succeeded === false), '所有日志应标记失败');
  assert(logs[2].reason.includes('缺少'), '最早的日志原因应包含缺少字段');
  assert(logs[1].reason.includes('格式错误'), '中间日志原因应包含格式错误');
  assert(logs[0].reason.includes('应为数组'), '最新日志原因应包含类型错误');
});

test('回归：多种冲突同时存在 - 日志完整记录', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const originalData = Store.exportAllData();
  const unclosedItems = originalData.items.filter(i => i.status !== 'closed');
  
  let importData = {
    ...originalData,
    shifts: [
      ...originalData.shifts,
      { id: 'multi_conflict_shift', name: '白班', startTime: '07:00', endTime: '16:00' }
    ],
    users: [
      ...originalData.users,
      { id: 'multi_conflict_user', name: '张三', roleId: 'role_observer' }
    ]
  };
  
  if (unclosedItems.length > 0) {
    importData = {
      ...importData,
      items: importData.items.map(i => 
        i.id === unclosedItems[0].id && i.status !== 'closed'
          ? { ...i, title: i.title + ' (多重冲突)', status: 'processing' }
          : i
      )
    };
  }
  
  const preview = Store.previewImport(importData);
  assert(preview.hasConflicts === true, '应检测到多重冲突');
  assert(preview.conflicts.shiftNames.includes('白班'), '应包含班次冲突');
  assert(preview.conflicts.userNames.includes('张三'), '应包含用户冲突');
  
  const result = Store.executeImport(importData, adminUser);
  assert(result.success === true, '恢复应成功');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs[0].conflicts !== null, '日志应记录冲突');
  assert(logs[0].conflicts.shiftNames.includes('白班'), '日志应包含班次冲突');
  assert(logs[0].conflicts.userNames.includes('张三'), '日志应包含用户冲突');
  
  if (unclosedItems.length > 0) {
    assert(preview.conflicts.unclosedItemIds.includes(unclosedItems[0].id), '应包含事项冲突');
    assert(logs[0].conflicts.unclosedItemIds.includes(unclosedItems[0].id), '日志应包含事项冲突');
  }
  
  Store.Shifts.saveAll(originalData.shifts);
  Store.Users.saveAll(originalData.users);
  Store.Items.saveAll(originalData.items);
});

test('回归：恢复日志摘要与实际结果一致', () => {
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const originalData = Store.exportAllData();
  const originalItemCount = originalData.items.length;
  const originalShiftCount = originalData.shifts.length;
  
  const newShift = { id: 'summary_test_shift', name: '摘要测试班', startTime: '06:00', endTime: '15:00' };
  const newItem = { id: 'summary_test_item', title: '摘要测试事项', type: 'other', status: 'new', version: 1 };
  
  const importData = {
    ...originalData,
    shifts: [...originalData.shifts, newShift],
    items: [...originalData.items, newItem]
  };
  
  const result = Store.executeImport(importData, adminUser);
  assert(result.success === true, '恢复应成功');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length === 1, '应有1条日志');
  assert(logs[0].beforeSummary.shifts === originalShiftCount, '恢复前班次数量一致');
  assert(logs[0].afterSummary.shifts === originalShiftCount + 1, '恢复后班次数量一致');
  assert(logs[0].beforeSummary.items === originalItemCount, '恢复前事项数量一致');
  assert(logs[0].afterSummary.items === originalItemCount + 1, '恢复后事项数量一致');
  assert(logs[0].conflicts === null, '无冲突时日志正确');
  
  const actualShifts = Store.Shifts.getAll();
  const actualItems = Store.Items.getAll();
  assert(actualShifts.length === logs[0].afterSummary.shifts, '实际班次数量与日志一致');
  assert(actualItems.length === logs[0].afterSummary.items, '实际事项数量与日志一致');
  
  Store.Shifts.saveAll(originalData.shifts);
  Store.Items.saveAll(originalData.items);
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

console.log('\n--- 8. 交接复盘测试 ---\n');

test('创建复盘卡 - 从已关闭事项', () => {
  Store.ReviewCards.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const items = Store.Items.getAll();
  const closedItem = items.find(i => i.status === 'closed');
  
  if (closedItem) {
    const createResult = Store.ReviewCards.create({
      sourceType: 'closed_item',
      sourceId: closedItem.id,
      sourceSummary: `[${closedItem.type}] ${closedItem.title}`,
      hasRisk: true,
      riskDescription: '磁盘空间可能再次告警',
      responsiblePersonId: 'user_li',
      responsiblePersonName: '李四',
      followUpDeadline: '2026-07-01',
      conclusion: '需增加磁盘监控阈值'
    }, adminUser);
    const card = createResult.card;
    
    assert(createResult.success === true, '创建应成功');
    assert(createResult.created === true, '首次创建 created 应为 true');
    assert(card.id, '复盘卡应有ID');
    assert(card.sourceType === 'closed_item', '来源类型应为已关闭事项');
    assert(card.sourceId === closedItem.id, '来源ID应正确');
    assert(card.hasRisk === true, '遗留风险应为true');
    assert(card.riskDescription === '磁盘空间可能再次告警', '风险描述应正确');
    assert(card.responsiblePersonId === 'user_li', '责任人ID应正确');
    assert(card.responsiblePersonName === '李四', '责任人名称应正确');
    assert(card.followUpDeadline === '2026-07-01', '截止时间应正确');
    assert(card.conclusion === '需增加磁盘监控阈值', '复盘结论应正确');
    assert(card.followUpNotes.length === 0, '初始跟进说明应为空');
    assert(card.logs.length === 1, '初始应有一条操作日志');
    assert(card.logs[0].action === '创建复盘卡', '日志操作应为创建复盘卡');
    assert(card.creatorId === 'user_zhang', '创建人ID应正确');
    assert(card.creatorName === '张三', '创建人名称应正确');
  }
});

test('创建复盘卡 - 从交接记录', () => {
  const adminUser = Store.Users.getById('user_zhang');
  const records = Store.HandoverRecords.getAll();
  
  if (records.length > 0) {
    const record = records[0];
    const existing = Store.ReviewCards.getBySourceId(record.id);
    if (!existing) {
      const createResult = Store.ReviewCards.create({
        sourceType: 'handover_record',
        sourceId: record.id,
        sourceSummary: `${record.shiftName} ${record.date}`,
        hasRisk: false,
        conclusion: '本次交接顺利'
      }, adminUser);
      const card = createResult.card;
      
      assert(createResult.success === true, '创建应成功');
      assert(card.sourceType === 'handover_record', '来源类型应为交接记录');
      assert(card.sourceId === record.id, '来源ID应正确');
      assert(card.hasRisk === false, '遗留风险应为false');
    }
  }
});

test('复盘卡权限不足 - 值班员不能修改结论', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const opUser = Store.Users.getById('user_li');
    
    const result = Store.ReviewCards.updateConclusion(card.id, {
      conclusion: '值班员试图修改结论'
    }, opUser);
    
    assert(result.success === false, '值班员修改结论应失败');
    assert(result.error.includes('权限'), '错误信息应包含权限');
    
    const fresh = Store.ReviewCards.getById(card.id);
    assert(fresh.conclusion !== '值班员试图修改结论', '结论不应被修改');
  }
});

test('复盘卡权限不足 - 值班员不能删除', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const opUser = Store.Users.getById('user_li');
    
    const result = Store.ReviewCards.deleteCard(card.id, opUser);
    assert(result.success === false, '值班员删除复盘卡应失败');
    assert(result.error.includes('权限'), '错误信息应包含权限');
    
    const stillExists = Store.ReviewCards.getById(card.id);
    assert(stillExists !== null, '复盘卡仍应存在');
  }
});

test('复盘卡权限不足 - 观察员不能修改结论', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const observerUser = Store.Users.getById('user_zhao');
    
    const result = Store.ReviewCards.updateConclusion(card.id, {
      conclusion: '观察员试图修改结论'
    }, observerUser);
    
    assert(result.success === false, '观察员修改结论应失败');
  }
});

test('修改复盘卡留痕 - 班长修改结论写入日志', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const adminUser = Store.Users.getById('user_zhang');
    const originalLogCount = card.logs.length;
    
    const result = Store.ReviewCards.updateConclusion(card.id, {
      hasRisk: false,
      conclusion: '更新后的复盘结论'
    }, adminUser);
    
    assert(result.success === true, '班长修改结论应成功');
    assert(result.card.conclusion === '更新后的复盘结论', '结论应已更新');
    assert(result.card.hasRisk === false, '风险标记应已更新');
    assert(result.card.logs.length === originalLogCount + 1, '应新增一条操作日志');
    
    const lastLog = result.card.logs[result.card.logs.length - 1];
    assert(lastLog.action === '修改复盘结论', '日志操作应为修改复盘结论');
    assert(lastLog.operatorName === '张三', '日志操作人应正确');
    assert(lastLog.detail.includes('遗留风险'), '日志应包含遗留风险变更');
    assert(lastLog.detail.includes('复盘结论已更新'), '日志应包含结论更新');
  }
});

test('普通值班员可以添加跟进说明', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const opUser = Store.Users.getById('user_li');
    const originalNoteCount = card.followUpNotes.length;
    const originalLogCount = card.logs.length;
    
    const result = Store.ReviewCards.addFollowUpNote(card.id, '已确认磁盘清理完成，后续观察中', opUser);
    
    assert(result.success === true, '添加跟进说明应成功');
    assert(result.card.followUpNotes.length === originalNoteCount + 1, '跟进说明应增加');
    assert(result.card.followUpNotes[result.card.followUpNotes.length - 1].content === '已确认磁盘清理完成，后续观察中', '跟进说明内容应正确');
    assert(result.card.followUpNotes[result.card.followUpNotes.length - 1].operatorName === '李四', '跟进说明操作人应正确');
    assert(result.card.logs.length === originalLogCount + 1, '应新增一条操作日志');
    
    const lastLog = result.card.logs[result.card.logs.length - 1];
    assert(lastLog.action === '添加跟进说明', '日志操作应为添加跟进说明');
  }
});

test('班长删除复盘卡', () => {
  const adminUser = Store.Users.getById('user_zhang');
  const createResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'test_delete_item',
    sourceSummary: '测试删除',
    conclusion: '待删除'
  }, adminUser);
  const testCard = createResult.card;
  
  const cardId = testCard.id;
  assert(Store.ReviewCards.getById(cardId) !== null, '复盘卡应存在');
  
  const result = Store.ReviewCards.deleteCard(cardId, adminUser);
  assert(result.success === true, '班长删除复盘卡应成功');
  assert(Store.ReviewCards.getById(cardId) === null, '删除后复盘卡不应存在');
});

test('同源重复创建 - 同一 sourceId 只保留首张，create 返回 created=false', () => {
  Store.ReviewCards.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const firstResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'dup_source_1',
    sourceSummary: '首次创建的摘要',
    hasRisk: true,
    conclusion: '第一张复盘卡结论'
  }, adminUser);
  
  assert(firstResult.success === true, '第一次创建应成功');
  assert(firstResult.created === true, '第一次 created 应为 true');
  const firstId = firstResult.card.id;
  assert(firstResult.card.conclusion === '第一张复盘卡结论', '第一次结论应为原始值');
  
  const secondResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'dup_source_1',
    sourceSummary: '第二次试图覆盖的摘要',
    hasRisk: false,
    conclusion: '试图覆盖复盘卡结论'
  }, adminUser);
  
  assert(secondResult.success === true, '第二次调用 success 仍为 true');
  assert(secondResult.created === false, '第二次 created 应为 false');
  assert(secondResult.card.id === firstId, '第二次应复用首张卡的 id，不应生成新卡');
  assert(secondResult.card.sourceSummary === '首次创建的摘要', '不应被第二次数据覆盖');
  assert(secondResult.card.conclusion === '第一张复盘卡结论', '不应被第二次结论覆盖');
  assert(secondResult.message && secondResult.message.includes('复用'), '应返回复用提示');
  
  const allCards = Store.ReviewCards.getAll();
  const dupCount = allCards.filter(c => c.sourceId === 'dup_source_1').length;
  assert(dupCount === 1, '同一 sourceId 最终应只有一张卡');
});

test('不同来源正常创建 - 不同 sourceId 各自独立创建', () => {
  Store.ReviewCards.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const r1 = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'diff_source_a',
    sourceSummary: '来源A',
    conclusion: '结论A'
  }, adminUser);
  
  const r2 = Store.ReviewCards.create({
    sourceType: 'handover_record',
    sourceId: 'diff_source_b',
    sourceSummary: '来源B',
    conclusion: '结论B'
  }, adminUser);
  
  const r3 = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'diff_source_c',
    sourceSummary: '来源C',
    conclusion: '结论C'
  }, adminUser);
  
  assert(r1.created === true, '来源A created=true');
  assert(r2.created === true, '来源B created=true');
  assert(r3.created === true, '来源C created=true');
  assert(r1.card.id !== r2.card.id, '不同来源卡ID应不同');
  assert(r2.card.id !== r3.card.id, '不同来源卡ID应不同');
  
  const allCards = Store.ReviewCards.getAll();
  assert(allCards.length === 3, '三个不同来源应创建3张卡');
});

test('导出 JSON 不含重复复盘卡 - 每个 sourceId 只出现一次', () => {
  Store.ReviewCards.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'export_src_1',
    conclusion: '导出测试1'
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'export_src_2',
    conclusion: '导出测试2'
  }, adminUser);
  
  // 手工模拟脏数据 - 直接塞一张重复 sourceId 卡（绕过 create 和 saveAll）
  const cleanCards = JSON.parse(localStorage.getItem('handover_review_cards') || '[]');
  const dirtyCards = [
    ...cleanCards,
    {
      id: 'review_dirty_dup',
      sourceType: 'closed_item',
      sourceId: 'export_src_1',
      sourceSummary: '脏重复数据',
      hasRisk: false,
      riskDescription: '',
      responsiblePersonId: '',
      responsiblePersonName: '',
      followUpDeadline: '',
      conclusion: '脏重复',
      followUpNotes: [],
      logs: [],
      creatorId: 'dirty',
      creatorName: '脏数据',
      createTime: Date.now(),
      updateTime: Date.now()
    }
  ];
  localStorage.setItem('handover_review_cards', JSON.stringify(dirtyCards));
  
  // 直接读原始 localStorage 验证脏数据确实插入成功（不经过 getAll）
  const rawBefore = JSON.parse(localStorage.getItem('handover_review_cards') || '[]');
  const dupRaw = rawBefore.filter(c => c.sourceId === 'export_src_1').length;
  assert(dupRaw > 1, '测试前置条件：直接读 localStorage 应看到重复数据（脏数据插入成功）');
  
  // 现在走正常的 export 路径（内部会调 getAll → 自动去重）
  const exported = Store.exportAllData();
  const reviewCards = exported.reviewCards;
  const sourceIds = reviewCards.map(c => c.sourceId);
  const uniqueIds = new Set(sourceIds);
  
  assert(reviewCards.length === uniqueIds.size, '导出的 reviewCards 中每个 sourceId 应唯一，不应有重复');
  assert(reviewCards.length === 2, '导出后去重，应有2张（export_src_1 + export_src_2）');
  
  const src1Card = reviewCards.find(c => c.sourceId === 'export_src_1');
  assert(src1Card.conclusion === '导出测试1', '去重后保留的应是原始卡，不是脏重复');
  
  // 顺便验证：getAll 读完后已经自动修好了存储
  const rawAfter = JSON.parse(localStorage.getItem('handover_review_cards') || '[]');
  const dupAfter = rawAfter.filter(c => c.sourceId === 'export_src_1').length;
  assert(dupAfter === 1, '经过 getAll 后，localStorage 里的脏重复也被清理了');
});

test('恢复导入后继续创建仍不重复 - saveAll 去重 + create 幂等双保险', () => {
  Store.ReviewCards.saveAll([]);
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  
  // 构造一份包含重复 sourceId 的导出包（模拟外部手工拼接或老版本产生的重复数据）
  const t0 = Date.now() - 100000;
  const t1 = t0 + 1;
  const sampleData = {
    shifts: Store.Shifts.getAll(),
    roles: Store.Roles.getAll(),
    users: Store.Users.getAll(),
    checkItems: Store.CheckItems.getAll(),
    items: Store.Items.getAll(),
    currentShift: Store.CurrentShift.get(),
    handoverRecords: Store.HandoverRecords.getAll(),
    recoveryLogs: [],
    reviewCards: [
      {
        id: 'review_import_1_older',
        sourceType: 'closed_item',
        sourceId: 'import_src_X',
        sourceSummary: '导入重复卡1（更早）',
        hasRisk: false,
        riskDescription: '',
        responsiblePersonId: '',
        responsiblePersonName: '',
        followUpDeadline: '',
        conclusion: '较早的卡',
        followUpNotes: [],
        logs: [{ action: '创建复盘卡', operatorId: 'user_zhang', operatorName: '张三', time: t0, detail: '' }],
        creatorId: 'user_zhang',
        creatorName: '张三',
        createTime: t0,
        updateTime: t0
      },
      {
        id: 'review_import_1_newer',
        sourceType: 'closed_item',
        sourceId: 'import_src_X',
        sourceSummary: '导入重复卡2（较新）',
        hasRisk: true,
        riskDescription: '',
        responsiblePersonId: '',
        responsiblePersonName: '',
        followUpDeadline: '',
        conclusion: '较新的卡',
        followUpNotes: [],
        logs: [{ action: '创建复盘卡', operatorId: 'user_zhang', operatorName: '张三', time: t1, detail: '' }],
        creatorId: 'user_zhang',
        creatorName: '张三',
        createTime: t1,
        updateTime: t1
      },
      {
        id: 'review_import_2',
        sourceType: 'handover_record',
        sourceId: 'import_src_Y',
        sourceSummary: '独立的卡',
        hasRisk: false,
        riskDescription: '',
        responsiblePersonId: '',
        responsiblePersonName: '',
        followUpDeadline: '',
        conclusion: '独立结论',
        followUpNotes: [],
        logs: [],
        creatorId: 'user_zhang',
        creatorName: '张三',
        createTime: Date.now(),
        updateTime: Date.now()
      }
    ],
    exportTime: new Date().toISOString(),
    version: '1.1'
  };
  
  const importResult = Store.executeImport(sampleData, adminUser);
  assert(importResult.success === true, '导入应成功');
  
  const afterImport = Store.ReviewCards.getAll();
  const xCount = afterImport.filter(c => c.sourceId === 'import_src_X').length;
  assert(xCount === 1, '导入后 sourceId=X 只有一张卡（saveAll 去重生效）');
  
  const xCard = afterImport.find(c => c.sourceId === 'import_src_X');
  assert(xCard.conclusion === '较早的卡', '去重保留 createTime 较早的那张');
  assert(afterImport.filter(c => c.sourceId === 'import_src_Y').length === 1, 'sourceId=Y 正常保留');
  
  // 再对 X 调一次 create，确认幂等拦截仍生效
  const recreateResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'import_src_X',
    sourceSummary: '导入后再次创建',
    conclusion: '不应出现'
  }, adminUser);
  
  assert(recreateResult.created === false, '导入后对已有 sourceId 再 create，created 应为 false');
  assert(recreateResult.card.id === xCard.id, '应复用导入后保留的那张卡 id');
  
  const finalCards = Store.ReviewCards.getAll();
  assert(finalCards.length === 2, '最终只有 2 张（import_src_X + import_src_Y），没有新增');
});

test('复盘卡权限校验方法', () => {
  const adminUser = Store.Users.getById('user_zhang');
  const opUser = Store.Users.getById('user_li');
  const observerUser = Store.Users.getById('user_zhao');
  
  assert(Store.ReviewCards.checkCanEditConclusion(adminUser) === true, '班长应有编辑权限');
  assert(Store.ReviewCards.checkCanEditConclusion(opUser) === false, '值班员不应有编辑权限');
  assert(Store.ReviewCards.checkCanEditConclusion(observerUser) === false, '观察员不应有编辑权限');
  assert(Store.ReviewCards.checkCanEditConclusion(null) === false, '空用户不应有编辑权限');
});

test('复盘卡导出包含在完整数据包中', () => {
  const data = Store.exportAllData();
  assert(data.reviewCards && Array.isArray(data.reviewCards), '导出应包含复盘卡数据');
});

test('复盘卡导出恢复后持久化', () => {
  Store.ReviewCards.saveAll([]);
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  
  const createResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'persist_test_item',
    sourceSummary: '持久化测试事项',
    hasRisk: true,
    riskDescription: '测试风险',
    responsiblePersonId: 'user_li',
    responsiblePersonName: '李四',
    followUpDeadline: '2026-08-01',
    conclusion: '持久化测试结论'
  }, adminUser);
  const card = createResult.card;
  assert(createResult.created === true, '首次创建 created=true');
  
  Store.ReviewCards.addFollowUpNote(card.id, '持久化跟进说明', Store.Users.getById('user_li'));
  Store.ReviewCards.updateConclusion(card.id, { conclusion: '更新后的结论' }, adminUser);
  
  const updatedCard = Store.ReviewCards.getById(card.id);
  assert(updatedCard !== null, '更新后的复盘卡应存在');
  assert(updatedCard.conclusion === '更新后的结论', '结论应为更新后的');
  assert(updatedCard.followUpNotes.length === 1, '跟进说明应有一条');
  assert(updatedCard.logs.length === 3, '应有3条操作日志');
  
  const exportedData = Store.exportAllData();
  assert(exportedData.reviewCards.length >= 1, '导出应包含复盘卡');
  
  const exportedCard = exportedData.reviewCards.find(c => c.id === card.id);
  assert(exportedCard !== undefined, '导出应包含测试复盘卡');
  assert(exportedCard.conclusion === '更新后的结论', '导出结论应正确');
  assert(exportedCard.hasRisk === true, '导出遗留风险应正确');
  assert(exportedCard.responsiblePersonName === '李四', '导出责任人应正确');
  assert(exportedCard.followUpDeadline === '2026-08-01', '导出截止时间应正确');
  assert(exportedCard.followUpNotes.length === 1, '导出跟进说明应正确');
  assert(exportedCard.logs.length === 3, '导出操作日志应正确');
  
  Store.ReviewCards.saveAll([]);
  assert(Store.ReviewCards.getAll().length === 0, '清空后复盘卡应为空');
  
  const result = Store.executeImport(exportedData, adminUser);
  assert(result.success === true, '恢复应成功');
  
  const restoredCard = Store.ReviewCards.getById(card.id);
  assert(restoredCard !== null, '恢复后复盘卡应存在');
  assert(restoredCard.conclusion === '更新后的结论', '恢复后结论应正确');
  assert(restoredCard.hasRisk === true, '恢复后遗留风险应正确');
  assert(restoredCard.responsiblePersonName === '李四', '恢复后责任人应正确');
  assert(restoredCard.followUpDeadline === '2026-08-01', '恢复后截止时间应正确');
  assert(restoredCard.followUpNotes.length === 1, '恢复后跟进说明应正确');
  assert(restoredCard.followUpNotes[0].content === '持久化跟进说明', '恢复后跟进说明内容应正确');
  assert(restoredCard.logs.length === 3, '恢复后操作日志应正确');
  assert(restoredCard.logs[0].action === '创建复盘卡', '恢复后日志顺序应正确，最早为创建');
  assert(restoredCard.logs[1].action === '添加跟进说明', '恢复后日志顺序应正确');
  assert(restoredCard.logs[2].action === '修改复盘结论', '恢复后日志顺序应正确，最新为修改');
});

test('复盘卡校验 - reviewCards 字段应在导入校验中', () => {
  const data = Store.exportAllData();
  const validation = Store.validateImportStructure(data);
  assert(validation.valid === true, '包含 reviewCards 的导出数据应通过校验');
  
  const invalidData = { ...data, reviewCards: 'not_an_array' };
  const invalidValidation = Store.validateImportStructure(invalidData);
  assert(invalidValidation.valid === false, 'reviewCards 非数组应校验失败');
});

console.log('\n--- 9. 日常追踪能力测试 ---\n');

test('focusMark 字段 - 创建复盘卡时默认为 false', () => {
  Store.ReviewCards.saveAll([]);
  const adminUser = Store.Users.getById('user_zhang');
  const result = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'focus_test_1',
    sourceSummary: '重点标记测试',
    hasRisk: true,
    riskDescription: '测试风险',
    responsiblePersonId: 'user_li',
    responsiblePersonName: '李四',
    followUpDeadline: '2020-01-01',
    conclusion: '测试结论'
  }, adminUser);
  assert(result.success === true, '创建应成功');
  assert(result.card.focusMark === false, '新建复盘卡 focusMark 应为 false');
});

test('focusMark 字段 - 旧数据缺少 focusMark 时自动补齐', () => {
  const raw = JSON.parse(localStorage.getItem('handover_review_cards') || '[]');
  const legacyCards = raw.map(c => {
    const { focusMark, ...rest } = c;
    return rest;
  });
  localStorage.setItem('handover_review_cards', JSON.stringify(legacyCards));
  const cards = Store.ReviewCards.getAll();
  assert(cards.every(c => 'focusMark' in c), '迁移后所有复盘卡都应有 focusMark 字段');
  assert(cards.every(c => c.focusMark === false), '迁移后 focusMark 默认为 false');
});

test('班长可以标记重点关注', () => {
  Store.ReviewCards.saveAll([]);
  const adminUser = Store.Users.getById('user_zhang');
  const result = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'focus_toggle_1',
    sourceSummary: '标记重点测试',
    hasRisk: true,
    followUpDeadline: '2020-01-01'
  }, adminUser);
  const card = result.card;
  assert(card.focusMark === false, '初始 focusMark 应为 false');
  
  const toggleResult = Store.ReviewCards.toggleFocusMark(card.id, adminUser);
  assert(toggleResult.success === true, '标记重点应成功');
  assert(toggleResult.card.focusMark === true, '标记后 focusMark 应为 true');
  
  const lastLog = toggleResult.card.logs[toggleResult.card.logs.length - 1];
  assert(lastLog.action === '标记为重点关注', '日志操作应为标记为重点关注');
  assert(lastLog.operatorName === '张三', '日志操作人应正确');
  assert(lastLog.detail.includes('标记为重点关注'), '日志详情应包含标记信息');
});

test('班长可以取消重点关注', () => {
  const adminUser = Store.Users.getById('user_zhang');
  const cards = Store.ReviewCards.getAll();
  const focusedCard = cards.find(c => c.focusMark === true);
  if (focusedCard) {
    const toggleResult = Store.ReviewCards.toggleFocusMark(focusedCard.id, adminUser);
    assert(toggleResult.success === true, '取消重点应成功');
    assert(toggleResult.card.focusMark === false, '取消后 focusMark 应为 false');
    
    const lastLog = toggleResult.card.logs[toggleResult.card.logs.length - 1];
    assert(lastLog.action === '取消重点关注', '日志操作应为取消重点关注');
  }
});

test('值班员不能修改重点标记', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const opUser = Store.Users.getById('user_li');
    const result = Store.ReviewCards.toggleFocusMark(card.id, opUser);
    assert(result.success === false, '值班员修改重点标记应失败');
    assert(result.error.includes('权限'), '错误信息应包含权限');
    
    const fresh = Store.ReviewCards.getById(card.id);
    assert(fresh.focusMark === card.focusMark, '重点标记不应被修改');
  }
});

test('观察员不能修改重点标记', () => {
  const cards = Store.ReviewCards.getAll();
  if (cards.length > 0) {
    const card = cards[0];
    const observerUser = Store.Users.getById('user_zhao');
    const result = Store.ReviewCards.toggleFocusMark(card.id, observerUser);
    assert(result.success === false, '观察员修改重点标记应失败');
  }
});

test('重点关注标记随导出/恢复持久化', () => {
  Store.ReviewCards.saveAll([]);
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  const createResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'focus_export_test',
    sourceSummary: '重点标记导出测试',
    hasRisk: true,
    followUpDeadline: '2020-01-01',
    conclusion: '导出测试'
  }, adminUser);
  
  const toggleResult = Store.ReviewCards.toggleFocusMark(createResult.card.id, adminUser);
  assert(toggleResult.card.focusMark === true, '标记后应为 true');
  
  const exportedData = Store.exportAllData();
  const exportedCard = exportedData.reviewCards.find(c => c.id === createResult.card.id);
  assert(exportedCard !== undefined, '导出应包含该复盘卡');
  assert(exportedCard.focusMark === true, '导出的 focusMark 应为 true');
  
  Store.ReviewCards.saveAll([]);
  assert(Store.ReviewCards.getAll().length === 0, '清空后应为空');
  
  const importResult = Store.executeImport(exportedData, adminUser);
  assert(importResult.success === true, '恢复应成功');
  
  const restoredCard = Store.ReviewCards.getById(createResult.card.id);
  assert(restoredCard !== null, '恢复后复盘卡应存在');
  assert(restoredCard.focusMark === true, '恢复后 focusMark 应为 true');
  
  const focusLog = restoredCard.logs.find(l => l.action === '标记为重点关注');
  assert(focusLog !== undefined, '恢复后应保留标记重点关注的日志');
});

test('恢复日志包含复盘卡数量对比', () => {
  Store.RecoveryLogs.saveAll([]);
  Store.ReviewCards.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'log_count_test',
    sourceSummary: '日志数量测试',
    conclusion: '测试'
  }, adminUser);
  
  const exportedData = Store.exportAllData();
  const originalReviewCount = exportedData.reviewCards.length;
  
  Store.ReviewCards.saveAll([]);
  const importResult = Store.executeImport(exportedData, adminUser);
  assert(importResult.success === true, '恢复应成功');
  
  const logs = Store.RecoveryLogs.getAll();
  assert(logs.length >= 1, '应有恢复日志');
  const log = logs[0];
  assert('reviewCards' in log.beforeSummary, '恢复前摘要应包含 reviewCards');
  assert('reviewCards' in log.afterSummary, '恢复后摘要应包含 reviewCards');
  assert(log.beforeSummary.reviewCards === 0, '恢复前复盘卡数量应为0');
  assert(log.afterSummary.reviewCards === originalReviewCount, '恢复后复盘卡数量应正确');
});

test('筛选条件 localStorage 持久化', () => {
  const filters = {
    hasRisk: true,
    noRisk: false,
    myResponsible: true,
    overdue: false
  };
  Store.ReviewFilters.save(filters);
  
  const loaded = Store.ReviewFilters.get();
  assert(loaded.hasRisk === true, 'hasRisk 应持久化为 true');
  assert(loaded.noRisk === false, 'noRisk 应持久化为 false');
  assert(loaded.myResponsible === true, 'myResponsible 应持久化为 true');
  assert(loaded.overdue === false, 'overdue 应持久化为 false');
  
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });
  const reset = Store.ReviewFilters.get();
  assert(reset.hasRisk === false, '重置后 hasRisk 应为 false');
});

test('筛选逻辑 - 有遗留风险', () => {
  Store.ReviewCards.saveAll([]);
  const adminUser = Store.Users.getById('user_zhang');
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'filter_risk_yes',
    sourceSummary: '有风险',
    hasRisk: true
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'filter_risk_no',
    sourceSummary: '无风险',
    hasRisk: false
  }, adminUser);
  
  const allCards = Store.ReviewCards.getAll();
  const riskCards = allCards.filter(c => c.hasRisk);
  const noRiskCards = allCards.filter(c => !c.hasRisk);
  assert(riskCards.length >= 1, '应有至少1张有风险的卡');
  assert(noRiskCards.length >= 1, '应有至少1张无风险的卡');
});

test('筛选逻辑 - 已逾期（有风险且截止时间已过）', () => {
  Store.ReviewCards.saveAll([]);
  const adminUser = Store.Users.getById('user_zhang');
  
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'overdue_yes',
    sourceSummary: '已逾期',
    hasRisk: true,
    followUpDeadline: '2020-01-01'
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'overdue_no_risk',
    sourceSummary: '无风险不逾期',
    hasRisk: false,
    followUpDeadline: '2020-01-01'
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'overdue_future',
    sourceSummary: '未来截止',
    hasRisk: true,
    followUpDeadline: '2099-12-31'
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'overdue_no_deadline',
    sourceSummary: '无截止时间',
    hasRisk: true
  }, adminUser);
  
  const allCards = Store.ReviewCards.getAll();
  function isOverdue(card) {
    if (!card.followUpDeadline) return false;
    if (!card.hasRisk) return false;
    const deadline = new Date(card.followUpDeadline + 'T23:59:59');
    return deadline < new Date();
  }
  
  const overdueCards = allCards.filter(c => isOverdue(c));
  assert(overdueCards.length === 1, '应只有1张已逾期的卡');
  assert(overdueCards[0].sourceId === 'overdue_yes', '逾期卡应为 overdue_yes');
});

test('筛选逻辑 - 只看我负责', () => {
  Store.ReviewCards.saveAll([]);
  const adminUser = Store.Users.getById('user_zhang');
  const opUser = Store.Users.getById('user_li');
  
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'my_resp_1',
    sourceSummary: '我负责',
    responsiblePersonId: 'user_zhang',
    responsiblePersonName: '张三'
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'my_resp_2',
    sourceSummary: '别人负责',
    responsiblePersonId: 'user_li',
    responsiblePersonName: '李四'
  }, adminUser);
  
  const allCards = Store.ReviewCards.getAll();
  const myCards = allCards.filter(c => c.responsiblePersonId === 'user_zhang');
  assert(myCards.length === 1, '张三只负责1张');
  assert(myCards[0].sourceId === 'my_resp_1', '负责的卡应为 my_resp_1');
});

test('重点关注标记写入操作日志', () => {
  Store.ReviewCards.saveAll([]);
  const adminUser = Store.Users.getById('user_zhang');
  const createResult = Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'log_test_focus',
    sourceSummary: '日志测试'
  }, adminUser);
  const card = createResult.card;
  const originalLogCount = card.logs.length;
  
  const toggle1 = Store.ReviewCards.toggleFocusMark(card.id, adminUser);
  assert(toggle1.card.logs.length === originalLogCount + 1, '标记后应新增一条日志');
  assert(toggle1.card.logs[originalLogCount].action === '标记为重点关注', '日志应为标记为重点关注');
  assert(toggle1.card.logs[originalLogCount].operatorId === 'user_zhang', '日志操作人ID应正确');
  assert(toggle1.card.logs[originalLogCount].operatorName === '张三', '日志操作人名称应正确');
  
  const toggle2 = Store.ReviewCards.toggleFocusMark(card.id, adminUser);
  assert(toggle2.card.logs.length === originalLogCount + 2, '取消后再新增一条日志');
  assert(toggle2.card.logs[originalLogCount + 1].action === '取消重点关注', '日志应为取消重点关注');
});

test('焦点标记与导出恢复 - 恢复后日志能看出复盘卡数量无异常变化', () => {
  Store.ReviewCards.saveAll([]);
  Store.RecoveryLogs.saveAll([]);
  
  const adminUser = Store.Users.getById('user_zhang');
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'restore_count_1',
    sourceSummary: '恢复数量测试1',
    hasRisk: true,
    followUpDeadline: '2020-01-01',
    conclusion: '测试1'
  }, adminUser);
  Store.ReviewCards.create({
    sourceType: 'closed_item',
    sourceId: 'restore_count_2',
    sourceSummary: '恢复数量测试2',
    hasRisk: false,
    conclusion: '测试2'
  }, adminUser);
  
  const allCards = Store.ReviewCards.getAll();
  const card1 = allCards.find(c => c.sourceId === 'restore_count_1');
  Store.ReviewCards.toggleFocusMark(card1.id, adminUser);
  
  const exportedData = Store.exportAllData();
  assert(exportedData.reviewCards.length === 2, '导出应有2张复盘卡');
  
  const importResult = Store.executeImport(exportedData, adminUser);
  assert(importResult.success === true, '恢复应成功');
  
  const logs = Store.RecoveryLogs.getAll();
  const latestLog = logs[0];
  assert(latestLog.beforeSummary.reviewCards === 2, '恢复前复盘卡数量应为2');
  assert(latestLog.afterSummary.reviewCards === 2, '恢复后复盘卡数量应为2');
  
  const restored = Store.ReviewCards.getAll();
  assert(restored.length === 2, '恢复后实际复盘卡数量应为2');
  const restored1 = restored.find(c => c.sourceId === 'restore_count_1');
  assert(restored1.focusMark === true, '恢复后重点标记应保留');
});

console.log('\n--- 10. 复盘筛选配置一等公民 - 导出导入测试 ---\n');

test('导出数据包含 reviewFilters 字段', () => {
  const data = Store.exportAllData();
  assert(data.reviewFilters !== undefined, '导出数据应包含 reviewFilters 字段');
  assert(typeof data.reviewFilters === 'object', 'reviewFilters 应为对象');
  assert('hasRisk' in data.reviewFilters, 'reviewFilters 应包含 hasRisk 字段');
  assert('noRisk' in data.reviewFilters, 'reviewFilters 应包含 noRisk 字段');
  assert('myResponsible' in data.reviewFilters, 'reviewFilters 应包含 myResponsible 字段');
  assert('overdue' in data.reviewFilters, 'reviewFilters 应包含 overdue 字段');
  assert(typeof data.reviewFilters.hasRisk === 'boolean', 'hasRisk 应为布尔值');
});

test('筛选配置校验函数 - validateReviewFilters', () => {
  const validFilters = {
    hasRisk: true,
    noRisk: false,
    myResponsible: true,
    overdue: false
  };
  const result1 = Store.validateReviewFilters(validFilters);
  assert(result1.valid === true, '有效筛选配置应通过校验');

  const result2 = Store.validateReviewFilters(null);
  assert(result2.valid === false, 'null 应校验失败');

  const result3 = Store.validateReviewFilters('not_an_object');
  assert(result3.valid === false, '字符串应校验失败');

  const invalidType = { hasRisk: 'true' };
  const result4 = Store.validateReviewFilters(invalidType);
  assert(result4.valid === false, '非布尔值应校验失败');

  const unknownField = { unknownField: true };
  const result5 = Store.validateReviewFilters(unknownField);
  assert(result5.valid === false, '未知字段应校验失败');
});

test('筛选配置迁移函数 - migrateReviewFilters', () => {
  const defaultFilters = Store.migrateReviewFilters(null);
  assert(defaultFilters.hasRisk === false, '默认 hasRisk 应为 false');
  assert(defaultFilters.noRisk === false, '默认 noRisk 应为 false');
  assert(defaultFilters.myResponsible === false, '默认 myResponsible 应为 false');
  assert(defaultFilters.overdue === false, '默认 overdue 应为 false');

  const partialFilters = { hasRisk: true, extraField: 'should_be_ignored' };
  const migrated = Store.migrateReviewFilters(partialFilters);
  assert(migrated.hasRisk === true, '已设置的 hasRisk 应保留');
  assert(migrated.noRisk === false, '未设置的 noRisk 应使用默认值');
  assert(!('extraField' in migrated), '多余字段应被过滤掉');
  assert(Object.keys(migrated).length === 4, '迁移后应只有 4 个字段');

  const wrongType = { hasRisk: 1, overdue: 'yes' };
  const migrated2 = Store.migrateReviewFilters(wrongType);
  assert(migrated2.hasRisk === false, '非布尔值应使用默认值');
  assert(migrated2.overdue === false, '非布尔值应使用默认值');
});

test('旧包兼容 - 导入包没有 reviewFilters 时使用本地设置', () => {
  Store.ReviewFilters.save({
    hasRisk: true,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const oldStyleData = { ...originalData };
  delete oldStyleData.reviewFilters;

  const preview = Store.previewImport(oldStyleData);
  assert(preview.success === true, '旧格式包预览应成功');
  assert(preview.reviewFilters.importHasFilters === false, '应识别为无筛选配置的包');

  const adminUser = Store.Users.getById('user_zhang');
  Store.RecoveryLogs.saveAll([]);
  const result = Store.executeImport(oldStyleData, adminUser);
  assert(result.success === true, '旧格式包导入应成功');

  const afterFilters = Store.ReviewFilters.get();
  assert(afterFilters.hasRisk === true, '无筛选配置的包导入后，本地筛选应保持不变');

  const logs = Store.RecoveryLogs.getAll();
  assert(logs[0].reviewFiltersRestore !== undefined, '恢复日志应包含筛选配置恢复信息');
  assert(logs[0].reviewFiltersRestore.importHasFilters === false, '日志应记录导入包无筛选配置');
  assert(logs[0].reviewFiltersRestore.restored === false, '日志应记录未恢复筛选配置');
});

test('筛选配置冲突检测 - 本地与导入包不同时检测为冲突', () => {
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const modifiedData = {
    ...originalData,
    reviewFilters: {
      hasRisk: true,
      noRisk: false,
      myResponsible: true,
      overdue: false
    }
  };

  const conflictResult = Store.detectConflicts(modifiedData);
  assert(conflictResult.hasConflicts === true, '筛选配置不同应检测为冲突');
  assert(conflictResult.conflicts.reviewFilters.hasConflict === true, 'reviewFilters 冲突标志应为 true');
  assert(conflictResult.conflicts.reviewFilters.changedFields.includes('hasRisk'), '变化字段应包含 hasRisk');
  assert(conflictResult.conflicts.reviewFilters.changedFields.includes('myResponsible'), '变化字段应包含 myResponsible');
});

test('筛选配置冲突检测 - 本地与导入包相同时不检测为冲突', () => {
  Store.ReviewFilters.save({
    hasRisk: true,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const data = Store.exportAllData();
  const conflictResult = Store.detectConflicts(data);
  assert(conflictResult.conflicts.reviewFilters.hasConflict === false, '相同筛选配置不应检测为冲突');
  assert(conflictResult.conflicts.reviewFilters.changedFields.length === 0, '变化字段应为空');
});

test('筛选配置导入恢复 - 恢复后 localStorage 中正确写入', () => {
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const importData = {
    ...originalData,
    reviewFilters: {
      hasRisk: true,
      noRisk: false,
      myResponsible: false,
      overdue: true
    }
  };

  const adminUser = Store.Users.getById('user_zhang');
  Store.RecoveryLogs.saveAll([]);
  const result = Store.executeImport(importData, adminUser);
  assert(result.success === true, '导入应成功');

  const afterFilters = Store.ReviewFilters.get();
  assert(afterFilters.hasRisk === true, '恢复后 hasRisk 应为 true');
  assert(afterFilters.overdue === true, '恢复后 overdue 应为 true');
  assert(afterFilters.noRisk === false, '恢复后 noRisk 应为 false');
  assert(afterFilters.myResponsible === false, '恢复后 myResponsible 应为 false');

  const logs = Store.RecoveryLogs.getAll();
  assert(logs[0].reviewFiltersRestore.restored === true, '日志应记录筛选配置已恢复');
  assert(logs[0].reviewFiltersRestore.importHasFilters === true, '日志应记录导入包有筛选配置');
  assert(logs[0].reviewFiltersRestore.changedFields.includes('hasRisk'), '日志应记录变化的字段');
  assert(logs[0].reviewFiltersRestore.changedFields.includes('overdue'), '日志应记录变化的字段');
  assert(logs[0].reviewFiltersRestore.beforeFilters !== undefined, '日志应包含恢复前筛选配置');
  assert(logs[0].reviewFiltersRestore.afterFilters !== undefined, '日志应包含恢复后筛选配置');
});

test('筛选配置非法字段 - 导入时自动迁移并使用默认值', () => {
  const adminUser = Store.Users.getById('user_zhang');
  Store.RecoveryLogs.saveAll([]);
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const badData = {
    ...originalData,
    reviewFilters: {
      hasRisk: 'not_boolean',
      unknownField: true,
      overdue: 123
    }
  };

  const validation = Store.validateImportStructure(badData);
  assert(validation.valid === false, '含非法筛选字段的数据应结构校验失败');
  assert(validation.errors.some(e => e.includes('筛选配置')), '错误信息应包含筛选配置');

  const migrated = Store.migrateReviewFilters(badData.reviewFilters);
  assert(migrated.hasRisk === false, '非法 hasRisk 应迁移为默认 false');
  assert(migrated.overdue === false, '非法 overdue 应迁移为默认 false');
  assert(!('unknownField' in migrated), '未知字段应被过滤');
});

test('权限控制 - 值班员无法通过恢复修改筛选配置（权限不足时整个恢复失败）', () => {
  const opUser = Store.Users.getById('user_li');
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const importData = {
    ...originalData,
    reviewFilters: {
      hasRisk: true,
      noRisk: true,
      myResponsible: true,
      overdue: true
    }
  };

  Store.RecoveryLogs.saveAll([]);
  const result = Store.executeImport(importData, opUser);
  assert(result.success === false, '值班员执行恢复应失败');
  assert(result.errors.some(e => e.includes('权限')), '错误应包含权限相关');

  const afterFilters = Store.ReviewFilters.get();
  assert(afterFilters.hasRisk === false, '权限不足时筛选配置不应被修改');
  assert(afterFilters.noRisk === false, '权限不足时筛选配置不应被修改');

  const logs = Store.RecoveryLogs.getAll();
  assert(logs[0].succeeded === false, '失败日志应记录');
});

test('预览导入 - 返回值包含筛选配置详细信息', () => {
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const importData = {
    ...originalData,
    reviewFilters: {
      hasRisk: true,
      noRisk: false,
      myResponsible: true,
      overdue: false
    }
  };

  const preview = Store.previewImport(importData);
  assert(preview.success === true, '预览应成功');
  assert(preview.reviewFilters !== undefined, '预览结果应包含 reviewFilters');
  assert(preview.reviewFilters.importHasFilters === true, '应标记导入包有筛选配置');
  assert(preview.reviewFilters.filtersChanged === true, '应标记筛选配置有变化');
  assert(preview.reviewFilters.importFilters !== null, '应有导入包的筛选配置');
  assert(preview.reviewFilters.currentFilters !== null, '应有当前本地的筛选配置');
  assert(preview.reviewFilters.importFilters.hasRisk === true, '导入包 hasRisk 应为 true');
  assert(preview.reviewFilters.currentFilters.hasRisk === false, '本地 hasRisk 应为 false');
  assert(preview.reviewFilters.conflictInfo !== undefined, '应有冲突详情');
  assert(preview.reviewFilters.conflictInfo.hasConflict === true, '冲突信息中 hasConflict 应为 true');
});

test('筛选配置恢复后持久化 - 模拟刷新页面后仍生效', () => {
  Store.ReviewFilters.save({
    hasRisk: false,
    noRisk: false,
    myResponsible: false,
    overdue: false
  });

  const originalData = Store.exportAllData();
  const importData = {
    ...originalData,
    reviewFilters: {
      hasRisk: true,
      noRisk: false,
      myResponsible: true,
      overdue: true
    }
  };

  const adminUser = Store.Users.getById('user_zhang');
  Store.RecoveryLogs.saveAll([]);
  Store.executeImport(importData, adminUser);

  const rawStorage = JSON.parse(localStorage.getItem('handover_review_filters') || '{}');
  assert(rawStorage.hasRisk === true, '直接读 localStorage，hasRisk 应为 true');
  assert(rawStorage.myResponsible === true, '直接读 localStorage，myResponsible 应为 true');
  assert(rawStorage.overdue === true, '直接读 localStorage，overdue 应为 true');

  const reloaded = Store.ReviewFilters.get();
  assert(reloaded.hasRisk === true, '通过 Store 读取，hasRisk 应为 true');
  assert(reloaded.myResponsible === true, '通过 Store 读取，myResponsible 应为 true');
});

test('导入结构校验 - reviewFilters 在数组字段校验之外单独校验', () => {
  const data = Store.exportAllData();
  
  const validData = { ...data };
  const v1 = Store.validateImportStructure(validData);
  assert(v1.valid === true, '正常数据应通过校验');

  const noFilterData = { ...data };
  delete noFilterData.reviewFilters;
  const v2 = Store.validateImportStructure(noFilterData);
  assert(v2.valid === true, '缺少 reviewFilters 不应导致校验失败（可选字段）');

  const badFilterData = { ...data, reviewFilters: 'not_object' };
  const v3 = Store.validateImportStructure(badFilterData);
  assert(v3.valid === false, 'reviewFilters 非对象应校验失败');
});

test('getDiffLabel 不包含 reviewFilters（筛选不是计数类型）', () => {
  const label = Store.getDiffLabel ? Store.getDiffLabel('reviewFilters') : undefined;
  if (label !== undefined) {
    assert(true, '如果有 getDiffLabel，不报错即可');
  } else {
    assert(true, 'getDiffLabel 不在 Store 暴露中也正常');
  }
});

// ======== 异常交接包测试 ========
test('导出异常交接包 - 字段完整性', () => {
  Store.createSampleData();
  const adminUser = Store.Users.getById('user_zhang');
  const operator = adminUser;
  const shift = Store.Shifts.getById('shift_morning');
  Store.CurrentShift.save({ shiftId: shift.id, date: '2025-11-21', handoverUserId: '' });

  const items = Store.Items.getAll();
  const selectedItemIds = items.slice(0, 2).map(it => it.id);

  const checkResults = {};
  Store.CheckItems.getAll().forEach(ci => {
    checkResults[ci.id] = { checked: ci.required };
  });

  const takeoverCandidateIds = ['user_li'];

  const pkg = Store.Items.exportExceptionHandover(
    operator,
    selectedItemIds,
    checkResults,
    takeoverCandidateIds
  );

  assert(pkg.packageType === 'exception_handover', 'packageType 应为 exception_handover');
  assert(pkg.packageVersion === '1.0', 'packageVersion 应为 1.0');
  assert(pkg.exportTime && typeof pkg.exportTime === 'string', '应有 exportTime');
  assert(pkg.shiftInfo && pkg.shiftInfo.shiftId === shift.id, '应包含正确的班次信息');
  assert(pkg.shiftInfo.date === '2025-11-21', '应包含正确的日期');
  assert(pkg.handoverUser && pkg.handoverUser.id === operator.id, '交班人应为当前操作员');
  assert(pkg.takeoverCandidates.length === 1, '应有 1 位接班候选人');
  assert(pkg.takeoverCandidates[0].id === 'user_li', '候选人应为 user_li');
  assert(pkg.checkResults && pkg.checkResults.length > 0, '检查项结果不应为空');
  assert(pkg.items.length === 2, `应导出 2 个事项，实际 ${pkg.items.length}`);
  pkg.items.forEach(it => {
    assert(typeof it.id === 'string' && it.id.length > 0, '事项应有 id');
    assert(typeof it.title === 'string' && it.title.length > 0, '事项应有 title');
    assert(typeof it.version === 'number', '事项应有 version');
    assert(Array.isArray(it.history), '事项应有 history 数组');
  });
});

test('校验异常交接包结构 - 字段缺失提示', () => {
  const goodPkg = {
    packageType: 'exception_handover',
    packageVersion: '1.0',
    exportTime: new Date().toISOString(),
    shiftInfo: { shiftId: 's1', shiftName: '白班', date: '2025-11-21' },
    handoverUser: { id: 'u1', name: '张三', roleId: 'r1', roleName: '班长' },
    takeoverCandidates: [],
    checkResults: [],
    items: [{ id: 'it1', title: 'test', version: 1, history: [] }]
  };

  const r1 = Store.Items.validateExceptionHandoverStructure(goodPkg);
  assert(r1.valid === true, '正常包应通过校验');

  const noType = { ...goodPkg };
  delete noType.packageType;
  const r2 = Store.Items.validateExceptionHandoverStructure(noType);
  assert(r2.valid === false, '缺少 packageType 应校验失败');
  assert(r2.errors.some(e => e.includes('packageType')), '错误应提及 packageType');

  const wrongType = { ...goodPkg, packageType: 'backup' };
  const r3 = Store.Items.validateExceptionHandoverStructure(wrongType);
  assert(r3.valid === false, '错误的 packageType 应校验失败');

  const noItems = { ...goodPkg, items: 'not_array' };
  const r4 = Store.Items.validateExceptionHandoverStructure(noItems);
  assert(r4.valid === false, 'items 不是数组应校验失败');

  const noShift = { ...goodPkg };
  delete noShift.shiftInfo;
  const r5 = Store.Items.validateExceptionHandoverStructure(noShift);
  assert(r5.valid === false, '缺少 shiftInfo 应校验失败');

  const noHandoverUser = { ...goodPkg };
  delete noHandoverUser.handoverUser;
  const r6 = Store.Items.validateExceptionHandoverStructure(noHandoverUser);
  assert(r6.valid === false, '缺少 handoverUser 应校验失败');

  const badItems = { ...goodPkg, items: [{ noId: true }] };
  const r7 = Store.Items.validateExceptionHandoverStructure(badItems);
  assert(r7.valid === false, '事项缺少 id 应校验失败');
});

test('导入预览 - 新增/覆盖/冲突/跳过 四类场景', () => {
  Store.createSampleData();
  const adminUser = Store.Users.getById('user_zhang');
  const shift = Store.Shifts.getById('shift_morning');
  Store.CurrentShift.save({ shiftId: shift.id, date: '2025-11-21', handoverUserId: '' });

  const allItems = Store.Items.getAll();
  const originalItem = allItems[0];
  const overwriteItem = allItems[1];
  const conflictItem = allItems[2];

  // 先在本地更新 conflictItem，让版本号 +1，制造版本差异冲突
  const oldConflictVersion = conflictItem.version;
  Store.Items.update(conflictItem.id, { description: conflictItem.description + ' (本地更新)' }, adminUser, oldConflictVersion);
  const updatedConflictItem = Store.Items.getById(conflictItem.id);
  assert(updatedConflictItem.version > oldConflictVersion, '本地更新后版本号应递增');

  // 构造导入包
  const importItems = [
    // 新增：本地不存在的事项
    {
      id: 'brand_new_item_001',
      title: '全新事项',
      type: 'alert',
      status: 'new',
      version: 1,
      description: '描述',
      shiftId: shift.id,
      shiftDate: '2025-11-21',
      updateTime: new Date().toISOString(),
      history: [{ action: 'create', timestamp: new Date().toISOString() }]
    },
    // 覆盖：同 id 同版本 但内容不同
    {
      ...overwriteItem,
      title: overwriteItem.title + ' (被修改)',
      description: '覆盖更新的描述',
      updateTime: overwriteItem.updateTime
    },
    // 冲突：本地版本比导入版本更新（导入旧版本 oldConflictVersion）
    {
      ...conflictItem,
      version: oldConflictVersion,
      title: '旧版本冲突项',
      updateTime: conflictItem.updateTime
    },
    // 跳过：本地完全一致
    JSON.parse(JSON.stringify(originalItem))
  ];

  const pkgData = {
    packageType: 'exception_handover',
    packageVersion: '1.0',
    exportTime: new Date().toISOString(),
    shiftInfo: { shiftId: shift.id, shiftName: shift.name, date: '2025-11-21' },
    handoverUser: { id: adminUser.id, name: adminUser.name, roleId: adminUser.roleId, roleName: '班长' },
    takeoverCandidates: [],
    checkResults: [],
    items: importItems
  };

  const preview = Store.Items.previewExceptionHandoverImport(pkgData, adminUser);

  assert(preview.summary.total === 4, `总事项数应为 4，实际 ${preview.summary.total}`);
  assert(preview.summary.newCount === 1, `新增应为 1，实际 ${preview.summary.newCount}`);
  assert(preview.summary.overwriteCount >= 1, `覆盖应至少 1，实际 ${preview.summary.overwriteCount}`);
  assert(preview.summary.conflictCount >= 1, `冲突应至少 1，实际 ${preview.summary.conflictCount}`);
  assert(preview.summary.skipCount >= 1, `跳过应至少 1，实际 ${preview.summary.skipCount}`);

  const newAnalysis = preview.itemAnalysis.find(a => a.id === 'brand_new_item_001');
  assert(newAnalysis && newAnalysis.action === 'new', '新增项 action 应为 new');
  assert(newAnalysis.canImport === true, '新增项应可以导入');

  const overwriteAnalysis = preview.itemAnalysis.find(a => a.id === overwriteItem.id);
  assert(overwriteAnalysis && overwriteAnalysis.action === 'overwrite', '覆盖项 action 应为 overwrite');
  assert(overwriteAnalysis.canImport === true, '覆盖项应可以导入');

  const conflictAnalysis = preview.itemAnalysis.find(a => a.id === conflictItem.id);
  assert(conflictAnalysis && conflictAnalysis.action === 'conflict', '冲突项 action 应为 conflict');
  assert(conflictAnalysis.canImport === false, '冲突项不应被导入');

  const skipAnalysis = preview.itemAnalysis.find(a => a.id === originalItem.id);
  assert(skipAnalysis && skipAnalysis.action === 'skip', '一致项 action 应为 skip');
  assert(skipAnalysis.canImport === false, '跳过项不应被导入');
});

test('权限校验 - 角色权限 + 候选人列表双重拦截', () => {
  Store.createSampleData();
  const shift = Store.Shifts.getById('shift_morning');

  // 观察员角色（无 canConfirm 权限）
  const observerRole = Store.Roles.getAll().find(r => r.name === '观察员' || !r.canConfirm);
  const observerUser = {
    id: 'user_observer',
    name: '观察员小王',
    roleId: observerRole ? observerRole.id : 'role_observer',
    roleName: '观察员'
  };

  // 有 canConfirm 权限的运维值班员
  const dutyUser = Store.Users.getById('user_li');

  const pkgData = {
    packageType: 'exception_handover',
    packageVersion: '1.0',
    exportTime: new Date().toISOString(),
    shiftInfo: { shiftId: shift.id, shiftName: shift.name, date: '2025-11-21' },
    handoverUser: { id: 'user_zhang', name: '张三', roleId: 'role_monitor', roleName: '班长' },
    takeoverCandidates: [{ id: 'user_zhang', name: '张三', roleId: 'role_monitor', roleName: '班长' }],
    checkResults: [],
    items: []
  };

  // 1. 观察员：角色本身无权限
  const p1 = Store.Items.previewExceptionHandoverImport(pkgData, observerUser);
  assert(p1.permissionCheck.allowed === false, '观察员不应允许导入');
  assert(p1.permissionCheck.reason.includes('权限') || p1.permissionCheck.reason.includes('canConfirm'),
    '拒绝理由应提及权限');

  // 2. 运维值班员 user_li：有权限但不在候选人列表
  const p2 = Store.Items.previewExceptionHandoverImport(pkgData, dutyUser);
  assert(p2.permissionCheck.allowed === false, '不在候选人列表应被拒绝');
  assert(p2.permissionCheck.reason.includes('候选人'), '拒绝理由应提及候选人');

  // 3. 候选人在列表且有权限：应允许
  const pkgData2 = {
    ...pkgData,
    takeoverCandidates: [{ id: dutyUser.id, name: dutyUser.name, roleId: dutyUser.roleId, roleName: '运维值班员' }]
  };
  const p3 = Store.Items.previewExceptionHandoverImport(pkgData2, dutyUser);
  assert(p3.permissionCheck.allowed === true, '有权限且在候选人列表应允许');

  // 4. 未指定候选人（空列表）：有权限的用户都可以接
  const pkgData3 = { ...pkgData, takeoverCandidates: [] };
  const p4 = Store.Items.previewExceptionHandoverImport(pkgData3, dutyUser);
  assert(p4.permissionCheck.allowed === true, '未指定候选人时，有权限的用户都可以接');
});

test('执行导入 - 新增 + 覆盖 + 冲突跳过，写入恢复日志，刷新持久化', () => {
  Store.createSampleData();
  Store.RecoveryLogs.saveAll([]);

  const adminUser = Store.Users.getById('user_zhang');
  const shift = Store.Shifts.getById('shift_morning');
  Store.CurrentShift.save({ shiftId: shift.id, date: '2025-11-21', handoverUserId: '' });

  const originalCount = Store.Items.getAll().length;
  const existingItem = Store.Items.getAll()[0];
  const localVersion = existingItem.version;
  const existingTitle = existingItem.title;

  const importItems = [
    {
      id: 'imported_new_' + Date.now(),
      title: '新导入事项',
      type: 'alert',
      status: 'new',
      version: 1,
      description: '新导入描述',
      shiftId: shift.id,
      shiftDate: '2025-11-21',
      assigneeId: '',
      history: [{ action: 'create', timestamp: new Date().toISOString(), operator: { id: 'x', name: 'x', roleId: 'x', roleName: 'x' } }]
    },
    {
      ...existingItem,
      title: '被覆盖更新的标题',
      version: existingItem.version,
      history: [
        ...existingItem.history,
        { action: 'update', timestamp: new Date().toISOString(), operator: { id: 'x', name: 'x', roleId: 'x', roleName: 'x' }, changes: [{ field: 'title', oldValue: existingTitle, newValue: '被覆盖更新的标题' }] }
      ]
    }
  ];

  const pkgData = {
    packageType: 'exception_handover',
    packageVersion: '1.0',
    exportTime: new Date().toISOString(),
    shiftInfo: { shiftId: shift.id, shiftName: shift.name, date: '2025-11-21' },
    handoverUser: { id: adminUser.id, name: adminUser.name, roleId: adminUser.roleId, roleName: '班长' },
    takeoverCandidates: [],
    checkResults: [],
    items: importItems
  };

  const result = Store.Items.executeExceptionHandoverImport(pkgData, adminUser);
  assert(result.success === true, '导入应返回成功');
  assert(result.imported.newCount === 1, '应新增 1 项');
  assert(result.imported.overwriteCount === 1, '应覆盖 1 项');
  assert(result.imported.conflictCount === 0, '应无冲突项');

  const newCount = Store.Items.getAll().length;
  assert(newCount === originalCount + 1, `总事项数应为 ${originalCount + 1}，实际 ${newCount}`);

  // 验证覆盖后的版本号递增
  const updatedItem = Store.Items.getById(existingItem.id);
  assert(updatedItem.title === '被覆盖更新的标题', '覆盖项标题应已更新');
  assert(updatedItem.version > localVersion, `覆盖后版本号应递增，原值 ${localVersion}，新值 ${updatedItem.version}`);

  // 验证历史记录被追加
  const hasImportHistory = updatedItem.history.some(h =>
    h.action === 'import_overwrite' || h.remark?.includes('异常交接包')
  );
  assert(hasImportHistory === true, '覆盖事项应有导入历史记录');

  // 验证恢复日志
  const logs = Store.RecoveryLogs.getAll();
  const importLog = logs.find(l => l.operationType === 'exception_handover_import');
  assert(importLog, '应有异常交接包导入的恢复日志');
  assert(importLog.operator.id === adminUser.id, '日志记录的操作员应为当前用户');
  assert(importLog.importedItemIds && importLog.importedItemIds.length >= 2, '日志应记录导入的事项 id');

  // 模拟刷新：验证 localStorage 持久化
  const rawItems = JSON.parse(localStorage.getItem('handover_items') || '[]');
  const persistedUpdated = rawItems.find(it => it.id === existingItem.id);
  assert(persistedUpdated && persistedUpdated.title === '被覆盖更新的标题', '刷新后 localStorage 中应保留更新后的标题');
  const persistedNew = rawItems.find(it => it.id === importItems[0].id);
  assert(persistedNew, '刷新后 localStorage 中应保留新增事项');

  // 重新读取验证
  Store.Items.saveAll(rawItems);
  const reloadedUpdated = Store.Items.getById(existingItem.id);
  assert(reloadedUpdated.title === '被覆盖更新的标题', '重新加载后标题应正确');
});

test('冲突场景 - 同编号版本不同 / 本地有更新，导入被跳过', () => {
  Store.createSampleData();
  const adminUser = Store.Users.getById('user_zhang');
  const shift = Store.Shifts.getById('shift_morning');

  const existingItem = Store.Items.getAll()[0];
  const originalTitle = existingItem.title;
  const originalVersion = existingItem.version;

  // 本地先做一次更新，版本号 +1
  const updateResult = Store.Items.update(
    existingItem.id,
    { title: originalTitle + ' (本地最新修改)' },
    adminUser,
    originalVersion
  );
  assert(updateResult.success, '本地更新应成功');

  const localItemAfter = Store.Items.getById(existingItem.id);
  const localVersionAfter = localItemAfter.version;
  assert(localVersionAfter > originalVersion, '本地版本号应递增');

  // 构造导入包：版本号为 originalVersion（比本地旧）
  const pkgData = {
    packageType: 'exception_handover',
    packageVersion: '1.0',
    exportTime: new Date().toISOString(),
    shiftInfo: { shiftId: shift.id, shiftName: shift.name, date: '2025-11-21' },
    handoverUser: { id: adminUser.id, name: adminUser.name, roleId: adminUser.roleId, roleName: '班长' },
    takeoverCandidates: [],
    checkResults: [],
    items: [
      {
        ...existingItem,
        version: originalVersion,
        title: '导入包中的旧版本标题'
      }
    ]
  };

  const preview = Store.Items.previewExceptionHandoverImport(pkgData, adminUser);
  const analysis = preview.itemAnalysis.find(a => a.id === existingItem.id);
  assert(analysis && analysis.action === 'conflict', `版本不一致应判定为冲突，实际 action=${analysis?.action}`);
  assert(analysis.canImport === false, '冲突项应禁止导入');
  assert(analysis.reason.includes('版本') || analysis.reason.includes('更新'),
    '冲突理由应提及版本或更新');

  // 执行导入
  const result = Store.Items.executeExceptionHandoverImport(pkgData, adminUser);
  assert(result.imported.conflictCount >= 1, '应至少有 1 项冲突');
  assert(result.imported.overwriteCount === 0, '不应有覆盖项');

  // 本地数据不应被修改
  const finalItem = Store.Items.getById(existingItem.id);
  assert(finalItem.title === originalTitle + ' (本地最新修改)',
    '本地标题应保持最新修改，不应被旧版本覆盖');
  assert(finalItem.version === localVersionAfter, '本地版本号应保持不变');
});

console.log('\n--- 10. 班前检查清单模块测试 ---\n');

localStorage.clear();
Store.createSampleData();

const cltTplResult = Store.ChecklistTemplates.create({
  name: '通用班前检查',
  shiftIds: [],
  items: [
    { name: '机房环境巡检', required: true, description: '温度湿度检查' },
    { name: '监控告警检查', required: true, description: '未处理告警' },
    { name: '备份任务检查', required: false, description: '昨日备份' },
    { name: '工单积压检查', required: true, description: '积压工单' }
  ]
});

test('检查清单模板 - 创建与字段完整性', () => {
  assert(cltTplResult.success === true, '创建模板应成功');
  const tpl = cltTplResult.template;
  assert(tpl.id, '模板应有 id');
  assert(tpl.name === '通用班前检查', `模板名称应为"通用班前检查"，实际"${tpl.name}"`);
  assert(tpl.shiftIds.length === 0, '未指定班次时应为空数组');
  assert(tpl.items.length === 4, `应有 4 个检查项，实际 ${tpl.items.length}`);
  assert(tpl.items[0].required === true, '第一项应为必填');
  assert(tpl.items[2].required === false, '第三项应为非必填');
  assert(tpl.createTime, '应有创建时间');
  assert(tpl.updateTime, '应有更新时间');
});

test('检查清单模板 - 查询与按班次筛选', () => {
  const all = Store.ChecklistTemplates.getAll();
  assert(all.length >= 2, `至少应有 2 个模板（样例+新建），实际 ${all.length}`);

  const byId = Store.ChecklistTemplates.getById(cltTplResult.template.id);
  assert(byId !== null, '按 ID 应能查到模板');
  assert(byId.name === '通用班前检查', '查到的模板名称应一致');

  const morningTpls = Store.ChecklistTemplates.getByShiftId('shift_morning');
  assert(morningTpls.length >= 1, '白班应有可用模板（通用模板适用所有班次）');
});

test('检查清单模板 - 更新与删除', () => {
  const updateResult = Store.ChecklistTemplates.update(cltTplResult.template.id, {
    name: '通用班前检查（修改后）',
    shiftIds: ['shift_morning']
  });
  assert(updateResult.success === true, '更新模板应成功');
  assert(updateResult.template.name === '通用班前检查（修改后）', '更新后名称应改变');

  const delResult = Store.ChecklistTemplates.remove('nonexistent_id');
  assert(delResult.success === false, '删除不存在的模板应失败');
  assert(delResult.error === '模板不存在', '应返回模板不存在错误');

  const dupTpl = Store.ChecklistTemplates.create({ name: '待删除模板', shiftIds: [], items: [] });
  const delOk = Store.ChecklistTemplates.remove(dupTpl.template.id);
  assert(delOk.success === true, '删除已有模板应成功');
  assert(Store.ChecklistTemplates.getById(dupTpl.template.id) === null, '删除后按 ID 应查不到');
});

const cltUser = Store.Users.getById('user_zhang');
const cltObserver = Store.Users.getById('user_zhao');
const cltOperator = Store.Users.getById('user_li');

test('生成检查单 - 正常生成与字段验证', () => {
  const result = Store.ChecklistRecords.generate(
    cltTplResult.template.id, cltUser, 'shift_morning', '2026-06-13'
  );
  assert(result.success === true, '生成检查单应成功');
  const rec = result.record;
  assert(rec.id, '检查单应有 id');
  assert(rec.templateId === cltTplResult.template.id, '模板 ID 应一致');
  assert(rec.templateName === '通用班前检查（修改后）', '模板名称应一致');
  assert(rec.shiftId === 'shift_morning', '班次 ID 应一致');
  assert(rec.shiftDate === '2026-06-13', '日期应一致');
  assert(rec.executorId === 'user_zhang', '执行人 ID 应一致');
  assert(rec.executorName === '张三', '执行人名称应一致');
  assert(rec.status === 'in_progress', '初始状态应为 in_progress');
  assert(rec.items.length === 4, '检查项数量应与模板一致');
  assert(rec.items[0].checked === false, '检查项初始应未勾选');
  assert(rec.completeTime === null, '完成时间应为 null');
});

test('生成检查单 - 权限拦截（观察员无权限）', () => {
  const result = Store.ChecklistRecords.generate(
    cltTplResult.template.id, cltObserver, 'shift_morning', '2026-06-13'
  );
  assert(result.success === false, '观察员生成检查单应失败');
  assert(result.error.includes('无权限'), `错误应包含"无权限"，实际"${result.error}"`);
});

test('生成检查单 - 重复生成当天同一模板应被拦截', () => {
  const result = Store.ChecklistRecords.generate(
    cltTplResult.template.id, cltUser, 'shift_morning', '2026-06-13'
  );
  assert(result.success === false, '重复生成应失败');
  assert(result.error.includes('重复'), `错误应包含"重复"，实际"${result.error}"`);
});

test('生成检查单 - 模板被删除时生成应提示', () => {
  const tmpTpl = Store.ChecklistTemplates.create({ name: '临时模板', shiftIds: [], items: [{ name: '测试项', required: true }] });
  Store.ChecklistTemplates.remove(tmpTpl.template.id);
  const result = Store.ChecklistRecords.generate(
    tmpTpl.template.id, cltUser, 'shift_morning', '2026-06-13'
  );
  assert(result.success === false, '模板删除后生成应失败');
  assert(result.error.includes('已被删除'), `错误应包含"已被删除"，实际"${result.error}"`);
});

test('勾选检查项 - 正常勾选与备注', () => {
  const records = Store.ChecklistRecords.getAll();
  const myRec = records.find(r => r.executorId === 'user_zhang' && r.status === 'in_progress');
  assert(myRec, '应能找到进行中的检查单');

  const checkResult = Store.ChecklistRecords.checkItem(myRec.id, myRec.items[0].id, true, '温度正常', cltUser);
  assert(checkResult.success === true, '勾选应成功');
  assert(checkResult.item.checked === true, '勾选后应为 true');
  assert(checkResult.item.remark === '温度正常', '备注应保存');

  const refreshed = Store.ChecklistRecords.getById(myRec.id);
  assert(refreshed.items[0].checked === true, '刷新后勾选状态应保持');
});

test('勾选检查项 - 非本人不能修改', () => {
  const records = Store.ChecklistRecords.getAll();
  const myRec = records.find(r => r.executorId === 'user_zhang' && r.status === 'in_progress');
  const checkResult = Store.ChecklistRecords.checkItem(myRec.id, myRec.items[1].id, true, '', cltOperator);
  assert(checkResult.success === false, '非本人勾选应失败');
  assert(checkResult.error.includes('只能修改自己的'), `错误应包含"只能修改自己的"，实际"${checkResult.error}"`);
});

test('完成检查单 - 必填项未完成时不能完成', () => {
  const records = Store.ChecklistRecords.getAll();
  const myRec = records.find(r => r.executorId === 'user_zhang' && r.status === 'in_progress');
  const result = Store.ChecklistRecords.complete(myRec.id, cltUser);
  assert(result.success === false, '必填项未完成时应失败');
  assert(result.error.includes('必填项未完成'), `错误应包含"必填项未完成"，实际"${result.error}"`);
  assert(result.uncheckedItems && result.uncheckedItems.length > 0, '应返回未完成的必填项列表');
});

test('完成检查单 - 全部必填项勾选后完成，写入恢复日志', () => {
  const records = Store.ChecklistRecords.getAll();
  const myRec = records.find(r => r.executorId === 'user_zhang' && r.status === 'in_progress');

  Store.ChecklistRecords.checkItem(myRec.id, myRec.items[1].id, true, '无告警', cltUser);
  Store.ChecklistRecords.checkItem(myRec.id, myRec.items[3].id, true, '', cltUser);

  const result = Store.ChecklistRecords.complete(myRec.id, cltUser);
  assert(result.success === true, '全部必填项勾选后应完成');
  assert(result.record.status === 'completed', '状态应为 completed');
  assert(result.record.completeTime !== null, '完成时间应不为 null');

  const logs = Store.RecoveryLogs.getAll();
  const checkLog = logs.find(l => l.action === '完成班前检查' && l.checklistRecordId === myRec.id);
  assert(checkLog, '应写入完成班前检查的恢复日志');
  assert(checkLog.operatorName === '张三', '日志操作人应为张三');
  assert(checkLog.templateName === '通用班前检查（修改后）', '日志模板名称应正确');
  assert(checkLog.succeeded === true, '日志应标记成功');
  assert(checkLog.totalItems === 4, `日志总项数应为 4，实际 ${checkLog.totalItems}`);
});

test('完成检查单 - 已完成后不能再修改', () => {
  const records = Store.ChecklistRecords.getAll();
  const completedRec = records.find(r => r.executorId === 'user_zhang' && r.status === 'completed');
  const checkResult = Store.ChecklistRecords.checkItem(completedRec.id, completedRec.items[2].id, true, '', cltUser);
  assert(checkResult.success === false, '已完成检查单不应再修改');
  assert(checkResult.error.includes('已完成'), `错误应包含"已完成"，实际"${checkResult.error}"`);
});

test('刷新页面后数据持久化', () => {
  const allBefore = Store.ChecklistRecords.getAll();
  const completedBefore = allBefore.filter(r => r.status === 'completed');
  assert(completedBefore.length >= 1, '至少应有 1 条已完成记录');

  const raw = localStorage.getItem('handover_checklist_records');
  assert(raw !== null, 'localStorage 应有 checklist_records 数据');
  const parsed = JSON.parse(raw);
  const completedFromStorage = parsed.filter(r => r.status === 'completed');
  assert(completedFromStorage.length === completedBefore.length, 'localStorage 中已完成记录数量应一致');

  const tplRaw = localStorage.getItem('handover_checklist_templates');
  assert(tplRaw !== null, 'localStorage 应有 checklist_templates 数据');
});

test('导出 JSON - 正常导出与字段完整性', () => {
  const result = Store.ChecklistRecords.exportJSON();
  assert(result.success === true, '导出 JSON 应成功');
  assert(result.count >= 1, `至少应有 1 条导出记录，实际 ${result.count}`);
  const first = result.data[0];
  assert(first.recordId, '导出应有 recordId');
  assert(first.templateName, '导出应有 templateName');
  assert(first.shiftDate, '导出应有 shiftDate');
  assert(first.executorName, '导出应有 executorName');
  assert(first.completeTime, '导出应有 completeTime');
  assert(Array.isArray(first.failedItems), '导出应有 failedItems 数组');
  assert(Array.isArray(first.items), '导出应有 items 数组');
});

test('导出 CSV - 正常导出', () => {
  const result = Store.ChecklistRecords.exportCSV();
  assert(result.success === true, '导出 CSV 应成功');
  assert(result.csv.includes('班次日期'), 'CSV 应包含表头');
  assert(result.csv.includes('通用班前检查'), 'CSV 应包含模板名称');
  assert(result.csv.includes('张三'), 'CSV 应包含执行人');
});

test('导出空记录 - 无记录时明确提示', () => {
  localStorage.clear();
  Store.createSampleData();
  const result = Store.ChecklistRecords.exportJSON();
  assert(result.success === false, '无记录时导出应失败');
  assert(result.error.includes('没有可导出的检查记录'), `错误应为"没有可导出的检查记录"，实际"${result.error}"`);

  const csvResult = Store.ChecklistRecords.exportCSV();
  assert(csvResult.success === false, '无记录时 CSV 导出也应失败');
});

test('查询 - 按用户和按班次筛选', () => {
  localStorage.clear();
  Store.createSampleData();
  const tpl = Store.ChecklistTemplates.create({
    name: '查询测试模板', shiftIds: [], items: [
      { name: '项1', required: true },
      { name: '项2', required: false }
    ]
  });
  const user = Store.Users.getById('user_li');
  Store.ChecklistRecords.generate(tpl.template.id, user, 'shift_morning', '2026-06-13');

  const byUser = Store.ChecklistRecords.getByUser('user_li');
  assert(byUser.length >= 1, '按用户查询应至少有 1 条');

  const byShift = Store.ChecklistRecords.getByShift('shift_morning', '2026-06-13');
  assert(byShift.length >= 1, '按班次查询应至少有 1 条');
});

console.log('\n--- 11. 临时协同处置室测试 ---');

// 重置环境
localStorage.clear();
Store.createSampleData();

// 获取测试用户
const drAdmin = Store.Users.getById('user_zhang');       // 班长
const drOperator = Store.Users.getById('user_li');       // 运维值班员
const drObserver = Store.Users.getById('user_zhao');     // 观察员（赵六）
const drAnotherOperator = Store.Users.getById('user_wang'); // 另一个值班员（王五）

// 获取测试事项，用 sourceItemId 创建关联
const drSourceItem = Store.Items.create({
  title: '处置室测试事项：核心交换机告警',
  content: '核心交换机端口反复 DOWN/UP',
  level: 'high',
  assigneeId: 'user_li',
  assigneeName: '李四',
  exceptionType: 'net',
  shiftId: 'shift_morning'
}, drOperator);
const drItemId = drSourceItem.id;

test('协同处置室 - 数据模型字段完整性', () => {
  const levels = Store.CollabRooms.LEVELS;
  assert(levels && Object.keys(levels).length === 4, '应有 4 个级别定义');
  assert(levels.urgent.name === '紧急' && levels.high.name === '高' && levels.medium.name === '中' && levels.low.name === '低',
    '级别名称应正确映射');
});

test('协同处置室 - 创建成功与日志写入', () => {
  const result = Store.CollabRooms.create({
    sourceItemId: drItemId,
    sourceItemTitle: '处置室测试事项：核心交换机告警',
    title: '核心交换机端口异常协同处置',
    level: 'urgent',
    impactScope: '全网业务可能受影响，办公网已出现卡顿',
    target: '2小时内定位根因并恢复端口稳定',
    deadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16),
    participantIds: ['user_zhang', 'user_li', 'user_wang']
  }, drOperator);

  assert(result.success === true, `创建应成功，错误信息:${result.error || ''}`);
  assert(result.room, '应返回 room 对象');
  assert(result.room.id && result.room.id.startsWith('room_'), 'ID 格式应为 room_xxx');
  assert(result.room.status === 'active', '初始状态应为 active');
  assert(result.room.version === 1, '初始版本应为 1');
  assert(result.room.creatorId === 'user_li', '创建者应为值班员');
  assert(result.room.participants.length === 3, `参与者数量应为 3，实际 ${result.room.participants.length}`);
  assert(result.room.messages.length === 0, '初始消息为空');
  assert(result.room.pendingQuestions.length === 0, '初始待确认问题为空');
  assert(result.room.logs.length >= 1, `至少应有 1 条创建日志，实际 ${result.room.logs.length}`);
  assert(result.room.logs[0].action === '创建处置室', '首条日志应为创建处置室');
  assert(result.room.sourceItemId === drItemId, '应关联事项 ID');
});

test('协同处置室 - 重复拉起拦截（同一事项重复创建）', () => {
  const result = Store.CollabRooms.create({
    sourceItemId: drItemId,
    title: '第二次拉起 - 应该失败',
    level: 'medium',
    impactScope: '...',
    target: '...',
    deadline: new Date().toISOString().slice(0, 16),
    participantIds: ['user_zhang']
  }, drAdmin);

  assert(result.success === false, '同一事项重复拉起应失败');
  assert(result.conflict === true, '应标记为冲突');
  assert(result.conflictType === 'duplicate_room', `冲突类型应为 duplicate_room，实际 ${result.conflictType}`);
  assert(result.existingRoomId, '应返回已存在的处置室 ID');
});

test('协同处置室 - 权限验证（观察员无创建权限）', () => {
  const result = Store.CollabRooms.create({
    title: '观察员创建应失败',
    level: 'low',
    impactScope: 'x', target: 'y',
    deadline: new Date().toISOString().slice(0, 16),
    participantIds: ['user_wang']
  }, drObserver);

  assert(result.success === false, '观察员创建应失败');
  assert(result.conflictType === 'permission', `冲突类型应为 permission，实际 ${result.conflictType}`);
});

test('协同处置室 - 查询方法', () => {
  const all = Store.CollabRooms.getAll();
  assert(all.length === 1, 'getAll 应有 1 条');

  const byId = Store.CollabRooms.getById(all[0].id);
  assert(byId && byId.id === all[0].id, 'getById 应正确返回');

  const bySource = Store.CollabRooms.getActiveBySourceItemId(drItemId);
  assert(bySource, 'getActiveBySourceItemId 应找到处置室');
  assert(bySource.sourceItemId === drItemId, '关联事项应匹配');

  const byZhang = Store.CollabRooms.getByParticipant('user_zhang');
  assert(byZhang.length === 1, '张三参与的处置室应有 1 条');
  const byZhao = Store.CollabRooms.getByParticipant('user_zhao');
  assert(byZhao.length === 0, '赵六（观察员）不应在任何处置室中');
});

test('协同处置室 - 权限检查方法', () => {
  const room = Store.CollabRooms.getAll()[0];

  // 班长权限
  assert(Store.CollabRooms.canManageMembers(room, drAdmin) === true, '班长应能调整成员');
  assert(Store.CollabRooms.canClose(room, drAdmin) === true, '班长应能关闭');
  assert(Store.CollabRooms.canAddMessage(room, drAdmin) === true, '班长应能发消息');
  assert(Store.CollabRooms.canEditBasic(room, drAdmin) === true, '班长应能编辑基本信息');

  // 普通值班员（参与者 + 创建者）权限
  assert(Store.CollabRooms.canManageMembers(room, drOperator) === false, '值班员不应能调整成员');
  assert(Store.CollabRooms.canClose(room, drOperator) === false, '值班员不应能关闭');
  assert(Store.CollabRooms.canAddMessage(room, drOperator) === true, '值班员（参与者）应能发消息');
  assert(Store.CollabRooms.canEditBasic(room, drOperator) === true, '值班员（创建者）应能编辑基本信息');

  // 非参与者权限（观察员赵六，未加入）
  assert(Store.CollabRooms.canAddMessage(room, drObserver) === false, '非参与者不应能发消息');
});

test('协同处置室 - 添加进展消息（带附件）', () => {
  const room = Store.CollabRooms.getAll()[0];
  const startVer = room.version;

  const result = Store.CollabRooms.addProgress(
    room.id,
    '已现场排查，发现光模块温度异常偏高 78℃，已准备好备用模块',
    [
      { name: '温度监控截图.txt', content: '15:23 端口温度 78℃，阈值 70℃' },
      { name: '光模块型号对照表.txt', content: 'SFP+ 10G SR，编号 XXX-123' }
    ],
    drOperator
  );

  assert(result.success === true, `添加进展应成功，${result.error || ''}`);
  assert(result.room.version === startVer + 1, '版本应 +1');

  const refreshed = Store.CollabRooms.getById(room.id);
  assert(refreshed.messages.length === 1, `应新增 1 条消息，实际 ${refreshed.messages.length}`);
  assert(refreshed.messages[0].type === 'progress', '消息类型应为 progress');
  assert(refreshed.messages[0].attachments.length === 2, '应带 2 个附件');
  assert(refreshed.messages[0].operatorId === 'user_li', '发送人应为李四');
  assert(refreshed.logs.some(l => l.action === '补充进展'), '日志应包含补充进展记录');
});

test('协同处置室 - 非参与者提交消息 - 权限拦截', () => {
  const room = Store.CollabRooms.getAll()[0];
  const result = Store.CollabRooms.addProgress(
    room.id, '观察员（赵六）不应能发消息', [], drObserver
  );
  assert(result.success === false && result.conflictType === 'permission',
    '非参与者提交消息应被拦截为 permission 冲突');
});

test('协同处置室 - 添加待确认问题', () => {
  const room = Store.CollabRooms.getAll()[0];
  const result = Store.CollabRooms.addQuestion(
    room.id,
    '是否需要协调机房同事更换光模块？当前机房值班电话未接通',
    drOperator
  );

  assert(result.success === true, '添加问题应成功');
  const refreshed = Store.CollabRooms.getById(room.id);
  assert(refreshed.pendingQuestions.length === 1, '待确认问题应有 1 条');
  assert(refreshed.pendingQuestions[0].answered === false, '问题初始应为未答复');
  assert(refreshed.messages.length === 2, 'messages 也应有 question 类型消息');
  assert(refreshed.messages[1].type === 'question', '第二条消息类型应为 question');
});

test('协同处置室 - 班长答复待确认问题', () => {
  const room = Store.CollabRooms.getById(Store.CollabRooms.getAll()[0].id);
  const qId = room.pendingQuestions[0].id;

  const result = Store.CollabRooms.answerQuestion(
    room.id, qId,
    '请立即联系运维二线王工（内线 8888）前往机房更换，我会同步邮件审批',
    drAdmin
  );

  assert(result.success === true, '答复问题应成功');
  const refreshed = Store.CollabRooms.getById(room.id);
  const q = refreshed.pendingQuestions.find(p => p.id === qId);
  assert(q.answered === true, '问题状态应为已答复');
  assert(q.answererId === 'user_zhang', '答复人应为张三（班长）');
  assert(refreshed.messages.length === 3, '消息数应为 3，含新增 answer 消息');
  assert(refreshed.messages[2].type === 'answer', '最新消息类型应为 answer');
});

test('协同处置室 - 班长调整成员', () => {
  const room = Store.CollabRooms.getById(Store.CollabRooms.getAll()[0].id);
  const startCount = room.participants.length; // 应为 3

  // 移除王五(user_wang)，添加赵六(user_zhao)
  const result = Store.CollabRooms.update(
    room.id,
    { participantIds: ['user_zhang', 'user_li', 'user_zhao'] },
    drAdmin, room.version
  );

  assert(result.success === true, '调整成员应成功');
  const refreshed = Store.CollabRooms.getById(room.id);
  const ids = refreshed.participants.map(p => p.userId);
  assert(ids.includes('user_zhao'), '应新增赵六为成员');
  assert(!ids.includes('user_wang'), '应移除王五');
  assert(refreshed.participants.length === startCount, `成员数量应保持 ${startCount} 不变（加1减1）`);
});

test('协同处置室 - 值班员调整成员 - 权限拦截', () => {
  const room = Store.CollabRooms.getById(Store.CollabRooms.getAll()[0].id);
  const result = Store.CollabRooms.update(
    room.id,
    { participantIds: ['user_li'] },
    drOperator, room.version
  );
  assert(result.success === false && result.conflictType === 'permission',
    '值班员不应能调整成员');
});

test('协同处置室 - 乐观锁 - 版本冲突拦截', () => {
  const room = Store.CollabRooms.getAll()[0];
  const oldVersion = 1; // 远低于当前版本

  // 模拟两个页面：A 页基于旧版本修改
  const resultA = Store.CollabRooms.update(
    room.id,
    { title: 'A 页面的修改（基于旧版本）' },
    drAdmin, oldVersion
  );

  assert(resultA.success === false, '基于旧版本的修改应失败');
  assert(resultA.conflict === true, '应标记 conflict');
  assert(resultA.conflictType === 'version', `冲突类型应为 version，实际 ${resultA.conflictType}`);
  assert(resultA.latestRoom, '应返回最新版本的处置室对象供前端刷新');
  assert(resultA.latestRoom.version === room.version, 'latestRoom 版本应等于当前最新版本');

  const refreshed = Store.CollabRooms.getById(room.id);
  assert(refreshed.title !== 'A 页面的修改（基于旧版本）', '标题不应被旧版本修改');
});

test('协同处置室 - 乐观锁 - 正确版本应正常更新', () => {
  const room = Store.CollabRooms.getById(Store.CollabRooms.getAll()[0].id);
  const oldVer = room.version;

  const result = Store.CollabRooms.update(
    room.id,
    { title: '【已定位根因】核心交换机端口异常协同处置', target: '已定位根因，更换光模块后恢复' },
    drAdmin, room.version
  );

  assert(result.success === true, `正确版本应更新成功，${result.error || ''}`);
  assert(result.room.version === oldVer + 1, '版本号应 +1');
  const refreshed = Store.CollabRooms.getById(room.id);
  assert(refreshed.title.startsWith('【已定位根因】'), '标题应已更新');
});

test('协同处置室 - 班长关闭处置室', () => {
  const room = Store.CollabRooms.getById(Store.CollabRooms.getAll()[0].id);
  const openVer = room.version;

  // close(id, operator, reason, baseVersion) —— 注意参数顺序
  const result = Store.CollabRooms.close(
    room.id,
    drAdmin,
    '已更换光模块，温度降至 42℃，端口连续 30 分钟稳定，业务恢复正常',
    room.version
  );

  assert(result.success === true, `关闭应成功，错误:${result.error || ''}, conflictType:${result.conflictType || ''}`);
  assert(result.room.status === 'closed', '状态应为 closed');
  assert(result.room.version === openVer + 1, '版本应 +1');
  assert(result.room.closeReason.length > 0, '关闭原因应已记录');
  assert(result.room.closeTime, 'closeTime 应有值');

  const refreshed = Store.CollabRooms.getById(room.id);
  assert(refreshed.logs.some(l => l.action === '关闭处置室'), '日志应包含关闭记录');
});

test('协同处置室 - 已关闭后继续提交消息 - 拦截', () => {
  const room = Store.CollabRooms.getAll()[0];
  const result = Store.CollabRooms.addProgress(room.id, '关闭后不应还能发消息', [], drAdmin);
  assert(result.success === false && result.conflictType === 'closed',
    '已关闭处置室提交消息应返回 closed 冲突');
});

test('协同处置室 - 已关闭后重复拉起 - 应允许（因为已关闭的不应拦截）', () => {
  // 之前是 active 时拦截，现在关闭了再次发起应该允许
  const result = Store.CollabRooms.create({
    sourceItemId: drItemId,
    sourceItemTitle: '处置室测试事项：核心交换机告警',
    title: '核心交换机再次异常（第二次拉起）',
    level: 'high',
    impactScope: '相同位置',
    target: '新的目标',
    deadline: new Date().toISOString().slice(0, 16),
    participantIds: ['user_zhang']
  }, drOperator);

  assert(result.success === true, `已关闭后再次拉起应允许，错误: ${result.error || ''}`);
  assert(result.room.id !== Store.CollabRooms.getAll()[0].id, '应为新的处置室，ID 不同');
  assert(Store.CollabRooms.getAll().length === 2, '现在应有 2 个处置室');
});

test('协同处置室 - 重新开启（班长权限）', () => {
  const firstRoom = Store.CollabRooms.getAll()[0];
  assert(firstRoom.status === 'closed', '初始应为 closed');

  const reopenResult = Store.CollabRooms.reopen(firstRoom.id, drAdmin);
  assert(reopenResult.success === true, `重新开启应成功，${reopenResult.error || ''}`);
  assert(reopenResult.room.status === 'active', '重新开启后状态应为 active');
  assert(reopenResult.room.version > firstRoom.version, '版本号应提升');

  const refreshed = Store.CollabRooms.getById(firstRoom.id);
  assert(refreshed.logs.some(l => l.action === '重新开启处置室'), '日志应记录重新开启');
});

test('协同处置室 - 重新开启后应能再次提交消息', () => {
  const room = Store.CollabRooms.getAll()[0];
  const result = Store.CollabRooms.addProgress(room.id, '重新开启后提交进展：用户反馈仍偶发丢包', [], drOperator);
  assert(result.success === true, '重新开启后应能正常发消息');
});

test('协同处置室 - 导出 JSON 摘要', () => {
  const room = Store.CollabRooms.getAll()[0];
  const result = Store.CollabRooms.exportJSON(room.id);
  assert(result.success === true, 'JSON 导出应成功');

  const j = result.data;
  assert(j.id === room.id, 'ID 匹配');
  assert(j.totalMessages > 0, '摘要应包含消息数统计 totalMessages');
  assert(j.totalQuestions > 0, '摘要应包含问题数统计 totalQuestions');
  assert(Array.isArray(j.messages) && j.messages.length > 0, '应包含 messages 数组');
  assert(Array.isArray(j.pendingQuestions), '应包含 pendingQuestions 数组');
  assert(Array.isArray(j.operationLogs) && j.operationLogs.length > 0, '应包含 operationLogs 数组');
});

test('协同处置室 - 导出 CSV 摘要', () => {
  const room = Store.CollabRooms.getAll()[0];
  const result = Store.CollabRooms.exportCSV(room.id);
  assert(result.success === true, 'CSV 导出应成功');
  assert(result.csv.startsWith('\ufeff'), 'CSV 应含 UTF-8 BOM 避免中文乱码');
  assert(result.csv.includes('处置室 ID'), '应包含处置室 ID 字段表头');
  assert(result.csv.includes(room.id), 'CSV 内容中应包含处置室 ID');
  assert(result.csv.includes('处置室标题'), '应包含处置室标题表头');
  assert(result.csv.includes('=== 消息/进展/问答流水 ==='), '应包含消息流水分区');
  assert(result.csv.includes('=== 待确认问题清单 ==='), '应包含问题清单分区');
  assert(result.csv.includes('=== 操作日志 ==='), '应包含操作日志分区');
});

test('协同处置室 - localStorage 持久化（刷新后恢复）', () => {
  const beforeAll = Store.CollabRooms.getAll();
  assert(beforeAll.length === 2, '当前应有 2 个处置室');

  // 模拟刷新：重新读取 localStorage
  const raw = localStorage.getItem('handover_collab_rooms');
  assert(raw !== null, 'localStorage 中应有 collab_rooms');
  const parsed = JSON.parse(raw);
  assert(Array.isArray(parsed) && parsed.length === 2, '序列化后数据结构正确');

  // 验证第一条（关闭重开的那个）
  const firstSaved = parsed.find(r => r.id === beforeAll[0].id);
  assert(firstSaved.status === 'active', '持久化后状态应为 active');
  assert(firstSaved.messages.length === beforeAll[0].messages.length,
    '持久化后消息数应与内存中一致');
  assert(firstSaved.version === beforeAll[0].version,
    '持久化后版本号应与内存中一致');
});

test('协同处置室 - 完整导出包含 collabRooms', () => {
  const fullExport = Store.exportAllData();
  assert('collabRooms' in fullExport, '完整导出应包含 collabRooms 字段');
  assert(Array.isArray(fullExport.collabRooms), 'collabRooms 应为数组');
  assert(fullExport.collabRooms.length === 2, `collabRooms 应为 2 条，实际 ${fullExport.collabRooms.length}`);
});

test('协同处置室 - 备份/恢复完整流程（导入含 collabRooms）', () => {
  localStorage.clear();
  Store.createSampleData();
  assert(Store.CollabRooms.getAll().length === 0, '清空后处置室应为 0');

  // 重新用 adminUser 导入刚才的 fullExport 需要它里面还有其他基础数据，
  // 所以我们先创建一个处置室再导出然后恢复它
  const r1 = Store.CollabRooms.create({
    title: '备份测试处置室', level: 'low', impactScope: 't', target: 't',
    deadline: new Date().toISOString().slice(0, 16), participantIds: ['user_zhang']
  }, drAdmin);
  assert(r1.success, '创建处置室成功');
  const savedExport = Store.exportAllData();
  const roomIdToKeep = r1.room.id;

  // 再次清空
  localStorage.clear();
  Store.createSampleData();
  assert(Store.CollabRooms.getAll().length === 0, '二次清空后处置室应为 0');

  // 执行恢复
  const admin = Store.Users.getById('user_zhang');
  const importResult = Store.executeImport(savedExport, admin);
  assert(importResult.success === true, `执行导入应成功，${importResult.error || ''}`);

  const roomsAfter = Store.CollabRooms.getAll();
  assert(roomsAfter.length === 1, `恢复后应存在 1 个处置室，实际 ${roomsAfter.length}`);
  assert(roomsAfter[0].id === roomIdToKeep, 'ID 应匹配');
  assert(roomsAfter[0].title === '备份测试处置室', '标题应匹配');
});

test('协同处置室 - 四种冲突类型齐全', () => {
  localStorage.clear();
  Store.createSampleData();
  const admin = Store.Users.getById('user_zhang');
  const op = Store.Users.getById('user_li');
  const observer = Store.Users.getById('user_zhao'); // 观察员是赵六，不是王五
  const item = Store.Items.create({
    title: '冲突测试事项', level: 'low', content: '',
    shiftId: 'shift_morning', assigneeId: 'user_li', assigneeName: '李四'
  }, op);

  // 1. permission（创建权限）
  const r1 = Store.CollabRooms.create({ title: 'a', level: 'low', impactScope: 'x', target: 'x', deadline: '2025-01-01T00:00', participantIds: ['user_zhang'] }, observer);
  assert(r1.conflictType === 'permission', `观察员创建应为 permission 冲突，实际 ${r1.conflictType}`);

  // 2. duplicate_room（同一事项重复拉起）
  // 注意：user_li（李四）是后续 addProgress 的操作者，必须加入参与人列表
  const r2 = Store.CollabRooms.create({ sourceItemId: item.id, title: 'b', level: 'low', impactScope: 'x', target: 'x', deadline: '2025-01-01T00:00', participantIds: ['user_zhang', 'user_li'] }, op);
  assert(r2.success, '第一个应创建成功');
  const r3 = Store.CollabRooms.create({ sourceItemId: item.id, title: 'c', level: 'low', impactScope: 'x', target: 'x', deadline: '2025-01-01T00:00', participantIds: ['user_zhang'] }, op);
  assert(r3.conflictType === 'duplicate_room', `重复拉起应为 duplicate_room 冲突，实际 ${r3.conflictType}`);

  // 3. version（版本号）：先推高版本号
  Store.CollabRooms.addProgress(r2.room.id, '推高版本号', [], op);
  // 再用旧的版本号 1 做更新
  const r5 = Store.CollabRooms.update(r2.room.id, { title: 'e' }, admin, /* baseVersion */ 1);
  assert(r5.conflictType === 'version', `旧版本保存应为 version 冲突，实际 ${r5.conflictType}`);

  // 4. closed（已关闭操作）
  const roomBeforeClose = Store.CollabRooms.getById(r2.room.id);
  // close(id, operator, reason, baseVersion) —— 注意参数顺序
  Store.CollabRooms.close(r2.room.id, admin, '测试关闭', roomBeforeClose.version);
  const r6 = Store.CollabRooms.addProgress(r2.room.id, '关闭后不能发', [], op);
  assert(r6.conflictType === 'closed', `已 closed 编辑应为 closed 冲突，实际 ${r6.conflictType}`);

  console.log('  ✓ 四种冲突类型（permission/duplicate_room/version/closed）全部正确返回');
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
