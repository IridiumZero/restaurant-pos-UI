<template>
  <div class="order-history">
    <div class="page-header">
      <h2>订单历史</h2>
      <div class="filter-row">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          size="default"
        />
        <el-select v-model="paymentFilter" placeholder="支付方式" clearable style="width: 130px">
          <el-option label="现金" value="现金" />
          <el-option label="POS机" value="POS机" />
        </el-select>
        <el-button @click="loadOrders">刷新</el-button>
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
      </div>
    </div>

    <el-table :data="filteredOrders" border stripe style="width: 100%" row-key="id" v-loading="loading" empty-text="暂无订单">
      <el-table-column prop="id" label="订单号" width="90" sortable />
      <el-table-column label="商品明细" min-width="200">
        <template #default="{ row }">
          <div class="order-items">
            <div v-for="(item, idx) in row.items" :key="idx" class="order-item-row">
              {{ item.name }} &times; {{ item.qty }}
              <span class="item-subtotal">&yen;{{ (item.price * item.qty).toFixed(2) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="总金额" width="110" sortable prop="totalAmount">
        <template #default="{ row }">
          <span class="money">&yen;{{ row.totalAmount.toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="paymentMethod" label="支付方式" width="100">
        <template #default="{ row }">
          <el-tag :type="row.paymentMethod === '现金' ? 'success' : ''">{{ row.paymentMethod }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="收款/找零" width="130">
        <template #default="{ row }">
          <template v-if="row.paymentMethod === '现金'">
            收 &yen;{{ row.cashReceived?.toFixed(2) }}
            <br />找 &yen;{{ row.change?.toFixed(2) }}
          </template>
          <template v-else>-</template>
        </template>
      </el-table-column>
      <el-table-column label="交易时间" width="170" sortable prop="createdAt">
        <template #default="{ row }">
          {{ formatTime(row.createdAt) }}
        </template>
      </el-table-column>
    </el-table>
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
  padding: 20px;
  border-radius: 8px;
}
.page-header h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.summary-cards {
  display: flex;
  gap: 16px;
  margin-left: auto;
}
.summary-item {
  text-align: center;
  padding: 4px 16px;
  background: #f5f7fa;
  border-radius: 6px;
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
.order-items {
  max-height: 100px;
  overflow: auto;
}
.order-item-row {
  font-size: 13px;
  line-height: 1.8;
  display: flex;
  justify-content: space-between;
}
.item-subtotal {
  color: #909399;
}
</style>
