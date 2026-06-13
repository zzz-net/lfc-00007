const Store = (function() {
  const STORAGE_KEYS = {
    SHIFTS: 'handover_shifts',
    ROLES: 'handover_roles',
    USERS: 'handover_users',
    CHECK_ITEMS: 'handover_check_items',
    ITEMS: 'handover_items',
    CURRENT_SHIFT: 'handover_current_shift',
    HANDOVER_RECORDS: 'handover_records',
    CURRENT_USER_ID: 'handover_current_user',
    RECOVERY_LOGS: 'handover_recovery_logs',
    REVIEW_CARDS: 'handover_review_cards',
    REVIEW_FILTERS: 'handover_review_filters',
    CHECKLIST_TEMPLATES: 'handover_checklist_templates',
    CHECKLIST_RECORDS: 'handover_checklist_records',
    COLLAB_ROOMS: 'handover_collab_rooms'
  };

  const CURRENT_DATA_VERSION = '1.1';
  const COMPATIBLE_VERSIONS = ['1.0', '1.1'];

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
      const roles = getFromStorage(STORAGE_KEYS.ROLES, []);
      let needsSave = false;
      const migrated = roles.map(role => {
        if (!('canManageConfig' in role)) {
          needsSave = true;
          return {
            ...role,
            canManageConfig: role.id === 'role_admin' || role.name === '班长'
          };
        }
        return role;
      });
      if (needsSave) {
        saveToStorage(STORAGE_KEYS.ROLES, migrated);
      }
      return migrated;
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
    },

    exportExceptionHandover(operator, selectedItemIds, checkResults, takeoverCandidateIds) {
      const EXCEPTION_HANDOVER_VERSION = '1.0';
      const shift = CurrentShift.get();
      const shiftInfo = shift.shiftId ? {
        shiftId: shift.shiftId,
        shiftName: Shifts.getById(shift.shiftId)?.name || '',
        date: shift.date
      } : null;

      const handoverUser = shift.handoverUserId ? {
        id: shift.handoverUserId,
        name: Users.getById(shift.handoverUserId)?.name || '',
        roleId: Users.getById(shift.handoverUserId)?.roleId || '',
        roleName: (() => {
          const u = Users.getById(shift.handoverUserId);
          return u ? (Roles.getById(u.roleId)?.name || '') : '';
        })()
      } : (operator ? {
        id: operator.id, name: operator.name, roleId: operator.roleId,
        roleName: Roles.getById(operator.roleId)?.name || ''
      } : null);

      const allItems = this.getAll();
      const items = selectedItemIds && selectedItemIds.length > 0
        ? allItems.filter(it => selectedItemIds.includes(it.id))
        : allItems.filter(it => it.shiftId === shift.shiftId && it.shiftDate === shift.date);

      const allCheckItems = CheckItems.getAll();
      const checkResultList = allCheckItems.map(ci => ({
        id: ci.id,
        name: ci.name,
        required: ci.required || false,
        checked: !!(checkResults && checkResults[ci.id] && checkResults[ci.id].checked)
      }));

      const candidates = (takeoverCandidateIds || []).map(uid => {
        const u = Users.getById(uid);
        if (!u) return null;
        return {
          id: u.id,
          name: u.name,
          roleId: u.roleId,
          roleName: Roles.getById(u.roleId)?.name || ''
        };
      }).filter(Boolean);

      return {
        packageType: 'exception_handover',
        packageVersion: EXCEPTION_HANDOVER_VERSION,
        exportTime: new Date().toISOString(),
        shiftInfo,
        handoverUser,
        operator: operator ? {
          id: operator.id, name: operator.name, roleId: operator.roleId,
          roleName: Roles.getById(operator.roleId)?.name || ''
        } : null,
        takeoverCandidates: candidates,
        checkResults: checkResultList,
        items: items.map(it => JSON.parse(JSON.stringify(it)))
      };
    },

    validateExceptionHandoverStructure(data) {
      const errors = [];
      const warnings = [];

      if (!data || typeof data !== 'object') {
        errors.push('交接包数据格式错误，应为 JSON 对象');
        return { valid: false, errors, warnings };
      }

      if (!data.packageType) {
        errors.push('缺少 packageType 字段');
      } else if (data.packageType !== 'exception_handover') {
        errors.push(`packageType 应为 'exception_handover'，实际为 '${data.packageType}'`);
      }

      if (!data.packageVersion) {
        warnings.push('缺少 packageVersion 字段');
      }

      if (!data.exportTime) {
        warnings.push('缺少 exportTime 字段');
      }

      if (!data.shiftInfo) {
        errors.push('缺少 shiftInfo（班次信息）');
      } else if (typeof data.shiftInfo !== 'object') {
        errors.push('shiftInfo 格式错误');
      } else {
        if (!data.shiftInfo.shiftId) warnings.push('shiftInfo 缺少 shiftId');
        if (!data.shiftInfo.date) warnings.push('shiftInfo 缺少 date');
      }

      if (!data.handoverUser) {
        errors.push('缺少 handoverUser（交班人信息）');
      } else if (typeof data.handoverUser !== 'object') {
        errors.push('handoverUser 格式错误');
      }

      if (!Array.isArray(data.items)) {
        errors.push('items 应为数组');
      } else {
        data.items.forEach((it, idx) => {
          if (!it || typeof it !== 'object') {
            errors.push(`第 ${idx + 1} 个事项格式错误`);
            return;
          }
          if (!it.id) errors.push(`第 ${idx + 1} 个事项缺少 id`);
          if (!it.title) warnings.push(`事项 ${it.id || idx + 1} 缺少 title`);
          if (typeof it.version !== 'number') warnings.push(`事项 ${it.id || idx + 1} 缺少数字类型的 version`);
          if (!Array.isArray(it.history)) warnings.push(`事项 ${it.id || idx + 1} 缺少 history 数组`);
        });
      }

      if (!Array.isArray(data.takeoverCandidates)) {
        warnings.push('takeoverCandidates 应为数组');
      }
      if (!Array.isArray(data.checkResults)) {
        warnings.push('checkResults 应为数组');
      }

      return { valid: errors.length === 0, errors, warnings };
    },

    checkExceptionHandoverPermission(user, pkgData) {
      if (!user) {
        return { allowed: false, reason: '未登录用户无权限导入交接包' };
      }
      const role = Roles.getById(user.roleId);
      if (!role || !role.canConfirm) {
        return { allowed: false, reason: `当前用户角色无接班确认权限（需要 canConfirm）` };
      }
      const candidates = pkgData.takeoverCandidates || [];
      if (candidates.length > 0) {
        const inList = candidates.some(c => c.id === user.id);
        if (!inList) {
          return {
            allowed: false,
            reason: `当前用户不在接班候选人列表中（候选人：${candidates.map(c => c.name).join('、')}）`
          };
        }
      }
      return { allowed: true, reason: '权限校验通过' };
    },

    previewExceptionHandoverImport(data, currentUser) {
      const structureValidation = this.validateExceptionHandoverStructure(data);

      const currentVersion = (typeof CURRENT_DATA_VERSION !== 'undefined') ? CURRENT_DATA_VERSION : '3.0';
      const importVersion = data.packageVersion || '0.0';
      const compatibleVersions = (typeof COMPATIBLE_VERSIONS !== 'undefined') ? COMPATIBLE_VERSIONS : ['1.0', '2.0', '3.0'];
      const isCompatible = compatibleVersions.includes(importVersion) || importVersion === currentVersion;
      const isOlder = importVersion < currentVersion;
      const versionCheck = {
        compatible: isCompatible,
        importVersion,
        currentVersion,
        isOlder,
        message: isCompatible
          ? (isOlder ? '导入版本较旧，可兼容导入' : '版本兼容')
          : `导入版本 ${importVersion} 与当前版本 ${currentVersion} 不兼容`
      };

      const permissionCheck = this.checkExceptionHandoverPermission(currentUser, data);

      const localItemsMap = {};
      this.getAll().forEach(it => { localItemsMap[it.id] = it; });

      const itemAnalysis = [];
      const importItems = data.items || [];

      importItems.forEach(imported => {
        const local = localItemsMap[imported.id];
        let action;
        let canImport;
        let reason = '';

        if (!local) {
          action = 'new';
          canImport = true;
          reason = '本地不存在该事项，将新增';
        } else {
          const localVersion = local.version || 0;
          const importVersion = imported.version || 0;
          const localUpdateTime = new Date(local.updateTime || 0).getTime();
          const importUpdateTime = new Date(imported.updateTime || 0).getTime();

          const isContentEqual = JSON.stringify({
            t: imported.title, d: imported.description, s: imported.status,
            a: imported.assigneeId
          }) === JSON.stringify({
            t: local.title, d: local.description, s: local.status,
            a: local.assigneeId
          });

          if (localVersion > importVersion) {
            action = 'conflict';
            canImport = false;
            reason = `本地版本(v${localVersion})比导入版本(v${importVersion})更新，可能已有新处理，已跳过`;
          } else if (localUpdateTime > importUpdateTime) {
            action = 'conflict';
            canImport = false;
            reason = `本地更新时间比导入包中更新时间更晚，可能已有新处理，已跳过`;
          } else if (isContentEqual && localVersion === importVersion) {
            action = 'skip';
            canImport = false;
            reason = '本地内容与导入内容完全一致，无需更新';
          } else {
            action = 'overwrite';
            canImport = true;
            reason = `本地有该事项，内容有差异，将覆盖更新（版本号会递增）`;
          }
        }

        itemAnalysis.push({
          id: imported.id,
          title: imported.title || imported.id,
          action,
          canImport: permissionCheck.allowed && canImport,
          reason,
          importedVersion: imported.version,
          localVersion: local?.version,
          importedItem: imported,
          localItem: local
        });
      });

      const summary = {
        total: itemAnalysis.length,
        newCount: itemAnalysis.filter(a => a.action === 'new').length,
        overwriteCount: itemAnalysis.filter(a => a.action === 'overwrite').length,
        conflictCount: itemAnalysis.filter(a => a.action === 'conflict').length,
        skipCount: itemAnalysis.filter(a => a.action === 'skip').length
      };

      const allCheckItems = CheckItems.getAll();
      const packageCheckMap = {};
      (data.checkResults || []).forEach(cr => { packageCheckMap[cr.id] = cr; });
      const checkItemResults = allCheckItems.map(ci => {
        const pkgCr = packageCheckMap[ci.id];
        return {
          id: ci.id,
          name: ci.name,
          required: ci.required || false,
          checked: pkgCr ? !!pkgCr.checked : false,
          inPackage: !!pkgCr
        };
      });

      return {
        summary,
        itemAnalysis,
        checkItemResults,
        packageInfo: {
          packageType: data.packageType,
          packageVersion: data.packageVersion,
          exportTime: data.exportTime,
          shiftInfo: data.shiftInfo,
          handoverUser: data.handoverUser,
          operator: data.operator,
          takeoverCandidates: data.takeoverCandidates || []
        },
        structureValid: structureValidation.valid,
        structureWarnings: structureValidation.warnings,
        structureErrors: structureValidation.errors,
        versionCheck,
        permissionCheck
      };
    },

    executeExceptionHandoverImport(data, currentUser) {
      try {
        const preview = this.previewExceptionHandoverImport(data, currentUser);
        if (!preview.permissionCheck.allowed) {
          return {
            success: false,
            errors: [preview.permissionCheck.reason],
            imported: { newCount: 0, overwriteCount: 0, conflictCount: 0, skipCount: preview.summary.skipCount }
          };
        }

        const beforeSnapshot = this.getAll();
        const importedItemIds = [];
        let newCount = 0;
        let overwriteCount = 0;

        const items = this.getAll();
        const itemsMap = {};
        items.forEach(it => { itemsMap[it.id] = it; });

        preview.itemAnalysis.forEach(analysis => {
          if (!analysis.canImport) return;
          const imported = analysis.importedItem;

          if (analysis.action === 'new') {
            const now = new Date().toISOString();
            const newItem = {
              ...imported,
              version: Math.max(1, imported.version || 1),
              createTime: imported.createTime || now,
              updateTime: now,
              history: [
                ...(imported.history || []),
                {
                  action: 'import_create',
                  timestamp: now,
                  operator: currentUser ? {
                    id: currentUser.id, name: currentUser.name,
                    roleId: currentUser.roleId,
                    roleName: Roles.getById(currentUser.roleId)?.name || ''
                  } : null,
                  remark: '从异常交接包导入新增'
                }
              ]
            };
            items.push(newItem);
            itemsMap[newItem.id] = newItem;
            importedItemIds.push(newItem.id);
            newCount++;
          } else if (analysis.action === 'overwrite') {
            const local = itemsMap[imported.id];
            if (local) {
              const now = new Date().toISOString();
              const oldVersion = local.version || 0;
              const importVersion = imported.version || 0;
              local.title = imported.title;
              local.description = imported.description;
              local.type = imported.type;
              local.status = imported.status;
              local.assigneeId = imported.assigneeId;
              local.shiftId = imported.shiftId || local.shiftId;
              local.shiftDate = imported.shiftDate || local.shiftDate;
              local.version = Math.max(oldVersion, importVersion) + 1;
              local.updateTime = now;
              if (!Array.isArray(local.history)) local.history = [];
              local.history.push({
                action: 'import_overwrite',
                timestamp: now,
                operator: currentUser ? {
                  id: currentUser.id, name: currentUser.name,
                  roleId: currentUser.roleId,
                  roleName: Roles.getById(currentUser.roleId)?.name || ''
                } : null,
                remark: '异常交接包覆盖更新',
                baseVersion: oldVersion
              });
              importedItemIds.push(local.id);
              overwriteCount++;
            }
          }
        });

        this.saveAll(items);

        const afterSnapshot = this.getAll();
        const logId = 'recov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        RecoveryLogs.add({
          id: logId,
          operationType: 'exception_handover_import',
          operationTime: new Date().toISOString(),
          operator: currentUser ? {
            id: currentUser.id, name: currentUser.name,
            roleId: currentUser.roleId,
            roleName: Roles.getById(currentUser.roleId)?.name || ''
          } : null,
          packageInfo: {
            packageVersion: data.packageVersion,
            shiftInfo: data.shiftInfo,
            handoverUser: data.handoverUser,
            exportTime: data.exportTime
          },
          beforeSnapshot: { items: beforeSnapshot },
          afterSnapshot: { items: afterSnapshot },
          conflicts: preview.itemAnalysis.filter(a => a.action === 'conflict').map(a => ({
            type: 'item_version_or_update',
            id: a.id,
            name: a.title,
            localVersion: a.localVersion,
            importVersion: a.importedVersion,
            reason: a.reason
          })),
          importedItemIds,
          skippedCount: preview.summary.conflictCount + preview.summary.skipCount,
          conflictCount: preview.summary.conflictCount,
          success: true
        });

        return {
          success: true,
          imported: {
            newCount,
            overwriteCount,
            conflictCount: preview.summary.conflictCount,
            skipCount: preview.summary.skipCount,
            total: preview.summary.total
          },
          logId
        };
      } catch (e) {
        RecoveryLogs.add({
          id: 'recov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          operationType: 'exception_handover_import',
          operationTime: new Date().toISOString(),
          operator: currentUser ? {
            id: currentUser.id, name: currentUser.name,
            roleId: currentUser.roleId,
            roleName: Roles.getById(currentUser.roleId)?.name || ''
          } : null,
          success: false,
          errorMessage: e.message
        });
        return { success: false, errors: ['导入过程发生错误: ' + e.message] };
      }
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

  const RecoveryLogs = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.RECOVERY_LOGS, []);
    },
    saveAll(logs) {
      return saveToStorage(STORAGE_KEYS.RECOVERY_LOGS, logs);
    },
    add(log) {
      const logs = this.getAll();
      const newLog = {
        id: generateId('recovery'),
        ...log,
        timestamp: Date.now()
      };
      logs.unshift(newLog);
      if (logs.length > 100) {
        logs.splice(100);
      }
      this.saveAll(logs);
      return newLog;
    }
  };

  const ReviewFilters = {
    get() {
      return getFromStorage(STORAGE_KEYS.REVIEW_FILTERS, {
        hasRisk: false,
        noRisk: false,
        myResponsible: false,
        overdue: false
      });
    },
    save(filters) {
      return saveToStorage(STORAGE_KEYS.REVIEW_FILTERS, filters);
    }
  };

  const ChecklistTemplates = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.CHECKLIST_TEMPLATES, []);
    },
    saveAll(templates) {
      return saveToStorage(STORAGE_KEYS.CHECKLIST_TEMPLATES, templates);
    },
    getById(id) {
      return this.getAll().find(t => t.id === id) || null;
    },
    create(template) {
      const templates = this.getAll();
      const newTemplate = {
        id: generateId('clt'),
        name: template.name || '',
        shiftIds: template.shiftIds || [],
        items: (template.items || []).map(it => ({
          id: generateId('cli'),
          name: it.name || '',
          required: !!it.required,
          description: it.description || ''
        })),
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      };
      templates.push(newTemplate);
      this.saveAll(templates);
      return { success: true, template: newTemplate };
    },
    update(id, data) {
      const templates = this.getAll();
      const idx = templates.findIndex(t => t.id === id);
      if (idx === -1) return { success: false, error: '模板不存在' };
      if (data.name !== undefined) templates[idx].name = data.name;
      if (data.shiftIds !== undefined) templates[idx].shiftIds = data.shiftIds;
      if (data.items !== undefined) {
        templates[idx].items = data.items.map(it => ({
          id: it.id || generateId('cli'),
          name: it.name || '',
          required: !!it.required,
          description: it.description || ''
        }));
      }
      templates[idx].updateTime = new Date().toISOString();
      this.saveAll(templates);
      return { success: true, template: templates[idx] };
    },
    remove(id) {
      const templates = this.getAll();
      const filtered = templates.filter(t => t.id !== id);
      if (filtered.length === templates.length) return { success: false, error: '模板不存在' };
      this.saveAll(filtered);
      return { success: true };
    },
    getByShiftId(shiftId) {
      return this.getAll().filter(t => !t.shiftIds || t.shiftIds.length === 0 || t.shiftIds.includes(shiftId));
    }
  };

  const ChecklistRecords = {
    getAll() {
      return getFromStorage(STORAGE_KEYS.CHECKLIST_RECORDS, []);
    },
    saveAll(records) {
      return saveToStorage(STORAGE_KEYS.CHECKLIST_RECORDS, records);
    },
    getById(id) {
      return this.getAll().find(r => r.id === id) || null;
    },
    generate(templateId, user, shiftId, shiftDate) {
      if (!user || !user.id) {
        return { success: false, error: '请先选择当前用户' };
      }
      const role = Roles.getById(user.roleId);
      if (!role || (!role.canConfirm && !role.canCreate)) {
        return { success: false, error: '当前用户无权限执行班前检查' };
      }
      const template = ChecklistTemplates.getById(templateId);
      if (!template) {
        return { success: false, error: '检查清单模板已被删除，无法生成检查单' };
      }
      const existing = this.getAll().find(r =>
        r.templateId === templateId &&
        r.executorId === user.id &&
        r.shiftId === shiftId &&
        r.shiftDate === shiftDate
      );
      if (existing) {
        return { success: false, error: '当天已生成过该模板的检查单，不能重复生成', existingId: existing.id };
      }
      const records = this.getAll();
      const newRecord = {
        id: generateId('clr'),
        templateId,
        templateName: template.name,
        shiftId,
        shiftDate,
        executorId: user.id,
        executorName: user.name,
        executorRoleId: user.roleId,
        executorRoleName: role ? role.name : '',
        items: template.items.map(it => ({
          id: it.id,
          name: it.name,
          required: it.required,
          description: it.description || '',
          checked: false,
          remark: ''
        })),
        status: 'in_progress',
        createTime: new Date().toISOString(),
        completeTime: null
      };
      records.push(newRecord);
      this.saveAll(records);
      return { success: true, record: newRecord };
    },
    checkItem(recordId, itemId, checked, remark, user) {
      const records = this.getAll();
      const record = records.find(r => r.id === recordId);
      if (!record) return { success: false, error: '检查单不存在' };
      if (record.status !== 'in_progress') return { success: false, error: '检查单已完成，不能再修改' };
      if (record.executorId !== (user && user.id)) return { success: false, error: '只能修改自己的检查单' };
      const item = record.items.find(it => it.id === itemId);
      if (!item) return { success: false, error: '检查项不存在' };
      item.checked = !!checked;
      if (remark !== undefined) item.remark = remark;
      this.saveAll(records);
      return { success: true, item };
    },
    complete(recordId, user) {
      const records = this.getAll();
      const record = records.find(r => r.id === recordId);
      if (!record) return { success: false, error: '检查单不存在' };
      if (record.status !== 'in_progress') return { success: false, error: '检查单已完成' };
      if (record.executorId !== (user && user.id)) return { success: false, error: '只能完成自己的检查单' };
      const unchecked = record.items.filter(it => it.required && !it.checked);
      if (unchecked.length > 0) {
        return {
          success: false,
          error: `还有 ${unchecked.length} 个必填项未完成：${unchecked.map(it => it.name).join('、')}`,
          uncheckedItems: unchecked
        };
      }
      record.status = 'completed';
      record.completeTime = new Date().toISOString();
      this.saveAll(records);
      RecoveryLogs.add({
        action: '完成班前检查',
        operatorId: user.id,
        operatorName: user.name,
        checklistRecordId: recordId,
        templateName: record.templateName,
        shiftDate: record.shiftDate,
        totalItems: record.items.length,
        failedItems: record.items.filter(it => !it.checked).map(it => it.name),
        succeeded: true
      });
      return { success: true, record };
    },
    getByUser(userId) {
      return this.getAll().filter(r => r.executorId === userId);
    },
    getByShift(shiftId, shiftDate) {
      return this.getAll().filter(r => r.shiftId === shiftId && r.shiftDate === shiftDate);
    },
    exportJSON(filters) {
      let records = this.getAll();
      if (filters) {
        if (filters.shiftId) records = records.filter(r => r.shiftId === filters.shiftId);
        if (filters.startDate) records = records.filter(r => r.shiftDate >= filters.startDate);
        if (filters.endDate) records = records.filter(r => r.shiftDate <= filters.endDate);
        if (filters.status) records = records.filter(r => r.status === filters.status);
      }
      if (records.length === 0) {
        return { success: false, error: '没有可导出的检查记录' };
      }
      const exportData = records.map(r => ({
        recordId: r.id,
        templateName: r.templateName,
        shiftId: r.shiftId,
        shiftDate: r.shiftDate,
        executorName: r.executorName,
        executorRoleName: r.executorRoleName,
        status: r.status,
        createTime: r.createTime,
        completeTime: r.completeTime,
        totalItems: r.items.length,
        checkedItems: r.items.filter(it => it.checked).length,
        failedItems: r.items.filter(it => !it.checked).map(it => ({ name: it.name, required: it.required, remark: it.remark })),
        items: r.items.map(it => ({ name: it.name, required: it.required, checked: it.checked, remark: it.remark }))
      }));
      return { success: true, data: exportData, count: exportData.length };
    },
    exportCSV(filters) {
      const jsonResult = this.exportJSON(filters);
      if (!jsonResult.success) return jsonResult;
      const header = '班次日期,班次ID,模板名称,执行人,角色,状态,完成时间,总项数,通过项数,未通过项,备注';
      const rows = jsonResult.data.map(r => {
        const failedNames = r.failedItems.map(f => f.name + (f.remark ? '(' + f.remark + ')' : '')).join('; ');
        const statusText = r.status === 'completed' ? '已完成' : '进行中';
        const allRemarks = r.items.filter(it => it.remark).map(it => it.name + ':' + it.remark).join('; ');
        return [
          r.shiftDate,
          r.shiftId,
          '"' + (r.templateName || '').replace(/"/g, '""') + '"',
          r.executorName,
          r.executorRoleName,
          statusText,
          r.completeTime || '',
          r.totalItems,
          r.checkedItems,
          '"' + failedNames.replace(/"/g, '""') + '"',
          '"' + (allRemarks || '').replace(/"/g, '""') + '"'
        ].join(',');
      });
      return { success: true, csv: header + '\n' + rows.join('\n'), count: jsonResult.count };
    }
  };

  const ReviewCards = {
    getAll() {
      const raw = getFromStorage(STORAGE_KEYS.REVIEW_CARDS, []);
      const seen = new Map();
      let needsSave = false;
      const migrated = raw.map(card => {
        if (!card || !card.sourceId) return null;
        if (!('focusMark' in card)) {
          needsSave = true;
          card.focusMark = false;
        }
        return card;
      }).filter(Boolean);
      for (const card of migrated) {
        if (!seen.has(card.sourceId) || card.createTime < seen.get(card.sourceId).createTime) {
          seen.set(card.sourceId, card);
        }
      }
      const deduped = Array.from(seen.values());
      if (needsSave || deduped.length !== raw.length) {
        saveToStorage(STORAGE_KEYS.REVIEW_CARDS, deduped);
      }
      return deduped;
    },
    saveAll(cards) {
      const seen = new Map();
      const migrated = cards.map(card => {
        if (!card || !card.sourceId) return null;
        if (!('focusMark' in card)) {
          card.focusMark = false;
        }
        return card;
      }).filter(Boolean);
      for (const card of migrated) {
        if (!seen.has(card.sourceId) || card.createTime < seen.get(card.sourceId).createTime) {
          seen.set(card.sourceId, card);
        }
      }
      const deduped = Array.from(seen.values());
      return saveToStorage(STORAGE_KEYS.REVIEW_CARDS, deduped);
    },
    getById(id) {
      return this.getAll().find(c => c.id === id) || null;
    },
    getBySourceId(sourceId) {
      return this.getAll().find(c => c.sourceId === sourceId) || null;
    },
    create(data, operator) {
      if (!data || !data.sourceId) {
        return { success: false, error: '缺少来源ID', card: null, created: false };
      }
      const existing = this.getBySourceId(data.sourceId);
      if (existing) {
        return { success: true, card: existing, created: false, message: '该来源已有复盘卡，复用现有卡' };
      }
      const now = Date.now();
      const card = {
        id: generateId('review'),
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        sourceSummary: data.sourceSummary || '',
        hasRisk: data.hasRisk || false,
        riskDescription: data.riskDescription || '',
        responsiblePersonId: data.responsiblePersonId || '',
        responsiblePersonName: data.responsiblePersonName || '',
        followUpDeadline: data.followUpDeadline || '',
        conclusion: data.conclusion || '',
        focusMark: false,
        followUpNotes: [],
        logs: [{
          action: '创建复盘卡',
          operatorId: operator.id,
          operatorName: operator.name,
          time: now,
          detail: `创建复盘卡，来源：${data.sourceType === 'handover_record' ? '交接记录' : '已关闭事项'}`
        }],
        creatorId: operator.id,
        creatorName: operator.name,
        createTime: now,
        updateTime: now
      };
      const cards = this.getAll();
      cards.push(card);
      this.saveAll(cards);
      return { success: true, card, created: true, message: '复盘卡已创建' };
    },
    updateConclusion(id, data, operator) {
      const cards = this.getAll();
      const index = cards.findIndex(c => c.id === id);
      if (index === -1) return { success: false, error: '复盘卡不存在' };
      const card = cards[index];
      const operatorRole = Roles.getById(operator.roleId);
      if (!operatorRole || operatorRole.id !== 'role_admin') {
        return { success: false, error: '权限不足，只有班长可以修改复盘结论' };
      }
      const changes = [];
      if (data.hasRisk !== undefined && data.hasRisk !== card.hasRisk) {
        changes.push(`遗留风险：${card.hasRisk ? '是' : '否'} → ${data.hasRisk ? '是' : '否'}`);
        card.hasRisk = data.hasRisk;
      }
      if (data.riskDescription !== undefined && data.riskDescription !== card.riskDescription) {
        changes.push('风险描述已更新');
        card.riskDescription = data.riskDescription;
      }
      if (data.responsiblePersonId !== undefined && data.responsiblePersonId !== card.responsiblePersonId) {
        changes.push(`责任人：${card.responsiblePersonName || '无'} → ${data.responsiblePersonName || '无'}`);
        card.responsiblePersonId = data.responsiblePersonId;
        card.responsiblePersonName = data.responsiblePersonName || '';
      }
      if (data.followUpDeadline !== undefined && data.followUpDeadline !== card.followUpDeadline) {
        changes.push(`跟进截止时间：${card.followUpDeadline || '无'} → ${data.followUpDeadline || '无'}`);
        card.followUpDeadline = data.followUpDeadline;
      }
      if (data.conclusion !== undefined && data.conclusion !== card.conclusion) {
        changes.push('复盘结论已更新');
        card.conclusion = data.conclusion;
      }
      card.updateTime = Date.now();
      card.logs.push({
        action: '修改复盘结论',
        operatorId: operator.id,
        operatorName: operator.name,
        time: card.updateTime,
        detail: changes.join('；') || '更新复盘信息'
      });
      cards[index] = card;
      this.saveAll(cards);
      return { success: true, card };
    },
    addFollowUpNote(id, note, operator) {
      const cards = this.getAll();
      const index = cards.findIndex(c => c.id === id);
      if (index === -1) return { success: false, error: '复盘卡不存在' };
      const card = cards[index];
      const now = Date.now();
      card.followUpNotes.push({
        id: generateId('note'),
        content: note,
        operatorId: operator.id,
        operatorName: operator.name,
        time: now
      });
      card.updateTime = now;
      card.logs.push({
        action: '添加跟进说明',
        operatorId: operator.id,
        operatorName: operator.name,
        time: now,
        detail: `添加跟进说明：${note.substring(0, 50)}${note.length > 50 ? '...' : ''}`
      });
      cards[index] = card;
      this.saveAll(cards);
      return { success: true, card };
    },
    deleteCard(id, operator) {
      const cards = this.getAll();
      const index = cards.findIndex(c => c.id === id);
      if (index === -1) return { success: false, error: '复盘卡不存在' };
      const operatorRole = Roles.getById(operator.roleId);
      if (!operatorRole || operatorRole.id !== 'role_admin') {
        return { success: false, error: '权限不足，只有班长可以删除复盘卡' };
      }
      cards.splice(index, 1);
      this.saveAll(cards);
      return { success: true };
    },
    toggleFocusMark(id, operator) {
      const cards = this.getAll();
      const index = cards.findIndex(c => c.id === id);
      if (index === -1) return { success: false, error: '复盘卡不存在' };
      const operatorRole = Roles.getById(operator.roleId);
      if (!operatorRole || operatorRole.id !== 'role_admin') {
        return { success: false, error: '权限不足，只有班长可以修改重点标记' };
      }
      const card = cards[index];
      const oldMark = card.focusMark || false;
      card.focusMark = !oldMark;
      card.updateTime = Date.now();
      card.logs.push({
        action: card.focusMark ? '标记为重点关注' : '取消重点关注',
        operatorId: operator.id,
        operatorName: operator.name,
        time: card.updateTime,
        detail: card.focusMark ? '将该复盘卡标记为重点关注' : '取消该复盘卡的重点关注标记'
      });
      cards[index] = card;
      this.saveAll(cards);
      return { success: true, card };
    },
    checkCanEditConclusion(user) {
      if (!user || !user.roleId) return false;
      const role = Roles.getById(user.roleId);
      return role && role.id === 'role_admin';
    }
  };

  const CollabRooms = {
    LEVELS: {
      urgent: { name: '紧急', color: 'urgent' },
      high: { name: '高', color: 'high' },
      medium: { name: '中', color: 'medium' },
      low: { name: '低', color: 'low' }
    },

    getAll() {
      return getFromStorage(STORAGE_KEYS.COLLAB_ROOMS, []);
    },
    saveAll(rooms) {
      return saveToStorage(STORAGE_KEYS.COLLAB_ROOMS, rooms);
    },
    getById(id) {
      return this.getAll().find(r => r.id === id) || null;
    },
    getActiveBySourceItemId(sourceItemId) {
      return this.getAll().find(r => r.sourceItemId === sourceItemId && r.status === 'active') || null;
    },
    getByParticipant(userId) {
      return this.getAll().filter(r =>
        r.participants.some(p => p.userId === userId)
      );
    },
    create(data, creator) {
      if (!creator || !creator.id) {
        return { success: false, error: '请先选择当前用户' };
      }
      const role = Roles.getById(creator.roleId);
      if (!role || !role.canCreate) {
        return {
          success: false,
          error: '当前用户无权限创建处置室',
          conflict: true,
          conflictType: 'permission'
        };
      }
      if (data.sourceItemId) {
        const existing = this.getActiveBySourceItemId(data.sourceItemId);
        if (existing) {
          return {
            success: false,
            error: '该事项已有关联的进行中处置室，请勿重复拉起',
            conflict: true,
            existingRoomId: existing.id,
            existingRoom: existing,
            conflictType: 'duplicate_room'
          };
        }
      }
      if (!data.title || !data.title.trim()) {
        return { success: false, error: '请填写处置室标题' };
      }
      if (!data.level || !this.LEVELS[data.level]) {
        return { success: false, error: '请选择事件级别' };
      }
      // 允许传入 participantIds（ID 数组）或 participants（对象数组）
      if (data.participantIds && !data.participants) {
        const allUsers = Users.getAll();
        data.participants = data.participantIds
          .map(uid => allUsers.find(u => u.id === uid))
          .filter(Boolean)
          .map(u => ({
            userId: u.id,
            name: u.name,
            roleId: u.roleId,
            roleName: (Roles.getById(u.roleId) || {}).name || ''
          }));
      }
      if (!data.participants || data.participants.length === 0) {
        return { success: false, error: '请至少选择一位参与人' };
      }
      const now = Date.now();
      const room = {
        id: generateId('room'),
        sourceItemId: data.sourceItemId || '',
        sourceItemTitle: data.sourceItemTitle || '',
        title: data.title.trim(),
        level: data.level,
        impactScope: data.impactScope || '',
        target: data.target || '',
        deadline: data.deadline || '',
        status: 'active',
        participants: data.participants.map(p => ({
          userId: p.userId,
          name: p.name,
          roleId: p.roleId,
          roleName: p.roleName,
          joinTime: now
        })),
        messages: [],
        pendingQuestions: [],
        logs: [{
          id: generateId('log'),
          action: '创建处置室',
          detail: '创建处置室：' + data.title.trim() + '，事件级别：' + this.LEVELS[data.level].name + '，参与人：' + data.participants.map(p => p.name).join('、'),
          operatorId: creator.id,
          operatorName: creator.name,
          time: now
        }],
        version: 1,
        creatorId: creator.id,
        creatorName: creator.name,
        createTime: now,
        updateTime: now,
        closeTime: null,
        closeReason: ''
      };
      const rooms = this.getAll();
      rooms.push(room);
      this.saveAll(rooms);
      return { success: true, room };
    },
    _addLog(room, action, detail, operator) {
      const now = Date.now();
      room.logs.push({
        id: generateId('log'),
        action,
        detail,
        operatorId: operator.id,
        operatorName: operator.name,
        time: now
      });
    },
    _isAdmin(user) {
      if (!user || !user.roleId) return false;
      const role = Roles.getById(user.roleId);
      return role && (role.id === 'role_admin' || role.canManageConfig === true);
    },
    _isParticipant(room, user) {
      if (!user || !user.id) return false;
      return room.participants.some(p => p.userId === user.id);
    },
    canManageMembers(room, user) {
      if (!room || room.status === 'closed') return false;
      return this._isAdmin(user);
    },
    canClose(room, user) {
      if (!room || room.status === 'closed') return false;
      return this._isAdmin(user);
    },
    canAddMessage(room, user) {
      if (!room || room.status === 'closed') return false;
      return this._isParticipant(room, user);
    },
    canEditBasic(room, user) {
      if (!room || room.status === 'closed') return false;
      return this._isAdmin(user) || room.creatorId === user?.id;
    },
    update(id, data, operator, baseVersion) {
      const rooms = this.getAll();
      const idx = rooms.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, error: '处置室不存在' };
      const room = rooms[idx];
      if (room.status === 'closed') {
        return {
          success: false,
          error: '处置室已关闭，无法修改',
          conflict: true,
          conflictType: 'closed'
        };
      }
      if (baseVersion !== undefined && baseVersion !== room.version) {
        return {
          success: false,
          error: '版本冲突，已有他人更新，请刷新后重试',
          conflict: true,
          conflictType: 'version',
          latestVersion: room.version,
          latestRoom: JSON.parse(JSON.stringify(room))
        };
      }
      // 允许传入 participantIds（ID 数组）或 participants（对象数组）
      if (data.participantIds && !data.participants) {
        const allUsers = Users.getAll();
        data.participants = data.participantIds
          .map(uid => allUsers.find(u => u.id === uid))
          .filter(Boolean)
          .map(u => ({
            userId: u.id,
            name: u.name,
            roleId: u.roleId,
            roleName: (Roles.getById(u.roleId) || {}).name || ''
          }));
      }
      if (data.participants !== undefined && !this.canManageMembers(room, operator)) {
        return {
          success: false,
          error: '仅班长可调整参与人',
          conflict: true,
          conflictType: 'permission'
        };
      }
      const hasBasicChanges = data.title !== undefined || data.level !== undefined
        || data.impactScope !== undefined || data.target !== undefined
        || data.deadline !== undefined;
      if (hasBasicChanges && !this.canEditBasic(room, operator)) {
        return {
          success: false,
          error: '仅班长或创建者可修改基本信息',
          conflict: true,
          conflictType: 'permission'
        };
      }
      const changes = [];
      if (data.title !== undefined && data.title !== room.title) {
        changes.push('标题：' + room.title + ' → ' + data.title);
        room.title = data.title;
      }
      if (data.level !== undefined && data.level !== room.level) {
        changes.push('事件级别：' + this.LEVELS[room.level].name + ' → ' + this.LEVELS[data.level].name);
        room.level = data.level;
      }
      if (data.impactScope !== undefined && data.impactScope !== room.impactScope) {
        changes.push('影响范围已更新');
        room.impactScope = data.impactScope;
      }
      if (data.target !== undefined && data.target !== room.target) {
        changes.push('处置目标已更新');
        room.target = data.target;
      }
      if (data.deadline !== undefined && data.deadline !== room.deadline) {
        changes.push('截止时间：' + (room.deadline || '未设置') + ' → ' + (data.deadline || '未设置'));
        room.deadline = data.deadline;
      }
      if (data.participants !== undefined) {
        const newIds = data.participants.map(p => p.userId);
        const now = Date.now();
        const merged = [];
        data.participants.forEach(p => {
          const existing = room.participants.find(x => x.userId === p.userId);
          merged.push(existing || { ...p, joinTime: now });
        });
        const added = data.participants.filter(p => !room.participants.some(x => x.userId === p.userId));
        const removed = room.participants.filter(p => !newIds.includes(p.userId));
        room.participants = merged;
        const addedNames = added.map(a => a.name);
        const removedNames = removed.map(r => r.name);
        if (addedNames.length > 0 || removedNames.length > 0) {
          let detail = '成员调整：';
          if (addedNames.length > 0) detail += '添加：' + addedNames.join('、');
          if (removedNames.length > 0) detail += (addedNames.length > 0 ? '；' : '') + '移除：' + removedNames.join('、');
          changes.push(detail);
        }
      }
      if (changes.length === 0) {
        return { success: true, room };
      }
      room.version += 1;
      room.updateTime = Date.now();
      this._addLog(room, '修改处置室', changes.join('；'), operator);
      rooms[idx] = room;
      this.saveAll(rooms);
      return { success: true, room };
    },
    addProgress(id, content, attachments, operator) {
      const rooms = this.getAll();
      const idx = rooms.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, error: '处置室不存在' };
      const room = rooms[idx];
      if (room.status === 'closed') {
        return {
          success: false, error: '处置室已关闭，无法补充进展', conflict: true, conflictType: 'closed'
        };
      }
      if (!this._isParticipant(room, operator)) {
        return {
          success: false, error: '仅参与人可在处置室内补充进展', conflict: true, conflictType: 'permission'
        };
      }
      if (!content || !content.trim()) {
        return { success: false, error: '请输入进展内容' };
      }
      const now = Date.now();
      const message = {
        id: generateId('msg'),
        type: 'progress',
        content: content.trim(),
        attachments: attachments || [],
        operatorId: operator.id,
        operatorName: operator.name,
        time: now
      };
      room.messages.push(message);
      room.version += 1;
      room.updateTime = now;
      const summary = content.trim().substring(0, 50) + (content.length > 50 ? '...' : '');
      this._addLog(room, '补充进展', operator.name + ' 补充进展：' + summary, operator);
      rooms[idx] = room;
      this.saveAll(rooms);
      return { success: true, room, message };
    },
    addQuestion(id, content, operator) {
      const rooms = this.getAll();
      const idx = rooms.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, error: '处置室不存在' };
      const room = rooms[idx];
      if (room.status === 'closed') {
        return { success: false, error: '处置室已关闭，无法提出问题', conflict: true, conflictType: 'closed' };
      }
      if (!this._isParticipant(room, operator)) {
        return { success: false, error: '仅参与人可提出待确认问题', conflict: true, conflictType: 'permission' };
      }
      if (!content || !content.trim()) {
        return { success: false, error: '请输入问题内容' };
      }
      const now = Date.now();
      const question = {
        id: generateId('q'),
        content: content.trim(),
        answered: false,
        answer: '',
        answererId: '',
        answererName: '',
        answerTime: null,
        operatorId: operator.id,
        operatorName: operator.name,
        time: now
      };
      room.pendingQuestions.push(question);
      const message = {
        id: generateId('msg'),
        type: 'question',
        content: content.trim(),
        questionId: question.id,
        attachments: [],
        operatorId: operator.id,
        operatorName: operator.name,
        time: now
      };
      room.messages.push(message);
      room.version += 1;
      room.updateTime = now;
      const summary = content.trim().substring(0, 50) + (content.length > 50 ? '...' : '');
      this._addLog(room, '提出待确认问题', operator.name + ' 提出：' + summary, operator);
      rooms[idx] = room;
      this.saveAll(rooms);
      return { success: true, room, question };
    },
    answerQuestion(id, questionId, answer, operator) {
      const rooms = this.getAll();
      const idx = rooms.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, error: '处置室不存在' };
      const room = rooms[idx];
      if (room.status === 'closed') {
        return { success: false, error: '处置室已关闭', conflict: true, conflictType: 'closed' };
      }
      if (!this._isAdmin(operator) && room.creatorId !== operator.id) {
        return { success: false, error: '仅班长或处置室创建者可答复问题', conflict: true, conflictType: 'permission' };
      }
      const qIdx = room.pendingQuestions.findIndex(q => q.id === questionId);
      if (qIdx === -1) return { success: false, error: '问题不存在' };
      if (!answer || !answer.trim()) {
        return { success: false, error: '请输入答复内容' };
      }
      const now = Date.now();
      room.pendingQuestions[qIdx].answered = true;
      room.pendingQuestions[qIdx].answer = answer.trim();
      room.pendingQuestions[qIdx].answererId = operator.id;
      room.pendingQuestions[qIdx].answererName = operator.name;
      room.pendingQuestions[qIdx].answerTime = now;
      const message = {
        id: generateId('msg'),
        type: 'answer',
        content: answer.trim(),
        questionId: questionId,
        attachments: [],
        operatorId: operator.id,
        operatorName: operator.name,
        time: now
      };
      room.messages.push(message);
      room.version += 1;
      room.updateTime = now;
      const qSummary = room.pendingQuestions[qIdx].content.substring(0, 30);
      const aSummary = answer.trim().substring(0, 30);
      this._addLog(room, '答复问题', operator.name + ' 答复问题：' + qSummary + ' - ' + aSummary, operator);
      rooms[idx] = room;
      this.saveAll(rooms);
      return { success: true, room };
    },
    close(id, operator, reason, baseVersion) {
      const rooms = this.getAll();
      const idx = rooms.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, error: '处置室不存在' };
      const room = rooms[idx];
      if (room.status === 'closed') {
        return { success: false, error: '处置室已关闭', conflict: true, conflictType: 'closed' };
      }
      if (baseVersion !== undefined && baseVersion !== room.version) {
        return {
          success: false,
          error: '版本冲突，已有他人更新，请刷新后重试',
          conflict: true,
          conflictType: 'version',
          latestVersion: room.version,
          latestRoom: JSON.parse(JSON.stringify(room))
        };
      }
      if (!this.canClose(room, operator)) {
        return { success: false, error: '仅班长可关闭处置室', conflict: true, conflictType: 'permission' };
      }
      const now = Date.now();
      room.status = 'closed';
      room.closeTime = now;
      room.closeReason = reason || '';
      room.version += 1;
      room.updateTime = now;
      this._addLog(room, '关闭处置室', '关闭原因：' + (reason || '未填写'), operator);
      rooms[idx] = room;
      this.saveAll(rooms);
      return { success: true, room };
    },
    reopen(id, operator, baseVersion) {
      const rooms = this.getAll();
      const idx = rooms.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, error: '处置室不存在' };
      const room = rooms[idx];
      if (room.status !== 'closed') {
        return { success: false, error: '处置室未关闭' };
      }
      if (!this._isAdmin(operator)) {
        return { success: false, error: '仅班长可重新开启处置室', conflict: true, conflictType: 'permission' };
      }
      const now = Date.now();
      room.status = 'active';
      room.closeTime = null;
      room.closeReason = '';
      room.version += 1;
      room.updateTime = now;
      this._addLog(room, '重新开启处置室', '', operator);
      rooms[idx] = room;
      this.saveAll(rooms);
      return { success: true, room };
    },
    exportJSON(id) {
      const room = this.getById(id);
      if (!room) return { success: false, error: '处置室不存在' };
      const levelName = this.LEVELS[room.level]?.name || room.level;
      const statusName = room.status === 'closed' ? '已关闭' : '进行中';
      const summary = {
        id: room.id,
        title: room.title,
        level: levelName,
        status: statusName,
        sourceItemTitle: room.sourceItemTitle,
        impactScope: room.impactScope,
        target: room.target,
        deadline: room.deadline,
        participants: room.participants.map(p => ({
          name: p.name,
          role: p.roleName,
          joinTime: new Date(p.joinTime).toISOString()
        })),
        creator: room.creatorName,
        createTime: new Date(room.createTime).toISOString(),
        updateTime: new Date(room.updateTime).toISOString(),
        closeTime: room.closeTime ? new Date(room.closeTime).toISOString() : null,
        closeReason: room.closeReason,
        messages: room.messages.map(m => ({
          type: m.type === 'progress' ? '进展' : m.type === 'question' ? '待确认问题' : m.type === 'answer' ? '问题答复' : m.type,
          content: m.content,
          operator: m.operatorName,
          time: new Date(m.time).toISOString(),
          attachments: m.attachments || []
        })),
        pendingQuestions: room.pendingQuestions.map(q => ({
          content: q.content,
          answered: q.answered,
          answer: q.answer,
          answerer: q.answererName,
          answerTime: q.answerTime ? new Date(q.answerTime).toISOString() : null,
          operator: q.operatorName,
          time: new Date(q.time).toISOString()
        })),
        totalMessages: room.messages.length,
        totalQuestions: room.pendingQuestions.length,
        unansweredQuestions: room.pendingQuestions.filter(q => !q.answered).length,
        operationLogs: room.logs.map(l => ({
          action: l.action,
          detail: l.detail,
          operator: l.operatorName,
          time: new Date(l.time).toISOString()
        }))
      };
      return { success: true, data: summary };
    },
    exportCSV(id) {
      const result = this.exportJSON(id);
      if (!result.success) return result;
      const s = result.data;
      const lines = [];
      lines.push(['字段', '内容'].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(','));
      const pushRow = (k, v) => lines.push([k, v].map(x => '"' + String(x || '').replace(/"/g, '""') + '"').join(','));
      pushRow('处置室 ID', s.id);
      pushRow('处置室标题', s.title);
      pushRow('事件级别', s.level);
      pushRow('状态', s.status);
      pushRow('关联事项', s.sourceItemTitle);
      pushRow('影响范围', s.impactScope);
      pushRow('处置目标', s.target);
      pushRow('截止时间', s.deadline);
      pushRow('参与人', s.participants.map(p => p.name + '(' + p.role + ')').join('；'));
      pushRow('创建人', s.creator);
      pushRow('创建时间', s.createTime);
      pushRow('更新时间', s.updateTime);
      pushRow('关闭时间', s.closeTime || '');
      pushRow('关闭原因', s.closeReason || '');
      pushRow('消息总数', s.totalMessages);
      pushRow('待确认问题数', s.totalQuestions);
      pushRow('未答复问题数', s.unansweredQuestions);
      lines.push('');
      lines.push('=== 消息/进展/问答流水 ===');
      lines.push(['时间', '类型', '操作人', '内容', '附件数'].map(x => '"' + x + '"').join(','));
      s.messages.forEach(m => {
        lines.push([m.time, m.type, m.operator, m.content, (m.attachments || []).length]
          .map(x => '"' + String(x || '').replace(/"/g, '""') + '"').join(','));
      });
      lines.push('');
      lines.push('=== 待确认问题清单 ===');
      lines.push(['时间', '提问人', '问题', '已答复', '答复人', '答复内容', '答复时间'].map(x => '"' + x + '"').join(','));
      s.pendingQuestions.forEach(q => {
        lines.push([q.time, q.operator, q.content, q.answered ? '是' : '否',
          q.answerer || '', q.answer || '', q.answerTime || '']
          .map(x => '"' + String(x || '').replace(/"/g, '""') + '"').join(','));
      });
      lines.push('');
      lines.push('=== 操作日志 ===');
      lines.push(['时间', '操作人', '动作', '详情'].map(x => '"' + x + '"').join(','));
      s.operationLogs.forEach(l => {
        lines.push([l.time, l.operator, l.action, l.detail]
          .map(x => '"' + String(x || '').replace(/"/g, '""') + '"').join(','));
      });
      const BOM = '\uFEFF';
      return { success: true, csv: BOM + lines.join('\n'), filename: s.title };
    }
  };

  function createSampleData() {
    const sampleRoles = [
      { id: 'role_admin', name: '班长', canCreate: true, canProcess: true, canClose: true, canConfirm: true, canManageConfig: true },
      { id: 'role_operator', name: '运维值班员', canCreate: true, canProcess: true, canClose: false, canConfirm: true, canManageConfig: false },
      { id: 'role_observer', name: '观察员', canCreate: false, canProcess: false, canClose: false, canConfirm: false, canManageConfig: false }
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

    ChecklistTemplates.saveAll([
      {
        id: 'clt_sample1',
        name: '标准班前检查',
        shiftIds: [],
        items: [
          { id: 'cli_s1', name: '机房环境巡检', required: true, description: '温度、湿度、空调运行状态' },
          { id: 'cli_s2', name: '监控告警检查', required: true, description: '检查监控平台是否有未处理告警' },
          { id: 'cli_s3', name: '备份任务检查', required: true, description: '检查昨日备份任务是否成功完成' },
          { id: 'cli_s4', name: '工单积压检查', required: true, description: '检查是否有未处理的积压工单' },
          { id: 'cli_s5', name: '网络连通性检查', required: false, description: '核心网络设备连通性测试' },
          { id: 'cli_s6', name: '值班日志准备', required: true, description: '确认值班日志已准备就绪' }
        ],
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      },
      {
        id: 'clt_sample2',
        name: '夜班专项检查',
        shiftIds: ['shift_night'],
        items: [
          { id: 'cli_n1', name: '夜间告警值守确认', required: true, description: '确认夜间告警通知渠道畅通' },
          { id: 'cli_n2', name: '无人值守系统状态', required: true, description: '检查无人值守系统运行状态' },
          { id: 'cli_n3', name: '安全门禁检查', required: false, description: '确认机房门禁系统正常' }
        ],
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      }
    ]);

    ChecklistRecords.saveAll([]);

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
      recoveryLogs: RecoveryLogs.getAll(),
      reviewCards: ReviewCards.getAll(),
      reviewFilters: ReviewFilters.get(),
      collabRooms: CollabRooms.getAll(),
      exportTime: new Date().toISOString(),
      version: CURRENT_DATA_VERSION
    };
  }

  const VALID_REVIEW_FILTER_FIELDS = ['hasRisk', 'noRisk', 'myResponsible', 'overdue'];

  function validateReviewFilters(filters) {
    const errors = [];
    if (filters === undefined || filters === null) {
      return { valid: false, errors: ['筛选配置为空'] };
    }
    if (typeof filters !== 'object') {
      return { valid: false, errors: ['筛选配置应为对象'] };
    }
    for (const key of Object.keys(filters)) {
      if (!VALID_REVIEW_FILTER_FIELDS.includes(key)) {
        errors.push(`未知筛选字段: ${key}`);
      }
      if (typeof filters[key] !== 'boolean') {
        errors.push(`筛选字段 ${key} 应为布尔值`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function migrateReviewFilters(filters) {
    const defaultFilters = {
      hasRisk: false,
      noRisk: false,
      myResponsible: false,
      overdue: false
    };
    if (!filters || typeof filters !== 'object') {
      return { ...defaultFilters };
    }
    const migrated = { ...defaultFilters };
    for (const key of VALID_REVIEW_FILTER_FIELDS) {
      if (key in filters && typeof filters[key] === 'boolean') {
        migrated[key] = filters[key];
      }
    }
    return migrated;
  }

  function validateImportStructure(data) {
    const errors = [];
    const requiredFields = ['version', 'exportTime'];
    const arrayFields = ['shifts', 'roles', 'users', 'checkItems', 'items', 'handoverRecords', 'reviewCards', 'collabRooms'];

    if (typeof data !== 'object' || data === null) {
      return { valid: false, errors: ['数据格式错误，应为 JSON 对象'] };
    }

    requiredFields.forEach(field => {
      if (!(field in data)) {
        errors.push(`缺少必要字段: ${field}`);
      }
    });

    arrayFields.forEach(field => {
      if (field in data && !Array.isArray(data[field])) {
        errors.push(`字段 ${field} 应为数组`);
      }
    });

    if ('currentShift' in data && typeof data.currentShift !== 'object') {
      errors.push('字段 currentShift 应为对象');
    }

    if ('reviewFilters' in data) {
      const filterValidation = validateReviewFilters(data.reviewFilters);
      if (!filterValidation.valid) {
        filterValidation.errors.forEach(err => {
          errors.push(`筛选配置: ${err}`);
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function checkVersionCompatibility(importVersion) {
    const isCompatible = COMPATIBLE_VERSIONS.includes(importVersion);
    const isOlder = importVersion < CURRENT_DATA_VERSION;
    const isNewer = importVersion > CURRENT_DATA_VERSION;

    return {
      compatible: isCompatible,
      isOlder,
      isNewer,
      importVersion,
      currentVersion: CURRENT_DATA_VERSION,
      message: isCompatible 
        ? (isOlder ? '导入数据版本较旧，兼容但部分新功能可能缺失' : '版本兼容')
        : (isNewer ? '导入数据版本过新，可能无法完全兼容' : '导入数据版本不支持')
    };
  }

  function checkUserPermission(user) {
    if (!user || !user.roleId) {
      return { allowed: false, reason: '未选择当前用户' };
    }
    const role = Roles.getById(user.roleId);
    if (!role) {
      return { allowed: false, reason: '用户角色不存在' };
    }
    const allowed = role.canManageConfig === true;
    return {
      allowed,
      reason: allowed ? '权限验证通过' : '当前用户没有配置管理权限，无法执行恢复操作'
    };
  }

  function detectConflicts(importData) {
    const currentShifts = Shifts.getAll();
    const currentUsers = Users.getAll();
    const currentItems = Items.getAll();

    const currentShiftById = {};
    const currentShiftNames = [];
    currentShifts.forEach(s => {
      currentShiftById[s.id] = s;
      currentShiftNames.push(s.name);
    });

    const currentUserById = {};
    const currentUserNames = [];
    currentUsers.forEach(u => {
      currentUserById[u.id] = u;
      currentUserNames.push(u.name);
    });

    const currentUnclosedItemById = {};
    currentItems
      .filter(i => i.status !== 'closed')
      .forEach(i => { currentUnclosedItemById[i.id] = i; });

    const conflicts = {
      shiftNames: [],
      userNames: [],
      unclosedItemIds: [],
      reviewFilters: {
        hasConflict: false,
        importHasFilters: false,
        currentHasFilters: true,
        changedFields: [],
        importFilters: null,
        currentFilters: null
      }
    };

    if (importData.shifts) {
      importData.shifts.forEach(shift => {
        const existingById = currentShiftById[shift.id];
        if (existingById) {
          if (existingById.name !== shift.name) {
            conflicts.shiftNames.push(shift.name);
          }
        } else if (currentShiftNames.includes(shift.name)) {
          conflicts.shiftNames.push(shift.name);
        }
      });
    }

    if (importData.users) {
      importData.users.forEach(user => {
        const existingById = currentUserById[user.id];
        if (existingById) {
          if (existingById.name !== user.name) {
            conflicts.userNames.push(user.name);
          }
        } else if (currentUserNames.includes(user.name)) {
          conflicts.userNames.push(user.name);
        }
      });
    }

    if (importData.items) {
      importData.items.forEach(item => {
        if (item.status !== 'closed' && currentUnclosedItemById[item.id]) {
          const existing = currentUnclosedItemById[item.id];
          const hasDifference = existing.title !== item.title || 
                                existing.status !== item.status ||
                                existing.assigneeId !== item.assigneeId;
          if (hasDifference) {
            conflicts.unclosedItemIds.push(item.id);
          }
        }
      });
    }

    if (importData.reviewFilters !== undefined) {
      conflicts.reviewFilters.importHasFilters = true;
      const importFilters = migrateReviewFilters(importData.reviewFilters);
      const currentFilters = ReviewFilters.get();
      conflicts.reviewFilters.importFilters = importFilters;
      conflicts.reviewFilters.currentFilters = currentFilters;

      const changedFields = [];
      for (const key of VALID_REVIEW_FILTER_FIELDS) {
        if (importFilters[key] !== currentFilters[key]) {
          changedFields.push(key);
        }
      }
      if (changedFields.length > 0) {
        conflicts.reviewFilters.hasConflict = true;
        conflicts.reviewFilters.changedFields = changedFields;
      }
    }

    const hasConflicts = conflicts.shiftNames.length > 0 || 
                         conflicts.userNames.length > 0 || 
                         conflicts.unclosedItemIds.length > 0 ||
                         conflicts.reviewFilters.hasConflict;

    return { hasConflicts, conflicts };
  }

  function getImportSummary(importData) {
    return {
      shifts: importData.shifts ? importData.shifts.length : 0,
      roles: importData.roles ? importData.roles.length : 0,
      users: importData.users ? importData.users.length : 0,
      checkItems: importData.checkItems ? importData.checkItems.length : 0,
      items: importData.items ? importData.items.length : 0,
      handoverRecords: importData.handoverRecords ? importData.handoverRecords.length : 0,
      recoveryLogs: importData.recoveryLogs ? importData.recoveryLogs.length : 0,
      reviewCards: importData.reviewCards ? importData.reviewCards.length : 0,
      collabRooms: importData.collabRooms ? importData.collabRooms.length : 0,
      reviewFilters: importData.reviewFilters ? migrateReviewFilters(importData.reviewFilters) : null,
      hasReviewFilters: !!importData.reviewFilters,
      exportTime: importData.exportTime,
      version: importData.version
    };
  }

  function getCurrentDataSummary() {
    return {
      shifts: Shifts.getAll().length,
      roles: Roles.getAll().length,
      users: Users.getAll().length,
      checkItems: CheckItems.getAll().length,
      items: Items.getAll().length,
      handoverRecords: HandoverRecords.getAll().length,
      recoveryLogs: RecoveryLogs.getAll().length,
      reviewCards: ReviewCards.getAll().length,
      collabRooms: CollabRooms.getAll().length,
      reviewFilters: ReviewFilters.get(),
      version: CURRENT_DATA_VERSION
    };
  }

  function calculateDifferences(importSummary, currentSummary) {
    const fields = ['shifts', 'roles', 'users', 'checkItems', 'items', 'handoverRecords', 'recoveryLogs', 'reviewCards', 'collabRooms'];
    const differences = {};
    let totalChanges = 0;

    fields.forEach(field => {
      const imported = importSummary[field] || 0;
      const current = currentSummary[field] || 0;
      const diff = imported - current;
      differences[field] = { imported, current, diff };
      if (diff !== 0) totalChanges++;
    });

    const importFilters = importSummary.reviewFilters;
    const currentFilters = currentSummary.reviewFilters;
    const hasImportFilters = importSummary.hasReviewFilters;
    let filtersChanged = false;
    if (hasImportFilters && currentFilters) {
      for (const key of VALID_REVIEW_FILTER_FIELDS) {
        if (importFilters[key] !== currentFilters[key]) {
          filtersChanged = true;
          break;
        }
      }
    } else if (hasImportFilters && !currentFilters) {
      filtersChanged = true;
    }

    return { differences, totalChanges, filtersChanged, importFilters, currentFilters, hasImportFilters };
  }

  function previewImport(data) {
    const structureValidation = validateImportStructure(data);
    if (!structureValidation.valid) {
      return {
        success: false,
        step: 'structure',
        errors: structureValidation.errors
      };
    }

    const versionCheck = checkVersionCompatibility(data.version);
    const importSummary = getImportSummary(data);
    const currentSummary = getCurrentDataSummary();
    const diffResult = calculateDifferences(importSummary, currentSummary);
    const conflictResult = detectConflicts(data);

    return {
      success: true,
      versionCheck,
      importSummary,
      currentSummary,
      differences: diffResult.differences,
      totalChanges: diffResult.totalChanges,
      conflicts: conflictResult.conflicts,
      hasConflicts: conflictResult.hasConflicts,
      reviewFilters: {
        importHasFilters: diffResult.hasImportFilters,
        importFilters: diffResult.importFilters,
        currentFilters: diffResult.currentFilters,
        filtersChanged: diffResult.filtersChanged,
        conflictInfo: conflictResult.conflicts.reviewFilters
      }
    };
  }

  function executeImport(data, operator) {
    const preview = previewImport(data);
    if (!preview.success) {
      RecoveryLogs.add({
        action: '导入失败',
        operatorId: operator?.id || 'unknown',
        operatorName: operator?.name || '未知用户',
        reason: preview.errors.join('；'),
        succeeded: false
      });
      return { success: false, errors: preview.errors };
    }

    const permissionCheck = checkUserPermission(operator);
    if (!permissionCheck.allowed) {
      RecoveryLogs.add({
        action: '导入失败',
        operatorId: operator?.id || 'unknown',
        operatorName: operator?.name || '未知用户',
        reason: permissionCheck.reason,
        succeeded: false
      });
      return { success: false, errors: [permissionCheck.reason] };
    }

    try {
      const beforeSummary = getCurrentDataSummary();
      const conflictResult = {
        hasConflicts: preview.hasConflicts,
        conflicts: preview.conflicts
      };

      if (data.shifts) Shifts.saveAll(data.shifts);
      if (data.roles) Roles.saveAll(data.roles);
      if (data.users) Users.saveAll(data.users);
      if (data.checkItems) CheckItems.saveAll(data.checkItems);
      if (data.items) Items.saveAll(data.items);
      if (data.currentShift) CurrentShift.save(data.currentShift);
      if (data.handoverRecords) HandoverRecords.saveAll(data.handoverRecords);
      if (data.recoveryLogs) RecoveryLogs.saveAll(data.recoveryLogs);
      if (data.reviewCards) ReviewCards.saveAll(data.reviewCards);
      if (data.collabRooms) CollabRooms.saveAll(data.collabRooms);

      let reviewFiltersRestoreInfo = {
        restored: false,
        importHasFilters: false,
        beforeFilters: beforeSummary.reviewFilters,
        afterFilters: null,
        changedFields: []
      };
      if (data.reviewFilters !== undefined) {
        reviewFiltersRestoreInfo.importHasFilters = true;
        const migratedFilters = migrateReviewFilters(data.reviewFilters);
        ReviewFilters.save(migratedFilters);
        reviewFiltersRestoreInfo.restored = true;
        reviewFiltersRestoreInfo.changedFields = preview.reviewFilters.conflictInfo?.changedFields || [];
      }

      const afterSummary = getCurrentDataSummary();
      reviewFiltersRestoreInfo.afterFilters = afterSummary.reviewFilters;

      RecoveryLogs.add({
        action: '数据恢复',
        operatorId: operator.id,
        operatorName: operator.name,
        importVersion: data.version,
        importTime: data.exportTime,
        beforeSummary,
        afterSummary,
        conflicts: conflictResult.hasConflicts ? conflictResult.conflicts : null,
        reviewFiltersRestore: reviewFiltersRestoreInfo,
        succeeded: true
      });

      return { success: true };
    } catch (e) {
      console.error('导入数据失败:', e);
      RecoveryLogs.add({
        action: '导入失败',
        operatorId: operator?.id || 'unknown',
        operatorName: operator?.name || '未知用户',
        reason: e.message,
        succeeded: false
      });
      return { success: false, errors: ['导入过程发生错误: ' + e.message] };
    }
  }

  const EXCEPTION_HANDOVER_VERSION = '1.0';

  return {
    Shifts,
    Roles,
    Users,
    CheckItems,
    Items,
    CurrentShift,
    CurrentUser,
    HandoverRecords,
    RecoveryLogs,
    ReviewCards,
    ReviewFilters,
    ChecklistTemplates,
    ChecklistRecords,
    CollabRooms,
    createSampleData,
    exportAllData,
    validateImportStructure,
    validateReviewFilters,
    migrateReviewFilters,
    checkVersionCompatibility,
    checkUserPermission,
    detectConflicts,
    getImportSummary,
    getCurrentDataSummary,
    calculateDifferences,
    previewImport,
    executeImport,
    CURRENT_DATA_VERSION,
    COMPATIBLE_VERSIONS,
    generateId,
    EXCEPTION_HANDOVER_VERSION
  };
})();
