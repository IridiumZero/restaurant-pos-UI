<template>
  <div class="employee-manage">
    <div class="page-header">
      <h2>{{ t('employee.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="showAddDialog">{{ t('employee.addEmployee') }}</el-button>
    </div>

    <el-table :data="employees" v-loading="loading" stripe>
      <el-table-column prop="id" :label="t('common.id')" width="60" />
      <el-table-column prop="username" :label="t('employee.employeeId')" width="120" />
      <el-table-column prop="name" :label="t('employee.employeeName')" width="140" />
      <el-table-column :label="t('employee.employeeRole')" width="110">
        <template #default="{ row }">
          <el-tag :type="roleType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('employee.employeeStatus')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? t('employee.active') : t('employee.disabled') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="showEditDialog(row)">{{ t('common.edit') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('employee.editEmployee') : t('employee.addEmployee')" width="560px" :close-on-click-modal="false" class="employee-dialog">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px" class="employee-form">
        <el-form-item :label="t('employee.employeeId')" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" />
        </el-form-item>
        <el-form-item :label="t('employee.employeeName')" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('employee.employeeRole')" prop="role">
          <el-select v-model="form.role" style="width:100%">
            <el-option :label="t('employee.waiter')" value="waiter" />
            <el-option :label="t('employee.cashier')" value="cashier" />
            <el-option :label="t('employee.admin')" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('employee.employeeStatus')" prop="status">
          <el-select v-model="form.status" style="width:100%">
            <el-option :label="t('employee.active')" value="active" />
            <el-option :label="t('employee.disabled')" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('login.password')" prop="password">
          <el-input v-model="form.password" type="password" :placeholder="isEdit ? t('employee.passwordHint') : t('employee.defaultPassword')" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit } from '@element-plus/icons-vue'
import { useI18n } from '../i18n'
import { api } from '../api'

const { t } = useI18n()
const employees = ref([])
const dialogVisible = ref(false), isEdit = ref(false), editingId = ref(null)
const formRef = ref(null), loading = ref(false), saving = ref(false)
const form = reactive({ username: '', name: '', role: 'waiter', status: 'active', password: '' })
const rules = { username: [{ required: true, message: t('common.required'), trigger: 'blur' }], name: [{ required: true, message: t('common.required'), trigger: 'blur' }] }

function roleType(r) { return { admin: 'danger', cashier: 'warning', waiter: 'primary' }[r] || '' }
function roleLabel(r) { return t(`employee.${r}`) || r }

async function load() { loading.value = true; try { employees.value = await api.getEmployees() } catch {}; loading.value = false }

function showAddDialog() {
  isEdit.value = false; editingId.value = null
  form.username = ''; form.name = ''; form.role = 'waiter'; form.status = 'active'; form.password = ''
  dialogVisible.value = true; setTimeout(() => formRef.value?.resetFields(), 0)
}
function showEditDialog(row) {
  isEdit.value = true; editingId.value = row.id
  form.username = row.username; form.name = row.name; form.role = row.role; form.status = row.status; form.password = ''
  dialogVisible.value = true
}
async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false); if (!valid) return
  saving.value = true
  try {
    const data = { name: form.name, role: form.role, status: form.status }
    if (form.password) data.password = form.password
    if (isEdit.value) { await api.updateEmployee(editingId.value, data); ElMessage.success(t('employee.editSuccess')) }
    else { await api.addEmployee({ ...data, username: form.username }); ElMessage.success(t('employee.addSuccess')) }
    dialogVisible.value = false; await load()
  } catch (e) { ElMessage.error(e.message) }
  saving.value = false
}

onMounted(load)
</script>

<style scoped>
.employee-manage { 
  background: rgba(255, 255, 255, 0.95); 
  backdrop-filter: blur(10px);
  padding: 20px; 
  height: 100%; 
  display: flex; 
  flex-direction: column;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.page-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 20px; 
  flex-shrink: 0;
  padding-bottom: 16px;
  border-bottom: 2px solid #f0f2f5;
}

.page-header h2 { 
  margin: 0; 
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.5px;
}

.page-header .el-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
  font-weight: 600 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.page-header .el-button:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4) !important;
}

/* Employee dialog styling */
/* Employee form styling */
.employee-form {
  background: #ffffff !important;
  padding: 24px !important;
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
}

.employee-form :deep(.el-form-item__label) {
  font-weight: 600 !important;
  color: #2d3748 !important;
  font-size: 14px !important;
}

.employee-form :deep(.el-input__wrapper) {
  border-radius: 8px !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06) !important;
  background-color: rgba(255, 255, 255, 0.95) !important;
  border: 1.5px solid #e2e8f0 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  padding: 8px 12px !important;
}

.employee-form :deep(.el-input__wrapper:hover) {
  border-color: #cbd5e0 !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08) !important;
}

.employee-form :deep(.el-input__wrapper.is-focus) {
  border-color: #667eea !important;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15), 0 4px 12px rgba(102, 126, 234, 0.2) !important;
  background-color: #ffffff !important;
}

.employee-form :deep(.el-input__inner) {
  font-size: 14px !important;
  color: #2d3748 !important;
}

.employee-form :deep(.el-select .el-input__wrapper) {
  cursor: pointer !important;
}

.employee-form :deep(.el-form-item) {
  margin-bottom: 20px !important;
}

.employee-form :deep(.el-form-item:last-child) {
  margin-bottom: 0 !important;
}

/* Dialog footer buttons */
.employee-dialog :deep(.el-dialog__footer .el-button) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.employee-dialog :deep(.el-dialog__footer .el-button--primary) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
  font-weight: 600 !important;
}

.employee-dialog :deep(.el-dialog__footer .el-button--primary:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4) !important;
}

/* Table styling */
.employee-manage :deep(.el-table) {
  border-radius: 12px !important;
  overflow: hidden !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
}

.employee-manage :deep(.el-table th) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: #ffffff !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  border: none !important;
}

.employee-manage :deep(.el-table td) {
  font-size: 14px !important;
  color: #2d3748 !important;
}

.employee-manage :deep(.el-table__row:hover > td) {
  background-color: rgba(102, 126, 234, 0.05) !important;
}

.employee-manage :deep(.el-table--striped .el-table__row--striped td) {
  background-color: #f8f9fa !important;
}

/* Tag styling */
.employee-manage :deep(.el-tag) {
  border-radius: 6px !important;
  font-weight: 500 !important;
  padding: 4px 12px !important;
  border: none !important;
}

.employee-manage :deep(.el-tag--danger) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: #ffffff !important;
}

.employee-manage :deep(.el-tag--warning) {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
  color: #ffffff !important;
}

.employee-manage :deep(.el-tag--primary) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%) !important;
  color: #ffffff !important;
}

.employee-manage :deep(.el-tag--success) {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%) !important;
  color: #ffffff !important;
}

.employee-manage :deep(.el-tag--info) {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%) !important;
  color: #64748b !important;
}

/* Edit button styling */
.employee-manage :deep(.el-button--default) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.employee-manage :deep(.el-button--default:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
}

/* Responsive design */
@media (max-width: 768px) {
  .employee-manage {
    padding: 12px !important;
  }
  
  .page-header h2 {
    font-size: 16px !important;
  }
  
  .employee-dialog :deep(.el-dialog) {
    width: 95% !important;
  }
  
  .employee-form {
    padding: 16px !important;
  }
}
</style>
