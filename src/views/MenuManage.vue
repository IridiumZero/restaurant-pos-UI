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

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('menu.editDish') : t('menu.addDish')" width="900px" :close-on-click-modal="false" class="dish-dialog">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px" class="dish-form">
        <div class="form-row form-row-3">
          <el-form-item :label="t('menu.dishName')" prop="name"><el-input v-model="form.name" :placeholder="t('menu.placeholderName')" /></el-form-item>
          <el-form-item :label="t('menu.dishNamePt')"><el-input v-model="form.name_pt" :placeholder="t('menu.placeholderNamePt')" /></el-form-item>
          <el-form-item :label="t('menu.dishNameEn')"><el-input v-model="form.name_en" :placeholder="t('menu.placeholderNameEn')" /></el-form-item>
        </div>
        <div class="form-row form-row-2">
          <el-form-item :label="t('menu.dishCategory')" prop="category">
            <el-select v-model="form.category" style="width:100%" filterable multiple :placeholder="t('menu.placeholderCategory')">
              <el-option v-for="cat in categoryList" :key="cat.id" :label="getCategoryName(cat) || cat.name" :value="cat.name" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('menu.dishPrice')" prop="price"><div class="price-row"><el-input-number v-model="form.price" :min="1" :precision="2" :step="10" style="flex:1;min-width:0" /> <span class="price-unit">{{ t('currency.symbol') }}</span></div></el-form-item>
        </div>
        <div class="form-row form-row-1">
          <el-form-item :label="t('menu.dishRemark')"><el-input v-model="form.remark" :placeholder="t('menu.dishRemark')" /></el-form-item>
        </div>
        <div class="form-row form-row-1">
          <el-form-item :label="t('menu.dishRemarkPt')"><el-input v-model="form.remark_pt" :placeholder="t('menu.dishRemarkPt')" /></el-form-item>
        </div>
        <div class="form-row form-row-1">
          <el-form-item :label="t('menu.dishRemarkEn')"><el-input v-model="form.remark_en" :placeholder="t('menu.dishRemarkEn')" /></el-form-item>
        </div>

        <!-- 口味配置 / Flavor Options -->
        <div class="flavor-section" v-if="flavorTemplates.length">
          <div class="flavor-section-header">
            <span class="flavor-section-title">{{ t('menu.flavorTitle') }}</span>
            <span class="flavor-section-hint">{{ enabledFlavorCount }} / {{ flavorTemplates.length }} {{ t('menu.flavorEnabled') }}</span>
          </div>
          <div class="flavor-card-list">
            <div v-for="flavor in flavorTemplates" :key="flavor.id" class="flavor-card" :class="{ 'flavor-card-active': isFlavorEnabled(flavor.id) }">
              <div class="flavor-card-header">
                <el-switch v-model="flavorState[flavor.id].enabled" size="small" />
                <span class="flavor-card-name">{{ getFlavorName(flavor) }}</span>
                <el-checkbox v-model="flavorState[flavor.id].required" :disabled="!isFlavorEnabled(flavor.id)" size="small">{{ t('menu.flavorRequired') }}</el-checkbox>
              </div>
              <div class="flavor-card-options" v-if="flavor.options && flavor.options.length">
                <el-tag v-for="opt in flavor.options" :key="opt" size="small" type="info" class="flavor-option-tag">{{ localizeOption(opt) }}</el-tag>
              </div>
            </div>
          </div>
        </div>

        <div class="form-row form-row-2">
          <el-form-item :label="t('menu.dishImage')" prop="image">
            <div class="image-upload-multi">
              <input type="file" accept="image/*" @change="handleImageSelect" ref="fileInput" style="display:none" multiple />
              <div v-for="(img, idx) in imageList" :key="idx" class="image-thumb">
                <img :src="imageUrl(img)" />
                <span v-if="idx === 0" class="image-cover-tag">{{ t('menu.coverImage') }}</span>
                <el-button size="small" type="danger" circle class="image-del-btn" @click="removeImage(idx)">
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
              <div class="image-add-btn" @click="fileInput?.click()" v-if="!imageUploading && imageList.length < 4">
                <el-icon style="font-size:24px;color:#909399"><Plus /></el-icon>
              </div>
              <div class="image-add-btn" v-else-if="imageUploading">
                <el-icon class="is-loading" style="font-size:20px;color:#409eff"><Loading /></el-icon>
              </div>
            </div>
          </el-form-item>
          <el-form-item :label="t('menu.dishStatus')" prop="status">
            <el-select v-model="form.status" style="width:100%">
              <el-option :label="t('menu.active')" value="active" />
              <el-option :label="t('menu.inactive')" value="inactive" />
              <el-option :label="t('menu.soldOut')" value="sold_out" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 分类管理对话框 -->
    <el-dialog v-model="categoryDialogVisible" :title="t('menu.manageCategory')" width="560px" :close-on-click-modal="false" class="category-dialog">
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
            <el-button size="small" :icon="Top" text @click="moveCategoryUp(idx)" :disabled="idx === 0" v-if="isAdmin" />
            <el-button size="small" :icon="Bottom" text @click="moveCategoryDown(idx)" :disabled="idx === categoryList.length - 1" v-if="isAdmin" />
            <el-button size="small" :icon="Edit" text @click="startEditCategory(cat)" v-if="isAdmin" />
            <el-button size="small" type="danger" :icon="Delete" @click="handleDeleteCategory(cat)" v-if="isAdmin" class="category-delete-btn">{{ t('common.delete') }}</el-button>
          </template>
        </div>
      </div>
      <div v-else class="empty-hint">{{ t('menu.noCategory') }}</div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Close, Check, FolderOpened, Top, Bottom, Loading } from '@element-plus/icons-vue'
import { useI18n, getDishName, getCategoryName, getDishRemark, getFlavorName, localizeOption } from '../i18n'
import { api } from '../api'

const { t, locale, formatCurrency } = useI18n()
const serverBase = localStorage.getItem('serverUrl') || location.origin || 'http://localhost:3000'
const dishes = ref([])
const dialogVisible = ref(false), isEdit = ref(false), editingId = ref(null), formRef = ref(null), loading = ref(false), saving = ref(false), filterCategory = ref('全部')
const imageList = ref([]), imageUploading = ref(false), fileInput = ref(null)
const form = reactive({ name: '', name_pt: '', name_en: '', category: [], price: 0, remark: '', remark_pt: '', remark_en: '', status: 'active', image: '' })
const rules = { name: [{ required: true }], category: [{ required: true }], price: [{ required: true }] }

// Flavor configuration
const flavorTemplates = ref([])
const flavorState = reactive({}) // flavorState[flavorId] = { enabled: bool, required: bool }

const enabledFlavorCount = computed(() => {
  return Object.values(flavorState).filter(s => s.enabled).length
})

function isFlavorEnabled(flavorId) {
  return flavorState[flavorId]?.enabled === true
}

function resetFlavorState() {
  Object.keys(flavorState).forEach(k => delete flavorState[k])
}

function initFlavorStateFromTemplates(templates) {
  templates.forEach(f => {
    if (!flavorState[f.id]) {
      flavorState[f.id] = { enabled: false, required: false }
    }
  })
}

async function loadFlavorTemplates() {
  try {
    flavorTemplates.value = await api.getFlavors()
    initFlavorStateFromTemplates(flavorTemplates.value)
  } catch (e) { console.error('加载口味模板失败:', e) }
}

async function loadDishFlavors(dishId) {
  try {
    const assigned = await api.getDishFlavors(dishId)
    assigned.forEach(af => {
      if (flavorState[af.flavor_id]) {
        flavorState[af.flavor_id].enabled = true
        flavorState[af.flavor_id].required = !!af.required
      }
    })
  } catch (e) { console.error('加载菜品口味失败:', e) }
}

function getEnabledFlavors() {
  return flavorTemplates.value
    .filter(f => flavorState[f.id]?.enabled)
    .map((f, idx) => ({ flavor_id: f.id, required: flavorState[f.id].required, sort_order: idx }))
}

const userRole = ref((() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role || '' } catch { return '' } })())
const isAdmin = computed(() => userRole.value === 'admin')

// Category management
const categoryList = ref([])
const categoryDialogVisible = ref(false)
const categorySaving = ref(false)
const newCategoryName = ref('')
const newCategoryNamePt = ref('')
const newCategoryNameEn = ref('')
const editingCatId = ref(null)
const editingCatName = ref('')
const editingCatNamePt = ref('')
const editingCatNameEn = ref('')

const filterCategories = computed(() => {
  const cats = categoryList.value.map(c => ({ name: c.name, label: getCategoryName(c) }))
  return [{ name: '全部', label: t('common.all') }, ...cats]
})

const filteredDishes = computed(() => {
  if (filterCategory.value === '全部') return dishes.value
  return dishes.value.filter(d => (d.category || '').split(',').includes(filterCategory.value))
})

function categoryDishCount(catName) {
  return dishes.value.filter(d => (d.category || '').split(',').includes(catName)).length
}

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
function showAddDialog() { isEdit.value = false; editingId.value = null; form.name = ''; form.name_pt = ''; form.name_en = ''; form.category = []; form.price = 0; form.remark = ''; form.remark_pt = ''; form.remark_en = ''; form.status = 'active'; form.image = ''; imageList.value = []; resetFlavorState(); loadFlavorTemplates(); dialogVisible.value = true; setTimeout(() => formRef.value?.resetFields(), 0) }
async function showEditDialog(row) { isEdit.value = true; editingId.value = row.id; form.name = row.name; form.name_pt = row.name_pt || ''; form.name_en = row.name_en || ''; form.category = row.category ? row.category.split(',') : []; form.price = row.price; form.remark = row.remark || ''; form.remark_pt = row.remark_pt || ''; form.remark_en = row.remark_en || ''; form.status = row.status || 'active'; form.image = row.image || ''; imageList.value = parseImages(row); resetFlavorState(); await loadFlavorTemplates(); await loadDishFlavors(row.id); dialogVisible.value = true }

function parseImages(row) {
  if (row.images) {
    try {
      const arr = typeof row.images === 'string' ? JSON.parse(row.images) : row.images
      if (Array.isArray(arr) && arr.length) return arr
    } catch {}
  }
  return row.image ? [row.image] : []
}

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  const remaining = 4 - imageList.value.length
  const toUpload = files.slice(0, remaining)
  if (files.length > remaining) {
    ElMessage.warning(t('menu.imageLimit', '最多上传4张图片'))
  }
  if (!toUpload.length) { if (fileInput.value) fileInput.value.value = ''; return }
  imageUploading.value = true
  for (const file of toUpload) {
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await api.uploadImage(base64)
      imageList.value.push(res.path)
    } catch (err) { ElMessage.error(err.message) }
  }
  imageUploading.value = false
  if (fileInput.value) fileInput.value.value = ''
}

function removeImage(idx) {
  imageList.value.splice(idx, 1)
}

async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false); if (!valid) return
  saving.value = true
  try {
    const data = { name: form.name, name_pt: form.name_pt, name_en: form.name_en, category: Array.isArray(form.category) ? form.category.join(',') : form.category, price: form.price, remark: form.remark, remark_pt: form.remark_pt, remark_en: form.remark_en, status: form.status, image: imageList.value[0] || '', images: JSON.stringify(imageList.value) }
    let dishId = editingId.value
    if (isEdit.value) { await api.updateDish(dishId, data); ElMessage.success(t('menu.editSuccess')) }
    else { const res = await api.addDish(data); dishId = res?.id || res; ElMessage.success(t('menu.addSuccess')) }
    if (dishId) { await api.setDishFlavors(dishId, getEnabledFlavors()) }
    dialogVisible.value = false; await load()
  } catch (e) { ElMessage.error(e.message) }
  saving.value = false
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
  newCategoryName.value = ''
  newCategoryNamePt.value = ''
  newCategoryNameEn.value = ''
  editingCatId.value = null
  categoryDialogVisible.value = true
}

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
    if (fields.name) await load() // refresh dishes if category renamed
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
    await load()
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

/* ========================================
   Dialog Optimization
   ======================================== */

/* Horizontal form rows */
.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 0;
  align-items: flex-start;
}

.price-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.price-unit {
  color: #909399;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
}

.form-row :deep(.el-form-item) {
  flex: 1;
  min-width: 0;
  margin-bottom: 14px !important;
}

/* Form styling */
.dish-form {
  padding: 16px 20px 4px !important;
}

/* Form item spacing */
.dish-form :deep(.el-form-item) {
  margin-bottom: 14px !important;
}

.dish-form :deep(.el-form-item__content) {
  min-width: 0 !important;
}

/* Form label - right aligned for neat columns */
.dish-form :deep(.el-form-item__label) {
  font-weight: 600 !important;
  color: #4a5568 !important;
  font-size: 13px !important;
  line-height: 32px !important;
  text-align: right !important;
  padding-right: 10px !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
}

.dish-form :deep(.el-form-item__label::before) {
  color: #f56c6c !important;
  font-weight: 700 !important;
  margin-right: 2px !important;
}

/* Input and Select unified styling */
.dish-form :deep(.el-input__wrapper),
.dish-form :deep(.el-select .el-input__wrapper) {
  border-radius: 8px !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06) !important;
  background-color: #ffffff !important;
  border: 1.5px solid #e2e8f0 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  padding: 6px 12px !important;
}

.dish-form :deep(.el-input__wrapper:hover),
.dish-form :deep(.el-select .el-input__wrapper:hover) {
  border-color: #cbd5e0 !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08) !important;
}

.dish-form :deep(.el-input__wrapper.is-focus),
.dish-form :deep(.el-select .el-input__wrapper.is-focus) {
  border-color: #667eea !important;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12), 0 4px 12px rgba(102, 126, 234, 0.15) !important;
  background-color: #ffffff !important;
}

.dish-form :deep(.el-input__inner) {
  font-size: 14px !important;
  color: #2d3748 !important;
  height: 28px !important;
  line-height: 28px !important;
}

.dish-form :deep(.el-input__inner::placeholder) {
  color: #a0aec0 !important;
  font-weight: 400 !important;
}

/* Select dropdown */
.dish-form :deep(.el-select-dropdown) {
  border-radius: 8px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  border: 1px solid #e2e8f0 !important;
  overflow: hidden !important;
  padding: 6px !important;
}

.dish-form :deep(.el-select-dropdown__item) {
  border-radius: 6px !important;
  margin: 2px 0 !important;
  padding: 8px 12px !important;
  font-size: 14px !important;
  transition: all 0.2s ease !important;
}

.dish-form :deep(.el-select-dropdown__item:hover) {
  background-color: rgba(102, 126, 234, 0.08) !important;
  color: #667eea !important;
}

.dish-form :deep(.el-select-dropdown__item.is-selected) {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.12) 0%, rgba(118, 75, 162, 0.12) 100%) !important;
  color: #667eea !important;
  font-weight: 600 !important;
}

.dish-form :deep(.el-select-dropdown__item.is-selected::after) {
  color: #667eea !important;
  font-weight: 700 !important;
}

/* Number input */
.dish-form :deep(.el-input-number) {
  width: 100% !important;
}

.dish-form :deep(.el-input-number .el-input__wrapper) {
  padding-right: 60px !important;
}

.dish-form :deep(.el-input-number__decrease),
.dish-form :deep(.el-input-number__increase) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: #ffffff !important;
  border: none !important;
  transition: all 0.3s ease !important;
  font-weight: 700 !important;
  font-size: 16px !important;
  width: 32px !important;
}

.dish-form :deep(.el-input-number__decrease:hover),
.dish-form :deep(.el-input-number__increase:hover) {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%) !important;
  transform: scale(1.08) !important;
}

.dish-form :deep(.el-input-number__decrease:active),
.dish-form :deep(.el-input-number__increase:active) {
  transform: scale(0.95) !important;
}

/* Image upload - multi */
.image-upload-multi {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.image-thumb {
  position: relative;
  width: 68px;
  height: 68px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #e2e8f0;
  flex-shrink: 0;
}

.image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-cover-tag {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(102, 126, 234, 0.85);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 1px 0;
  line-height: 1.3;
}

.image-del-btn {
  position: absolute !important;
  top: 2px;
  right: 2px;
  width: 18px !important;
  height: 18px !important;
  padding: 0 !important;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-thumb:hover .image-del-btn {
  opacity: 1;
}

.image-add-btn {
  width: 68px;
  height: 68px;
  border-radius: 8px;
  border: 2px dashed #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.image-add-btn:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.04);
}

/* Responsive */
@media (max-width: 768px) {
  .dish-dialog :deep(.el-dialog) {
    width: 95% !important;
    margin: 20px auto !important;
  }
  
  .dish-form {
    padding: 12px 14px 4px !important;
  }
  
  .dish-dialog :deep(.el-dialog__body) {
    padding: 12px !important;
  }
  
  .form-row {
    flex-direction: column;
    gap: 0;
  }
  
  .image-thumb,
  .image-add-btn {
    width: 56px;
    height: 56px;
  }
}

/* ========================================
   Category Dialog
   ======================================== */

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

/* ========================================
   Flavor Configuration Section
   ======================================== */

.flavor-section {
  margin: 0 0 14px 0;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.04) 0%, rgba(118, 75, 162, 0.04) 100%);
  border-radius: 10px;
  border: 1px solid #e4e7ed;
}

.flavor-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ebeef5;
}

.flavor-section-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
  letter-spacing: 0.3px;
}

.flavor-section-hint {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.flavor-card-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 4px;
}

.flavor-card {
  padding: 8px 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1.5px solid #e4e7ed;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex: 1;
  min-width: 180px;
}

.flavor-card:hover {
  border-color: #cbd5e0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.flavor-card-active {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%);
  box-shadow: 0 2px 10px rgba(102, 126, 234, 0.12);
}

.flavor-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.flavor-card-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  min-width: 0;
}

.flavor-card-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
}

.flavor-option-tag {
  font-size: 12px !important;
}

.flavor-card-list::-webkit-scrollbar {
  width: 5px;
}

.flavor-card-list::-webkit-scrollbar-track {
  background: transparent;
}

.flavor-card-list::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.25);
  border-radius: 3px;
}

.flavor-card-list::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.45);
}
</style>
