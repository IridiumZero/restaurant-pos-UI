<template>
  <el-dialog :model-value="visible" @update:model-value="$emit('update:visible', $event)"
    :title="dish ? getDishName(dish) : ''" width="480px"
    :close-on-click-modal="true" class="dish-detail-dialog" destroy-on-close>
    <div v-if="dish" class="dish-detail-body" v-loading="flavorsLoading">
      <!-- 菜品图片轮播 -->
      <div v-if="dishImages.length" class="dish-detail-image">
        <el-carousel v-if="dishImages.length > 1" height="220px" indicator-position="outside" class="dish-detail-carousel">
          <el-carousel-item v-for="(img, idx) in dishImages" :key="idx">
            <el-image :src="imageUrl(img)" fit="cover" class="dish-detail-img" />
          </el-carousel-item>
        </el-carousel>
        <el-image v-else :src="imageUrl(dishImages[0])" fit="cover" class="dish-detail-img" />
      </div>
      <h3 class="dish-detail-name">{{ getDishName(dish) }}</h3>
      <p v-if="getDishRemark(dish)" class="dish-detail-remark">{{ getDishRemark(dish) }}</p>
      <div class="dish-detail-price">{{ formatCurrency(dish.price) }}</div>

      <!-- 口味选择 -->
      <div v-if="flavors.length" class="dish-detail-flavors">
        <div v-for="flavor in flavors" :key="flavor.flavor_id" class="flavor-group">
          <div class="flavor-label">
            {{ getFlavorName(flavor) }}
            <span v-if="flavor.required" class="flavor-required">{{ t('menu.flavorRequired') }}</span>
          </div>
          <el-radio-group v-model="selectedFlavors[flavor.flavor_id]" class="flavor-options" size="small">
            <el-radio-button v-for="opt in flavor.options" :key="opt" :value="opt" class="flavor-btn">
              {{ localizeOption(opt) }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 数量选择 -->
      <div class="dish-detail-qty-row">
        <span class="dish-detail-qty-label">{{ t('order.qty', '数量') }}</span>
        <div class="dish-detail-qty-controls">
          <el-button circle :icon="Minus" size="small" @click="detailQty > 1 && detailQty--" :disabled="detailQty <= 1" />
          <span class="dish-detail-qty-value">{{ detailQty }}</span>
          <el-button circle :icon="Plus" size="small" @click="detailQty++" />
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmAdd" :loading="flavorsLoading">
        {{ t('order.addToCart', '加入购物车') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Minus, Plus } from '@element-plus/icons-vue'
import { useI18n, getDishName, getDishRemark, getFlavorName, localizeOption } from '../i18n'

const props = defineProps({
  visible: Boolean,
  dish: Object,
  flavors: { type: Array, default: () => [] },
  flavorsLoading: Boolean,
  serverUrl: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'add-to-cart'])

const { t, formatCurrency } = useI18n()

const selectedFlavors = ref({})
const detailQty = ref(1)

// Reset internal state when dialog opens with a new dish
watch(() => props.visible, (v) => {
  if (v && props.dish) {
    const init = {}
    props.flavors.forEach(f => { init[f.flavor_id] = '' })
    selectedFlavors.value = init
    detailQty.value = 1
  }
})

const dishImages = computed(() => {
  const dish = props.dish
  if (!dish) return []
  if (dish.images) {
    try {
      const arr = typeof dish.images === 'string' ? JSON.parse(dish.images) : dish.images
      if (Array.isArray(arr) && arr.length) return arr
    } catch {}
  }
  return dish.image ? [dish.image] : []
})

function imageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return (props.serverUrl || '') + path
}

function confirmAdd() {
  if (!props.dish) return
  for (const flavor of props.flavors) {
    if (flavor.required && !selectedFlavors.value[flavor.flavor_id]) {
      ElMessage.warning((t('order.flavorRequired', '请选择') + ' ' + getFlavorName(flavor)))
      return
    }
  }
  const flavors = props.flavors
    .filter(f => selectedFlavors.value[f.flavor_id])
    .map(f => ({ name: f.name, name_pt: f.name_pt || '', name_en: f.name_en || '', value: selectedFlavors.value[f.flavor_id] }))
  emit('add-to-cart', { dish: props.dish, flavors, qty: detailQty.value })
  emit('update:visible', false)
}
</script>

<style scoped>
.dish-detail-dialog :deep(.el-dialog) {
  border-radius: 16px !important;
  overflow: hidden;
}

.dish-detail-body {
  padding: 4px 0;
}

.dish-detail-image {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.dish-detail-carousel {
  border-radius: 12px;
  overflow: hidden;
}

.dish-detail-carousel :deep(.el-carousel__indicators--outside) {
  position: relative;
  margin-top: -24px;
}

.dish-detail-carousel :deep(.el-carousel__indicator .el-carousel__button) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
}

.dish-detail-carousel :deep(.el-carousel__indicator.is-active .el-carousel__button) {
  background: #667eea;
}

.dish-detail-img {
  width: 100%;
  height: 220px;
  display: block;
}

.dish-detail-img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dish-detail-name {
  font-size: 20px;
  font-weight: 700;
  color: #2d3748;
  margin: 0 0 6px 0;
}

.dish-detail-remark {
  font-size: 14px;
  color: #718096;
  margin: 0 0 10px 0;
  line-height: 1.5;
}

.dish-detail-price {
  font-size: 22px;
  font-weight: 800;
  color: #f56c6c;
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.1) 0%, rgba(255, 107, 43, 0.1) 100%);
  padding: 6px 16px;
  border-radius: 10px;
  display: inline-block;
  margin-bottom: 18px;
}

.dish-detail-flavors {
  margin-bottom: 18px;
}

.flavor-group {
  margin-bottom: 12px;
}

.flavor-group:last-child {
  margin-bottom: 0;
}

.flavor-label {
  font-size: 13px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.flavor-required {
  font-size: 11px;
  font-weight: 600;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(245, 108, 108, 0.3);
}

.flavor-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flavor-btn {
  margin-right: 0 !important;
}

.flavor-btn :deep(.el-radio-button__inner) {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 6px !important;
  border: 1px solid #dcdfe6 !important;
  box-shadow: none !important;
  color: #606266;
  background: #f5f7fa;
}

.flavor-btn:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border-color: #667eea !important;
}

.dish-detail-qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 4px;
  border-top: 1px solid rgba(102, 126, 234, 0.1);
}

.dish-detail-qty-label {
  font-size: 15px;
  font-weight: 600;
  color: #2d3748;
}

.dish-detail-qty-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dish-detail-qty-value {
  font-size: 18px;
  font-weight: 700;
  color: #667eea;
  min-width: 28px;
  text-align: center;
}

.dish-detail-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px 20px;
}

.dish-detail-dialog :deep(.el-button--primary) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  border-radius: 10px !important;
  font-weight: 600 !important;
  flex: 1;
  transition: all 0.3s ease !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
}

.dish-detail-dialog :deep(.el-button--primary:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4) !important;
}

@media (max-width: 600px) {
  .dish-detail-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 480px !important;
  }

  .dish-detail-img {
    height: 160px;
  }

  .dish-detail-name {
    font-size: 18px;
  }

  .dish-detail-price {
    font-size: 18px;
  }
}
</style>
