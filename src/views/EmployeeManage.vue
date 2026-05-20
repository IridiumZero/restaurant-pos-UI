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

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('employee.editEmployee') : t('employee.addEmployee')" width="90%" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
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
const dialogVisible = ref(false), isEdit = ref(false), editingId = ref(null), originalHash = ref('')
const formRef = ref(null), loading = ref(false), saving = ref(false)
const form = reactive({ username: '', name: '', role: 'waiter', status: 'active', password: '' })
const rules = { username: [{ required: true, message: t('common.required'), trigger: 'blur' }], name: [{ required: true, message: t('common.required'), trigger: 'blur' }] }

function roleType(r) { return { admin: 'danger', cashier: 'warning', waiter: 'primary' }[r] || '' }
function roleLabel(r) { return t(`employee.${r}`) || r }

async function load() { loading.value = true; try { employees.value = await api.getEmployees() } catch {}; loading.value = false }

function showAddDialog() {
  isEdit.value = false; editingId.value = null; originalHash.value = ''
  form.username = ''; form.name = ''; form.role = 'waiter'; form.status = 'active'; form.password = ''
  dialogVisible.value = true; setTimeout(() => formRef.value?.resetFields(), 0)
}
function showEditDialog(row) {
  isEdit.value = true; editingId.value = row.id
  originalHash.value = row.password || ''
  form.username = row.username; form.name = row.name; form.role = row.role; form.status = row.status; form.password = row.password || ''
  dialogVisible.value = true
}
async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false); if (!valid) return
  saving.value = true
  try {
    const data = { name: form.name, role: form.role, status: form.status }
    if (form.password && form.password !== originalHash.value) data.password = form.password
    if (isEdit.value) { await api.updateEmployee(editingId.value, data); ElMessage.success(t('employee.editSuccess')) }
    else { await api.addEmployee({ ...data, username: form.username }); ElMessage.success(t('employee.addSuccess')) }
    dialogVisible.value = false; await load()
  } catch (e) { ElMessage.error(e.message) }
  saving.value = false
}

onMounted(load)
</script>

<style scoped>
.employee-manage { background:#fff; padding:16px; height:100%; display:flex; flex-direction:column; }
.page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-shrink:0; }
.page-header h2 { margin:0; font-size:18px; }
</style>
