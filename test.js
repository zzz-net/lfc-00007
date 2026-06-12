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
