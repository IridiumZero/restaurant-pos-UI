<template>
  <div class="reports">
    <h2>{{ t('reports.title') }}</h2>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :xs="24" :lg="12"><el-card shadow="never" class="chart-card"><template #header><span class="card-title">{{ t('reports.monthlyTrend') }}</span></template><v-chart :option="trendOption" class="chart-box" autoresize /></el-card></el-col>
      <el-col :xs="24" :lg="12"><el-card shadow="never" class="chart-card"><template #header><span class="card-title">{{ t('reports.categoryPie') }}</span></template><v-chart :option="categoryOption" class="chart-box" autoresize /></el-card></el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :xs="24" :lg="12"><el-card shadow="never" class="chart-card"><template #header><span class="card-title">{{ t('reports.paymentPie') }}</span></template><v-chart :option="paymentOption" class="chart-box" autoresize /></el-card></el-col>
      <el-col :xs="24" :lg="12"><el-card shadow="never" class="chart-card"><template #header><span class="card-title">{{ t('reports.dishRank') }}</span></template><v-chart :option="dishRankOption" class="chart-box" autoresize /></el-card></el-col>
    </el-row>
    <div class="total-summary">
      <div class="summary-stat"><span class="stat-label">{{ t('reports.totalOrders') }}</span><span class="stat-value">{{ summary.orders }}</span></div>
      <div class="summary-stat"><span class="stat-label">{{ t('reports.totalRevenue') }}</span><span class="stat-value money">{{ formatCurrency(summary.revenue) }}</span></div>
      <div class="summary-stat"><span class="stat-label">{{ t('reports.avgPerOrder') }}</span><span class="stat-value money">{{ formatCurrency(summary.avg) }}</span></div>
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
import { useI18n, getCategoryName, getDishName } from '../i18n'
import { api } from '../api'

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent])
const { t, formatCurrency } = useI18n()

const trendData = ref([]), categoryData = ref([]), paymentData = ref([]), dishTopData = ref([])
const categoryList = ref([]), dishList = ref([])
const loading = ref(false)

const categoryMap = computed(() => {
  const map = {}
  categoryList.value.forEach(c => { map[c.name] = c })
  return map
})
const dishMap = computed(() => {
  const map = {}
  dishList.value.forEach(d => { map[d.id] = d })
  return map
})

const summary = computed(() => {
  const allOrders = trendData.value.reduce((s, d) => s + d.count, 0)
  const allRevenue = trendData.value.reduce((s, d) => s + d.revenue, 0)
  return { orders: allOrders, revenue: allRevenue, avg: allOrders ? allRevenue / allOrders : 0 }
})

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br/>${t('reports.totalRevenue')}: ${formatCurrency(p[0].value)}` },
  xAxis: { type: 'category', data: trendData.value.map(d => d.date.slice(5)), axisLabel: { interval: 4 } },
  yAxis: { type: 'value', name: t('currency.symbol') },
  series: [{ data: trendData.value.map(d => d.revenue), type: 'line', smooth: true, areaStyle: { color: 'rgba(64,158,255,0.15)' }, itemStyle: { color: '#409EFF' }, symbol: 'circle', symbolSize: 6 }],
  grid: { left: 60, right: 20, top: 20, bottom: 30 },
}))

function localizedCategory(raw) {
  if (!raw) return t('common.all')
  // 兜底：万一服务端返回的还是逗号合并串，拆开逐项翻译再拼回
  const parts = raw.split(/[,，]/).map(c => c.trim()).filter(Boolean)
  return parts.map(p => {
    const cat = categoryMap.value[p]
    return cat ? getCategoryName(cat) : p
  }).join(', ')
}

const categoryOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0 },
  series: [{ type: 'pie', radius: ['45%','72%'], center: ['50%','45%'], data: categoryData.value.map(d => ({ name: localizedCategory(d.category), value: d.count })), label: { formatter: '{b}\n{d}%' } }],
}))

const paymentOption = computed(() => {
  const colorMap = { '现金': '#67c23a', 'POS机': '#409EFF' }
  const nameMap = { '现金': t('admin.cash'), 'POS机': t('admin.pos') }
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['45%','72%'], center: ['50%','45%'], data: paymentData.value.map(d => ({ name: nameMap[d.name] || d.name, value: d.value, itemStyle: { color: colorMap[d.name] } })), label: { formatter: '{b}\n{d}%' } }],
  }
})

const dishRankOption = computed(() => {
  const sorted = [...dishTopData.value].reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c}' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sorted.map(d => {
      const dish = dishMap.value[d.id]
      return dish ? getDishName(dish) : d.name
    }), axisLabel: { width: 90, overflow: 'truncate' } },
    series: [{ data: sorted.map(d => d.qty), type: 'bar', itemStyle: { color: '#409EFF', borderRadius: [0,4,4,0] }, barMaxWidth: 28 }],
    grid: { left: 100, right: 20, top: 10, bottom: 20 },
  }
})

onMounted(async () => {
  try {
    const [trend, cat, pay, dishes, cats, allDishes] = await Promise.all([
      api.getMonthlyTrend(), api.getCategoryPie(), api.getPaymentPie(), api.getDishesTop(),
      api.getCategories(), api.getDishes()
    ])
    trendData.value = trend
    categoryData.value = cat
    paymentData.value = pay
    dishTopData.value = dishes
    categoryList.value = cats
    dishList.value = allDishes
  } catch (e) { console.error('加载报表数据失败:', e) }
})
</script>

<style scoped>
.reports { padding:16px; }
.reports h2 { font-size:18px; margin:0; }
.card-title { font-weight:600; font-size:15px; }
.chart-card { margin-bottom:16px; }
.chart-box { height:280px; }
.total-summary { display:flex; gap:16px; margin-top:8px; background:#fff; padding:16px; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.06); flex-wrap:wrap; }
.summary-stat { flex:1; text-align:center; min-width:100px; }
.stat-label { display:block; font-size:13px; color:#909399; margin-bottom:4px; }
.stat-value { font-size:24px; font-weight:bold; color:#303133; }
.stat-value.money { color:#f56c6c; }
</style>
