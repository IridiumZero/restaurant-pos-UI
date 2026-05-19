<template>
  <div class="employee-manage">
    <div class="page-header">
      <h2>{{ t('employee.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="showAddDialog">{{ t('employee.addEmployee') }}</el-button>
    </div>

    <el-table :data="employees" v-loading="loading" stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" :label="t('employee.employeeId')" width="120" />
      <el-table-column prop="name" :label="t('employee.employeeName')" width="140" />
      <el-table-column :label="t('employee.employeeRole')" width="110">
        <template #default="{ row }">
          <el-tag :type="roleType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('employee.employeeStatus')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? t('employee.active') : t('employee.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="showEditDialog(row)">{{ t('common.edit') }}</el-button>
          <el-button size="small" :icon="Lock" @click="resetPassword(row)">{{ t('employee.resetPassword') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('employee.editEmployee') : t('employee.addEmployee')" width="90%" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item :label="t('employee.employeeId')" prop="username">
          <el-input v-model="form.username" :placeholder="t('employee.employeeId')" :disabled="isEdit" />
        </el-form-item>
        <el-form-item :label="t('employee.employeeName')" prop="name">
          <el-input v-model="form.name" :placeholder="t('employee.employeeName')" />
        </el-form-item>
        <el-form-item :label="t('employee.employeeRole')" prop="role">
          <el-select v-model="form.role" style="width: 100%">
            <el-option :label="t('employee.waiter')" value="waiter" />
            <el-option :label="t('employee.cashier')" value="cashier" />
            <el-option :label="t('employee.admin')" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('employee.employeeStatus')" prop="status">
          <el-select v-model="form.status" style="width: 100%">
            <el-option :label="t('employee.active')" value="active" />
            <el-option :label="t('employee.disabled')" value="disabled" />
          </el-select>
        </el-form-item>
        <p v-if="!isEdit" class="form-hint">{{ t('employee.defaultPassword') }}</p>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Lock } from '@element-plus/icons-vue'
import { getAll, add, update } from '../db'
import { useI18n } from '../i18n'

const { t } = useI18n()

const employees = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref(null)
const formRef = ref(null)
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  username: '',
  name: '',
  password: '123456',
  role: 'waiter',
  status: 'active',
})

const rules = {
  username: [{ required: true, message: 'Required', trigger: 'blur' }],
  name: [{ required: true, message: 'Required', trigger: 'blur' }],
}

function roleType(role) {
  return { admin: 'danger', cashier: 'warning', waiter: '' }[role] || ''
}

function roleLabel(role) {
  return t(`employee.${role}`) || role
}

async function loadEmployees() {
  loading.value = true
  employees.value = await getAll('employees')
  loading.value = false
}

function showAddDialog() {
  isEdit.value = false
  editingId.value = null
  form.username = ''
  form.name = ''
  form.password = '123456'
  form.role = 'waiter'
  form.status = 'active'
  dialogVisible.value = true
  setTimeout(() => formRef.value?.resetFields(), 0)
}

function showEditDialog(row) {
  isEdit.value = true
  editingId.value = row.id
  form.username = row.username
  form.name = row.name
  form.role = row.role
  form.status = row.status
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  if (isEdit.value) {
    await update('employees', { id: editingId.value, ...form })
    ElMessage.success(t('employee.editSuccess'))
  } else {
    await add('employees', { ...form })
    ElMessage.success(t('employee.addSuccess'))
  }
  saving.value = false
  dialogVisible.value = false
  await loadEmployees()
}

async function resetPassword(row) {
  try {
    await ElMessageBox.confirm(
      `${t('employee.resetPassword')}: ${row.name}?`,
      t('common.confirm'),
      { type: 'warning' }
    )
    await update('employees', { ...row, password: '123456' })
    ElMessage.success(t('employee.resetPwdSuccess'))
  } catch { /* cancelled */ }
}

onMounted(loadEmployees)
</script>

<style scoped>
.employee-manage {
  background: #fff;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.page-header h2 {
  margin: 0;
  font-size: 18px;
}
.form-hint {
  color: #909399;
  font-size: 13px;
  text-align: center;
}
</style>
