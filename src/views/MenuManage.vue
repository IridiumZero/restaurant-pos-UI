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

    <!-- 卡片列表（平板/移动端友好） -->
    <div class="dish-card-list" v-loading="loading">
      <div v-for="dish in filteredDishes" :key="dish.id" class="dish-row">
        <div class="dish-row-main">
          <span class="dish-row-id">#{{ dish.id }}</span>
          <span class="dish-row-name">{{ dish.name }}</span>
          <el-tag size="small">{{ dish.category }}</el-tag>
        </div>
        <div class="dish-row-right">
          <span class="dish-row-price">&yen;{{ dish.price.toFixed(2) }}</span>
          <el-button size="small" :icon="Edit" @click="showEditDialog(dish)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(dish)">删除</el-button>
        </div>
      </div>
      <div v-if="!loading && !filteredDishes.length" class="empty-hint">暂无菜品，点击右上角添加</div>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑菜品' : '添加菜品'" width="90%" :close-on-click-modal="false">
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
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.page-header h2 {
  margin: 0;
  font-size: 18px;
}
.filter-bar {
  margin-bottom: 12px;
  flex-shrink: 0;
  overflow-x: auto;
  white-space: nowrap;
}
.dish-card-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.dish-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  gap: 8px;
  flex-wrap: wrap;
}
.dish-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dish-row-id {
  color: #c0c4cc;
  font-size: 12px;
  min-width: 28px;
}
.dish-row-name {
  font-weight: 500;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dish-row-price {
  color: #f56c6c;
  font-weight: bold;
  font-size: 14px;
  min-width: 60px;
  text-align: right;
}
.dish-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.empty-hint {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
  font-size: 14px;
}
</style>
