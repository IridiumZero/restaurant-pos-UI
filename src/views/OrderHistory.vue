<template>
  <div class="order-history">
    <div class="page-header">
      <h2>订单历史</h2>
      <div class="filter-row">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          size="default"
          style="width: 220px"
        />
        <el-select v-model="paymentFilter" placeholder="支付方式" clearable style="width: 110px">
          <el-option label="现金" value="现金" />
          <el-option label="POS机" value="POS机" />
        </el-select>
        <el-button @click="loadOrders" size="small">刷新</el-button>
      </div>
    </div>

    <!-- 汇总卡片 -->
    <div class="summary-cards">
      <div class="summary-item">
        <span class="summary-label">订单数</span>
        <span class="summary-value">{{ filteredOrders.length }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">总销售额</span>
        <span class="summary-value money">&yen;{{ totalSales.toFixed(2) }}</span>
      </div>
    </div>

    <!-- 卡片列表 -->
    <div class="order-card-list" v-loading="loading">
      <div v-for="order in filteredOrders" :key="order.id" class="order-card">
        <div class="order-card-top">
          <span class="order-no">#{{ order.id }}</span>
          <el-tag :type="order.paymentMethod === '现金' ? 'success' : ''" size="small">
            {{ order.paymentMethod }}
          </el-tag>
          <span class="order-total money">&yen;{{ order.totalAmount.toFixed(2) }}</span>
        </div>
        <div class="order-card-items">
          <span v-for="(item, idx) in order.items" :key="idx" class="order-item-tag">
            {{ item.name }}×{{ item.qty }}
          </span>
        </div>
        <div class="order-card-bottom">
          <span class="order-time">{{ formatTime(order.createdAt) }}</span>
          <span v-if="order.paymentMethod === '现金'" class="order-cash-detail">
            收 &yen;{{ order.cashReceived?.toFixed(2) }} / 找 &yen;{{ order.change?.toFixed(2) }}
          </span>
        </div>
      </div>
      <div v-if="!loading && !filteredOrders.length" class="empty-hint">暂无订单</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAll } from '../db'

const orders = ref([])
const dateRange = ref([])
const paymentFilter = ref('')
const loading = ref(false)

const filteredOrders = computed(() => {
  let result = orders.value
  if (paymentFilter.value) {
    result = result.filter((o) => o.paymentMethod === paymentFilter.value)
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const start = dateRange.value[0]
    const end = dateRange.value[1] + 'T23:59:59'
    result = result.filter((o) => o.createdAt >= start && o.createdAt <= end)
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})

const totalSales = computed(() => {
  return filteredOrders.value.reduce((sum, o) => sum + o.totalAmount, 0)
})

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadOrders() {
  loading.value = true
  orders.value = await getAll('orders')
  loading.value = false
}

onMounted(loadOrders)
</script>

<style scoped>
.order-history {
  background: #fff;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-header h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.summary-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.summary-item {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 8px;
}
.summary-label {
  font-size: 12px;
  color: #909399;
  display: block;
}
.summary-value {
  font-size: 20px;
  font-weight: bold;
  color: #303133;
}
.money {
  color: #f56c6c;
}
.order-card-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.order-card {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  margin-bottom: 8px;
}
.order-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.order-no {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.order-total {
  margin-left: auto;
  font-size: 16px;
  font-weight: bold;
}
.order-card-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.order-item-tag {
  background: #f0f2f5;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}
.order-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}
.order-cash-detail {
  color: #67c23a;
}
.empty-hint {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
  font-size: 14px;
}
</style>
