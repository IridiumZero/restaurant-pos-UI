<template>
  <div class="menu-manage">
    <div class="page-header">
      <h2>{{ t('menu.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="showAddDialog">{{ t('menu.addDish') }}</el-button>
    </div>
    <div class="filter-bar">
      <el-radio-group v-model="filterCategory" size="small">
        <el-radio-button value="全部">{{ t('common.all') }}</el-radio-button>
        <el-radio-button v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</el-radio-button>
      </el-radio-group>
    </div>
    <div class="dish-card-list" v-loading="loading">
      <div v-for="dish in filteredDishes" :key="dish.id" class="dish-row">
        <div class="dish-row-main">
          <span class="dish-row-id">#{{ dish.id }}</span>
          <span class="dish-row-name">{{ dish.name }}</span>
          <el-tag size="small">{{ dish.category }}</el-tag>
          <el-tag :type="dish.status === 'active' ? 'success' : 'info'" size="small">{{ dish.status === 'active' ? t('menu.active') : t('menu.inactive') }}</el-tag>
        </div>
        <div class="dish-row-right">
          <span class="dish-row-price">{{ formatCurrency(dish.price) }}</span>
          <el-button size="small" :icon="Edit" @click="showEditDialog(dish)">{{ t('common.edit') }}</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(dish)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
      <div v-if="!loading && !filteredDishes.length" class="empty-hint">{{ t('menu.noDish') }}</div>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('menu.editDish') : t('menu.addDish')" width="90%" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item :label="t('menu.dishName')" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item :label="t('menu.dishCategory')" prop="category">
          <el-select v-model="form.category" style="width:100%" allow-create filterable>
            <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('menu.dishPrice')" prop="price"><el-input-number v-model="form.price" :min="1" :precision="2" :step="10" style="width:100%" /> <span style="margin-left:8px;color:#909399">MT</span></el-form-item>
        <el-form-item :label="t('menu.dishStock')" prop="stock"><el-input-number v-model="form.stock" :min="0" style="width:100%" /></el-form-item>
        <el-form-item :label="t('menu.dishStatus')" prop="status">
          <el-select v-model="form.status" style="width:100%">
            <el-option :label="t('menu.active')" value="active" />
            <el-option :label="t('menu.inactive')" value="inactive" />
          </el-select>
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { useI18n } from '../i18n'
import { api } from '../api'

const { t, formatCurrency } = useI18n()
const dishes = ref([])
const dialogVisible = ref(false), isEdit = ref(false), editingId = ref(null), formRef = ref(null), loading = ref(false), saving = ref(false), filterCategory = ref('全部')
const form = reactive({ name: '', category: '', price: 0, stock: 0, status: 'active' })
const rules = { name: [{ required: true }], category: [{ required: true }], price: [{ required: true }] }

const categories = computed(() => [...new Set(dishes.value.map(d => d.category))].sort())
const filteredDishes = computed(() => filterCategory.value === '全部' ? dishes.value : dishes.value.filter(d => d.category === filterCategory.value))

async function load() { loading.value = true; try { dishes.value = await api.getDishes() } catch {}; loading.value = false }
function showAddDialog() { isEdit.value = false; editingId.value = null; form.name = ''; form.category = ''; form.price = 0; form.stock = 0; form.status = 'active'; dialogVisible.value = true; setTimeout(() => formRef.value?.resetFields(), 0) }
function showEditDialog(row) { isEdit.value = true; editingId.value = row.id; form.name = row.name; form.category = row.category; form.price = row.price; form.stock = row.stock || 0; form.status = row.status || 'active'; dialogVisible.value = true }

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false); if (!valid) return
  saving.value = true
  try {
    const data = { name: form.name, category: form.category, price: form.price, stock: form.stock, status: form.status, image: '' }
    if (isEdit.value) { await api.updateDish(editingId.value, data); ElMessage.success(t('menu.editSuccess')) }
    else { await api.addDish(data); ElMessage.success(t('menu.addSuccess')) }
    dialogVisible.value = false; await load()
  } catch (e) { ElMessage.error(e.message) }
  saving.value = false
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(t('menu.deleteConfirm'), t('common.confirm'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' })
    await api.deleteDish(row.id); ElMessage.success(t('menu.deleteSuccess')); await load()
  } catch {}
}

onMounted(load)
</script>

<style scoped>
.menu-manage { background:#fff; padding:16px; height:100%; display:flex; flex-direction:column; }
.page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-shrink:0; }
.page-header h2 { margin:0; font-size:18px; }
.filter-bar { margin-bottom:12px; flex-shrink:0; overflow-x:auto; white-space:nowrap; }
.dish-card-list { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.dish-row { display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid #f0f0f0; gap:8px; flex-wrap:wrap; }
.dish-row-main { display:flex; align-items:center; gap:8px; min-width:0; }
.dish-row-id { color:#c0c4cc; font-size:12px; min-width:28px; }
.dish-row-name { font-weight:500; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dish-row-price { color:#f56c6c; font-weight:bold; font-size:14px; min-width:80px; text-align:right; }
.dish-row-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.empty-hint { text-align:center; color:#c0c4cc; padding:40px 0; font-size:14px; }
</style>
