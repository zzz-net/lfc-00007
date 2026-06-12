const Store = (function() {
  const STORAGE_KEYS = {
    SHIFTS: 'handover_shifts',
    ROLES: 'handover_roles',
    USERS: 'handover_users',
    CHECK_ITEMS: 'handover_check_items',
    ITEMS: 'handover_items',
    CURRENT_SHIFT: 'handover_current_shift',
    HANDOVER_RECORDS: 'handover_records',
    CURRENT_USER_ID: 'handover_current_user'
  };

  function generateId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function getFromStorage(key, defaultValue) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error('读取存储失败:', key, e);
      return defaultValue;
    }
  }

  function saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('保存存储失败:', key, e);
      return false;
    }
  }

  const Shifts = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.SHIFTS, []);
    },
    saveAll(shifts) {
      return saveToStorage(STORAGE_KEYS.SHIFTS, shifts);
    },
    getById(id) {
      return this.getAll().find(s => s.id === id) || null;
    }
  };

  const Roles = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.ROLES, []);
    },
    saveAll(roles) {
      return saveToStorage(STORAGE_KEYS.ROLES, roles);
    },
    getById(id) {
      return this.getAll().find(r => r.id === id) || null;
    }
  };

  const Users = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.USERS, []);
    },
    saveAll(users) {
      return saveToStorage(STORAGE_KEYS.USERS, users);
    },
    getById(id) {
      return this.getAll().find(u => u.id === id) || null;
    }
  };

  const CheckItems = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.CHECK_ITEMS, []);
    },
    saveAll(items) {
      return saveToStorage(STORAGE_KEYS.CHECK_ITEMS, items);
    }
  };

  const Items = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.ITEMS, []);
    },
    saveAll(items) {
      return saveToStorage(STORAGE_KEYS.ITEMS, items);
    },
    getById(id) {
      return this.getAll().find(i => i.id === id) || null;
    },
    getByShiftAndDate(shiftId, date) {
      return this.getAll().filter(i => i.shiftId === shiftId && i.shiftDate === date);
    },
    create(data, creator) {
      const now = Date.now();
      const item = {
        id: generateId('item'),
        title: data.title,
        type: data.type,
        description: data.description || '',
        status: 'new',
        version: 1,
        shiftId: data.shiftId,
        shiftDate: data.shiftDate,
        creatorId: creator.id,
        creatorName: creator.name,
        assigneeId: data.assigneeId || '',
        assigneeName: data.assigneeName || '',
        createTime: now,
        updateTime: now,
        closeTime: null,
        closeReason: '',
        history: [{
          action: '创建事项',
          version: 1,
          operatorId: creator.id,
          operatorName: creator.name,
          time: now,
          reason: '',
          content: `创建事项：${data.title}`
        }]
      };
      const items = this.getAll();
      items.push(item);
      this.saveAll(items);
      return item;
    },
    update(id, data, operator, baseVersion) {
      const items = this.getAll();
      const index = items.findIndex(i => i.id === id);
      if (index === -1) return { success: false, error: '事项不存在' };

      const item = items[index];
      
      if (baseVersion !== undefined && baseVersion !== item.version) {
        return {
          success: false,
          error: '版本冲突',
          conflict: true,
          latestVersion: item.version,
          latestItem: item
        };
      }

      const oldTitle = item.title;
      const oldDesc = item.description;
      const oldAssignee = item.assigneeName;

      item.title = data.title !== undefined ? data.title : item.title;
      item.type = data.type !== undefined ? data.type : item.type;
      item.description = data.description !== undefined ? data.description : item.description;
      item.assigneeId = data.assigneeId !== undefined ? data.assigneeId : item.assigneeId;
      item.assigneeName = data.assigneeName !== undefined ? data.assigneeName : item.assigneeName;
      item.version += 1;
      item.updateTime = Date.now();

      let changeContent = [];
      if (data.title !== undefined && data.title !== oldTitle) {
        changeContent.push(`标题：${oldTitle} → ${data.title}`);
      }
      if (data.description !== undefined && data.description !== oldDesc) {
        changeContent.push('描述已更新');
      }
      if (data.assigneeName !== undefined && data.assigneeName !== oldAssignee) {
        changeContent.push(`处理人：${oldAssignee || '未分配'} → ${data.assigneeName || '未分配'}`);
      }

      item.history.push({
        action: '编辑事项',
        version: item.version,
        operatorId: operator.id,
        operatorName: operator.name,
        time: item.updateTime,
        reason: data.reason || '',
        content: changeContent.join('；') || '更新事项'
      });

      items[index] = item;
      this.saveAll(items);
      return { success: true, item };
    },
    changeStatus(id, newStatus, operator, reason, baseVersion) {
      const items = this.getAll();
      const index = items.findIndex(i => i.id === id);
      if (index === -1) return { success: false, error: '事项不存在' };

      const item = items[index];

      if (baseVersion !== undefined && baseVersion !== item.version) {
        return {
          success: false,
          error: '版本冲突',
          conflict: true,
          latestVersion: item.version,
          latestItem: item
        };
      }

      const oldStatus = item.status;
      item.status = newStatus;
      item.version += 1;
      item.updateTime = Date.now();

      if (newStatus === 'closed') {
        item.closeTime = Date.now();
        item.closeReason = reason || '';
      }

      const statusNames = {
        'new': '新建',
        'processing': '处理中',
        'pending_confirm': '待接班确认',
        'received': '已接收',
        'closed': '已关闭'
      };

      item.history.push({
        action: `状态变更：${statusNames[oldStatus]} → ${statusNames[newStatus]}`,
        version: item.version,
        operatorId: operator.id,
        operatorName: operator.name,
        time: item.updateTime,
        reason: reason || '',
        content: ''
      });

      items[index] = item;
      this.saveAll(items);
      return { success: true, item };
    },
    startProcessing(id, operator, baseVersion) {
      return this.changeStatus(id, 'processing', operator, '', baseVersion);
    },
    submitForConfirm(id, operator, baseVersion) {
      return this.changeStatus(id, 'pending_confirm', operator, '', baseVersion);
    },
    receive(id, operator, baseVersion) {
      return this.changeStatus(id, 'received', operator, '', baseVersion);
    },
    close(id, operator, reason, baseVersion) {
      return this.changeStatus(id, 'closed', operator, reason, baseVersion);
    }
  };

  const CurrentShift = {
    get() {
      return getFromStorage(STORAGE_KEYS.CURRENT_SHIFT, {
        shiftId: '',
        date: new Date().toISOString().split('T')[0],
        handoverUserId: ''
      });
    },
    save(data) {
      return saveToStorage(STORAGE_KEYS.CURRENT_SHIFT, data);
    }
  };

  const CurrentUser = {
    get() {
      return localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID) || '';
    },
    set(userId) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
    }
  };

  const HandoverRecords = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.HANDOVER_RECORDS, []);
    },
    saveAll(records) {
      return saveToStorage(STORAGE_KEYS.HANDOVER_RECORDS, records);
    },
    getById(id) {
      return this.getAll().find(r => r.id === id) || null;
    },
    create(data) {
      const record = {
        id: generateId('record'),
        shiftId: data.shiftId,
        shiftName: data.shiftName,
        date: data.date,
        handoverUserId: data.handoverUserId,
        handoverName: data.handoverName,
        takeoverUserId: data.takeoverUserId,
        takeoverName: data.takeoverName,
        handoverTime: data.handoverTime || null,
        takeoverTime: data.takeoverTime || null,
        status: 'pending',
        itemIds: data.itemIds || [],
        itemCount: data.itemIds ? data.itemIds.length : 0,
        checkResults: data.checkResults || {},
        totalCount: data.totalCount || 0,
        checkedCount: data.checkedCount || 0,
        itemsSnapshot: data.itemsSnapshot || [],
        createTime: Date.now()
      };
      const records = this.getAll();
      records.push(record);
      this.saveAll(records);
      return record;
    },
    confirm(id, takeoverUser) {
      const records = this.getAll();
      const index = records.findIndex(r => r.id === id);
      if (index === -1) return null;

      records[index].status = 'confirmed';
      records[index].takeoverUserId = takeoverUser.id;
      records[index].takeoverName = takeoverUser.name;
      records[index].takeoverTime = Date.now();

      this.saveAll(records);
      return records[index];
    },
    getByShift(shiftId) {
      return this.getAll().filter(r => r.shiftId === shiftId);
    },
    getByDateRange(startDate, endDate) {
      return this.getAll().filter(r => r.date >= startDate && r.date <= endDate);
    }
  };

  function createSampleData() {
    const sampleRoles = [
      { id: 'role_admin', name: '班长', canCreate: true, canProcess: true, canClose: true, canConfirm: true },
      { id: 'role_operator', name: '运维值班员', canCreate: true, canProcess: true, canClose: false, canConfirm: true },
      { id: 'role_observer', name: '观察员', canCreate: false, canProcess: false, canClose: false, canConfirm: false }
    ];
    Roles.saveAll(sampleRoles);

    const sampleShifts = [
      { id: 'shift_morning', name: '白班', startTime: '08:00', endTime: '16:00' },
      { id: 'shift_evening', name: '中班', startTime: '16:00', endTime: '00:00' },
      { id: 'shift_night', name: '夜班', startTime: '00:00', endTime: '08:00' }
    ];
    Shifts.saveAll(sampleShifts);

    const sampleUsers = [
      { id: 'user_zhang', name: '张三', roleId: 'role_admin' },
      { id: 'user_li', name: '李四', roleId: 'role_operator' },
      { id: 'user_wang', name: '王五', roleId: 'role_operator' },
      { id: 'user_zhao', name: '赵六', roleId: 'role_observer' }
    ];
    Users.saveAll(sampleUsers);

    const sampleCheckItems = [
      { id: 'check_1', name: '告警平台巡检', required: true, description: '检查所有告警平台是否有未处理告警' },
      { id: 'check_2', name: '服务器状态检查', required: true, description: '检查核心服务器CPU、内存、磁盘使用率' },
      { id: 'check_3', name: '网络设备状态', required: true, description: '检查核心交换机、路由器状态' },
      { id: 'check_4', name: '备份任务检查', required: false, description: '检查昨日备份任务是否成功' },
      { id: 'check_5', name: '值班日志填写', required: true, description: '确认本班值班日志已填写完整' }
    ];
    CheckItems.saveAll(sampleCheckItems);

    const today = new Date().toISOString().split('T')[0];
    const currentShiftData = {
      shiftId: 'shift_morning',
      date: today,
      handoverUserId: 'user_zhang'
    };
    CurrentShift.save(currentShiftData);

    const creator = sampleUsers[0];
    Items.saveAll([]);
    
    Items.create({
      title: '数据库CPU使用率告警',
      type: 'alert',
      description: '主数据库CPU使用率持续高于85%，需要排查慢查询',
      shiftId: 'shift_morning',
      shiftDate: today,
      assigneeId: 'user_li',
      assigneeName: '李四'
    }, creator);

    Items.create({
      title: '防火墙配置临时变更',
      type: 'change',
      description: '为配合项目上线，需要临时开放8080端口',
      shiftId: 'shift_morning',
      shiftDate: today,
      assigneeId: '',
      assigneeName: ''
    }, creator);

    Items.create({
      title: '监控系统磁盘空间不足',
      type: 'alert',
      description: '监控服务器磁盘使用率达90%，需要清理日志',
      shiftId: 'shift_morning',
      shiftDate: today,
      assigneeId: 'user_wang',
      assigneeName: '王五'
    }, creator);

    return true;
  }

  function exportAllData() {
    return {
      shifts: Shifts.getAll(),
      roles: Roles.getAll(),
      users: Users.getAll(),
      checkItems: CheckItems.getAll(),
      items: Items.getAll(),
      currentShift: CurrentShift.get(),
      handoverRecords: HandoverRecords.getAll(),
      exportTime: new Date().toISOString(),
      version: '1.0'
    };
  }

  function importAllData(data) {
    try {
      if (data.shifts) Shifts.saveAll(data.shifts);
      if (data.roles) Roles.saveAll(data.roles);
      if (data.users) Users.saveAll(data.users);
      if (data.checkItems) CheckItems.saveAll(data.checkItems);
      if (data.items) Items.saveAll(data.items);
      if (data.currentShift) CurrentShift.save(data.currentShift);
      if (data.handoverRecords) HandoverRecords.saveAll(data.handoverRecords);
      return true;
    } catch (e) {
      console.error('导入数据失败:', e);
      return false;
    }
  }

  return {
    Shifts,
    Roles,
    Users,
    CheckItems,
    Items,
    CurrentShift,
    CurrentUser,
    HandoverRecords,
    createSampleData,
    exportAllData,
    importAllData,
    generateId
  };
})();
