<template>
  <el-dialog :model-value="visible" @update:model-value="$emit('update:visible', $event)"
    :title="order ? `#${order.id} | ${order.table_number}${t('order.table')}` : ''"
    width="600px" :close-on-click-modal="true" class="order-detail-dialog">
    <div class="order-detail-body" v-if="order">
      <!-- 菜品列表 -->
      <div class="detail-items">
        <div v-for="item in order.items" :key="item.id"
          :class="['detail-item-row', { 'detail-item-cancelled': item.item_status === 'cancelled' }]">
          <div class="detail-item-info">
            <span class="detail-item-name">{{ getItemName(item) }}</span>
            <span class="detail-item-price">{{ item.dish_price }} MT × {{ item.quantity }}</span>
          </div>
          <div class="detail-item-actions" v-if="item.item_status !== 'cancelled'">
            <el-input-number v-model="cancelQty[item.id]" :min="0" :max="item.quantity" size="small" style="width:100px" />
            <el-button size="small" type="danger" plain :disabled="!cancelQty[item.id]"
              @click="handleCancelItem(item)">{{ t('kitchen.cancelItem') }}</el-button>
          </div>
          <el-tag v-else size="small" type="danger" effect="dark">{{ t('kitchen.cancelled') }}</el-tag>
        </div>
      </div>
      <div class="detail-total">
        <span>{{ t('order.totalAmount') }}</span>
        <span class="detail-total-amount">{{ formatCurrency(order.total_amount) }}</span>
      </div>

      <!-- 退菜原因 -->
      <el-input v-model="cancelReason" :placeholder="t('kitchen.cancelReasonPlaceholder')" size="small" style="margin-top:12px" />

      <!-- 加菜面板（折叠） -->
      <el-divider />
      <div class="add-panel-header" @click="showAddPanel = !showAddPanel">
        <span>{{ t('kitchen.addItems') }}</span>
        <el-icon :style="{ transform: showAddPanel ? 'rotate(180deg)' : '' }"><ArrowRight /></el-icon>
      </div>
      <div v-if="showAddPanel" class="add-panel">
        <el-input v-model="dishSearch" :placeholder="t('common.search')" clearable size="small" style="margin-bottom:10px" />
        <div class="add-dish-grid">
          <div v-for="dish in filteredDishes" :key="dish.id"
            :class="['add-dish-card', { selected: addCart[dish.id] }]"
            @click="toggleAddDish(dish)">
            <span class="add-dish-name">{{ getDishName(dish) }}</span>
            <span class="add-dish-price">{{ dish.price }} MT</span>
            <div v-if="addCart[dish.id]" class="add-dish-qty" @click.stop>
              <el-button size="small" circle @click.stop="decQty(dish.id)">-</el-button>
              <span>{{ addCart[dish.id].qty }}</span>
              <el-button size="small" circle @click.stop="incQty(dish.id)">+</el-button>
            </div>
          </div>
        </div>
        <div v-if="addCartCount > 0" style="margin-top:12px">
          <el-button type="primary" @click="handleAddItems" :loading="adding" style="width:100%">
            {{ t('kitchen.confirmAddItems') }} ({{ addCartCount }}{{ t('order.cartItem') }})
          </el-button>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="handleReprint" :loading="reprinting" size="small">{{ t('kitchen.reprint') }}</el-button>
      <el-button @click="$emit('update:visible', false)">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { useI18n, getDishName } from '../i18n'

const props = defineProps({
  visible: Boolean,
  order: Object,
  dishes: { type: Array, default: () => [] },
  locale: { type: String, default: 'zh' },
})

const emit = defineEmits(['update:visible', 'cancel-item', 'add-items', 'reprint'])

const { t, formatCurrency } = useI18n()

// Internal state
const cancelQty = ref({})
const cancelReason = ref('')
const showAddPanel = ref(false)
const addCart = ref({})
const dishSearch = ref('')
const adding = ref(false)
const reprinting = ref(false)

// Reset state when dialog opens
watch(() => props.visible, (v) => {
  if (v && props.order) {
    cancelQty.value = {}
    cancelReason.value = ''
    showAddPanel.value = false
    addCart.value = {}
    dishSearch.value = ''
    adding.value = false
    reprinting.value = false
    for (const item of (props.order.items || [])) {
      if (item.item_status !== 'cancelled') {
        cancelQty.value[item.id] = 0
      }
    }
  }
})

function getItemName(item) {
  if (!item) return ''
  if (props.locale === 'pt' && item.dish_name_pt) return item.dish_name_pt
  if (props.locale === 'en' && item.dish_name_en) return item.dish_name_en
  const d = props.dishes.find(dd => dd.id === item.dish_id)
  if (d) return getDishName(d)
  return item.dish_name || ''
}

const filteredDishes = computed(() => {
  let list = props.dishes.filter(d => d.status === 'active')
  if (dishSearch.value) {
    const q = dishSearch.value.toLowerCase()
    list = list.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.name_pt || '').toLowerCase().includes(q) ||
      (d.name_en || '').toLowerCase().includes(q)
    )
  }
  return list
})

const addCartCount = computed(() => Object.values(addCart.value).reduce((s, i) => s + i.qty, 0))

function toggleAddDish(dish) {
  if (addCart.value[dish.id]) {
    delete addCart.value[dish.id]
  } else {
    addCart.value[dish.id] = { dish, qty: 1 }
  }
}

function incQty(dishId) {
  if (addCart.value[dishId]) addCart.value[dishId].qty++
}

function decQty(dishId) {
  if (addCart.value[dishId]) {
    addCart.value[dishId].qty--
    if (addCart.value[dishId].qty <= 0) delete addCart.value[dishId]
  }
}

function handleCancelItem(item) {
  const qty = cancelQty.value[item.id]
  if (!qty || qty <= 0) return
  emit('cancel-item', { item, qty, reason: cancelReason.value })
  cancelReason.value = ''
}

function handleAddItems() {
  const items = Object.values(addCart.value).map(c => ({
    dish_id: c.dish.id,
    name: getDishName(c.dish),
    price: c.dish.price,
    qty: c.qty,
  }))
  emit('add-items', items)
  addCart.value = {}
}

function handleReprint() {
  reprinting.value = true
  emit('reprint')
}

// Expose reprinting state for parent to reset
defineExpose({ reprinting })
</script>

<style scoped>
.order-detail-dialog :deep(.el-dialog) {
  border-radius: 14px !important;
}

.order-detail-body {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  transition: all 0.2s;
}

.detail-item-row:hover {
  border-color: #c0c4cc;
}

.detail-item-cancelled {
  opacity: 0.45;
  text-decoration: line-through;
  background: rgba(245, 108, 108, 0.06);
}

.detail-item-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.detail-item-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.detail-item-price {
  font-size: 13px;
  color: #909399;
  white-space: nowrap;
}

.detail-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.detail-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 14px 0;
  font-size: 15px;
  font-weight: 500;
  color: #606266;
}

.detail-total-amount {
  font-size: 22px;
  font-weight: 700;
  color: #f56c6c;
}

/* Add panel (collapsible) */
.add-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: #667eea;
  user-select: none;
}

.add-panel-header:hover {
  color: #764ba2;
}

.add-panel {
  padding: 8px 0;
}

.add-dish-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.add-dish-card {
  padding: 8px 10px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-dish-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.12);
}

.add-dish-card.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.06);
}

.add-dish-name {
  font-size: 12px;
  font-weight: 500;
  color: #303133;
  line-height: 1.3;
}

.add-dish-price {
  font-size: 11px;
  color: #909399;
}

.add-dish-qty {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.add-dish-qty span {
  font-weight: 600;
  font-size: 14px;
  color: #667eea;
  min-width: 16px;
  text-align: center;
}
</style>
