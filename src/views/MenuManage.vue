<template>
  <div class="menu-manage">
    <div class="page-header">
      <h2>菜品管理</h2>
      <el-button type="primary" :icon="Plus" @click="showAddDialog">添加菜品</el-button>
    </div>

    <div class="filter-bar">
      <el-radio-group v-model="filterCategory" size="small">
        <el-radio-button value="全部">全部</el-radio-button>
        <el-radio-button v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</el-radio-button>
      </el-radio-group>
    </div>

    <el-table :data="filteredDishes" border stripe style="width: 100%" v-loading="loading">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="菜品名称" min-width="120" />
      <el-table-column prop="category" label="分类" width="100">
        <template #default="{ row }">
          <el-tag size="small">{{ row.category }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="price" label="价格" width="120" sortable>
        <template #default="{ row }">
          <span class="money">&yen;{{ row.price.toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="showEditDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑菜品' : '添加菜品'" width="480px" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="菜品名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入菜品名称" />
        </el-form-item>
        <el-form-item label="所属分类" prop="category">
          <el-select v-model="form.category" placeholder="选择或输入分类" style="width: 100%" allow-create filterable>
            <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
          </el-select>
        </el-form-item>
        <el-form-item label="价格" prop="price">
          <el-input-number v-model="form.price" :min="0.01" :precision="2" :step="1" style="width: 100%" placeholder="请输入价格" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { getAll, add, update, remove } from '../db'

const dishes = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref(null)
const formRef = ref(null)
const loading = ref(false)
const saving = ref(false)
const filterCategory = ref('全部')

const form = reactive({
  name: '',
  category: '',
  price: 0,
})

const rules = {
  name: [{ required: true, message: '请输入菜品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择或输入分类', trigger: 'blur' }],
  price: [{ required: true, message: '请输入价格', trigger: 'blur' }],
}

const categories = computed(() => {
  return [...new Set(dishes.value.map((d) => d.category))].sort()
})

const filteredDishes = computed(() => {
  if (filterCategory.value === '全部') return dishes.value
  return dishes.value.filter((d) => d.category === filterCategory.value)
})

async function loadDishes() {
  loading.value = true
  dishes.value = await getAll('dishes')
  loading.value = false
}

function showAddDialog() {
  isEdit.value = false
  editingId.value = null
  form.name = ''
  form.category = ''
  form.price = 0
  dialogVisible.value = true
  setTimeout(() => formRef.value?.resetFields(), 0)
}

function showEditDialog(row) {
  isEdit.value = true
  editingId.value = row.id
  form.name = row.name
  form.category = row.category
  form.price = row.price
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  const data = { name: form.name, category: form.category, price: form.price }
  if (isEdit.value) {
    data.id = editingId.value
    await update('dishes', data)
    ElMessage.success('修改成功')
  } else {
    await add('dishes', data)
    ElMessage.success('添加成功')
  }
  saving.value = false
  dialogVisible.value = false
  await loadDishes()
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除菜品"${row.name}"？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await remove('dishes', row.id)
    ElMessage.success('删除成功')
    await loadDishes()
  } catch {
    // cancelled
  }
}

onMounted(loadDishes)
</script>

<style scoped>
.menu-manage {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.page-header h2 {
  margin: 0;
  font-size: 18px;
}
.filter-bar {
  margin-bottom: 16px;
}
.money {
  color: #f56c6c;
  font-weight: bold;
}
</style>
