const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

createApp({
  setup() {
    const activeTab = ref('board');
    const configTab = ref('shifts');

    const shifts = ref([]);
    const roles = ref([]);
    const users = ref([]);
    const checkItems = ref([]);
    const items = ref([]);
    const handoverRecords = ref([]);
    const recoveryLogs = ref([]);
    const reviewCards = ref([]);
    const checklistTemplates = ref([]);
    const checklistRecords = ref([]);
    const collabRooms = ref([]);

    // ========== 处置室相关 ==========
    const showCreateCollabModal = ref(false);
    const showCollabDetailModal = ref(false);
    const showCloseCollabModal = ref(false);
    const showAttachmentModal = ref(false);
    const selectedCollabRoom = ref(null);
    const collabDetailBaseVersion = ref(0);
    const collabForm = reactive({
      sourceItemId: '',
      sourceItemTitle: '',
      title: '',
      level: '',
      impactScope: '',
      target: '',
      deadline: '',
      selectedUserIds: []
    });
    const dispatchFilter = reactive({
      status: '',
      level: '',
      participantId: ''
    });
    const isEditingMembers = ref(false);
    const memberEditUserIds = ref([]);
    const isEditingBasic = ref(false);
    const basicEditForm = reactive({
      title: '',
      level: 'medium',
      impactScope: '',
      target: '',
      deadline: ''
    });
    const closeCollabReason = ref('');
    const activeMessageTab = ref('progress');
    const progressInputText = ref('');
    const questionInputText = ref('');
    const progressAttachments = ref([]);
    const newAttachment = reactive({ name: '', content: '' });
    const questionAnswerText = reactive({});

    const currentShiftId = ref('');
    const currentShiftDate = ref('');
    const handoverUserId = ref('');
    const currentUserId = ref('');

    const showAddItemModal = ref(false);
    const showDetailModal = ref(false);
    const showCloseModal = ref(false);
    const showConfirmModal = ref(false);
    const showConflictModal = ref(false);
    const showImportPreviewModal = ref(false);

    const editingItem = ref(null);
    const selectedItem = ref(null);
    const closeReason = ref('');
    const confirmChecks = reactive({});
    const confirmError = ref('');
    const conflictInfo = ref(null);

    const importFileInput = ref(null);
    const selectedFileName = ref('');
    const selectedFileContent = ref(null);
    const importPreview = ref(null);
    const importPermission = ref({ allowed: false, reason: '' });
    const importError = ref('');

    const editingBaseVersion = ref(0);

    const showReviewModal = ref(false);
    const showReviewDetailModal = ref(false);
    const selectedReviewCard = ref(null);
    const reviewForm = reactive({
      sourceType: '',
      sourceId: '',
      sourceSummary: '',
      hasRisk: false,
      riskDescription: '',
      responsiblePersonId: '',
      responsiblePersonName: '',
      followUpDeadline: '',
      conclusion: ''
    });
    const reviewFollowUpNote = ref('');
    const reviewEditForm = reactive({
      hasRisk: false,
      riskDescription: '',
      responsiblePersonId: '',
      responsiblePersonName: '',
      followUpDeadline: '',
      conclusion: ''
    });
    const isEditingReview = ref(false);

    const reviewFilter = reactive({
      hasRisk: false,
      noRisk: false,
      myResponsible: false,
      overdue: false
    });

    const toast = reactive({
      show: false,
      message: '',
      type: 'info'
    });

    const historyFilter = reactive({
      shiftId: '',
      startDate: '',
      endDate: ''
    });

    const filteredHistory = ref([]);

    const itemForm = reactive({
      title: '',
      type: 'alert',
      description: '',
      assigneeId: ''
    });

    function showToast(message, type = 'info') {
      toast.message = message;
      toast.type = type;
      toast.show = true;
      setTimeout(() => {
        toast.show = false;
      }, 3000);
    }

    function formatTime(timestamp) {
      if (!timestamp) return '-';
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    function getRoleName(roleId) {
      const role = roles.value.find(r => r.id === roleId);
      return role ? role.name : '未知';
    }

    function getItemTypeName(type) {
      const types = {
        alert: '告警',
        change: '变更',
        other: '其他'
      };
      return types[type] || type;
    }

    function getStatusName(status) {
      const statuses = {
        new: '新建',
        processing: '处理中',
        pending_confirm: '待接班确认',
        received: '已接收',
        closed: '已关闭'
      };
      return statuses[status] || status;
    }

    function getHandoverStatusName(status) {
      return status === 'confirmed' ? '已确认' : '待确认';
    }

    const currentShift = computed(() => {
      return shifts.value.find(s => s.id === currentShiftId.value) || null;
    });

    const currentUser = computed(() => {
      return users.value.find(u => u.id === currentUserId.value) || null;
    });

    const currentUserRole = computed(() => {
      if (!currentUser.value) return null;
      return roles.value.find(r => r.id === currentUser.value.roleId) || null;
    });

    const handoverUserName = computed(() => {
      const user = users.value.find(u => u.id === handoverUserId.value);
      return user ? user.name : '未设置';
    });

    const currentShiftItems = computed(() => {
      return items.value.filter(item => 
        item.shiftId === currentShiftId.value && 
        item.shiftDate === currentShiftDate.value
      );
    });

    const pendingConfirmItems = computed(() => {
      return currentShiftItems.value.filter(item => item.status === 'pending_confirm');
    });

    function itemsByStatus(status) {
      return currentShiftItems.value.filter(item => item.status === status);
    }

    const canEditItem = computed(() => {
      if (!selectedItem.value || !currentUserRole.value) return false;
      if (selectedItem.value.status === 'closed') return false;
      return currentUserRole.value.canCreate || currentUserRole.value.canProcess;
    });

    const canStartProcessing = computed(() => {
      if (!selectedItem.value || !currentUserRole.value) return false;
      if (selectedItem.value.status !== 'new') return false;
      return currentUserRole.value.canProcess;
    });

    const canSubmitForConfirm = computed(() => {
      if (!selectedItem.value || !currentUserRole.value) return false;
      if (selectedItem.value.status !== 'processing') return false;
      return currentUserRole.value.canProcess;
    });

    const canCloseItem = computed(() => {
      if (!selectedItem.value || !currentUserRole.value) return false;
      if (selectedItem.value.status === 'closed') return false;
      if (currentUserRole.value.canClose) return true;
      if (selectedItem.value.creatorId === currentUserId.value && 
          selectedItem.value.status === 'new') {
        return true;
      }
      return false;
    });

    const canConfirm = computed(() => {
      if (!currentUser.value) return false;
      if (!currentUserRole.value) return false;
      return currentUserRole.value.canConfirm;
    });

    const canCreateReview = computed(() => {
      if (!currentUser.value) return false;
      return Store.ReviewCards.checkCanEditConclusion(currentUser.value);
    });

    const canEditReviewConclusion = computed(() => {
      if (!currentUser.value) return false;
      return Store.ReviewCards.checkCanEditConclusion(currentUser.value);
    });

    function isReviewCardOverdue(card) {
      if (!card.followUpDeadline) return false;
      if (!card.hasRisk) return false;
      const deadline = new Date(card.followUpDeadline + 'T23:59:59');
      return deadline < new Date();
    }

    const filteredReviewCards = computed(() => {
      let result = reviewCards.value;
      if (reviewFilter.hasRisk) {
        result = result.filter(c => c.hasRisk);
      }
      if (reviewFilter.noRisk) {
        result = result.filter(c => !c.hasRisk);
      }
      if (reviewFilter.myResponsible && currentUser.value) {
        result = result.filter(c => c.responsiblePersonId === currentUser.value.id);
      }
      if (reviewFilter.overdue) {
        result = result.filter(c => isReviewCardOverdue(c));
      }
      return result;
    });

    const canToggleFocusMark = computed(() => {
      if (!currentUser.value) return false;
      return Store.ReviewCards.checkCanEditConclusion(currentUser.value);
    });

    const currentDataVersion = computed(() => {
      return Store.CURRENT_DATA_VERSION;
    });

    const currentSummary = computed(() => {
      return Store.getCurrentDataSummary();
    });

    function loadData() {
      shifts.value = Store.Shifts.getAll();
      roles.value = Store.Roles.getAll();
      users.value = Store.Users.getAll();
      checkItems.value = Store.CheckItems.getAll();
      items.value = Store.Items.getAll();
      handoverRecords.value = Store.HandoverRecords.getAll();
      recoveryLogs.value = Store.RecoveryLogs.getAll();
      reviewCards.value = Store.ReviewCards.getAll();
      checklistTemplates.value = Store.ChecklistTemplates.getAll();
      checklistRecords.value = Store.ChecklistRecords.getAll();
      collabRooms.value = Store.CollabRooms.getAll();

      const currentShiftData = Store.CurrentShift.get();
      currentShiftId.value = currentShiftData.shiftId || '';
      currentShiftDate.value = currentShiftData.date || new Date().toISOString().split('T')[0];
      handoverUserId.value = currentShiftData.handoverUserId || '';

      currentUserId.value = Store.CurrentUser.get();

      const savedFilter = Store.ReviewFilters.get();
      reviewFilter.hasRisk = savedFilter.hasRisk || false;
      reviewFilter.noRisk = savedFilter.noRisk || false;
      reviewFilter.myResponsible = savedFilter.myResponsible || false;
      reviewFilter.overdue = savedFilter.overdue || false;

      checkItems.value.forEach(item => {
        if (!(item.id in confirmChecks)) {
          confirmChecks[item.id] = false;
        }
      });

      filterHistory();
    }

    function addShift() {
      shifts.value.push({
        id: Store.generateId('shift'),
        name: '',
        startTime: '08:00',
        endTime: '16:00'
      });
    }

    function removeShift(index) {
      if (confirm('确定删除该班次吗？')) {
        shifts.value.splice(index, 1);
      }
    }

    function saveShifts() {
      Store.Shifts.saveAll(shifts.value);
      showToast('班次配置已保存', 'success');
    }

    function addRole() {
      roles.value.push({
        id: Store.generateId('role'),
        name: '',
        canCreate: false,
        canProcess: false,
        canClose: false,
        canConfirm: false
      });
    }

    function removeRole(index) {
      if (confirm('确定删除该角色吗？')) {
        roles.value.splice(index, 1);
      }
    }

    function saveRoles() {
      Store.Roles.saveAll(roles.value);
      showToast('角色配置已保存', 'success');
    }

    function addUser() {
      users.value.push({
        id: Store.generateId('user'),
        name: '',
        roleId: ''
      });
    }

    function removeUser(index) {
      if (confirm('确定删除该用户吗？')) {
        users.value.splice(index, 1);
      }
    }

    function saveUsers() {
      Store.Users.saveAll(users.value);
      showToast('用户配置已保存', 'success');
    }

    function addCheckItem() {
      checkItems.value.push({
        id: Store.generateId('check'),
        name: '',
        required: false,
        description: ''
      });
    }

    function removeCheckItem(index) {
      if (confirm('确定删除该检查项吗？')) {
        checkItems.value.splice(index, 1);
      }
    }

    function saveCheckItems() {
      Store.CheckItems.saveAll(checkItems.value);
      showToast('检查模板已保存', 'success');
    }

    function saveCurrentShift() {
      Store.CurrentShift.save({
        shiftId: currentShiftId.value,
        date: currentShiftDate.value,
        handoverUserId: handoverUserId.value
      });
      showToast('当前班次设置已保存', 'success');
    }

    function onUserChange() {
      Store.CurrentUser.set(currentUserId.value);
    }

    function openItemDetail(item) {
      selectedItem.value = { ...item };
      showDetailModal.value = true;
    }

    function refreshSelectedItem() {
      if (selectedItem.value) {
        const fresh = Store.Items.getById(selectedItem.value.id);
        if (fresh) {
          selectedItem.value = { ...fresh };
        }
      }
    }

    function editItem() {
      if (!canEditItem.value) return;

      editingItem.value = selectedItem.value;
      editingBaseVersion.value = selectedItem.value.version;
      itemForm.title = selectedItem.value.title;
      itemForm.type = selectedItem.value.type;
      itemForm.description = selectedItem.value.description;
      itemForm.assigneeId = selectedItem.value.assigneeId;
      showDetailModal.value = false;
      showAddItemModal.value = true;
    }

    function saveItem() {
      if (!itemForm.title.trim()) {
        showToast('请输入事项标题', 'error');
        return;
      }

      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }

      const assigneeUser = users.value.find(u => u.id === itemForm.assigneeId);

      if (editingItem.value) {
        const result = Store.Items.update(
          editingItem.value.id,
          {
            title: itemForm.title.trim(),
            type: itemForm.type,
            description: itemForm.description,
            assigneeId: itemForm.assigneeId,
            assigneeName: assigneeUser ? assigneeUser.name : ''
          },
          currentUser.value,
          editingBaseVersion.value
        );

        if (result.conflict) {
          conflictInfo.value = {
            baseVersion: editingBaseVersion.value,
            latestVersion: result.latestVersion,
            latestContent: result.latestItem.description
          };
          showConflictModal.value = true;
          return;
        }

        if (result.success) {
          showToast('事项已更新', 'success');
          loadData();
          showAddItemModal.value = false;
          editingItem.value = null;
          selectedItem.value = result.item;
          showDetailModal.value = true;
        } else {
          showToast(result.error || '更新失败', 'error');
        }
      } else {
        if (!currentShiftId.value) {
          showToast('请先设置当前班次', 'error');
          return;
        }

        if (!currentUserRole.value || !currentUserRole.value.canCreate) {
          showToast('您没有创建事项的权限', 'error');
          return;
        }

        const item = Store.Items.create(
          {
            title: itemForm.title.trim(),
            type: itemForm.type,
            description: itemForm.description,
            shiftId: currentShiftId.value,
            shiftDate: currentShiftDate.value,
            assigneeId: itemForm.assigneeId,
            assigneeName: assigneeUser ? assigneeUser.name : ''
          },
          currentUser.value
        );

        showToast('事项已创建', 'success');
        loadData();
        showAddItemModal.value = false;
      }

      resetItemForm();
    }

    function resetItemForm() {
      itemForm.title = '';
      itemForm.type = 'alert';
      itemForm.description = '';
      itemForm.assigneeId = '';
      editingItem.value = null;
      editingBaseVersion.value = 0;
    }

    function startProcessing() {
      if (!canStartProcessing.value || !currentUser.value) return;

      const result = Store.Items.startProcessing(
        selectedItem.value.id,
        currentUser.value,
        selectedItem.value.version
      );

      if (result.conflict) {
        conflictInfo.value = {
          baseVersion: selectedItem.value.version,
          latestVersion: result.latestVersion,
          latestContent: result.latestItem.description
        };
        showConflictModal.value = true;
        refreshSelectedItem();
        return;
      }

      if (result.success) {
        showToast('已开始处理', 'success');
        loadData();
        selectedItem.value = result.item;
      } else {
        showToast(result.error || '操作失败', 'error');
      }
    }

    function submitForConfirm() {
      if (!canSubmitForConfirm.value || !currentUser.value) return;

      const result = Store.Items.submitForConfirm(
        selectedItem.value.id,
        currentUser.value,
        selectedItem.value.version
      );

      if (result.conflict) {
        conflictInfo.value = {
          baseVersion: selectedItem.value.version,
          latestVersion: result.latestVersion,
          latestContent: result.latestItem.description
        };
        showConflictModal.value = true;
        refreshSelectedItem();
        return;
      }

      if (result.success) {
        showToast('已提交待确认', 'success');
        loadData();
        selectedItem.value = result.item;
      } else {
        showToast(result.error || '操作失败', 'error');
      }
    }

    function confirmClose() {
      if (!closeReason.value.trim()) {
        showToast('请输入关闭原因', 'error');
        return;
      }

      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }

      if (!currentUserRole.value || !currentUserRole.value.canClose) {
        if (!(selectedItem.value.creatorId === currentUserId.value && 
              selectedItem.value.status === 'new')) {
          showToast('您没有关闭该事项的权限，只有当班有权限的角色才能关闭事项', 'error');
          return;
        }
      }

      const result = Store.Items.close(
        selectedItem.value.id,
        currentUser.value,
        closeReason.value.trim(),
        selectedItem.value.version
      );

      if (result.conflict) {
        conflictInfo.value = {
          baseVersion: selectedItem.value.version,
          latestVersion: result.latestVersion,
          latestContent: result.latestItem.description
        };
        showConflictModal.value = true;
        showCloseModal.value = false;
        refreshSelectedItem();
        return;
      }

      if (result.success) {
        showToast('事项已关闭', 'success');
        loadData();
        selectedItem.value = result.item;
        showCloseModal.value = false;
        closeReason.value = '';
      } else {
        showToast(result.error || '操作失败', 'error');
      }
    }

    function resolveConflict() {
      showConflictModal.value = false;
      conflictInfo.value = null;
      loadData();
      if (selectedItem.value) {
        refreshSelectedItem();
      }
    }

    function confirmHandover() {
      confirmError.value = '';

      if (!currentUser.value) {
        confirmError.value = '请先选择当前用户';
        return;
      }

      if (!currentUserRole.value || !currentUserRole.value.canConfirm) {
        confirmError.value = '您没有接班确认的权限';
        return;
      }

      const missingRequired = checkItems.value.filter(item => item.required && !confirmChecks[item.id]);
      if (missingRequired.length > 0) {
        const names = missingRequired.map(i => i.name).join('、');
        confirmError.value = `请先完成必填检查项：${names}`;
        return;
      }

      const pendingItems = pendingConfirmItems.value;
      for (const item of pendingItems) {
        const result = Store.Items.receive(item.id, currentUser.value);
        if (!result.success) {
          confirmError.value = `确认事项 ${item.title} 失败：${result.error}`;
          loadData();
          return;
        }
      }

      const checkedCount = checkItems.value.filter(item => confirmChecks[item.id]).length;
      const checkResults = {};
      checkItems.value.forEach(item => {
        checkResults[item.id] = {
          checked: confirmChecks[item.id],
          name: item.name,
          required: item.required
        };
      });

      const itemsSnapshot = currentShiftItems.value.map(item => ({
        id: item.id,
        title: item.title,
        type: item.type,
        status: item.status,
        description: item.description,
        assigneeName: item.assigneeName
      }));

      const record = Store.HandoverRecords.create({
        shiftId: currentShiftId.value,
        shiftName: currentShift.value ? currentShift.value.name : '',
        date: currentShiftDate.value,
        handoverUserId: handoverUserId.value,
        handoverName: handoverUserName.value,
        takeoverUserId: currentUser.value.id,
        takeoverName: currentUser.value.name,
        handoverTime: Date.now(),
        takeoverTime: Date.now(),
        itemIds: currentShiftItems.value.map(i => i.id),
        itemCount: currentShiftItems.value.length,
        checkResults,
        totalCount: checkItems.value.length,
        checkedCount,
        itemsSnapshot
      });

      Store.HandoverRecords.confirm(record.id, currentUser.value);

      showToast('接班确认成功', 'success');
      loadData();
      showConfirmModal.value = false;
    }

    function filterHistory() {
      let result = handoverRecords.value;

      if (historyFilter.shiftId) {
        result = result.filter(r => r.shiftId === historyFilter.shiftId);
      }

      if (historyFilter.startDate) {
        result = result.filter(r => r.date >= historyFilter.startDate);
      }

      if (historyFilter.endDate) {
        result = result.filter(r => r.date <= historyFilter.endDate);
      }

      result.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.takeoverTime || 0) - (a.takeoverTime || 0);
      });

      filteredHistory.value = result;
    }

    function resetHistoryFilter() {
      historyFilter.shiftId = '';
      historyFilter.startDate = '';
      historyFilter.endDate = '';
      filterHistory();
    }

    function viewHandoverRecord(record) {
      const itemsList = record.itemsSnapshot.map(i => 
        `${getItemTypeName(i.type)} - ${i.title}（${getStatusName(i.status)}）`
      ).join('\n');
      
      const checksList = Object.values(record.checkResults || {}).map(c => 
        `${c.checked ? '✅' : '⬜'} ${c.name}${c.required ? ' *必填' : ''}`
      ).join('\n');

      alert(
        `交接单详情\n\n` +
        `班次：${record.shiftName}\n` +
        `日期：${record.date}\n` +
        `状态：${getHandoverStatusName(record.status)}\n\n` +
        `交班人：${record.handoverName}\n` +
        `接班人：${record.takeoverName || '未接班'}\n` +
        `交班时间：${formatTime(record.handoverTime)}\n` +
        `接班时间：${formatTime(record.takeoverTime)}\n\n` +
        `检查项（${record.checkedCount}/${record.totalCount}）：\n${checksList}\n\n` +
        `事项列表（${record.itemCount}项）：\n${itemsList || '无'}`
      );
    }

    function exportHandover() {
      if (!currentShiftId.value) {
        showToast('请先设置当前班次', 'error');
        return;
      }

      const currentItems = currentShiftItems.value;
      
      let content = `=====================================\n`;
      content += `       值 班 交 接 单\n`;
      content += `=====================================\n\n`;
      content += `班次：${currentShift.value ? currentShift.value.name : '-'}\n`;
      content += `日期：${currentShiftDate.value}\n`;
      content += `时间：${currentShift.value ? currentShift.value.startTime + ' - ' + currentShift.value.endTime : '-'}\n`;
      content += `交班人：${handoverUserName.value}\n`;
      content += `接班人：${currentUser.value ? currentUser.value.name : '未确认'}\n`;
      content += `生成时间：${formatTime(Date.now())}\n\n`;

      content += `-------------------------------------\n`;
      content += `          交接检查项\n`;
      content += `-------------------------------------\n\n`;

      checkItems.value.forEach((item, index) => {
        const checked = confirmChecks[item.id] ? '✅' : '⬜';
        const required = item.required ? ' *必填' : '';
        content += `${index + 1}. ${checked} ${item.name}${required}\n`;
        if (item.description) {
          content += `   ${item.description}\n`;
        }
        content += `\n`;
      });

      content += `-------------------------------------\n`;
      content += `          交接事项列表\n`;
      content += `-------------------------------------\n\n`;

      const statusGroups = {
        'new': '一、新建事项',
        'processing': '二、处理中事项',
        'pending_confirm': '三、待接班确认事项',
        'received': '四、已接收事项',
        'closed': '五、已关闭事项'
      };

      let itemIndex = 1;
      for (const [status, title] of Object.entries(statusGroups)) {
        const statusItems = currentItems.filter(i => i.status === status);
        if (statusItems.length > 0) {
          content += `${title}（${statusItems.length}项）\n\n`;
          statusItems.forEach(item => {
            content += `  ${itemIndex}. [${getItemTypeName(item.type)}] ${item.title}\n`;
            content += `     状态：${getStatusName(item.status)}    处理人：${item.assigneeName || '未分配'}\n`;
            if (item.description) {
              content += `     描述：${item.description}\n`;
            }
            if (item.closeReason) {
              content += `     关闭原因：${item.closeReason}\n`;
            }
            content += `\n`;
            itemIndex++;
          });
        }
      }

      content += `-------------------------------------\n`;
      content += `          操作历史记录\n`;
      content += `-------------------------------------\n\n`;

      const allLogs = [];
      currentItems.forEach(item => {
        item.history.forEach(log => {
          allLogs.push({
            ...log,
            itemTitle: item.title
          });
        });
      });
      allLogs.sort((a, b) => b.time - a.time);

      allLogs.slice(0, 50).forEach(log => {
        content += `[${formatTime(log.time)}] ${log.operatorName}\n`;
        content += `  事项：${log.itemTitle}\n`;
        content += `  操作：${log.action}（v${log.version}）\n`;
        if (log.reason) {
          content += `  原因：${log.reason}\n`;
        }
        if (log.content) {
          content += `  内容：${log.content}\n`;
        }
        content += `\n`;
      });

      const relatedReviews = reviewCards.value.filter(c => {
        if (c.sourceType === 'closed_item') {
          return currentItems.some(i => i.id === c.sourceId);
        }
        return false;
      });
      if (relatedReviews.length > 0) {
        content += `-------------------------------------\n`;
        content += `          交接复盘信息\n`;
        content += `-------------------------------------\n\n`;
        relatedReviews.forEach((card, index) => {
          content += `${index + 1}. 复盘卡\n`;
          content += `   原始摘要：${card.sourceSummary}\n`;
          content += `   遗留风险：${card.hasRisk ? '是' : '否'}${card.hasRisk && card.riskDescription ? ' - ' + card.riskDescription : ''}\n`;
          content += `   责任人：${card.responsiblePersonName || '未指定'}\n`;
          content += `   截止时间：${card.followUpDeadline || '未设置'}\n`;
          content += `   复盘结论：${card.conclusion || '暂无'}\n`;
          if (card.followUpNotes.length > 0) {
            content += `   跟进说明：\n`;
            card.followUpNotes.forEach(note => {
              content += `     - [${formatTime(note.time)}] ${note.operatorName}：${note.content}\n`;
            });
          }
          content += `\n`;
        });
      }

      content += `=====================================\n`;
      content += `       交接单结束\n`;
      content += `=====================================\n`;

      downloadFile(content, `交接单_${currentShiftDate.value}_${currentShift.value ? currentShift.value.name : ''}.txt`, 'text/plain');
      showToast('交接单已导出', 'success');
    }

    function exportSingleHandover(record) {
      let content = `=====================================\n`;
      content += `       值 班 交 接 单\n`;
      content += `=====================================\n\n`;
      content += `班次：${record.shiftName}\n`;
      content += `日期：${record.date}\n`;
      content += `状态：${getHandoverStatusName(record.status)}\n`;
      content += `交班人：${record.handoverName}\n`;
      content += `接班人：${record.takeoverName || '未接班'}\n`;
      content += `交班时间：${formatTime(record.handoverTime)}\n`;
      content += `接班时间：${formatTime(record.takeoverTime)}\n\n`;

      content += `-------------------------------------\n`;
      content += `          交接检查项\n`;
      content += `-------------------------------------\n\n`;

      const checks = Object.values(record.checkResults || {});
      checks.forEach((item, index) => {
        const checked = item.checked ? '✅' : '⬜';
        const required = item.required ? ' *必填' : '';
        content += `${index + 1}. ${checked} ${item.name}${required}\n\n`;
      });

      content += `-------------------------------------\n`;
      content += `          交接事项列表\n`;
      content += `-------------------------------------\n\n`;

      const items = record.itemsSnapshot || [];
      items.forEach((item, index) => {
        content += `${index + 1}. [${getItemTypeName(item.type)}] ${item.title}\n`;
        content += `   状态：${getStatusName(item.status)}    处理人：${item.assigneeName || '未分配'}\n`;
        if (item.description) {
          content += `   描述：${item.description}\n`;
        }
        content += `\n`;
      });

      const recordReview = reviewCards.value.find(c => c.sourceId === record.id);
      if (recordReview) {
        content += `-------------------------------------\n`;
        content += `          交接复盘信息\n`;
        content += `-------------------------------------\n\n`;
        content += `原始摘要：${recordReview.sourceSummary}\n`;
        content += `遗留风险：${recordReview.hasRisk ? '是' : '否'}${recordReview.hasRisk && recordReview.riskDescription ? ' - ' + recordReview.riskDescription : ''}\n`;
        content += `责任人：${recordReview.responsiblePersonName || '未指定'}\n`;
        content += `截止时间：${recordReview.followUpDeadline || '未设置'}\n`;
        content += `复盘结论：${recordReview.conclusion || '暂无'}\n`;
        if (recordReview.followUpNotes.length > 0) {
          content += `跟进说明：\n`;
          recordReview.followUpNotes.forEach(note => {
            content += `  - [${formatTime(note.time)}] ${note.operatorName}：${note.content}\n`;
          });
        }
        content += `\n`;
      }

      content += `=====================================\n`;
      content += `       交接单结束\n`;
      content += `=====================================\n`;

      downloadFile(content, `交接单_${record.date}_${record.shiftName}.txt`, 'text/plain');
      showToast('交接单已导出', 'success');
    }

    function downloadFile(content, filename, type) {
      const blob = new Blob([content], { type: type + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function createSampleData() {
      if (confirm('创建样例数据会覆盖现有配置和数据，确定继续吗？')) {
        Store.createSampleData();
        loadData();
        showToast('样例数据已创建', 'success');
        activeTab.value = 'board';
      }
    }

    function formatIsoTime(isoString) {
      if (!isoString) return '-';
      const date = new Date(isoString);
      return formatTime(date.getTime());
    }

    function getDiffLabel(key) {
      const labels = {
        shifts: '班次',
        roles: '角色',
        users: '用户',
        checkItems: '检查项',
        items: '事项',
        handoverRecords: '交接记录',
        recoveryLogs: '恢复日志',
        reviewCards: '复盘卡'
      };
      return labels[key] || key;
    }

    function exportAllData() {
      const data = Store.exportAllData();
      const jsonStr = JSON.stringify(data, null, 2);
      const filename = `值班交接备份_${new Date().toISOString().split('T')[0]}.json`;
      downloadFile(jsonStr, filename, 'application/json');
      showToast('数据包已导出', 'success');
    }

    function onFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!file.name.endsWith('.json')) {
        importError.value = '请选择 JSON 格式的文件';
        return;
      }

      selectedFileName.value = file.name;
      importError.value = '';

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target.result);
          selectedFileContent.value = content;
        } catch (err) {
          importError.value = 'JSON 格式解析失败：' + err.message;
          selectedFileContent.value = null;
        }
      };
      reader.onerror = () => {
        importError.value = '文件读取失败';
        selectedFileContent.value = null;
      };
      reader.readAsText(file);
    }

    function clearFileSelection() {
      selectedFileName.value = '';
      selectedFileContent.value = null;
      importPreview.value = null;
      importPermission.value = { allowed: false, reason: '' };
      importError.value = '';
      if (importFileInput.value) {
        importFileInput.value.value = '';
      }
    }

    function previewAndValidateImport() {
      if (!selectedFileContent.value) {
        importError.value = '请先选择有效的 JSON 文件';
        return;
      }

      const preview = Store.previewImport(selectedFileContent.value);
      if (!preview.success) {
        importError.value = '数据结构校验失败：' + preview.errors.join('；');
        return;
      }

      importPreview.value = preview;
      importPermission.value = Store.checkUserPermission(currentUser.value);
      showImportPreviewModal.value = true;
      importError.value = '';
    }

    function cancelImport() {
      showImportPreviewModal.value = false;
      importPreview.value = null;
      importPermission.value = { allowed: false, reason: '' };
    }

    function confirmRestore() {
      if (!importPermission.value.allowed) {
        showToast('没有权限执行恢复操作', 'error');
        return;
      }

      if (!confirm('确定要覆盖当前所有数据吗？此操作不可撤销！')) {
        return;
      }

      const result = Store.executeImport(selectedFileContent.value, currentUser.value);

      if (result.success) {
        showToast('数据恢复成功', 'success');
        showImportPreviewModal.value = false;
        clearFileSelection();
        loadData();
      } else {
        showToast('恢复失败：' + (result.errors && result.errors[0] ? result.errors[0] : '未知错误'), 'error');
      }
    }

    function openCreateReviewFromItem(item) {
      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }
      if (!canCreateReview.value) {
        showToast('只有班长可以创建复盘卡', 'error');
        return;
      }
      const existing = Store.ReviewCards.getBySourceId(item.id);
      if (existing) {
        showToast('该事项已有复盘卡', 'warning');
        openReviewDetail(existing);
        return;
      }
      reviewForm.sourceType = 'closed_item';
      reviewForm.sourceId = item.id;
      reviewForm.sourceSummary = `[${getItemTypeName(item.type)}] ${item.title}${item.closeReason ? '（关闭原因：' + item.closeReason + '）' : ''}`;
      reviewForm.hasRisk = false;
      reviewForm.riskDescription = '';
      reviewForm.responsiblePersonId = item.assigneeId || '';
      reviewForm.responsiblePersonName = item.assigneeName || '';
      reviewForm.followUpDeadline = '';
      reviewForm.conclusion = '';
      showReviewModal.value = true;
    }

    function openCreateReviewFromRecord(record) {
      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }
      if (!canCreateReview.value) {
        showToast('只有班长可以创建复盘卡', 'error');
        return;
      }
      const existing = Store.ReviewCards.getBySourceId(record.id);
      if (existing) {
        showToast('该交接记录已有复盘卡', 'warning');
        openReviewDetail(existing);
        return;
      }
      const itemSummary = (record.itemsSnapshot || []).map(i =>
        `[${getItemTypeName(i.type)}] ${i.title}（${getStatusName(i.status)}）`
      ).join('；');
      reviewForm.sourceType = 'handover_record';
      reviewForm.sourceId = record.id;
      reviewForm.sourceSummary = `${record.shiftName} ${record.date} 交班人：${record.handoverName}，事项：${itemSummary || '无'}`;
      reviewForm.hasRisk = false;
      reviewForm.riskDescription = '';
      reviewForm.responsiblePersonId = '';
      reviewForm.responsiblePersonName = '';
      reviewForm.followUpDeadline = '';
      reviewForm.conclusion = '';
      showReviewModal.value = true;
    }

    function saveReviewCard() {
      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }
      const result = Store.ReviewCards.create({
        sourceType: reviewForm.sourceType,
        sourceId: reviewForm.sourceId,
        sourceSummary: reviewForm.sourceSummary,
        hasRisk: reviewForm.hasRisk,
        riskDescription: reviewForm.riskDescription,
        responsiblePersonId: reviewForm.responsiblePersonId,
        responsiblePersonName: reviewForm.responsiblePersonName,
        followUpDeadline: reviewForm.followUpDeadline,
        conclusion: reviewForm.conclusion
      }, currentUser.value);
      if (!result || !result.success) {
        showToast(result?.error || '创建失败', 'error');
        return;
      }
      if (result.created) {
        showToast(result.message || '复盘卡已创建', 'success');
      } else {
        showToast(result.message || '该来源已有复盘卡，已复用现有卡', 'warning');
      }
      showReviewModal.value = false;
      loadData();
      openReviewDetail(result.card);
    }

    function openReviewDetail(card) {
      const fresh = Store.ReviewCards.getById(card.id);
      if (!fresh) {
        showToast('复盘卡不存在', 'error');
        return;
      }
      selectedReviewCard.value = { ...fresh };
      isEditingReview.value = false;
      reviewFollowUpNote.value = '';
      reviewEditForm.hasRisk = fresh.hasRisk;
      reviewEditForm.riskDescription = fresh.riskDescription;
      reviewEditForm.responsiblePersonId = fresh.responsiblePersonId;
      reviewEditForm.responsiblePersonName = fresh.responsiblePersonName;
      reviewEditForm.followUpDeadline = fresh.followUpDeadline;
      reviewEditForm.conclusion = fresh.conclusion;
      showReviewDetailModal.value = true;
    }

    function saveReviewConclusion() {
      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }
      if (!selectedReviewCard.value) return;
      const assigneeUser = users.value.find(u => u.id === reviewEditForm.responsiblePersonId);
      const result = Store.ReviewCards.updateConclusion(
        selectedReviewCard.value.id,
        {
          hasRisk: reviewEditForm.hasRisk,
          riskDescription: reviewEditForm.riskDescription,
          responsiblePersonId: reviewEditForm.responsiblePersonId,
          responsiblePersonName: assigneeUser ? assigneeUser.name : reviewEditForm.responsiblePersonName,
          followUpDeadline: reviewEditForm.followUpDeadline,
          conclusion: reviewEditForm.conclusion
        },
        currentUser.value
      );
      if (result.success) {
        showToast('复盘信息已更新', 'success');
        isEditingReview.value = false;
        loadData();
        selectedReviewCard.value = { ...result.card };
      } else {
        showToast(result.error || '更新失败', 'error');
      }
    }

    function addReviewFollowUp() {
      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }
      if (!reviewFollowUpNote.value.trim()) {
        showToast('请输入跟进说明', 'error');
        return;
      }
      if (!selectedReviewCard.value) return;
      const result = Store.ReviewCards.addFollowUpNote(
        selectedReviewCard.value.id,
        reviewFollowUpNote.value.trim(),
        currentUser.value
      );
      if (result.success) {
        showToast('跟进说明已添加', 'success');
        reviewFollowUpNote.value = '';
        loadData();
        selectedReviewCard.value = { ...result.card };
      } else {
        showToast(result.error || '添加失败', 'error');
      }
    }

    function deleteReviewCard() {
      if (!currentUser.value) return;
      if (!selectedReviewCard.value) return;
      if (!confirm('确定删除该复盘卡吗？此操作不可撤销！')) return;
      const result = Store.ReviewCards.deleteCard(selectedReviewCard.value.id, currentUser.value);
      if (result.success) {
        showToast('复盘卡已删除', 'success');
        showReviewDetailModal.value = false;
        selectedReviewCard.value = null;
        loadData();
      } else {
        showToast(result.error || '删除失败', 'error');
      }
    }

    function toggleFocusMark(card, event) {
      if (event) event.stopPropagation();
      if (!currentUser.value) {
        showToast('请先选择当前用户', 'error');
        return;
      }
      if (!canToggleFocusMark.value) {
        showToast('只有班长可以修改重点标记', 'error');
        return;
      }
      const result = Store.ReviewCards.toggleFocusMark(card.id, currentUser.value);
      if (result.success) {
        showToast(card.focusMark ? '已取消重点关注' : '已标记为重点关注', 'success');
        loadData();
        if (selectedReviewCard.value && selectedReviewCard.value.id === card.id) {
          selectedReviewCard.value = { ...result.card };
        }
      } else {
        showToast(result.error || '操作失败', 'error');
      }
    }

    function saveReviewFilter() {
      Store.ReviewFilters.save({
        hasRisk: reviewFilter.hasRisk,
        noRisk: reviewFilter.noRisk,
        myResponsible: reviewFilter.myResponsible,
        overdue: reviewFilter.overdue
      });
    }

    function resetReviewFilter() {
      reviewFilter.hasRisk = false;
      reviewFilter.noRisk = false;
      reviewFilter.myResponsible = false;
      reviewFilter.overdue = false;
      saveReviewFilter();
    }

    function getFilterFields() {
      return [
        { key: 'hasRisk', label: '有遗留风险' },
        { key: 'noRisk', label: '无风险' },
        { key: 'myResponsible', label: '只看我负责' },
        { key: 'overdue', label: '已逾期' }
      ];
    }

    function getFilterChangedDesc(changedFields) {
      if (!changedFields || changedFields.length === 0) {
        return '无变化';
      }
      const labels = {
        hasRisk: '有遗留风险',
        noRisk: '无风险',
        myResponsible: '只看我负责',
        overdue: '已逾期'
      };
      return changedFields.map(f => labels[f] || f).join('、');
    }

    function getReviewBySourceId(sourceId) {
      return reviewCards.value.find(c => c.sourceId === sourceId) || null;
    }

    function testVersionConflict() {
      console.log('=== 版本冲突测试 ===');
      const testItem = items.value[0];
      if (!testItem) {
        console.log('没有事项可测试');
        return;
      }

      console.log('原始版本:', testItem.version);
      
      const result1 = Store.Items.update(testItem.id, { title: testItem.title + ' (修改1)' }, users.value[0], testItem.version);
      console.log('第一次修改:', result1.success ? '成功' : '失败', '新版本:', result1.item?.version);

      const result2 = Store.Items.update(testItem.id, { title: testItem.title + ' (修改2)' }, users.value[1], testItem.version);
      console.log('第二次修改(基于旧版本):', result2.success ? '成功' : '失败', '冲突:', result2.conflict);
      
      loadData();
    }

    onMounted(() => {
      loadData();

      watch(() => ({ ...reviewFilter }), () => {
        saveReviewFilter();
      }, { deep: true });

      watch(showConfirmModal, (val) => {
        if (val) {
          confirmError.value = '';
          checkItems.value.forEach(item => {
            confirmChecks[item.id] = false;
          });
        }
      });

      watch(showAddItemModal, (val) => {
        if (!val) {
          resetItemForm();
        }
      });

      watch(showCloseModal, (val) => {
        if (!val) {
          closeReason.value = '';
        }
      });
    });

    // ====== 班前检查清单 ======
    const showGenerateChecklistModal = ref(false);
    const selectedChecklistTemplateId = ref('');

    const canManageChecklist = computed(() => {
      if (!currentUser.value) return false;
      const role = roles.value.find(r => r.id === currentUser.value.roleId);
      return role && role.canManageConfig;
    });

    const canExecuteChecklist = computed(() => {
      if (!currentUser.value) return false;
      const role = roles.value.find(r => r.id === currentUser.value.roleId);
      return role && (role.canConfirm || role.canCreate);
    });

    const availableChecklistTemplates = computed(() => {
      if (!currentShiftId.value) return [];
      return Store.ChecklistTemplates.getByShiftId(currentShiftId.value);
    });

    const selectedChecklistTemplateItems = computed(() => {
      if (!selectedChecklistTemplateId.value) return [];
      const tpl = checklistTemplates.value.find(t => t.id === selectedChecklistTemplateId.value);
      return tpl ? tpl.items : [];
    });

    const myInProgressRecords = computed(() => {
      if (!currentUserId.value) return [];
      return checklistRecords.value.filter(r => r.executorId === currentUserId.value && r.status === 'in_progress');
    });

    const myCompletedRecords = computed(() => {
      if (!currentUserId.value) return [];
      return checklistRecords.value.filter(r => r.executorId === currentUserId.value && r.status === 'completed');
    });

    const otherCompletedRecords = computed(() => {
      if (!currentUserId.value) return [];
      return checklistRecords.value.filter(r => r.executorId !== currentUserId.value && r.status === 'completed');
    });

    function addChecklistTemplate() {
      const result = Store.ChecklistTemplates.create({
        name: '新检查模板',
        shiftIds: [],
        items: [
          { name: '机房环境巡检', required: true, description: '' },
          { name: '监控告警检查', required: true, description: '' }
        ]
      });
      if (result.success) {
        checklistTemplates.value = Store.ChecklistTemplates.getAll();
        showToast('已新建模板', 'success');
      }
    }

    function addChecklistTemplateItem(tpl) {
      tpl.items.push({ id: Store.generateId('cli'), name: '', required: false, description: '' });
    }

    function removeChecklistTemplate(id) {
      Store.ChecklistTemplates.remove(id);
      checklistTemplates.value = Store.ChecklistTemplates.getAll();
      showToast('模板已删除', 'success');
    }

    function saveChecklistTemplates() {
      Store.ChecklistTemplates.saveAll(checklistTemplates.value);
      showToast('模板配置已保存', 'success');
    }

    function generateChecklistRecord() {
      if (!selectedChecklistTemplateId.value) {
        showToast('请选择检查模板', 'warning');
        return;
      }
      const user = users.value.find(u => u.id === currentUserId.value);
      const result = Store.ChecklistRecords.generate(
        selectedChecklistTemplateId.value,
        user,
        currentShiftId.value,
        currentShiftDate.value
      );
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showGenerateChecklistModal.value = false;
      selectedChecklistTemplateId.value = '';
      checklistRecords.value = Store.ChecklistRecords.getAll();
      showToast('检查单已生成', 'success');
    }

    function onChecklistItemChange(recordId, item) {
      const user = users.value.find(u => u.id === currentUserId.value);
      Store.ChecklistRecords.checkItem(recordId, item.id, item.checked, item.remark, user);
    }

    function completeChecklistRecord(recordId) {
      const user = users.value.find(u => u.id === currentUserId.value);
      const result = Store.ChecklistRecords.complete(recordId, user);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      checklistRecords.value = Store.ChecklistRecords.getAll();
      recoveryLogs.value = Store.RecoveryLogs.getAll();
      showToast('检查单已完成，已写入操作日志', 'success');
    }

    function doExportChecklistJSON() {
      const result = Store.ChecklistRecords.exportJSON();
      if (!result.success) {
        showToast(result.error, 'warning');
        return;
      }
      const jsonStr = JSON.stringify(result.data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `checklist-records-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`已导出 ${result.count} 条检查记录(JSON)`, 'success');
    }

    function doExportChecklistCSV() {
      const result = Store.ChecklistRecords.exportCSV();
      if (!result.success) {
        showToast(result.error, 'warning');
        return;
      }
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `checklist-records-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`已导出 ${result.count} 条检查记录(CSV)`, 'success');
    }

    // ====== 异常交接包 ======
    const showExportExceptionModal = ref(false);
    const exceptionSelectedItemIds = ref([]);
    const exceptionCheckResults = reactive({});
    const exceptionCandidateIds = ref([]);

    const exceptionImportFileInput = ref(null);
    const exceptionSelectedFileName = ref('');
    const exceptionSelectedFileContent = ref(null);
    const showExceptionImportPreviewModal = ref(false);
    const exceptionImportPreview = ref(null);
    const exceptionImportError = ref('');

    const currentShift = computed(() => {
      return shifts.value.find(s => s.id === currentShiftId.value) || null;
    });

    const handoverUserName = computed(() => {
      const u = users.value.find(x => x.id === handoverUserId.value);
      return u ? u.name : '未设置';
    });

    const currentShiftItems = computed(() => {
      return items.value.filter(it => it.shiftId === currentShiftId.value && it.shiftDate === currentShiftDate.value);
    });

    watch(showExportExceptionModal, (val) => {
      if (val) {
        exceptionSelectedItemIds.value = currentShiftItems.value.map(it => it.id);
        checkItems.value.forEach(ci => {
          if (!exceptionCheckResults[ci.id]) {
            exceptionCheckResults[ci.id] = { checked: false };
          }
        });
        exceptionCandidateIds.value = [];
      }
    });

    function doExportExceptionHandover() {
      if (!currentShiftId.value) {
        showToast('请先设置当前班次', 'warning');
        return;
      }
      const operator = users.value.find(u => u.id === currentUserId.value) || null;
      const pkg = Store.Items.exportExceptionHandover(
        operator,
        exceptionSelectedItemIds.value,
        exceptionCheckResults,
        exceptionCandidateIds.value
      );
      const jsonStr = JSON.stringify(pkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `exception-handover-${dateStr}-${currentShift.value?.name || 'shift'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showExportExceptionModal.value = false;
      showToast(`已导出异常交接包（${pkg.items.length}项）`, 'success');
    }

    function onExceptionFileSelected(e) {
      const file = e.target.files[0];
      if (!file) return;
      exceptionSelectedFileName.value = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          exceptionSelectedFileContent.value = JSON.parse(ev.target.result);
          exceptionImportError.value = '';
        } catch (err) {
          exceptionImportError.value = '文件解析失败：' + err.message;
          exceptionSelectedFileContent.value = null;
        }
      };
      reader.readAsText(file);
    }

    function clearExceptionFileSelection() {
      exceptionSelectedFileName.value = '';
      exceptionSelectedFileContent.value = null;
      exceptionImportError.value = '';
      if (exceptionImportFileInput.value) exceptionImportFileInput.value.value = '';
    }

    function previewExceptionHandoverImport() {
      if (!exceptionSelectedFileContent.value) {
        showToast('请先选择交接包文件', 'warning');
        return;
      }
      const structureCheck = Store.Items.validateExceptionHandoverStructure(exceptionSelectedFileContent.value);
      if (!structureCheck.valid) {
        exceptionImportError.value = '包结构错误：\n' + structureCheck.errors.join('\n');
        return;
      }
      const user = users.value.find(u => u.id === currentUserId.value) || null;
      exceptionImportPreview.value = Store.Items.previewExceptionHandoverImport(
        exceptionSelectedFileContent.value,
        user
      );
      showExceptionImportPreviewModal.value = true;
    }

    function cancelExceptionImport() {
      showExceptionImportPreviewModal.value = false;
      exceptionImportPreview.value = null;
    }

    function confirmExceptionImport() {
      if (!exceptionImportPreview.value?.permissionCheck?.allowed) {
        showToast('无权限导入此交接包', 'error');
        return;
      }
      const user = users.value.find(u => u.id === currentUserId.value) || null;
      const result = Store.Items.executeExceptionHandoverImport(
        exceptionSelectedFileContent.value,
        user
      );
      showExceptionImportPreviewModal.value = false;
      loadData();
      showToast(`交接包导入完成：新增${result.imported.newCount}项，覆盖${result.imported.overwriteCount}项，冲突${result.imported.conflictCount}项，跳过${result.imported.skipCount}项`,
        result.success ? 'success' : 'warning');
      clearExceptionFileSelection();
    }

    function getExceptionActionName(action) {
      const map = {
        new: '新增',
        overwrite: '覆盖',
        conflict: '冲突',
        skip: '跳过'
      };
      return map[action] || action;
    }

    // ========== 处置室：计算属性 ==========
    const filteredCollabRooms = computed(() => {
      let list = collabRooms.value.slice();
      if (dispatchFilter.status) {
        list = list.filter(r => r.status === dispatchFilter.status);
      }
      if (dispatchFilter.level) {
        list = list.filter(r => r.level === dispatchFilter.level);
      }
      if (dispatchFilter.participantId) {
        list = list.filter(r => r.participants.some(p => p.userId === dispatchFilter.participantId));
      }
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return b.updateTime - a.updateTime;
      });
      return list;
    });
    const isAdminRole = computed(() => {
      if (!currentUser.value) return false;
      const role = roles.value.find(r => r.id === currentUser.value.roleId);
      return role && (role.id === 'role_admin' || role.canManageConfig === true);
    });
    const canCreateCollabFromItem = computed(() => {
      if (!currentUser.value) return false;
      const role = roles.value.find(r => r.id === currentUser.value.roleId);
      return role && role.canCreate;
    });

    // ========== 处置室：工具方法 ==========
    function reloadCollabRooms() {
      collabRooms.value = Store.CollabRooms.getAll();
    }
    function refreshSelectedCollabRoom() {
      if (!selectedCollabRoom.value) return;
      const fresh = Store.CollabRooms.getById(selectedCollabRoom.value.id);
      if (fresh) {
        selectedCollabRoom.value = JSON.parse(JSON.stringify(fresh));
        collabDetailBaseVersion.value = fresh.version;
      }
    }
    function getDispatchLevelName(level) {
      return Store.CollabRooms.LEVELS[level]?.name || level || '-';
    }
    function isDispatchOverdue(room) {
      if (!room || !room.deadline) return false;
      const dl = new Date(room.deadline).getTime();
      return !isNaN(dl) && Date.now() > dl && room.status === 'active';
    }
    function canSelectAsParticipant(user) {
      if (!user) return false;
      const role = roles.value.find(r => r.id === user.roleId);
      if (!role) return true;
      return role.canCreate || role.canProcess || role.canConfirm || role.canManageConfig;
    }
    function _buildParticipantsFromIds(ids) {
      return ids
        .map(id => users.value.find(u => u.id === id))
        .filter(Boolean)
        .map(u => ({
          userId: u.id,
          name: u.name,
          roleId: u.roleId,
          roleName: getRoleName(u.roleId)
        }));
    }
    function getActiveCollabByItemId(itemId) {
      if (!itemId) return null;
      return Store.CollabRooms.getActiveBySourceItemId(itemId);
    }

    // ========== 处置室：列表筛选 ==========
    function resetDispatchFilter() {
      dispatchFilter.status = '';
      dispatchFilter.level = '';
      dispatchFilter.participantId = '';
    }

    // ========== 处置室：创建 ==========
    function _resetCollabForm() {
      collabForm.sourceItemId = '';
      collabForm.sourceItemTitle = '';
      collabForm.title = '';
      collabForm.level = '';
      collabForm.impactScope = '';
      collabForm.target = '';
      collabForm.deadline = '';
      collabForm.selectedUserIds = [];
    }
    function openCreateCollabRoom() {
      _resetCollabForm();
      showCreateCollabModal.value = true;
    }
    function openCreateCollabRoomFromItem(item) {
      if (!item) return;
      _resetCollabForm();
      collabForm.sourceItemId = item.id;
      collabForm.sourceItemTitle = item.title;
      collabForm.title = item.title + ' - 协同处置';
      const existing = getActiveCollabByItemId(item.id);
      if (existing) {
        showToast('该事项已有关联的进行中处置室，已为您打开', 'warning');
        showDetailModal.value = false;
        openCollabRoomDetail(existing);
        return;
      }
      if (currentUser.value && canSelectAsParticipant(currentUser.value)) {
        collabForm.selectedUserIds.push(currentUser.value.id);
      }
      showDetailModal.value = false;
      showCreateCollabModal.value = true;
    }
    function createCollabRoom() {
      if (!currentUser.value) { showToast('请先选择当前用户', 'warning'); return; }
      if (!collabForm.title.trim()) { showToast('请填写处置室标题', 'warning'); return; }
      if (!collabForm.level) { showToast('请选择事件级别', 'warning'); return; }
      if (collabForm.selectedUserIds.length === 0) { showToast('请至少选择一位参与人', 'warning'); return; }
      const operator = currentUser.value;
      const result = Store.CollabRooms.create({
        sourceItemId: collabForm.sourceItemId,
        sourceItemTitle: collabForm.sourceItemTitle,
        title: collabForm.title,
        level: collabForm.level,
        impactScope: collabForm.impactScope,
        target: collabForm.target,
        deadline: collabForm.deadline,
        participants: _buildParticipantsFromIds(collabForm.selectedUserIds)
      }, operator);
      if (!result.success) {
        if (result.conflictType === 'duplicate_room' && result.existingRoom) {
          showToast(result.error, 'warning');
          showCreateCollabModal.value = false;
          openCollabRoomDetail(result.existingRoom);
          return;
        }
        showToast(result.error, 'error');
        return;
      }
      showToast('处置室创建成功', 'success');
      showCreateCollabModal.value = false;
      reloadCollabRooms();
      activeTab.value = 'dispatch_room';
      openCollabRoomDetail(result.room);
    }

    // ========== 处置室：详情打开与操作 ==========
    function openCollabRoomDetail(room) {
      if (!room) return;
      const fresh = Store.CollabRooms.getById(room.id);
      if (!fresh) { showToast('处置室不存在或已被删除', 'error'); return; }
      selectedCollabRoom.value = JSON.parse(JSON.stringify(fresh));
      collabDetailBaseVersion.value = fresh.version;
      isEditingMembers.value = false;
      isEditingBasic.value = false;
      memberEditUserIds.value = fresh.participants.map(p => p.userId);
      basicEditForm.title = fresh.title;
      basicEditForm.level = fresh.level;
      basicEditForm.impactScope = fresh.impactScope;
      basicEditForm.target = fresh.target;
      basicEditForm.deadline = fresh.deadline || '';
      progressInputText.value = '';
      questionInputText.value = '';
      progressAttachments.value = [];
      Object.keys(questionAnswerText).forEach(k => delete questionAnswerText[k]);
      showCollabDetailModal.value = true;
    }
    function closeCollabDetailModal() {
      showCollabDetailModal.value = false;
      selectedCollabRoom.value = null;
    }
    function jumpToCollabRoom(room) {
      if (!room) return;
      activeTab.value = 'dispatch_room';
      if (showDetailModal.value) showDetailModal.value = false;
      openCollabRoomDetail(room);
    }

    // ========== 处置室：权限判断 ==========
    function canAddCollabMessage(room) {
      if (!room || !currentUser.value) return false;
      return Store.CollabRooms.canAddMessage(room, currentUser.value);
    }
    function canManageCollabMembers(room) {
      if (!room || !currentUser.value) return false;
      return Store.CollabRooms.canManageMembers(room, currentUser.value);
    }
    function canCloseCollabRoom(room) {
      if (!room || !currentUser.value) return false;
      return Store.CollabRooms.canClose(room, currentUser.value);
    }
    function canEditCollabBasic(room) {
      if (!room || !currentUser.value) return false;
      return Store.CollabRooms.canEditBasic(room, currentUser.value);
    }
    function canAnswerCollabQuestion(room) {
      if (!room || !currentUser.value) return false;
      if (room.status === 'closed') return false;
      return isAdminRole.value || room.creatorId === currentUser.value.id;
    }
    function canExportCollabRoom(room) {
      if (!room || !currentUser.value) return false;
      return room.participants.some(p => p.userId === currentUser.value.id) || isAdminRole.value;
    }

    // ========== 处置室：成员调整 ==========
    function cancelMemberEdit() {
      isEditingMembers.value = false;
      if (selectedCollabRoom.value) {
        memberEditUserIds.value = selectedCollabRoom.value.participants.map(p => p.userId);
      }
    }
    function saveMemberChanges() {
      if (!selectedCollabRoom.value) return;
      const operator = currentUser.value;
      const result = Store.CollabRooms.update(
        selectedCollabRoom.value.id,
        { participants: _buildParticipantsFromIds(memberEditUserIds.value) },
        operator,
        collabDetailBaseVersion.value
      );
      _handleDispatchUpdateResult(result, '成员调整成功');
    }

    // ========== 处置室：基本信息修改 ==========
    function saveBasicChanges() {
      if (!selectedCollabRoom.value) return;
      const operator = currentUser.value;
      const updateData = {
        title: basicEditForm.title,
        level: basicEditForm.level,
        impactScope: basicEditForm.impactScope,
        target: basicEditForm.target,
        deadline: basicEditForm.deadline
      };
      const result = Store.CollabRooms.update(
        selectedCollabRoom.value.id,
        updateData,
        operator,
        collabDetailBaseVersion.value
      );
      _handleDispatchUpdateResult(result, '修改成功');
      if (result.success) isEditingBasic.value = false;
    }

    // ========== 处置室：关闭/重新开启 ==========
    function confirmCloseCollabRoom() {
      if (!selectedCollabRoom.value) return;
      const operator = currentUser.value;
      const result = Store.CollabRooms.close(
        selectedCollabRoom.value.id,
        operator,
        closeCollabReason.value,
        collabDetailBaseVersion.value
      );
      _handleDispatchUpdateResult(result, '处置室已关闭');
      if (result.success) {
        showCloseCollabModal.value = false;
        closeCollabReason.value = '';
      }
    }
    function reopenCollabRoom() {
      if (!selectedCollabRoom.value) return;
      const operator = currentUser.value;
      const result = Store.CollabRooms.reopen(selectedCollabRoom.value.id, operator);
      _handleDispatchUpdateResult(result, '处置室已重新开启');
    }

    // ========== 处置室：进展/问题提交 ==========
    function addAttachmentToProgress() {
      newAttachment.name = '';
      newAttachment.content = '';
      showAttachmentModal.value = true;
    }
    function confirmAddAttachment() {
      if (!newAttachment.name || !newAttachment.name.trim() || !newAttachment.content || !newAttachment.content.trim()) {
        showToast('请填写附件名称和内容', 'warning');
        return;
      }
      progressAttachments.value.push({
        name: newAttachment.name.trim(),
        content: newAttachment.content.trim(),
        size: newAttachment.content.trim().length
      });
      showAttachmentModal.value = false;
    }
    function submitProgress() {
      if (!selectedCollabRoom.value) return;
      if (!progressInputText.value || !progressInputText.value.trim()) {
        showToast('请输入进展内容', 'warning');
        return;
      }
      const operator = currentUser.value;
      const result = Store.CollabRooms.addProgress(
        selectedCollabRoom.value.id,
        progressInputText.value,
        JSON.parse(JSON.stringify(progressAttachments.value)),
        operator
      );
      _handleDispatchUpdateResult(result, '进展提交成功');
      if (result.success) {
        progressInputText.value = '';
        progressAttachments.value = [];
      }
    }
    function submitQuestion() {
      if (!selectedCollabRoom.value) return;
      if (!questionInputText.value || !questionInputText.value.trim()) {
        showToast('请输入问题内容', 'warning');
        return;
      }
      const operator = currentUser.value;
      const result = Store.CollabRooms.addQuestion(
        selectedCollabRoom.value.id,
        questionInputText.value,
        operator
      );
      _handleDispatchUpdateResult(result, '问题已提交');
      if (result.success) questionInputText.value = '';
    }
    function submitQuestionAnswer(qid) {
      if (!selectedCollabRoom.value) return;
      const text = questionAnswerText[qid];
      if (!text || !text.trim()) { showToast('请输入答复内容', 'warning'); return; }
      const operator = currentUser.value;
      const result = Store.CollabRooms.answerQuestion(
        selectedCollabRoom.value.id,
        qid,
        text,
        operator
      );
      _handleDispatchUpdateResult(result, '答复成功');
      if (result.success) delete questionAnswerText[qid];
    }

    // ========== 处置室：通用结果处理（含冲突/权限/已关闭提示） ==========
    function _handleDispatchUpdateResult(result, successMsg) {
      if (!result) return;
      if (result.success) {
        if (successMsg) showToast(successMsg, 'success');
        reloadCollabRooms();
        refreshSelectedCollabRoom();
        return;
      }
      if (result.conflictType === 'version') {
        showToast(result.error + '，已为您刷新到最新版本', 'error');
        if (result.latestRoom) {
          selectedCollabRoom.value = JSON.parse(JSON.stringify(result.latestRoom));
          collabDetailBaseVersion.value = result.latestRoom.version;
          memberEditUserIds.value = result.latestRoom.participants.map(p => p.userId);
        }
        return;
      }
      if (result.conflictType === 'closed') {
        showToast(result.error, 'warning');
        refreshSelectedCollabRoom();
        return;
      }
      if (result.conflictType === 'permission') {
        showToast(result.error, 'error');
        refreshSelectedCollabRoom();
        return;
      }
      showToast(result.error || '操作失败', 'error');
    }

    // ========== 处置室：导出 ==========
    function exportCollabRoom(format) {
      if (!selectedCollabRoom.value) return;
      if (format === 'json') {
        const result = Store.CollabRooms.exportJSON(selectedCollabRoom.value.id);
        if (!result.success) { showToast(result.error, 'error'); return; }
        const jsonStr = JSON.stringify(result.data, null, 2);
        downloadFile(jsonStr, `处置室-${result.data.title || 'summary'}.json`, 'application/json');
        showToast('已导出 JSON 摘要', 'success');
      } else if (format === 'csv') {
        const result = Store.CollabRooms.exportCSV(selectedCollabRoom.value.id);
        if (!result.success) { showToast(result.error, 'error'); return; }
        downloadFile(result.csv, `处置室-${result.filename || 'summary'}.csv`, 'text/csv');
        showToast('已导出 CSV 摘要', 'success');
      }
    }
    function downloadFile(content, filename, mimeType) {
      const blob = new Blob([content], { type: (mimeType || 'application/octet-stream') + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return {
      activeTab,
      configTab,
      shifts,
      roles,
      users,
      checkItems,
      items,
      handoverRecords,
      recoveryLogs,
      reviewCards,
      checklistTemplates,
      checklistRecords,
      currentShiftId,
      currentShiftDate,
      handoverUserId,
      currentUserId,
      showAddItemModal,
      showDetailModal,
      showCloseModal,
      showConfirmModal,
      showConflictModal,
      showImportPreviewModal,
      showReviewModal,
      showReviewDetailModal,
      editingItem,
      selectedItem,
      closeReason,
      confirmChecks,
      confirmError,
      conflictInfo,
      importFileInput,
      selectedFileName,
      importPreview,
      importPermission,
      importError,
      toast,
      historyFilter,
      filteredHistory,
      itemForm,
      selectedReviewCard,
      reviewForm,
      reviewFollowUpNote,
      reviewEditForm,
      isEditingReview,
      reviewFilter,

      currentShift,
      currentUser,
      currentUserRole,
      handoverUserName,
      pendingConfirmItems,
      currentDataVersion,
      currentSummary,

      canManageChecklist,
      canExecuteChecklist,
      showGenerateChecklistModal,
      selectedChecklistTemplateId,
      availableChecklistTemplates,
      selectedChecklistTemplateItems,
      myInProgressRecords,
      myCompletedRecords,
      otherCompletedRecords,
      addChecklistTemplate,
      addChecklistTemplateItem,
      removeChecklistTemplate,
      saveChecklistTemplates,
      generateChecklistRecord,
      onChecklistItemChange,
      completeChecklistRecord,
      doExportChecklistJSON,
      doExportChecklistCSV,

      showExportExceptionModal,
      exceptionSelectedItemIds,
      exceptionCheckResults,
      exceptionCandidateIds,
      currentShiftItems,
      exceptionImportFileInput,
      exceptionSelectedFileName,
      showExceptionImportPreviewModal,
      exceptionImportPreview,
      exceptionImportError,

      itemsByStatus,
      canEditItem,
      canStartProcessing,
      canSubmitForConfirm,
      canCloseItem,
      canConfirm,
      canCreateReview,
      canEditReviewConclusion,
      canToggleFocusMark,

      formatTime,
      formatIsoTime,
      getRoleName,
      getItemTypeName,
      getStatusName,
      getHandoverStatusName,
      getDiffLabel,
      isReviewCardOverdue,
      filteredReviewCards,

      addShift,
      removeShift,
      saveShifts,
      addRole,
      removeRole,
      saveRoles,
      addUser,
      removeUser,
      saveUsers,
      addCheckItem,
      removeCheckItem,
      saveCheckItems,
      saveCurrentShift,
      onUserChange,

      openItemDetail,
      editItem,
      saveItem,
      startProcessing,
      submitForConfirm,
      confirmClose,
      resolveConflict,

      confirmHandover,
      exportHandover,
      exportSingleHandover,

      openCreateReviewFromItem,
      openCreateReviewFromRecord,
      saveReviewCard,
      openReviewDetail,
      saveReviewConclusion,
      addReviewFollowUp,
      deleteReviewCard,
      toggleFocusMark,
      saveReviewFilter,
      resetReviewFilter,
      getFilterFields,
      getFilterChangedDesc,
      getReviewBySourceId,

      filterHistory,
      resetHistoryFilter,
      viewHandoverRecord,

      createSampleData,
      testVersionConflict,

      exportAllData,
      onFileSelected,
      clearFileSelection,
      previewAndValidateImport,
      cancelImport,
      confirmRestore,

      doExportExceptionHandover,
      onExceptionFileSelected,
      clearExceptionFileSelection,
      previewExceptionHandoverImport,
      cancelExceptionImport,
      confirmExceptionImport,
      getExceptionActionName,

      // ========== 处置室 ==========
      collabRooms,
      dispatchFilter,
      filteredCollabRooms,
      isAdminRole,
      canCreateCollabFromItem,
      showCreateCollabModal,
      showCollabDetailModal,
      showCloseCollabModal,
      showAttachmentModal,
      selectedCollabRoom,
      collabForm,
      isEditingMembers,
      memberEditUserIds,
      isEditingBasic,
      basicEditForm,
      closeCollabReason,
      activeMessageTab,
      progressInputText,
      questionInputText,
      progressAttachments,
      newAttachment,
      questionAnswerText,

      getDispatchLevelName,
      isDispatchOverdue,
      canSelectAsParticipant,
      getActiveCollabByItemId,
      resetDispatchFilter,
      openCreateCollabRoom,
      openCreateCollabRoomFromItem,
      createCollabRoom,
      openCollabRoomDetail,
      closeCollabDetailModal,
      jumpToCollabRoom,
      canAddCollabMessage,
      canManageCollabMembers,
      canCloseCollabRoom,
      canEditCollabBasic,
      canAnswerCollabQuestion,
      canExportCollabRoom,
      cancelMemberEdit,
      saveMemberChanges,
      saveBasicChanges,
      confirmCloseCollabRoom,
      reopenCollabRoom,
      addAttachmentToProgress,
      confirmAddAttachment,
      submitProgress,
      submitQuestion,
      submitQuestionAnswer,
      exportCollabRoom
    };
  }
}).mount('#app');
