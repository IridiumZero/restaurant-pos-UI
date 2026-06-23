<template>
  <div class="pending-orders">
    <div class="page-header">
      <h2>{{ t('admin.pendingTitle') }}</h2>
      <div class="header-right">
        <el-select v-model="waiterFilter" :placeholder="t('admin.filterByWaiter')" clearable size="small" style="width:140px">
          <el-option v-for="w in waiterList" :key="w.id" :label="w.name" :value="w.id" />
        </el-select>
        <el-button :icon="RefreshRight" @click="loadOrders" :loading="loading" size="small">{{ t('common.refresh') }}</el-button>
      </div>
    </div>
    <div class="order-list" v-loading="loading">
      <div v-for="order in filteredOrders" :key="order.id" class="order-card">
        <div class="order-main">
          <div class="order-left">
            <span class="order-no">#{{ order.id }}</span>
            <el-tag :type="order.status === 'cancelled' ? 'danger' : 'warning'" size="small">{{ order.table_number }} {{ t('order.table') }}</el-tag>
            <span class="order-waiter-name">{{ order.waiter_name || '—' }}</span>
            <el-tag v-if="order.status === 'cancelled'" type="danger" size="small" effect="dark">{{ t('admin.cancelSuccess') }}</el-tag>
          </div>
          <div class="order-mid">
            <div class="order-items">
              <span v-for="(item, idx) in (order.items || [])" :key="idx"
                :class="['item-tag', { 'item-cancelled': item.item_status === 'cancelled' }]">
                {{ getItemName(item) }}×{{ item.quantity }}
                <span v-if="item.item_status === 'cancelled'" class="cancel-badge">{{ t('kitchen.cancelled') }}</span>
              </span>
            </div>
            <span class="order-time">{{ formatTime(order.created_at) }}</span>
          </div>
          <div class="order-right">
            <span class="order-total">{{ formatCurrency(order.total_amount) }}</span>
            <template v-if="order.status === 'cancelled'">
              <el-button type="warning" size="small" @click="handleReopen(order)">{{ t('admin.reopenOrder') }}</el-button>
            </template>
            <template v-else>
              <el-button type="primary" @click="showCheckout(order)">{{ t('admin.checkout') }}</el-button>
              <div class="action-row">
                <el-button size="small" @click="showAddItems(order)">{{ t('kitchen.addItems') }}</el-button>
                <el-button size="small" @click="showCancelItem(order)">{{ t('kitchen.cancelItem') }}</el-button>
                <el-button size="small" @click="handleReprint(order)" :loading="reprinting === order.id">{{ t('kitchen.reprint') }}</el-button>
                <el-button type="danger" size="small" plain @click="handleCancel(order)">{{ t('admin.cancelOrder') }}</el-button>
              </div>
            </template>
            <el-button v-if="isAdmin" type="danger" size="small" :icon="Delete" circle @click="handleDelete(order)" class="delete-order-btn" />
          </div>
        </div>
      </div>
      <div v-if="!loading && !filteredOrders.length" class="empty-hint">
        <el-empty :description="t('admin.pendingEmpty')" :image-size="80" />
      </div>

    </div>

    <!-- 结账对话框 -->
    <el-dialog v-model="checkoutVisible" :title="t('admin.checkoutTitle')" width="420px" :close-on-click-modal="false">
      <div class="checkout-body" v-if="currentOrder">
        <div class="checkout-summary">
          <div><span>#{{ currentOrder.id }} | {{ currentOrder.table_number }}{{ t('order.table') }} | {{ currentOrder.waiter_name }}</span></div>
          <span class="checkout-total">{{ formatCurrency(currentOrder.total_amount) }}</span>
        </div>
        <el-divider />
        <el-radio-group v-model="paymentMethod" size="large">
          <el-radio value="cash">{{ t('admin.cash') }}</el-radio>
          <el-radio value="pos">{{ t('admin.pos') }}</el-radio>
        </el-radio-group>
        <template v-if="paymentMethod === 'cash'">
          <div class="cash-row"><span>{{ t('admin.cashReceived') }}:</span><el-input-number v-model="cashReceived" :min="0" :precision="2" :step="50" style="width:200px" /></div>
          <div class="quick-btns">
            <el-button size="small" @click="cashReceived = Math.ceil(currentOrder.total_amount / 50) * 50">{{ t('admin.quickRoundUp') }}</el-button>
            <el-button size="small" @click="cashReceived = currentOrder.total_amount + 50">+50</el-button>
            <el-button size="small" @click="cashReceived = currentOrder.total_amount + 100">+100</el-button>
            <el-button size="small" @click="cashReceived = currentOrder.total_amount + 200">+200</el-button>
          </div>
          <div v-if="cashReceived >= currentOrder.total_amount" class="change-info">
            {{ t('admin.change') }}: <span class="change-amount">{{ formatCurrency(cashReceived - currentOrder.total_amount) }}</span>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="checkoutVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCheckout" :loading="paying" :disabled="!canPay">{{ t('admin.confirmCheckout') }}</el-button>
      </template>
    </el-dialog>

    <!-- 加菜对话框 -->
    <el-dialog v-model="addItemsVisible" :title="t('kitchen.addItemsTitle')" width="560px" :close-on-click-modal="false">
      <div class="add-items-body" v-if="addItemsOrder">
        <div class="add-items-summary">
          <span>#{{ addItemsOrder.id }} | {{ addItemsOrder.table_number }}{{ t('order.table') }}</span>
        </div>
        <el-divider />
        <div class="dish-search">
          <el-input v-model="dishSearch" :placeholder="t('common.search')" clearable size="small" />
        </div>
        <div class="dish-grid">
          <div v-for="dish in filteredDishes" :key="dish.id"
            :class="['dish-card', { selected: addCart[dish.id] }]"
            @click="toggleAddDish(dish)">
            <span class="dish-card-name">{{ getDishName(dish) }}</span>
            <span class="dish-card-price">{{ dish.price }} MT</span>
            <div v-if="addCart[dish.id]" class="dish-card-qty">
              <el-button size="small" circle @click.stop="decAddQty(dish.id)">-</el-button>
              <span>{{ addCart[dish.id].qty }}</span>
              <el-button size="small" circle @click.stop="incAddQty(dish.id)">+</el-button>
            </div>
          </div>
        </div>
        <div v-if="addCartCount > 0" class="add-cart-summary">
          <span>{{ t('kitchen.addToOrder') }}: {{ addCartCount }} {{ t('order.cartItem') }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="addItemsVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddItems" :loading="addingItems" :disabled="addCartCount === 0">{{ t('kitchen.confirmAddItems') }}</el-button>
      </template>
    </el-dialog>

    <!-- 退菜对话框 -->
    <el-dialog v-model="cancelItemVisible" :title="t('kitchen.cancelItemTitle')" width="480px" :close-on-click-modal="false">
      <div class="cancel-item-body" v-if="cancelItemOrder">
        <div class="cancel-item-summary">
          <span>#{{ cancelItemOrder.id }} | {{ cancelItemOrder.table_number }}{{ t('order.table') }}</span>
        </div>
        <el-divider />
        <div class="cancel-item-list">
          <div v-for="item in cancelableItems" :key="item.id" class="cancel-item-row">
            <div class="cancel-item-info">
              <span class="cancel-item-name">{{ getItemName(item) }}</span>
              <span class="cancel-item-qty">×{{ item.quantity }}</span>
            </div>
            <div class="cancel-item-actions">
              <el-input-number v-model="cancelQtyMap[item.id]" :min="0" :max="item.quantity" size="small" style="width:120px" />
              <el-button size="small" type="danger" plain @click="handleCancelItem(item)" :disabled="!cancelQtyMap[item.id]">{{ t('kitchen.cancelItem') }}</el-button>
            </div>
          </div>
          <div v-if="!cancelableItems.length" class="empty-hint">
            <el-empty :description="t('common.noData')" :image-size="40" />
          </div>
        </div>
        <el-input v-model="cancelReason" :placeholder="t('kitchen.cancelReasonPlaceholder')" size="small" style="margin-top:12px" />
      </div>
      <template #footer>
        <el-button @click="cancelItemVisible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight, Delete } from '@element-plus/icons-vue'
import { useI18n, getDishName } from '../i18n'

function getDishNameLocal(dish) {
  return getDishName(dish)
}
import { api } from '../api'
import { useWebSocket } from '../ws'

// 在控制台打印厨打单内容（方便调试）
function logKitchenTicket(result, label) {
  const ticket = result?.kitchen_print?.ticket_text
  if (ticket) {
    console.log(`\n%c🧾 ${label} — Kitchen Ticket`, 'color:#667eea;font-weight:bold;font-size:13px')
    console.log(ticket.replace(/\r\n/g, '\n'))
  }
}

// 在控制台打印结账小票内容（方便调试）
function logReceipt(result, label) {
  const ticket = result?.print?.ticket_text || result?.ticket_text
  if (ticket) {
    console.log(`\n%c🧾 ${label} — Receipt`, 'color:#E6A23C;font-weight:bold;font-size:13px')
    console.log(ticket.replace(/\r\n/g, '\n'))
  }
}

const { t, formatCurrency, locale } = useI18n()

const isAdmin = computed(() => {
  try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'admin' } catch { return false }
})

const loading = ref(false), paying = ref(false)
const allOrders = ref([]), waiterList = ref([]), waiterFilter = ref(null), dishMap = ref({})
const checkoutVisible = ref(false), currentOrder = ref(null)
const paymentMethod = ref('cash'), cashReceived = ref(0)

// ── Add Items state ────────────────
const addItemsVisible = ref(false), addItemsOrder = ref(null)
const addCart = ref({}), dishSearch = ref(''), addingItems = ref(false)
const allDishes = ref([])

// ── Cancel Item state ──────────────
const cancelItemVisible = ref(false), cancelItemOrder = ref(null)
const cancelQtyMap = ref({}), cancelReason = ref('')
const reprinting = ref(null)

watch([waiterFilter], () => {
  loadOrders()
})

const filteredOrders = computed(() => {
  return allOrders.value.filter(o => o.status === 'pending' || o.status === 'cancelled')
})

const canPay = computed(() => paymentMethod.value === 'pos' || cashReceived.value >= (currentOrder.value?.total_amount || 0))

const filteredDishes = computed(() => {
  let list = allDishes.value.filter(d => d.status === 'active')
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

const cancelableItems = computed(() => {
  if (!cancelItemOrder.value) return []
  return (cancelItemOrder.value.items || []).filter(i => i.item_status !== 'cancelled')
})

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getItemName(item) {
  const d = dishMap.value[item.dish_id]
  return d ? getDishName(d) : item.dish_name
}

async function loadDishes() {
  try {
    const list = await api.getDishes()
    dishMap.value = {}
    allDishes.value = list
    list.forEach(d => { dishMap.value[d.id] = d })
  } catch {}
}

async function loadOrders() {
  loading.value = true
  try {
    const params = { pageSize: 9999 }
    if (waiterFilter.value) params.waiter_id = waiterFilter.value
    const [res, waiters] = await Promise.all([api.getOrders(params), api.getWaiters(), loadDishes()])
    allOrders.value = res.orders || res
    waiterList.value = waiters
  } catch (e) { console.error('加载订单失败:', e) }
  finally { loading.value = false }
}

function showCheckout(order) {
  currentOrder.value = order
  paymentMethod.value = 'cash'
  cashReceived.value = 0
  checkoutVisible.value = true
}

async function handleCancel(order) {
  try {
    await ElMessageBox.confirm(t('admin.cancelOrderConfirm'), t('common.confirm'), {
      confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning'
    })
    await api.cancelOrder(order.id)
    ElMessage.success(t('admin.cancelSuccess'))
    await loadOrders()
  } catch {}
}

async function handleDelete(order) {
  try {
    await ElMessageBox.confirm(t('admin.deleteOrderConfirm'), t('admin.deleteOrder'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
    await api.deleteOrder(order.id)
    ElMessage.success(t('admin.deleteSuccess'))
    await loadOrders()
  } catch (e) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      console.error('删除订单失败:', e)
      if (e.message) ElMessage.error(e.message)
    }
  }
}

async function handleReopen(order) {
  try {
    await api.reopenOrder(order.id)
    ElMessage.success(t('admin.reopenSuccess'))
    await loadOrders()
  } catch (e) {
    ElMessage.error(e.message || t('common.loadError', { msg: '' }))
  }
}

async function handleCheckout() {
  paying.value = true
  try {
    const change = paymentMethod.value === 'cash' ? cashReceived.value - currentOrder.value.total_amount : null
    const result = await api.checkoutOrder(currentOrder.value.id, {
      paymentMethod: paymentMethod.value,
      cashReceived: paymentMethod.value === 'cash' ? cashReceived.value : null,
      change,
      lang: locale.value,
    })
    if (result.print && result.print.success) {
      logReceipt(result, 'Checkout')
      ElMessage.success(t('admin.checkoutSuccess') + ' — ' + t('admin.receiptPrinted'))
    } else {
      logReceipt(result, 'Checkout (print failed)')
      const errMsg = result.print?.error || 'Unknown error'
      console.error('Print failed:', errMsg)
      ElMessage.warning(t('admin.checkoutSuccess') + ' — ' + t('admin.printFailed', { error: errMsg }))
    }
    checkoutVisible.value = false
    await loadOrders()
  } catch (e) { ElMessage.error(e.message) }
  paying.value = false
}

// ── Kitchen: Add Items ───────────────

function showAddItems(order) {
  addItemsOrder.value = order
  addCart.value = {}
  dishSearch.value = ''
  addItemsVisible.value = true
}

function toggleAddDish(dish) {
  if (addCart.value[dish.id]) {
    delete addCart.value[dish.id]
  } else {
    addCart.value[dish.id] = { dish, qty: 1 }
  }
}

function incAddQty(dishId) {
  if (addCart.value[dishId]) addCart.value[dishId].qty++
}

function decAddQty(dishId) {
  if (addCart.value[dishId]) {
    addCart.value[dishId].qty--
    if (addCart.value[dishId].qty <= 0) delete addCart.value[dishId]
  }
}

async function handleAddItems() {
  if (!addItemsOrder.value) return
  addingItems.value = true
  try {
    const items = Object.values(addCart.value).map(c => ({
      dish_id: c.dish.id,
      name: getDishNameLocal(c.dish),
      price: c.dish.price,
      qty: c.qty,
    }))
    const result = await api.addItemsToOrder(addItemsOrder.value.id, items, locale.value)
    logKitchenTicket(result, 'Add Items')
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.addItemsSuccess') + ' — ' + t('kitchen.kitchenPrintOk'))
    } else {
      ElMessage.warning(t('kitchen.addItemsSuccess') + (result.kitchen_print?.error ? ' — ' + t('kitchen.kitchenPrintFail') : ''))
    }
    addItemsVisible.value = false
    await loadOrders()
  } catch (e) {
    ElMessage.error(e.message)
  }
  addingItems.value = false
}

// ── Kitchen: Cancel Item ─────────────

function showCancelItem(order) {
  cancelItemOrder.value = order
  cancelQtyMap.value = {}
  cancelReason.value = ''
  // Initialize cancel qty to 0 for each cancelable item
  for (const item of (order.items || [])) {
    if (item.item_status !== 'cancelled') {
      cancelQtyMap.value[item.id] = 0
    }
  }
  cancelItemVisible.value = true
}

async function handleCancelItem(item) {
  const qty = cancelQtyMap.value[item.id]
  if (!qty || qty <= 0) return
  try {
    const result = await api.cancelOrderItem(
      cancelItemOrder.value.id, item.id, qty, cancelReason.value, locale.value
    )
    logKitchenTicket(result, 'Cancel Item')
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.cancelItemSuccess') + ' — ' + t('kitchen.kitchenPrintOk'))
    } else {
      ElMessage.warning(t('kitchen.cancelItemSuccess') + (result.kitchen_print?.error ? ' — ' + t('kitchen.kitchenPrintFail') : ''))
    }
    cancelItemVisible.value = false
    await loadOrders()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

// ── Kitchen: Reprint ─────────────────

async function handleReprint(order) {
  reprinting.value = order.id
  try {
    const result = await api.kitchenReprint(order.id, locale.value)
    logKitchenTicket(result, 'Reprint')
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.reprintSuccess'))
    } else {
      ElMessage.warning(t('kitchen.kitchenPrintFail'))
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
  reprinting.value = null
}

// ── WebSocket 实时刷新 ────────────────
useWebSocket((msg) => {
  if (msg.type === 'reconnected' || msg.type?.startsWith('order_')) {
    loadOrders()
  }
})

onMounted(loadOrders)
</script>

<style scoped>
.pending-orders { 
  padding: 20px; 
  height: 100%; 
  display: flex; 
  flex-direction: column;
}

.page-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 20px; 
  flex-shrink: 0; 
  flex-wrap: wrap; 
  gap: 12px;
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

.header-right { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
}

.order-list { 
  flex: 1; 
  overflow-y: auto; 
  -webkit-overflow-scrolling: touch;
  padding: 4px;
}

.order-card { 
  padding: 18px 20px; 
  border: none;
  border-radius: 12px; 
  margin-bottom: 14px; 
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.order-card::before {
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

.order-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
}

.order-card:hover::before {
  opacity: 1;
}

.order-main { 
  display: flex; 
  align-items: center; 
  gap: 20px; 
}

.order-left { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  gap: 6px; 
  flex-shrink: 0;
  min-width: 80px;
}

.order-no { 
  font-weight: 700; 
  font-size: 18px; 
  color: #303133;
  letter-spacing: 0.5px;
}

.order-waiter-name { 
  font-size: 12px; 
  color: #909399;
  font-weight: 500;
}

.order-mid { 
  flex: 1; 
  min-width: 0;
}

.order-items { 
  display: flex; 
  flex-wrap: wrap; 
  gap: 6px; 
  margin-bottom: 8px; 
}

.item-tag { 
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  padding: 4px 12px; 
  border-radius: 6px; 
  font-size: 13px; 
  color: #606266;
  border: 1px solid rgba(102, 126, 234, 0.2);
  transition: all 0.2s ease;
}

.item-tag:hover {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
  transform: scale(1.05);
}

.order-time { 
  font-size: 13px; 
  color: #909399;
  font-family: 'Courier New', monospace;
}

.order-right { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  gap: 10px; 
  flex-shrink: 0;
  min-width: 140px;
}

.order-total { 
  font-size: 22px; 
  font-weight: 700; 
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.5px;
}

.empty-hint { 
  display: flex; 
  justify-content: center; 
  padding: 60px 0;
}

/* Checkout dialog styling */
.checkout-summary { 
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
  font-size: 15px;
  padding: 12px 0;
}

.checkout-total { 
  font-size: 28px; 
  font-weight: 700; 
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-top: 8px;
}

.cash-row { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  margin-top: 20px; 
  font-size: 15px;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  border-radius: 8px;
}

.quick-btns { 
  display: flex; 
  gap: 8px; 
  margin-top: 12px; 
  flex-wrap: wrap;
}

.quick-btns :deep(.el-button) {
  transition: all 0.3s ease;
}

.quick-btns :deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.change-info { 
  margin-top: 16px; 
  font-size: 16px; 
  color: #67c23a;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.1) 0%, rgba(103, 194, 58, 0.05) 100%);
  border-radius: 8px;
  border-left: 3px solid #67c23a;
}

.change-amount { 
  font-size: 24px; 
  font-weight: 700;
  color: #67c23a;
}

/* Responsive design */
@media (max-width: 768px) {
  .pending-orders {
    padding: 12px;
  }
  
  .page-header {
    padding: 12px 16px;
  }
  
  .page-header h2 {
    font-size: 18px;
  }
  
  .order-card {
    padding: 14px 16px;
  }
  
  .order-main {
    gap: 12px;
  }
  
  .order-total {
    font-size: 18px;
  }
}

/* Scrollbar styling */
.order-list::-webkit-scrollbar {
  width: 6px;
}

.order-list::-webkit-scrollbar-track {
  background: transparent;
}

.order-list::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.order-list::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}

.delete-order-btn {
  margin-left: 8px !important;
}

/* Action row for kitchen buttons */
.action-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

/* Cancelled item styling */
.item-cancelled {
  opacity: 0.45;
  text-decoration: line-through;
  background: rgba(245, 108, 108, 0.08) !important;
  border-color: rgba(245, 108, 108, 0.2) !important;
}

.cancel-badge {
  font-size: 10px;
  color: #f56c6c;
  margin-left: 4px;
  font-weight: 600;
}

/* Add items dialog */
.add-items-body {
  max-height: 480px;
  overflow-y: auto;
}

.add-items-summary {
  font-size: 15px;
  color: #606266;
  padding: 8px 0;
}

.dish-search {
  margin-bottom: 12px;
}

.dish-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}

.dish-card {
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.dish-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.dish-card.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
}

.dish-card-name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  line-height: 1.3;
}

.dish-card-price {
  font-size: 12px;
  color: #909399;
}

.dish-card-qty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.dish-card-qty span {
  font-weight: 600;
  font-size: 15px;
  color: #667eea;
  min-width: 20px;
  text-align: center;
}

.add-cart-summary {
  margin-top: 12px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
  border-radius: 8px;
  font-size: 14px;
  color: #667eea;
  font-weight: 500;
}

/* Cancel item dialog */
.cancel-item-body {
  max-height: 420px;
  overflow-y: auto;
}

.cancel-item-summary {
  font-size: 15px;
  color: #606266;
  padding: 8px 0;
}

.cancel-item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cancel-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  transition: all 0.2s;
}

.cancel-item-row:hover {
  border-color: #c0c4cc;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.cancel-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cancel-item-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.cancel-item-qty {
  font-size: 13px;
  color: #909399;
}

.cancel-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>