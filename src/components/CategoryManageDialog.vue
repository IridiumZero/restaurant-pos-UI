<template>
  <el-dialog :model-value="visible" @update:model-value="$emit('update:visible', $event)"
    :title="t('menu.manageCategory')" width="560px"
    :close-on-click-modal="false" class="category-manage-dialog" destroy-on-close>
    <div class="category-add-row">
      <el-input v-model="newCategoryName" :placeholder="t('menu.newCategoryPlaceholder')" size="small" style="flex:2" @keyup.enter="handleAddCategory" />
      <el-input v-model="newCategoryNamePt" :placeholder="t('menu.categoryNamePt')" size="small" style="flex:2" />
      <el-input v-model="newCategoryNameEn" :placeholder="t('menu.categoryNameEn')" size="small" style="flex:2" />
      <el-button type="primary" size="small" :icon="Plus" @click="handleAddCategory" :loading="categorySaving" :disabled="!newCategoryName.trim()">{{ t('common.add') }}</el-button>
    </div>
    <div class="category-list" v-if="categoryList.length">
      <div v-for="(cat, idx) in categoryList" :key="cat.id" class="category-row">
        <template v-if="editingCatId === cat.id">
          <div class="category-edit-fields">
            <el-input v-model="editingCatName" :placeholder="t('menu.newCategoryPlaceholder')" size="small" />
            <el-input v-model="editingCatNamePt" :placeholder="t('menu.categoryNamePt')" size="small" />
            <el-input v-model="editingCatNameEn" :placeholder="t('menu.categoryNameEn')" size="small" />
          </div>
          <el-button size="small" type="primary" :icon="Check" @click="handleSaveCategory(cat)" :loading="categorySaving" />
          <el-button size="small" :icon="Close" @click="editingCatId = null" />
        </template>
        <template v-else>
          <span class="category-name">{{ getCategoryName(cat) }}</span>
          <span class="category-count">{{ categoryDishCount(cat.name) }}</span>
          <el-button size="small" :icon="Top" text @click="moveCategoryUp(idx)" :disabled="idx === 0" />
          <el-button size="small" :icon="Bottom" text @click="moveCategoryDown(idx)" :disabled="idx === categoryList.length - 1" />
          <el-button size="small" :icon="Edit" text @click="startEditCategory(cat)" />
          <el-button size="small" type="danger" :icon="Delete" @click="handleDeleteCategory(cat)" class="category-delete-btn">{{ t('common.delete') }}</el-button>
        </template>
      </div>
    </div>
    <div v-else class="empty-hint">{{ t('menu.noCategory') }}</div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Close, Check, Top, Bottom } from '@element-plus/icons-vue'
import { useI18n, getCategoryName } from '../i18n'
import { api } from '../api'

const props = defineProps({
  visible: Boolean,
})

const emit = defineEmits(['update:visible', 'categories-changed'])

const { t } = useI18n()

// State
const categoryList = ref([])
const categorySaving = ref(false)
const newCategoryName = ref('')
const newCategoryNamePt = ref('')
const newCategoryNameEn = ref('')
const editingCatId = ref(null)
const editingCatName = ref('')
const editingCatNamePt = ref('')
const editingCatNameEn = ref('')

// Load categories
async function loadCategories() {
  try { categoryList.value = await api.getCategories() } catch (e) { console.error('加载分类失败:', e) }
}

function categoryDishCount(catName) {
  // Not available in this component — would need dishes prop
  // Return empty for now; parent can provide if needed
  return ''
}

// Reset and load when dialog opens
watch(() => props.visible, (v) => {
  if (v) {
    newCategoryName.value = ''
    newCategoryNamePt.value = ''
    newCategoryNameEn.value = ''
    editingCatId.value = null
    loadCategories()
  }
})

async function handleAddCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  categorySaving.value = true
  try {
    await api.addCategory({ name, name_pt: newCategoryNamePt.value.trim(), name_en: newCategoryNameEn.value.trim() })
    newCategoryName.value = ''
    newCategoryNamePt.value = ''
    newCategoryNameEn.value = ''
    await loadCategories()
    emit('categories-changed')
  } catch (e) { ElMessage.error(e.message) }
  categorySaving.value = false
}

function startEditCategory(cat) {
  editingCatId.value = cat.id
  editingCatName.value = cat.name
  editingCatNamePt.value = cat.name_pt || ''
  editingCatNameEn.value = cat.name_en || ''
}

async function handleSaveCategory(cat) {
  const name = editingCatName.value.trim()
  if (!name) { editingCatId.value = null; return }
  const fields = {}
  if (name !== cat.name) fields.name = name
  const pt = editingCatNamePt.value.trim()
  if (pt !== (cat.name_pt || '')) fields.name_pt = pt
  const en = editingCatNameEn.value.trim()
  if (en !== (cat.name_en || '')) fields.name_en = en
  if (!Object.keys(fields).length) { editingCatId.value = null; return }
  categorySaving.value = true
  try {
    await api.updateCategory(cat.id, fields)
    editingCatId.value = null
    await loadCategories()
    emit('categories-changed')
  } catch (e) { ElMessage.error(e.message) }
  categorySaving.value = false
}

async function handleDeleteCategory(cat) {
  try {
    await ElMessageBox.confirm(
      t('menu.deleteCategoryConfirm', { name: cat.name }),
      t('common.confirm'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await api.deleteCategory(cat.id)
    await loadCategories()
    emit('categories-changed')
  } catch (e) { console.error('删除分类失败:', e) }
}

async function moveCategoryUp(idx) {
  if (idx === 0) return
  await swapCatOrder(idx, idx - 1)
}

async function moveCategoryDown(idx) {
  if (idx >= categoryList.value.length - 1) return
  await swapCatOrder(idx, idx + 1)
}

async function swapCatOrder(i, j) {
  const a = categoryList.value[i], b = categoryList.value[j]
  await api.updateCategory(a.id, { sort_order: j })
  await api.updateCategory(b.id, { sort_order: i })
  await loadCategories()
  emit('categories-changed')
}
</script>

<style scoped>
.category-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  padding: 12px;
  background: #ffffff !important;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
}

.category-add-row :deep(.el-input__wrapper) {
  border-radius: 8px !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06) !important;
  background-color: #ffffff !important;
  border: 1.5px solid #e2e8f0 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  padding: 6px 12px !important;
}

.category-add-row :deep(.el-input__wrapper:hover) {
  border-color: #cbd5e0 !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08) !important;
}

.category-add-row :deep(.el-input__wrapper.is-focus) {
  border-color: #667eea !important;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12), 0 4px 12px rgba(102, 126, 234, 0.15) !important;
}

.category-add-row :deep(.el-input__inner) {
  font-size: 13px !important;
  color: #2d3748 !important;
  height: 26px !important;
  line-height: 26px !important;
}

.category-add-row :deep(.el-input__inner::placeholder) {
  color: #a0aec0 !important;
}

.category-list {
  max-height: 420px;
  overflow-y: auto;
  padding: 8px;
  background: #ffffff !important;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
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

.empty-hint {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
  font-size: 15px;
}

.category-list::-webkit-scrollbar {
  width: 6px;
}

.category-list::-webkit-scrollbar-track {
  background: transparent;
}

.category-list::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.category-list::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}
</style>
