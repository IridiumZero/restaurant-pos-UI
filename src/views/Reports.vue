<template>
  <div class="reports">
    <h2>销售报表</h2>
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">近7天销售额趋势</span></template>
          <v-chart :option="dailyOption" class="chart-box" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">各分类销售占比</span></template>
          <v-chart :option="categoryOption" class="chart-box" autoresize />
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">支付方式占比</span></template>
          <v-chart :option="paymentOption" class="chart-box" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="chart-card">
          <template #header><span class="card-title">菜品销量排行 Top 10</span></template>
          <v-chart :option="dishRankOption" class="chart-box" autoresize />
        </el-card>
      </el-col>
    </el-row>
    <div class="total-summary">
      <div class="summary-stat">
        <span class="stat-label">总订单数</span>
        <span class="stat-value">{{ orders.length }}</span>
      </div>
      <div class="summary-stat">
        <span class="stat-label">总销售额</span>
        <span class="stat-value money">&yen;{{ totalRevenue.toFixed(2) }}</span>
      </div>
      <div class="summary-stat">
        <span class="stat-label">平均客单价</span>
        <span class="stat-value money">&yen;{{ avgOrder.toFixed(2) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { getAll } from '../db'

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent])

const orders = ref([])

const totalRevenue = computed(() => orders.value.reduce((s, o) => s + o.totalAmount, 0))
const avgOrder = computed(() => orders.value.length ? totalRevenue.value / orders.value.length : 0)

// 近7天销售额趋势
const dailyOption = computed(() => {
  const days = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const sales = days.map((day) =>
    orders.value.filter((o) => o.createdAt.startsWith(day)).reduce((sum, o) => sum + o.totalAmount, 0)
  )
  return {
    tooltip: { trigger: 'axis', formatter: '{b}<br/>销售额: ¥{c}' },
    xAxis: { type: 'category', data: days.map((d) => d.slice(5)) },
    yAxis: { type: 'value', name: '元' },
    series: [
      {
        data: sales,
        type: 'line',
        smooth: true,
        areaStyle: { color: 'rgba(64, 158, 255, 0.15)' },
        itemStyle: { color: '#409EFF' },
        symbol: 'circle',
        symbolSize: 8,
      },
    ],
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
  }
})

// 分类销售占比
const categoryOption = computed(() => {
  const map = {}
  orders.value.forEach((o) => {
    o.items.forEach((item) => {
      const cat = item.category || '其他'
      map[cat] = (map[cat] || 0) + item.price * item.qty
    })
  })
  return {
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '45%'],
        data: Object.entries(map).map(([name, value]) => ({ name, value })),
        label: { formatter: '{b}\n{d}%' },
      },
    ],
  }
})

// 支付方式占比
const paymentOption = computed(() => {
  const map = {}
  orders.value.forEach((o) => {
    map[o.paymentMethod] = (map[o.paymentMethod] || 0) + 1
  })
  const colorMap = { '现金': '#67c23a', 'POS机': '#409EFF' }
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 单 ({d}%)' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '45%'],
        data: Object.entries(map).map(([name, value]) => ({
          name,
          value,
          itemStyle: { color: colorMap[name] },
        })),
        label: { formatter: '{b}\n{d}%' },
      },
    ],
  }
})

// 菜品销量排行
const dishRankOption = computed(() => {
  const map = {}
  orders.value.forEach((o) => {
    o.items.forEach((item) => {
      map[item.name] = (map[item.name] || 0) + item.qty
    })
  })
  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c} 份' },
    xAxis: { type: 'value', name: '份' },
    yAxis: {
      type: 'category',
      data: sorted.map(([name]) => name),
      axisLabel: { width: 90, overflow: 'truncate' },
    },
    series: [
      {
        data: sorted.map(([, v]) => v),
        type: 'bar',
        itemStyle: {
          color: '#409EFF',
          borderRadius: [0, 4, 4, 0],
        },
        barMaxWidth: 28,
      },
    ],
    grid: { left: 100, right: 20, top: 10, bottom: 20 },
  }
})

onMounted(async () => {
  orders.value = await getAll('orders')
})
</script>

<style scoped>
.reports {
  padding: 16px;
}
.reports h2 {
  font-size: 18px;
  margin: 0;
}
.card-title {
  font-weight: 600;
  font-size: 15px;
}
.chart-card {
  margin-bottom: 16px;
}
.chart-box {
  height: 280px;
}
.total-summary {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  flex-wrap: wrap;
}
.summary-stat {
  flex: 1;
  text-align: center;
  min-width: 100px;
}
.stat-label {
  display: block;
  font-size: 13px;
  color: #909399;
  margin-bottom: 4px;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}
.stat-value.money {
  color: #f56c6c;
}
</style>
