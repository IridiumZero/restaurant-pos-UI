<template>
  <div class="order-page">
    <!-- 左侧：菜品区 -->
    <div class="left-panel">
      <div class="panel-header">
        <h2>{{ t('order.title') }}</h2>
        <div class="header-actions">
          <el-select v-model="currentLang" size="small" style="width: 100px" @change="setLocale">
            <el-option v-for="opt in localeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-button size="small" @click="$router.push('/login')">{{ t('nav.admin') }}</el-button>
        </div>
      </div>

      <!-- 服务员区域 -->
      <div class="waiter-bar">
        <template v-if="currentWaiter">
          <span class="waiter-info">
            <el-icon><UserFilled /></el-icon>
            {{ t('order.waiterLoggedIn') }}: <strong>{{ currentWaiter.name }}</strong>
          </span>
          <el-button size="small" text @click="waiterDialogVisible = true">{{ t('order.switchWaiter') }}</el-button>
        </template>
        <template v-else>
          <span class="waiter-info" style="color: #f56c6c">{{ t('order.waiterPlaceholder') }}</span>
          <el-button size="small" type="primary" @click="waiterDialogVisible = true">{{ t('order.waiterLogin') }}</el-button>
        </template>
      </div>

      <div class="category-bar">
        <el-radio-group v-model="activeCategory" size="large">
          <el-radio-button value="全部">{{ t('common.all') }}</el-radio-button>
          <el-radio-button v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</el-radio-button>
        </el-radio-group>
      </div>

      <div class="dish-grid" v-loading="loading">
        <div
          v-for="dish in filteredDishes"
          :key="dish.id"
          class="dish-card"
          :class="{ inactive: dish.status === 'inactive' || dish.stock === 0 }"
          @click="addToCart(dish)"
        >
          <div class="dish-avatar" :style="{ background: avatarColor(dish.name) }">
            {{ dish.name.charAt(0) }}
          </div>
          <div class="dish-info">
            <span class="dish-name">{{ dish.name }}</span>
            <span class="dish-price">{{ formatCurrency(dish.price) }}</span>
          </div>
          <span v-if="cartQty(dish.id)" class="dish-badge">{{ cartQty(dish.id) }}</span>
          <span v-if="dish.stock === 0" class="dish-soldout">—</span>
        </div>
        <div v-if="!loading && !filteredDishes.length" class="empty-hint">
          {{ t('menu.noDish') }}
        </div>
      </div>
    </div>

    <!-- 右侧：购物车 + 我的订单 -->
    <div class="right-panel">
      <!-- 购物车 -->
      <div class="cart-header">
        <h3>{{ t('order.cart') }}</h3>
        <span class="cart-count">{{ cart.length }} {{ t('order.cartItem') }}</span>
        <el-button size="small" text type="danger" @click="clearCart" :disabled="!cart.length">
          {{ t('order.clearCart') }}
        </el-button>
      </div>

      <div class="cart-list">
        <div v-for="(item, idx) in cart" :key="idx" class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">{{ item.name }}</span>
            <span class="cart-item-price">{{ formatCurrency(item.price) }}</span>
          </div>
          <div class="cart-item-actions">
            <el-button size="small" circle :icon="Minus" @click="decreaseQty(idx)" />
            <span class="cart-item-qty">{{ item.qty }}</span>
            <el-button size="small" circle :icon="Plus" @click="increaseQty(idx)" />
            <el-button size="small" type="danger" text :icon="Delete" @click="removeItem(idx)" />
          </div>
        </div>
        <div v-if="!cart.length" class="cart-empty">{{ t('order.cartEmpty') }}</div>
      </div>

      <div class="cart-footer">
        <div class="cart-total">
          <span>{{ t('common.total') }}</span>
          <span class="total-amount">{{ formatCurrency(totalAmount) }}</span>
        </div>
        <div class="table-select">
          <span>{{ t('order.selectTable') }}:</span>
          <el-select v-model="tableNumber" :placeholder="t('order.tablePlaceholder')" size="large" style="flex: 1">
            <el-option v-for="n in 50" :key="n" :label="`${n} ${t('order.table')}`" :value="n" />
          </el-select>
        </div>
        <div class="cart-buttons">
          <el-button size="large" style="flex: 1" @click="saveAsDraft" :disabled="!cart.length || !tableNumber">
            {{ t('order.saveDraft') }}
          </el-button>
          <el-button
            type="primary"
            size="large"
            style="flex: 1; height: 48px; font-size: 16px"
            :disabled="!cart.length || !tableNumber || !currentWaiter"
            @click="submitOrder"
          >
            {{ t('order.submitOrder') }}
          </el-button>
        </div>
      </div>

      <!-- 我的订单列表 -->
      <div class="my-orders-section">
        <div class="orders-header">
          <span class="orders-title">{{ t('order.myOrders') }}</span>
          <el-button size="small" text @click="loadMyOrders">{{ t('common.refresh') }}</el-button>
        </div>
        <div class="orders-tabs">
          <el-tabs v-model="orderTab" stretch>
            <el-tab-pane :label="t('order.draftOrders')" name="draft">
              <div v-if="myDrafts.length" class="mini-order-list">
                <div v-for="o in myDrafts" :key="o.id" class="mini-order-card" @click="continueDraft(o)">
                  <span>#{{ o.id }} {{ o.tableNumber }}{{ t('order.table') }}</span>
                  <span>{{ formatCurrency(o.totalAmount) }}</span>
                  <el-icon><ArrowRight /></el-icon>
                </div>
              </div>
              <div v-else class="mini-empty">{{ t('order.noDraft') }}</div>
            </el-tab-pane>
            <el-tab-pane :label="t('order.pendingOrders')" name="pending">
              <div v-if="myPending.length" class="mini-order-list">
                <div v-for="o in myPending" :key="o.id" class="mini-order-card" @click="continueOrder(o)">
                  <span>#{{ o.id }} {{ o.tableNumber }}{{ t('order.table') }}</span>
                  <span>{{ formatCurrency(o.totalAmount) }}</span>
                  <el-tag size="small" type="warning">{{ t('order.orderSubmitted') }}</el-tag>
                </div>
              </div>
              <div v-else class="mini-empty">{{ t('order.noPending') }}</div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>

    <!-- 服务员登录对话框 -->
    <el-dialog v-model="waiterDialogVisible" :title="t('order.waiterLabel') + ' ' + t('common.login')" width="320px">
      <el-select v-model="selectedWaiterId" :placeholder="t('order.waiterPlaceholder')" style="width: 100%" filterable>
        <el-option v-for="w in waiterList" :key="w.id" :label="`${w.name} (${w.username})`" :value="w.id" />
      </el-select>
      <template #footer>
        <el-button @click="waiterDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="loginWaiter" :disabled="!selectedWaiterId">
          {{ t('order.waiterLogin') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Minus, Plus, Delete, UserFilled, ArrowRight } from '@element-plus/icons-vue'
import { getAll, add, update, remove, getByIndex, initDB } from '../db'
import { useI18n, localeOptions } from '../i18n'

const { t, locale, setLocale, formatCurrency } = useI18n()
const currentLang = ref(locale.value)

const dishes = ref([])
const cart = ref([])
const tableNumber = ref(null)
const activeCategory = ref('全部')
const loading = ref(false)

// Waiter state
const currentWaiter = ref(null)
const waiterList = ref([])
const selectedWaiterId = ref(null)
const waiterDialogVisible = ref(false)

// My orders
const myDrafts = ref([])
const myPending = ref([])
const orderTab = ref('draft')

const categories = computed(() => {
  return [...new Set(dishes.value.map((d) => d.category))].sort()
})

const filteredDishes = computed(() => {
  let result = dishes.value.filter((d) => d.status !== 'inactive')
  if (activeCategory.value !== '全部') {
    result = result.filter((d) => d.category === activeCategory.value)
  }
  return result
})

const totalAmount = computed(() => {
  return cart.value.reduce((s, item) => s + item.price * item.qty, 0)
})

function cartQty(dishId) {
  const item = cart.value.find((c) => c.dishId === dishId)
  return item ? item.qty : 0
}

function addToCart(dish) {
  if (dish.stock === 0 || dish.status === 'inactive') return
  const existing = cart.value.find((c) => c.dishId === dish.id)
  if (existing) {
    existing.qty++
  } else {
    cart.value.push({ dishId: dish.id, name: dish.name, price: dish.price, qty: 1 })
  }
}

function increaseQty(idx) {
  cart.value[idx].qty++
}

function decreaseQty(idx) {
  if (cart.value[idx].qty > 1) {
    cart.value[idx].qty--
  } else {
    cart.value.splice(idx, 1)
  }
}

function removeItem(idx) {
  cart.value.splice(idx, 1)
}

function clearCart() {
  cart.value = []
}

async function saveAsDraft() {
  if (!currentWaiter.value) {
    ElMessage.warning(t('order.waiterPlaceholder'))
    return
  }
  const order = {
    tableNumber: tableNumber.value,
    waiterId: currentWaiter.value.id,
    waiterName: currentWaiter.value.name,
    items: cart.value.map((c) => ({ dishId: c.dishId, name: c.name, price: c.price, qty: c.qty })),
    totalAmount: totalAmount.value,
    status: 'draft',
    createdAt: new Date().toISOString(),
    paymentMethod: null,
    cashReceived: null,
    change: null,
    paidAt: null,
  }
  await add('orders', order)
  ElMessage.success(t('order.draftSaved'))
  cart.value = []
  tableNumber.value = null
  await loadMyOrders()
}

async function submitOrder() {
  if (!currentWaiter.value) {
    ElMessage.warning(t('order.waiterPlaceholder'))
    return
  }
  const order = {
    tableNumber: tableNumber.value,
    waiterId: currentWaiter.value.id,
    waiterName: currentWaiter.value.name,
    items: cart.value.map((c) => ({ dishId: c.dishId, name: c.name, price: c.price, qty: c.qty })),
    totalAmount: totalAmount.value,
    status: 'pending',
    createdAt: new Date().toISOString(),
    paymentMethod: null,
    cashReceived: null,
    change: null,
    paidAt: null,
  }
  await add('orders', order)
  ElMessage.success(t('order.submitSuccess'))
  cart.value = []
  tableNumber.value = null
  await loadMyOrders()
}

function continueDraft(order) {
  cart.value = order.items.map((item) => ({
    dishId: item.dishId,
    name: item.name,
    price: item.price,
    qty: item.qty,
  }))
  tableNumber.value = order.tableNumber
  // Delete the draft
  remove('orders', order.id).then(() => loadMyOrders())
}

async function continueOrder(order) {
  // Show pending order info
  ElMessage.info(`#${order.id} ${order.tableNumber}${t('order.table')} — ${formatCurrency(order.totalAmount)}`)
}

async function loadMyOrders() {
  if (!currentWaiter.value) return
  const all = await getByIndex('orders', 'waiterId', currentWaiter.value.id)
  myDrafts.value = all.filter((o) => o.status === 'draft').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  myPending.value = all.filter((o) => o.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function loginWaiter() {
  const w = waiterList.value.find((e) => e.id === selectedWaiterId.value)
  if (w) {
    currentWaiter.value = w
    localStorage.setItem('orderWaiterId', w.id)
    waiterDialogVisible.value = false
    await loadMyOrders()
  }
}

function avatarColor(name) {
  const colors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#00D4AA', '#FF85C0', '#9B59B6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

watch(setLocale, (val) => {
  currentLang.value = val
})

onMounted(async () => {
  loading.value = true
  await initDB()
  dishes.value = await getAll('dishes')
  waiterList.value = (await getAll('employees')).filter((e) => e.role === 'waiter' && e.status === 'active')

  // Restore last waiter
  const savedId = localStorage.getItem('orderWaiterId')
  if (savedId) {
    currentWaiter.value = waiterList.value.find((e) => e.id === Number(savedId)) || null
  }

  if (currentWaiter.value) {
    await loadMyOrders()
  }
  loading.value = false
})
</script>

<style scoped>
.order-page {
  height: 100%;
  display: flex;
  background: #f0f2f5;
}
.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  min-width: 0;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #304156;
  color: #fff;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 6px;
}
.panel-header h2 {
  font-size: 18px;
  margin: 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.waiter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: #fdf6ec;
  border-bottom: 1px solid #faecd8;
  font-size: 13px;
  flex-shrink: 0;
}
.waiter-info {
  display: flex;
  align-items: center;
  gap: 4px;
}
.category-bar {
  padding: 8px 16px;
  overflow-x: auto;
  white-space: nowrap;
  flex-shrink: 0;
  border-bottom: 1px solid #ebeef5;
}
.dish-grid {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  align-content: start;
  -webkit-overflow-scrolling: touch;
}
.dish-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  background: #fafafa;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  min-height: 110px;
}
.dish-card:active {
  background: #e6f0ff;
}
.dish-card.inactive {
  opacity: 0.45;
  cursor: not-allowed;
}
.dish-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 6px;
}
.dish-info {
  text-align: center;
}
.dish-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 2px;
}
.dish-price {
  display: block;
  font-size: 15px;
  font-weight: bold;
  color: #f56c6c;
}
.dish-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-weight: bold;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.dish-soldout {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px;
  color: #c0c4cc;
  font-weight: bold;
}

.right-panel {
  width: 340px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.cart-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}
.cart-header h3 {
  margin: 0;
  font-size: 16px;
}
.cart-count {
  color: #909399;
  font-size: 12px;
}
.cart-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
  -webkit-overflow-scrolling: touch;
  max-height: 220px;
}
.cart-item {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.cart-item-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.cart-item-name {
  font-weight: 500;
  font-size: 14px;
  color: #303133;
}
.cart-item-price {
  color: #909399;
  font-size: 12px;
}
.cart-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cart-item-qty {
  font-size: 15px;
  font-weight: bold;
  min-width: 22px;
  text-align: center;
}
.cart-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 30px 0;
  font-size: 13px;
}
.cart-footer {
  padding: 10px 16px;
  border-top: 1px solid #ebeef5;
  background: #fafafa;
  flex-shrink: 0;
}
.cart-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  color: #303133;
}
.total-amount {
  font-size: 20px;
  font-weight: bold;
  color: #f56c6c;
}
.table-select {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #303133;
}
.table-select span {
  flex-shrink: 0;
}
.cart-buttons {
  display: flex;
  gap: 8px;
}

.my-orders-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-top: 2px solid #ebeef5;
  overflow: hidden;
}
.orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 0;
  flex-shrink: 0;
}
.orders-title {
  font-size: 14px;
  font-weight: 600;
}
.orders-tabs {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.orders-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}
.mini-order-list {
  padding: 0 8px;
}
.mini-order-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px;
  margin-bottom: 4px;
  background: #f5f7fa;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.mini-order-card:active {
  background: #e6f0ff;
}
.mini-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 20px 0;
  font-size: 13px;
}

.empty-hint {
  grid-column: 1 / -1;
  text-align: center;
  color: #c0c4cc;
  padding: 60px 0;
  font-size: 14px;
}

@media (max-width: 768px) {
  .order-page {
    flex-direction: column;
  }
  .left-panel {
    flex: none;
    height: 52%;
  }
  .dish-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 6px;
    padding: 6px;
  }
  .dish-card {
    padding: 8px 4px;
    min-height: 90px;
  }
  .dish-avatar {
    width: 40px;
    height: 40px;
    font-size: 18px;
  }
  .dish-name {
    font-size: 12px;
  }
  .dish-price {
    font-size: 13px;
  }
  .right-panel {
    width: 100%;
    flex: 1;
    border-left: none;
    border-top: 1px solid #e4e7ed;
  }
  .cart-list {
    max-height: 120px;
  }
}
</style>
