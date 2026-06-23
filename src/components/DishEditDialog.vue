<template>
  <el-dialog :model-value="visible" @update:model-value="$emit('update:visible', $event)"
    :title="isEdit ? t('menu.editDish') : t('menu.addDish')" width="900px"
    :close-on-click-modal="false" class="dish-edit-dialog" destroy-on-close>
    <el-form :model="form" :rules="rules" ref="formRef" label-width="80px" class="dish-form">
      <div class="form-row form-row-3">
        <el-form-item :label="t('menu.dishName')" prop="name"><el-input v-model="form.name" :placeholder="t('menu.placeholderName')" /></el-form-item>
        <el-form-item :label="t('menu.dishNamePt')"><el-input v-model="form.name_pt" :placeholder="t('menu.placeholderNamePt')" /></el-form-item>
        <el-form-item :label="t('menu.dishNameEn')"><el-input v-model="form.name_en" :placeholder="t('menu.placeholderNameEn')" /></el-form-item>
      </div>
      <div class="form-row form-row-2">
        <el-form-item :label="t('menu.dishCategory')" prop="category">
          <el-select v-model="form.category" style="width:100%" filterable multiple :placeholder="t('menu.placeholderCategory')">
            <el-option v-for="cat in categories" :key="cat.id" :label="getCategoryName(cat) || cat.name" :value="cat.name" />
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
      <el-button @click="$emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="handleSave" :loading="saving">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Close, Loading } from '@element-plus/icons-vue'
import { useI18n, getCategoryName, getFlavorName, localizeOption } from '../i18n'
import { api } from '../api'

const props = defineProps({
  visible: Boolean,
  isEdit: Boolean,
  dish: Object, // null for add, dish object for edit
  categories: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'saved'])

const { t } = useI18n()
const serverBase = localStorage.getItem('serverUrl') || location.origin || 'http://localhost:3000'

// Form state
const formRef = ref(null)
const saving = ref(false)
const form = reactive({
  name: '', name_pt: '', name_en: '',
  category: [], price: 0,
  remark: '', remark_pt: '', remark_en: '',
  status: 'active', image: '',
})
const rules = { name: [{ required: true }], category: [{ required: true }], price: [{ required: true }] }

// Image upload
const imageList = ref([])
const imageUploading = ref(false)
const fileInput = ref(null)
const newlyUploaded = ref(new Set()) // 本轮新上传的图片路径（尚未保存到数据库）

// Flavor configuration
const flavorTemplates = ref([])
const flavorState = reactive({})

const enabledFlavorCount = computed(() => Object.values(flavorState).filter(s => s.enabled).length)

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

// Image handling
function parseImages(row) {
  if (!row) return []
  if (row.images) {
    try {
      const arr = typeof row.images === 'string' ? JSON.parse(row.images) : row.images
      if (Array.isArray(arr) && arr.length) return arr
    } catch {}
  }
  return row.image ? [row.image] : []
}

const MAX_IMG_SIDE = 1024
const JPEG_QUALITY = 0.85
const PNG_KEEP_THRESHOLD = 200 * 1024 // 小于 200KB 的 PNG 保留原始格式（保持透明）

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      // 小 PNG 不压缩（保持透明度）
      if (file.type === 'image/png' && file.size < PNG_KEEP_THRESHOLD) {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
        return
      }
      // 计算缩放比例
      let w = width, h = height
      if (w > MAX_IMG_SIDE || h > MAX_IMG_SIDE) {
        const scale = MAX_IMG_SIDE / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      // 绘制到 Canvas
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      // PNG 保持格式（大图也压缩尺寸），其余统一输出 JPEG
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const quality = mime === 'image/jpeg' ? JPEG_QUALITY : undefined
      const dataUrl = canvas.toDataURL(mime, quality)
      resolve(dataUrl)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
    img.src = url
  })
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
      const base64 = await compressImage(file)
      const res = await api.uploadImage(base64)
      imageList.value.push(res.path)
      newlyUploaded.value.add(res.path) // 标记为本轮新上传
    } catch (err) { ElMessage.error(err.message) }
  }
  imageUploading.value = false
  if (fileInput.value) fileInput.value.value = ''
}

function removeImage(idx) {
  const removed = imageList.value.splice(idx, 1)
  // 新上传但未保存的图片：直接从服务器删除（不会由 PUT handler 处理）
  if (removed[0] && newlyUploaded.value.has(removed[0])) {
    api.deleteImage(removed[0]).catch(() => {})
    newlyUploaded.value.delete(removed[0])
  }
  // 已有图片：仅从列表移除，保存时由服务端对比新旧列表自动清理
}

function imageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return serverBase + path
}

// Initialize form when dialog opens
watch(() => props.visible, async (v) => {
  if (v) {
    newlyUploaded.value = new Set()
    if (props.isEdit && props.dish) {
      // Edit mode: populate form from dish data
      const row = props.dish
      form.name = row.name || ''
      form.name_pt = row.name_pt || ''
      form.name_en = row.name_en || ''
      form.category = row.category ? row.category.split(',') : []
      form.price = row.price || 0
      form.remark = row.remark || ''
      form.remark_pt = row.remark_pt || ''
      form.remark_en = row.remark_en || ''
      form.status = row.status || 'active'
      form.image = row.image || ''
      imageList.value = parseImages(row)
      resetFlavorState()
      await loadFlavorTemplates()
      await loadDishFlavors(row.id)
    } else {
      // Add mode: reset everything
      form.name = ''; form.name_pt = ''; form.name_en = ''
      form.category = []; form.price = 0
      form.remark = ''; form.remark_pt = ''; form.remark_en = ''
      form.status = 'active'; form.image = ''
      imageList.value = []
      resetFlavorState()
      await loadFlavorTemplates()
      await nextTick()
      formRef.value?.resetFields()
    }
  }
})

async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const data = {
      name: form.name, name_pt: form.name_pt, name_en: form.name_en,
      category: Array.isArray(form.category) ? form.category.join(',') : form.category,
      price: form.price,
      remark: form.remark, remark_pt: form.remark_pt, remark_en: form.remark_en,
      status: form.status,
      image: imageList.value[0] || '',
      images: JSON.stringify(imageList.value),
    }
    let dishId
    if (props.isEdit && props.dish) {
      dishId = props.dish.id
      await api.updateDish(dishId, data)
      ElMessage.success(t('menu.editSuccess'))
    } else {
      const res = await api.addDish(data)
      dishId = res?.id || res
      ElMessage.success(t('menu.addSuccess'))
    }
    if (dishId) {
      await api.setDishFlavors(dishId, getEnabledFlavors())
    }
    emit('update:visible', false)
    emit('saved')
  } catch (e) {
    ElMessage.error(e.message)
  }
  saving.value = false
}
</script>

<style scoped>
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

.dish-form :deep(.el-form-item) {
  margin-bottom: 14px !important;
}

.dish-form :deep(.el-form-item__content) {
  min-width: 0 !important;
}

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
  .dish-edit-dialog :deep(.el-dialog) {
    width: 95% !important;
    margin: 20px auto !important;
  }

  .dish-form {
    padding: 12px 14px 4px !important;
  }

  .dish-edit-dialog :deep(.el-dialog__body) {
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
