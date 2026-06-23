<template>
  <div class="menu-manage">
    <div class="page-header">
      <h2>{{ t('menu.title') }}</h2>
      <div class="header-buttons">
        <el-button :icon="FolderOpened" @click="showCategoryDialog">{{ t('menu.manageCategory') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="showAddDialog">{{ t('menu.addDish') }}</el-button>
      </div>
    </div>
    <div class="filter-bar">
      <el-radio-group v-model="filterCategory" size="default" class="category-tabs">
        <el-radio-button v-for="cat in filterCategories" :key="cat.name" :value="cat.name" class="category-tab">{{ cat.label }}</el-radio-button>
      </el-radio-group>
    </div>
    <div class="dish-card-list" v-loading="loading">
      <div v-for="(dish, index) in filteredDishes" :key="dish.id" class="dish-row">
        <div class="dish-row-main">
          <span class="dish-row-id">#{{ dish.id }}</span>
          <div class="dish-thumb">
            <img v-if="dish.image" :src="imageUrl(dish.image)" />
            <span v-else class="dish-thumb-letter" :style="{ background: avatarColor(getDishName(dish)) }">{{ getDishName(dish).charAt(0) }}</span>
          </div>
          <span class="dish-row-name">{{ getDishName(dish) }}</span>
          <span v-if="getDishRemark(dish)" class="dish-row-remark">{{ getDishRemark(dish) }}</span>
          <el-tag v-for="catName in getDishCategoryLabel(dish)" :key="catName" size="small">{{ catName }}</el-tag>
          <el-tag :type="dish.status === 'active' ? 'success' : dish.status === 'sold_out' ? 'warning' : 'info'" size="small">{{ dish.status === 'active' ? t('menu.active') : dish.status === 'sold_out' ? t('menu.soldOut') : t('menu.inactive') }}</el-tag>
        </div>
        <div class="dish-row-right">
          <span class="dish-row-price">{{ formatCurrency(dish.price) }}</span>
          <el-button size="small" :icon="Top" @click="moveDishUp(index)" :disabled="index === 0" :title="t('menu.moveUp')" />
          <el-button size="small" :icon="Bottom" @click="moveDishDown(index)" :disabled="index === filteredDishes.length - 1" :title="t('menu.moveDown')" />
          <el-button size="small" :icon="Edit" @click="showEditDialog(dish)">{{ t('common.edit') }}</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(dish)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
      <div v-if="!loading && !filteredDishes.length" class="empty-hint">{{ t('menu.noDish') }}</div>
    </div>

    <!-- 菜品编辑对话框 -->
    <DishEditDialog v-model:visible="dialogVisible" :is-edit="isEdit" :dish="editingDish"
      :categories="categoryList" @saved="handleDishSaved" />

    <!-- 分类管理对话框 -->
    <CategoryManageDialog v-model:visible="categoryDialogVisible"
      @categories-changed="handleCategoriesChanged" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, FolderOpened, Top, Bottom } from '@element-plus/icons-vue'
import { useI18n, getDishName, getCategoryName, getDishRemark } from '../i18n'
import { api } from '../api'
import DishEditDialog from '../components/DishEditDialog.vue'
import CategoryManageDialog from '../components/CategoryManageDialog.vue'

const { t, formatCurrency } = useI18n()
const serverBase = localStorage.getItem('serverUrl') || location.origin || 'http://localhost:3000'
const dishes = ref([])
const loading = ref(false)
const filterCategory = ref('全部')

// Dish dialog state
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingDish = ref(null)

// Category
const categoryList = ref([])
const categoryDialogVisible = ref(false)

const filterCategories = computed(() => {
  const cats = categoryList.value.map(c => ({ name: c.name, label: getCategoryName(c) }))
  return [{ name: '全部', label: t('common.all') }, ...cats]
})

const filteredDishes = computed(() => {
  if (filterCategory.value === '全部') return dishes.value
  return dishes.value.filter(d => (d.category || '').split(/[,，]/).includes(filterCategory.value))
})

function getDishCategoryLabel(dish) {
  return (dish.category || '').split(',').map(name => {
    const cat = categoryList.value.find(c => c.name === name)
    return cat ? getCategoryName(cat) : ''
  }).filter(Boolean)
}

async function loadCategories() {
  try { categoryList.value = await api.getCategories() } catch (e) { console.error('加载分类失败:', e) }
}

async function load() { loading.value = true; try { dishes.value = await api.getDishes() } catch (e) { console.error('加载菜品失败:', e) }; loading.value = false }

function showAddDialog() {
  isEdit.value = false
  editingDish.value = null
  dialogVisible.value = true
}

function showEditDialog(row) {
  isEdit.value = true
  editingDish.value = { ...row }
  dialogVisible.value = true
}

async function handleDishSaved() {
  dialogVisible.value = false
  await load()
}

function imageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return serverBase + path
}

function avatarColor(name) {
  const colors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#00D4AA', '#FF85C0', '#9B59B6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(t('menu.deleteConfirm'), t('common.confirm'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' })
    await api.deleteDish(row.id); ElMessage.success(t('menu.deleteSuccess')); await load()
  } catch (e) { console.error('删除菜品失败:', e) }
}

// ── Dish sort order ──────────────────────────────────────

async function moveDishUp(index) {
  if (index === 0) return
  await swapSortOrder(filteredDishes.value, index, index - 1)
}

async function moveDishDown(index) {
  if (index >= filteredDishes.value.length - 1) return
  await swapSortOrder(filteredDishes.value, index, index + 1)
}

async function swapSortOrder(list, i, j) {
  const a = list[i], b = list[j]
  await api.updateDish(a.id, { sort_order: j })
  await api.updateDish(b.id, { sort_order: i })
  await load()
}

// ── Category management ───────────────────────────────

function showCategoryDialog() {
  categoryDialogVisible.value = true
}

async function handleCategoriesChanged() {
  await loadCategories()
  await load()
}

onMounted(() => { load(); loadCategories() })
</script>

<style scoped>
.menu-manage { 
  background: transparent;
  padding: 20px; 
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
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.page-header h2 { 
  margin: 0; 
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-buttons { 
  display: flex; 
  gap: 10px;
}

.header-buttons :deep(.el-button) {
  transition: all 0.3s ease;
}

.header-buttons :deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.filter-bar { 
  margin-bottom: 16px; 
  flex-shrink: 0; 
  overflow-x: auto; 
  white-space: nowrap;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* Tab group styling */
.category-tabs {
  display: inline-flex;
  gap: 8px;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}

/* Individual tab button */
.category-tab :deep(.el-radio-button__inner) {
  padding: 8px 20px !important;
  border: 2px solid #e2e8f0 !important;
  border-radius: 10px !important;
  font-weight: 500 !important;
  font-size: 14px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04) !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  position: relative;
  overflow: hidden;
}

/* Tab hover effect */
.category-tab :deep(.el-radio-button__inner:hover) {
  border-color: #667eea !important;
  color: #667eea !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
  background: rgba(102, 126, 234, 0.05) !important;
}

/* Active/Selected tab */
.category-tab :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: 2px solid #667eea !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
  transform: translateY(-3px) scale(1.02) !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
  position: relative;
}

/* Active tab indicator - bottom bar */
.category-tab :deep(.el-radio-button.is-active .el-radio-button__inner)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  background: linear-gradient(90deg, transparent, #fff, transparent);
  border-radius: 2px;
}

/* Active tab pulse animation */
.category-tab :deep(.el-radio-button.is-active .el-radio-button__inner)::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s;
}

.category-tab :deep(.el-radio-button.is-active:hover .el-radio-button__inner)::before {
  left: 100%;
}

.dish-card-list { 
  flex: 1; 
  overflow-y: auto; 
  -webkit-overflow-scrolling: touch;
  padding: 4px;
}

.dish-row { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 16px 20px; 
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  gap: 12px; 
  flex-wrap: wrap;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.dish-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.dish-row:hover {
  transform: translateX(4px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.15);
}

.dish-row:hover::before {
  opacity: 1;
}

.dish-row-main { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  min-width: 0;
  flex: 1;
}

.dish-row-id { 
  color: #c0c4cc; 
  font-size: 13px;
  min-width: 32px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.dish-row-name { 
  font-weight: 600; 
  font-size: 15px;
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap;
  color: #303133;
}

.dish-row-remark { 
  color: #909399; 
  font-size: 13px; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap; 
  max-width: 180px;
}

.dish-row-price { 
  font-size: 18px; 
  font-weight: 700;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  min-width: 100px; 
  text-align: right;
}

.dish-row-right { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  flex-shrink: 0;
}

.dish-row-right :deep(.el-button) {
  transition: all 0.3s ease;
}

.dish-row-right :deep(.el-button:hover) {
  transform: translateY(-2px);
}

.empty-hint { 
  text-align: center; 
  color: #c0c4cc; 
  padding: 60px 0; 
  font-size: 15px;
}

.dish-thumb { 
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.dish-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.dish-thumb img { 
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dish-thumb-letter { 
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.category-add-row { 
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  padding: 12px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  border-radius: 10px;
}

.category-list { 
  max-height: 420px;
  overflow-y: auto;
  padding: 8px;
}

.category-row { 
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin: 8px 0;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 10px;
  border: 1px solid #e4e7ed;
  transition: all 0.3s ease;
  flex-wrap: wrap;
}

.category-row:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateX(4px);
}

/* Delete button styling */
.category-delete-btn {
  background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%) !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(255, 65, 108, 0.3) !important;
  font-weight: 600 !important;
  min-width: 70px;
  color: #fff !important;
}

.category-delete-btn:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 16px rgba(255, 65, 108, 0.5) !important;
  background: linear-gradient(135deg, #ff4b2b 0%, #ff416c 100%) !important;
}

.category-delete-btn:active {
  transform: translateY(0) !important;
  box-shadow: 0 2px 8px rgba(255, 65, 108, 0.4) !important;
}

.category-delete-btn .el-icon {
  font-size: 16px !important;
  margin-right: 4px;
}

.category-name { 
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  min-width: 0;
  color: #303133;
}

.category-count { 
  color: #909399;
  font-size: 13px;
  margin-right: 6px;
  font-weight: 500;
}

.category-edit-fields { 
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Responsive design */
@media (max-width: 768px) {
  .menu-manage {
    padding: 12px;
  }
  
  .page-header {
    padding: 12px 16px;
  }
  
  .page-header h2 {
    font-size: 18px;
  }
  
  .dish-row {
    padding: 12px 16px;
  }
  
  .dish-row-price {
    font-size: 16px;
  }
}

/* Scrollbar styling */
.dish-card-list::-webkit-scrollbar,
.category-list::-webkit-scrollbar {
  width: 6px;
}

.dish-card-list::-webkit-scrollbar-track,
.category-list::-webkit-scrollbar-track {
  background: transparent;
}

.dish-card-list::-webkit-scrollbar-thumb,
.category-list::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.dish-card-list::-webkit-scrollbar-thumb:hover,
.category-list::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}

</style>

