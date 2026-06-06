<template>
  <div class="order-history">
    <div class="page-header"><h2>{{ t('history.title') }}</h2></div>
    <div class="filter-row">
      <el-date-picker v-model="dateRange" type="daterange" range-separator="~" :start-placeholder="t('common.startDate')" :end-placeholder="t('common.endDate')" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:220px" />
      <el-select v-model="paymentFilter" :placeholder="t('history.filterByPayment')" clearable style="width:110px">
        <el-option :label="t('admin.cash')" value="cash" /><el-option :label="t('admin.pos')" value="pos" />
      </el-select>
      <el-select v-model="waiterFilter" :placeholder="t('history.filterByWaiter')" clearable style="width:120px">
        <el-option v-for="w in waiterList" :key="w.id" :label="w.name" :value="w.id" />
      </el-select>
      <el-button @click="loadOrders" size="small">{{ t('common.refresh') }}</el-button>
    </div>
    <div class="summary-cards">
      <div class="summary-item"><span class="summary-label">{{ t('history.orderCount') }}</span><span class="summary-value">{{ filteredOrders.length }}</span></div>
      <div class="summary-item"><span class="summary-label">{{ t('history.totalSales') }}</span><span class="summary-value money">{{ formatCurrency(totalSales) }}</span></div>
      <div class="summary-item"><span class="summary-label">{{ t('history.avgOrder') }}</span><span class="summary-value money">{{ formatCurrency(avgOrder) }}</span></div>
    </div>
    <div class="order-card-list" v-loading="loading">
      <div v-for="order in filteredOrders" :key="order.id" class="order-card">
        <div class="order-card-top">
          <span class="order-no">#{{ order.id }}</span>
          <el-tag size="small">{{ order.table_number }} {{ t('order.table') }}</el-tag>
          <el-tag v-if="order.waiter_name" size="small" type="info">{{ order.waiter_name }}</el-tag>
          <el-tag :type="normalizePayment(order.payment_method) === 'cash' ? 'success' : 'info'" size="small">{{ paymentLabel(order.payment_method) }}</el-tag>
          <span class="order-total money">{{ formatCurrency(order.total_amount) }}</span>
        </div>
        <div class="order-card-items">
          <span v-for="(item, idx) in (order.items || [])" :key="idx" class="order-item-tag">{{ getItemName(item) }}×{{ item.quantity }}</span>
        </div>
        <div class="order-card-bottom">
          <span class="order-time">{{ formatTime(order.created_at) }}</span>
          <span v-if="normalizePayment(order.payment_method) === 'cash'" class="order-cash-detail">{{ t('admin.cashReceived') }} {{ formatCurrency(order.cash_received) }} / {{ t('admin.change') }} {{ formatCurrency(order.change_amount) }}</span>
          <el-button v-if="isAdmin" type="danger" size="small" :icon="Delete" circle plain @click="handleDelete(order)" class="delete-order-btn" />
        </div>
      </div>
      <div class="pagination-wrap" v-if="totalOrders > pageSize">
        <el-pagination background layout="prev, pager, next, total" :total="totalOrders" :page-size="pageSize" :current-page="currentPage" @current-change="handlePageChange" />
      </div>
      <div v-if="!loading && !filteredOrders.length" class="empty-hint">{{ t('history.noOrders') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n, getDishName } from '../i18n'
import { api } from '../api'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWebSocket } from '../ws'

const { t, formatCurrency } = useI18n()

const isAdmin = computed(() => {
  try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'admin' } catch { return false }
})
const allOrders = ref([]), waiterList = ref([]), dateRange = ref([]), paymentFilter = ref(''), waiterFilter = ref(null), loading = ref(false), dishMap = ref({})
const currentPage = ref(1), pageSize = ref(20), totalOrders = ref(0)

watch([dateRange, paymentFilter, waiterFilter], () => {
  currentPage.value = 1
  loadOrders()
})

// 兼容旧数据（中文值）和新数据（英文值）
function normalizePayment(method) {
  if (method === '现金' || method === 'cash') return 'cash'
  if (method === 'POS机' || method === 'pos') return 'pos'
  return method
}
function paymentLabel(method) {
  const n = normalizePayment(method)
  if (n === 'cash') return t('admin.cash')
  if (n === 'pos') return t('admin.pos')
  return method || '—'
}

const filteredOrders = computed(() => {
  let r = allOrders.value
  if (paymentFilter.value) r = r.filter(o => normalizePayment(o.payment_method) === paymentFilter.value)
  if (waiterFilter.value) r = r.filter(o => o.waiter_id === waiterFilter.value)
  if (dateRange.value?.length === 2) {
    r = r.filter(o => o.paid_at >= dateRange.value[0] && o.paid_at <= dateRange.value[1] + 'T23:59:59')
  }
  return r.sort((a, b) => String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || '')))
})
const totalSales = computed(() => filteredOrders.value.reduce((s, o) => s + o.total_amount, 0))
const avgOrder = computed(() => filteredOrders.value.length ? totalSales.value / filteredOrders.value.length : 0)

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso); const pad = n => String(n).padStart(2, '0')
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
  } catch (e) { console.error('加载菜品失败:', e) }
}

async function loadOrders() {
  loading.value = true
  try {
    const [res, waiters] = await Promise.all([
      api.getOrders({ status: 'completed', page: currentPage.value, pageSize: pageSize.value }),
      api.getWaiters(),
      loadDishes()
    ])
    allOrders.value = res.orders || res
    totalOrders.value = res.total ?? allOrders.value.length
    waiterList.value = waiters
  } catch (e) { console.error('加载订单失败:', e) }
  finally { loading.value = false }
}

function handlePageChange(page) {
  currentPage.value = page
  loadOrders()
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

useWebSocket((msg) => {
  if (msg.type?.startsWith('order_')) loadOrders()
})

onMounted(loadOrders)
</script>

<style scoped>
.order-history { background:#fff; padding:16px; height:100%; display:flex; flex-direction:column; }
.page-header h2 { margin:0 0 8px; font-size:18px; }
.filter-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.summary-cards { display:flex; gap:12px; margin-bottom:12px; flex-shrink:0; }
.summary-item { flex:1; text-align:center; padding:8px 12px; background:#f5f7fa; border-radius:8px; }
.summary-label { font-size:12px; color:#909399; display:block; }
.summary-value { font-size:20px; font-weight:bold; color:#303133; }
.money { color:#f56c6c; }
.order-card-list { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.order-card { padding:12px; border:1px solid #ebeef5; border-radius:8px; margin-bottom:8px; }
.order-card-top { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.order-no { font-weight:600; font-size:14px; color:#303133; }
.order-total { margin-left:auto; font-size:16px; font-weight:bold; }
.order-card-items { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
.order-item-tag { background:#f0f2f5; padding:2px 8px; border-radius:4px; font-size:12px; color:#606266; }
.order-card-bottom { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#909399; }
.order-cash-detail { color:#67c23a; }
.empty-hint { text-align:center; color:#c0c4cc; padding:40px 0; font-size:14px; }
.delete-order-btn { margin-left: auto !important; }
.pagination-wrap { display: flex; justify-content: center; padding: 16px 0; }
</style>
