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
            <el-tag type="warning" size="small">{{ order.table_number }} {{ t('order.table') }}</el-tag>
            <span class="order-waiter-name">{{ order.waiter_name || '—' }}</span>
          </div>
          <div class="order-mid">
            <div class="order-items">
              <span v-for="(item, idx) in (order.items || [])" :key="idx" class="item-tag">{{ item.dish_name }}×{{ item.quantity }}</span>
            </div>
            <span class="order-time">{{ formatTime(order.created_at) }}</span>
          </div>
          <div class="order-right">
            <span class="order-total">{{ formatCurrency(order.total_amount) }}</span>
            <el-button type="primary" @click="showCheckout(order)">{{ t('admin.checkout') }}</el-button>
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
          <el-radio value="现金">{{ t('admin.cash') }}</el-radio>
          <el-radio value="POS机">{{ t('admin.pos') }}</el-radio>
        </el-radio-group>
        <template v-if="paymentMethod === '现金'">
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
import { ElMessage } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import { useI18n } from '../i18n'
import { api } from '../api'

const { t, formatCurrency } = useI18n()

const loading = ref(false), paying = ref(false)
const allOrders = ref([]), waiterList = ref([]), waiterFilter = ref(null)
const checkoutVisible = ref(false), currentOrder = ref(null)
const paymentMethod = ref('现金'), cashReceived = ref(0)

const filteredOrders = computed(() => {
  let r = allOrders.value.filter(o => o.status === 'pending')
  if (waiterFilter.value) r = r.filter(o => o.waiter_id === waiterFilter.value)
  return r
})

const canPay = computed(() => paymentMethod.value === 'POS机' || cashReceived.value >= (currentOrder.value?.total_amount || 0))

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadOrders() {
  loading.value = true
  try {
    allOrders.value = await api.getOrders()
    waiterList.value = await api.getWaiters()
  } catch (e) { ElMessage.error('Failed to load: ' + e.message) }
  loading.value = false
}

function showCheckout(order) {
  currentOrder.value = order
  paymentMethod.value = '现金'
  cashReceived.value = 0
  checkoutVisible.value = true
}

async function handleCheckout() {
  paying.value = true
  try {
    const change = paymentMethod.value === '现金' ? cashReceived.value - currentOrder.value.total_amount : null
    await api.checkoutOrder(currentOrder.value.id, {
      paymentMethod: paymentMethod.value,
      cashReceived: paymentMethod.value === '现金' ? cashReceived.value : null,
      change,
    })
    printReceipt(currentOrder.value)
    ElMessage.success(t('admin.checkoutSuccess'))
    checkoutVisible.value = false
    await loadOrders()
  } catch (e) { ElMessage.error(e.message) }
  paying.value = false
}

function printReceipt(order) {
  const pad = n => String(n).padStart(2, '0')
  const d = new Date()
  const time = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const lines = [
    t('receipt.header'),
    `${t('receipt.orderNo')}: #${order.id}`,
    `${t('receipt.table')}: ${order.table_number}`,
    `${t('receipt.waiter')}: ${order.waiter_name || '—'}`,
    `${t('receipt.time')}: ${time}`,
    `${t('receipt.payment')}: ${paymentMethod.value}`,
    t('receipt.separator'),
    ...(order.items || []).map(i => `  ${i.dish_name} ×${i.quantity}  ${formatCurrency(i.dish_price * i.quantity)}`),
    t('receipt.separator'),
    `${t('receipt.total')}: ${formatCurrency(order.total_amount)}`,
  ]
  if (paymentMethod.value === '现金') {
    lines.push(`${t('receipt.received')}: ${formatCurrency(cashReceived.value)}`)
    lines.push(`${t('receipt.change')}: ${formatCurrency(cashReceived.value - order.total_amount)}`)
  }
  lines.push(t('receipt.footer'), t('receipt.thankYou'))
  console.log(lines.join('\n'))
  ElMessage.success(t('admin.receiptPrinted'))
}

onMounted(loadOrders)
</script>

<style scoped>
.pending-orders { padding:16px; height:100%; display:flex; flex-direction:column; }
.page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-shrink:0; flex-wrap:wrap; gap:8px; }
.page-header h2 { margin:0; font-size:18px; }
.header-right { display:flex; align-items:center; gap:8px; }
.order-list { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.order-card { padding:14px; border:1px solid #ebeef5; border-radius:8px; margin-bottom:10px; background:#fff; }
.order-main { display:flex; align-items:center; gap:16px; }
.order-left { display:flex; flex-direction:column; align-items:center; gap:4px; flex-shrink:0; }
.order-no { font-weight:700; font-size:15px; color:#303133; }
.order-waiter-name { font-size:11px; color:#909399; }
.order-mid { flex:1; min-width:0; }
.order-items { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }
.item-tag { background:#f0f2f5; padding:2px 8px; border-radius:4px; font-size:12px; color:#606266; }
.order-time { font-size:12px; color:#909399; }
.order-right { display:flex; flex-direction:column; align-items:center; gap:8px; flex-shrink:0; }
.order-total { font-size:18px; font-weight:bold; color:#f56c6c; }
.empty-hint { display:flex; justify-content:center; padding:40px 0; }
.checkout-summary { display:flex; flex-direction:column; gap:4px; font-size:14px; }
.checkout-total { font-size:24px; font-weight:bold; color:#f56c6c; }
.cash-row { display:flex; align-items:center; gap:8px; margin-top:16px; font-size:14px; }
.quick-btns { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
.change-info { margin-top:12px; font-size:15px; color:#67c23a; }
.change-amount { font-size:20px; font-weight:bold; }
</style>
