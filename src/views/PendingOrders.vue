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
              <span v-for="(item, idx) in (order.items || [])" :key="idx" class="item-tag">{{ getItemName(item) }}×{{ item.quantity }}</span>
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
              <el-button type="danger" size="small" plain @click="handleCancel(order)">{{ t('admin.cancelOrder') }}</el-button>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight, Delete } from '@element-plus/icons-vue'
import { useI18n, getDishName } from '../i18n'
import { api } from '../api'

const { t, formatCurrency, locale } = useI18n()

const isAdmin = computed(() => {
  try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'admin' } catch { return false }
})

const loading = ref(false), paying = ref(false)
const allOrders = ref([]), waiterList = ref([]), waiterFilter = ref(null), dishMap = ref({})
const checkoutVisible = ref(false), currentOrder = ref(null)
const paymentMethod = ref('cash'), cashReceived = ref(0)

const filteredOrders = computed(() => {
  let r = allOrders.value.filter(o => o.status === 'pending' || o.status === 'cancelled')
  if (waiterFilter.value) r = r.filter(o => o.waiter_id === waiterFilter.value)
  return r
})

const canPay = computed(() => paymentMethod.value === 'pos' || cashReceived.value >= (currentOrder.value?.total_amount || 0))

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
    list.forEach(d => { dishMap.value[d.id] = d })
  } catch {}
}

async function loadOrders() {
  loading.value = true
  try {
    const [orders, waiters] = await Promise.all([api.getOrders(), api.getWaiters(), loadDishes()])
    allOrders.value = orders
    waiterList.value = waiters
  } catch (e) { ElMessage.error(t('common.loadError', { msg: e.message })) }
  loading.value = false
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
      ElMessage.success(t('admin.checkoutSuccess') + ' — ' + t('admin.receiptPrinted'))
    } else {
      const errMsg = result.print?.error || 'Unknown error'
      console.error('Print failed:', errMsg)
      ElMessage.warning(t('admin.checkoutSuccess') + ' — ' + t('admin.printFailed', { error: errMsg }))
    }
    checkoutVisible.value = false
    await loadOrders()
  } catch (e) { ElMessage.error(e.message) }
  paying.value = false
}

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
</style>
