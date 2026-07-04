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
          <el-button size="small" @click="showServerConfig = true" :icon="Setting">{{ t('common.server') }}</el-button>
        </div>
      </div>

      <!-- 服务员登录 -->
      <div class="waiter-bar">
        <template v-if="currentUser">
          <span class="waiter-info">
            <el-icon><UserFilled /></el-icon>
            {{ currentUser.name }} <span class="role-tag">({{ currentUser.role }})</span>
          </span>
          <el-button size="small" text @click="showWaiterLogin = true">{{ t('order.switchWaiter') }}</el-button>
        </template>
        <template v-else>
          <span class="waiter-info" style="color: #f56c6c">{{ t('order.waiterPlaceholder') }}</span>
          <el-button size="small" type="primary" @click="showWaiterLogin = true">{{ t('order.waiterLogin') }}</el-button>
        </template>
      </div>

      <!-- 服务器连接状态 -->
      <div v-if="!serverOk" class="server-status err">
        <span class="status-dot" /> {{ t('common.serverError') }} {{ serverUrl }}
        <el-button size="small" text @click="showServerConfig = true" style="margin-left:auto">{{ t('common.edit') }}</el-button>
      </div>
      <div v-else-if="offlinePending > 0" class="server-status offline-sync">
        <span class="status-dot sync" /> {{ t('offline.pendingSync', { count: offlinePending }) }}
        <el-button size="small" text @click="syncOfflineOrders" style="margin-left:auto">{{ t('offline.syncNow') }}</el-button>
      </div>

      <div class="category-bar">
        <el-radio-group v-model="activeCategory" size="default" class="category-tabs">
          <el-radio-button
            v-for="cat in categories"
            :key="cat.name"
            :value="cat.name"
            class="category-tab"
          >{{ cat.label }}</el-radio-button>
        </el-radio-group>
      </div>

      <div class="dish-grid" v-loading="loading">
        <div
          v-for="dish in filteredDishes"
          :key="dish.id"
          class="dish-card"
          :class="{ inactive: dish.status === 'inactive', soldout: dish.status === 'sold_out' }"
          @click="openDishDetail(dish)"
        >
          <div class="dish-avatar">
            <img v-if="dish.image" :src="imageUrl(dish.image)" class="dish-avatar-img" />
            <span v-else class="dish-avatar-letter" :style="{ background: avatarColor(getDishName(dish)) }">{{ getDishName(dish).charAt(0) }}</span>
          </div>
          <div class="dish-info">
            <span class="dish-name">{{ getDishName(dish) }}</span>
            <span v-if="getDishRemark(dish)" class="dish-remark">{{ getDishRemark(dish) }}</span>
            <span class="dish-price">{{ formatCurrency(dish.price) }}</span>
          </div>
          <span v-if="cartQty(dish.id)" class="dish-badge">{{ cartQty(dish.id) }}</span>
          <span v-if="dish.status === 'sold_out'" class="dish-soldout">{{ t('menu.soldOut') }}</span>
        </div>
        <div v-if="!loading && !filteredDishes.length" class="empty-hint">{{ t('menu.noDish') }}</div>
      </div>
    </div>

    <!-- 右侧 -->
    <div class="right-panel">
      <div class="cart-header">
        <h3>{{ t('order.cart') }}</h3>
        <span class="cart-count">{{ cart.length }} {{ t('order.cartItem') }}</span>
        <el-button size="small" text type="danger" @click="clearCart" :disabled="!cart.length">{{ t('order.clearCart') }}</el-button>
      </div>
      <div class="cart-list">
        <div v-for="(item, idx) in cart" :key="idx" class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">{{ cartDishName(item) }}</span>
            <span class="cart-item-price">{{ formatCurrency(item.price) }}</span>
          </div>
          <div v-if="item.flavors && item.flavors.length" class="cart-item-flavors">
            <el-tag v-for="(fl, fi) in item.flavors" :key="fi" size="small" type="info" effect="plain" class="flavor-tag">
              {{ cartFlavorName(fl) }}: {{ localizeOption(fl.value) }}
            </el-tag>
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
          <el-button size="large" style="flex: 1" @click="saveAsDraft" :disabled="!cart.length || !tableNumber || !currentUser">
            {{ t('order.saveDraft') }}
          </el-button>
          <el-button type="primary" size="large" style="flex: 1; height: 48px; font-size: 16px"
            :disabled="!cart.length || !tableNumber || !currentUser" @click="submitOrder">
            {{ t('order.submitOrder') }}
          </el-button>
        </div>
      </div>

      <!-- 我的订单 -->
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
                  <span>#{{ o.id }} {{ o.table_number }}{{ t('order.table') }}</span>
                  <span>{{ formatCurrency(o.total_amount) }}</span>
                  <el-icon><ArrowRight /></el-icon>
                </div>
              </div>
              <div v-else class="mini-empty">{{ t('order.noDraft') }}</div>
            </el-tab-pane>
            <el-tab-pane :label="t('order.pendingOrders')" name="pending">
              <div v-if="myPending.length" class="mini-order-list">
                <div v-for="o in myPending" :key="o.id" class="mini-order-card clickable" @click="showOrderDetail(o)">
                  <span>#{{ o.id }} {{ o.table_number }}{{ t('order.table') }}</span>
                  <span>{{ formatCurrency(o.total_amount) }}</span>
                  <div class="pending-tags">
                    <el-tag size="small" type="warning">{{ t('order.orderSubmitted') }}</el-tag>
                    <el-icon><ArrowRight /></el-icon>
                  </div>
                </div>
              </div>
              <div v-else class="mini-empty">{{ t('order.noPending') }}</div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>

    <!-- 服务员登录对话框 -->
    <el-dialog v-model="showWaiterLogin" :title="t('order.waiterLogin')" width="380px" class="waiter-login-dialog">
      <el-form @submit.prevent="handleWaiterLogin" class="waiter-login-form">
        <el-form-item>
          <el-input v-model="waiterForm.employeeNo" :placeholder="t('login.placeholderUser')" size="large">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input v-model="waiterForm.password" type="password" :placeholder="t('login.placeholderPass')" size="large" show-password>
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-button type="primary" size="large" style="width:100%" @click="handleWaiterLogin" :loading="waiterLoading">
          {{ t('login.loginBtn') }}
        </el-button>
      </el-form>
    </el-dialog>

    <!-- 服务器配置对话框 -->
    <el-dialog v-model="showServerConfig" :title="t('common.serverUrl')" width="420px" class="server-config-dialog">
      <el-input v-model="serverUrlInput" placeholder="http://192.168.x.x:3000" size="large" class="server-url-input" />
      <template #footer>
        <el-button @click="showServerConfig = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveServerUrl">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 菜品详情对话框（口味选择） -->
    <DishDetailDialog v-model:visible="dishDetailVisible" :dish="selectedDish"
      :flavors="dishFlavors" :flavors-loading="flavorsLoading" :server-url="serverUrl"
      @add-to-cart="handleAddToCartFromDialog" />

    <!-- 订单详情对话框（加菜/退菜/补打） -->
    <OrderDetailDialog ref="orderDetailDialogRef" v-model:visible="detailVisible"
      :order="detailOrder" :dishes="dishes" :locale="locale"
      @cancel-item="handleDetailCancelItem" @add-items="handleDetailAddItems"
      @reprint="handleDetailReprint" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Minus, Plus, Delete, UserFilled, ArrowRight, Setting, User, Lock } from '@element-plus/icons-vue'
import { useI18n, localeOptions, getDishName, getCategoryName, getDishRemark, localizeOption } from '../i18n'
import { api } from '../api'
import { cacheMenu, getCachedMenu, queueOrder, syncPendingOrders, getPendingCount } from '../offline'
import { useWebSocket } from '../ws'
import DishDetailDialog from '../components/DishDetailDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'

const { t, locale, setLocale, formatCurrency } = useI18n()
const currentLang = ref(locale.value)

const dishes = ref([])
const cart = ref([])
const tableNumber = ref(null)
const activeCategory = ref('全部')
const loading = ref(false)
const serverOk = ref(false)
function isCapacitorApp() {
  return !!(window.Capacitor) || location.origin.startsWith('capacitor://')
}

function isCapacitorUrl(url) {
  return url.startsWith('https://localhost') || url.startsWith('capacitor://') || url.startsWith('http://localhost')
}

// Clean up any saved URL that points to the Capacitor webview itself
const _savedUrl = localStorage.getItem('serverUrl')
const serverUrl = ref(_savedUrl && !isCapacitorUrl(_savedUrl) ? _savedUrl : '')
const serverUrlInput = ref(serverUrl.value)
const showServerConfig = ref(!serverUrl.value)

const categories = computed(() => {
  const cats = [{ name: '全部', label: t('common.all') }]
  categoryList.value.forEach(c => cats.push({ name: c.name, label: getCategoryName(c) }))
  return cats
})
const categoryList = ref([])

const filteredDishes = computed(() => {
  if (activeCategory.value === '全部') return dishes.value.filter(d => d.status !== 'inactive')
  return dishes.value.filter(d => {
    if (d.status === 'inactive') return false
    const cats = (d.category || '').split(/[,，]/).map(c => c.trim())
    return cats.includes(activeCategory.value)
  })
})

const totalAmount = computed(() => cart.value.reduce((s, i) => s + i.price * i.qty, 0))

const showWaiterLogin = ref(false)
const waiterForm = ref({ employeeNo: '', password: '' })
const waiterLoading = ref(false)
const currentUser = ref(JSON.parse(localStorage.getItem('waiterUser') || 'null'))
const orderTab = ref('draft')
const myDrafts = ref([])
const myPending = ref([])

// ── 订单详情（加菜/退菜/补打）─────
const detailVisible = ref(false)
const detailOrder = ref(null)
const orderDetailDialogRef = ref(null)

// ── 菜品详情/口味选择 ──────────────────
const dishDetailVisible = ref(false)
const selectedDish = ref(null)
const dishFlavors = ref([])
const flavorsLoading = ref(false)

function cartDishName(item) {
  const dish = dishes.value.find(d => d.id === item.dishId)
  return dish ? getDishName(dish) : item.name
}

function cartFlavorName(fl) {
  if (locale.value === 'pt' && fl.name_pt) return fl.name_pt
  if (locale.value === 'en' && fl.name_en) return fl.name_en
  return fl.name || ''
}

// ── 离线模式 ──────────────────────────
const offlinePending = ref(0)
const isOnline = ref(navigator.onLine)

async function refreshPendingCount() {
  try { offlinePending.value = await getPendingCount() } catch { offlinePending.value = 0 }
}

async function syncOfflineOrders() {
  if (!isOnline.value || !serverOk.value) return
  try {
    const results = await syncPendingOrders(api)
    const ok = results.filter(r => r.success).length
    const fail = results.filter(r => !r.success).length
    if (ok) ElMessage.success(t('offline.syncResult', { ok }) + (fail ? t('offline.syncResultFail', { fail }) : ''))
    await refreshPendingCount()
    await loadMyOrders()
  } catch (e) { ElMessage.error(t('offline.syncError') + ': ' + e.message) }
}

// ── WebSocket 实时推送 ────────────────
const wsConnected = ref(false)
useWebSocket((msg) => {
  if (msg.type === 'connected') return
  if (msg.type === 'auth_ok') { wsConnected.value = true; return }
  // 断线重连后刷新数据（补发断线期间错过的事件）
  if (msg.type === 'reconnected') { loadMyOrders(); loadDishes(); return }
  // 收到订单相关事件时刷新数据
  if (msg.type?.startsWith('order_')) {
    loadMyOrders()
    loadDishes()
  }
})

// ── 在线/离线事件 ──────────────────────
window.addEventListener('online', async () => {
  isOnline.value = true
  await checkServer()
  if (serverOk.value) {
    await loadDishes()
    await syncOfflineOrders()
  }
})
window.addEventListener('offline', () => {
  isOnline.value = false
  serverOk.value = false
})

function cartQty(dishId) {
  return cart.value.filter(i => i.dishId === dishId).reduce((s, i) => s + i.qty, 0)
}

function flavorsMatch(f1, f2) {
  if (!f1 && !f2) return true
  if (!f1 || !f2) return false
  if (f1.length !== f2.length) return false
  return f1.every(fl => f2.some(f2fl => f2fl.name === fl.name && f2fl.value === fl.value))
}

async function openDishDetail(dish) {
  if (dish.status === 'inactive' || dish.status === 'sold_out') return
  selectedDish.value = dish
  dishFlavors.value = []
  dishDetailVisible.value = true

  // Load flavors (if any)
  try {
    flavorsLoading.value = true
    const flavors = await api.getDishFlavors(dish.id)
    dishFlavors.value = flavors || []
  } catch (e) {
    dishFlavors.value = []
  } finally {
    flavorsLoading.value = false
  }
}

function handleAddToCartFromDialog({ dish, flavors, qty }) {
  const existing = cart.value.find(
    i => i.dishId === dish.id && flavorsMatch(i.flavors, flavors)
  )
  if (existing) {
    existing.qty += qty
  } else {
    cart.value.push({
      dishId: dish.id,
      name: getDishName(dish),
      price: dish.price,
      qty: qty,
      flavors
    })
  }
  dishDetailVisible.value = false
}

function increaseQty(idx) { cart.value[idx].qty++ }
function decreaseQty(idx) { if (--cart.value[idx].qty <= 0) cart.value.splice(idx, 1) }
function removeItem(idx) { cart.value.splice(idx, 1) }
function clearCart() { cart.value = [] }

async function handleWaiterLogin() {
  if (!waiterForm.value.employeeNo || !waiterForm.value.password) {
    ElMessage.warning(t('common.required'))
    return
  }
  waiterLoading.value = true
  try {
    const response = await api.login(waiterForm.value.employeeNo, waiterForm.value.password)
    // 保存 token
    localStorage.setItem('token', response.token)
    // 保存用户信息
    currentUser.value = response.user
    localStorage.setItem('waiterUser', JSON.stringify(response.user))
    showWaiterLogin.value = false
    ElMessage.success(t('order.loginSuccess'))
    await loadDishes()
    await loadMyOrders()
  } catch (e) { ElMessage.error(e.message) }
  waiterLoading.value = false
}

async function saveAsDraft() {
  if (!currentUser.value) { ElMessage.warning(t('order.loginRequired')); return }
  const orderData = {
    created_by: currentUser.value.id,
    status: 'draft',
    tableNumber: tableNumber.value,
    totalAmount: totalAmount.value,
    items: cart.value.map(i => ({ dish_id: i.dishId, qty: i.qty, name: i.name, price: i.price, flavors: i.flavors || [] }))
  }
  try {
    if (!isOnline.value || !serverOk.value) {
      // 离线：存入 IndexedDB
      await queueOrder(orderData)
      ElMessage.success(t('offline.queuedDraft'))
      await refreshPendingCount()
    } else {
      await api.addOrder(orderData)
      ElMessage.success(t('order.draftSaved'))
      await loadMyOrders()
    }
    cart.value = []
    tableNumber.value = null
  } catch (e) { ElMessage.error(e.message) }
}

async function submitOrder() {
  if (!currentUser.value) { ElMessage.warning(t('order.loginRequired')); return }
  const orderData = {
    created_by: currentUser.value.id,
    status: 'pending',
    tableNumber: tableNumber.value,
    totalAmount: totalAmount.value,
    items: cart.value.map(i => ({ dish_id: i.dishId, qty: i.qty, name: i.name, price: i.price, flavors: i.flavors || [] })),
    lang: locale.value,
  }
  try {
    if (!isOnline.value || !serverOk.value) {
      // 离线：存入 IndexedDB
      await queueOrder(orderData)
      ElMessage.success(t('offline.queuedSubmit'))
      await refreshPendingCount()
    } else {
      const result = await api.addOrder(orderData)
      ElMessage.success(t('order.orderSubmitted'))
      await loadMyOrders()
    }
    cart.value = []
    tableNumber.value = null
  } catch (e) { ElMessage.error(e.message) }
}

async function saveServerUrl() {
  if (!serverUrlInput.value) {
    ElMessage.warning(t('common.serverUrlRequired'))
    return
  }
  
  serverUrl.value = serverUrlInput.value
  localStorage.setItem('serverUrl', serverUrl.value)
  showServerConfig.value = false
  
  await checkServer()
  
  if (serverOk.value) {
    if (!currentUser.value) showWaiterLogin.value = true
    else await loadDishes()
  }
}

async function checkServer() {
  try {
    await api.ping()
    serverOk.value = true
  } catch (e) {
    console.error('服务器连接失败:', e)
    // Fallback: if saved URL fails, try current page origin
    const saved = localStorage.getItem('serverUrl')
    const origin = location.origin
    if (saved && saved !== origin && !isCapacitorApp()) {
      try {
        const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          serverUrl.value = origin
          localStorage.setItem('serverUrl', origin)
          await api.ping()
          serverOk.value = true
          return
        }
      } catch {}
    }
    serverOk.value = false
  }
}

async function loadDishes() {
  try {
    loading.value = true
    const [d, cats] = await Promise.all([api.getDishes(), api.getCategories()])
    dishes.value = d
    categoryList.value = cats
    serverOk.value = true
    // 缓存到 IndexedDB
    try { await cacheMenu(d, cats) } catch {}
  } catch (e) {
    serverOk.value = false
    // 离线时尝试从缓存加载
    try {
      const cached = await getCachedMenu()
      if (cached) {
        dishes.value = cached.dishes
        categoryList.value = cached.categories
        ElMessage.info(t('offline.menuLoaded'))
      }
    } catch {}
    if (e.message) ElMessage.error(e.message)
  } finally { loading.value = false }
}

async function loadMyOrders() {
  if (!currentUser.value) return
  try {
    const res = await api.getOrdersByWaiter(currentUser.value.id)
    const list = res.orders || res
    myDrafts.value = list.filter(o => o.status === 'draft')
    myPending.value = list.filter(o => o.status === 'pending')
  } catch (e) { console.error('加载订单失败:', e) }
}

async function continueDraft(order) {
  try {
    await api.cancelOrder(order.id)
  } catch (e) {
    ElMessage.error(t('order.cancelDraftFailed') + ': ' + (e.message || ''))
    return // 取消失败则停止，避免创建重复草稿
  }
  tableNumber.value = order.table_number
  cart.value = (order.items || []).map(i => ({
    dishId: i.dish_id,
    name: i.dish_name || i.name,
    price: i.dish_price || i.price,
    qty: i.quantity || i.qty,
    flavors: i.flavors || []
  }))
  await loadMyOrders()
}

// ── 订单详情功能 ──────────────────

async function showOrderDetail(order) {
  // Refresh order data from server to get latest items
  try {
    const res = await api.getOrders({ waiter_id: currentUser.value.id })
    const fresh = (res.orders || res).find(o => o.id === order.id)
    detailOrder.value = fresh || order
  } catch {
    detailOrder.value = order
  }
  detailVisible.value = true
}

async function handleDetailAddItems(items) {
  if (!detailOrder.value) return
  try {
    const result = await api.addItemsToOrder(detailOrder.value.id, items, locale.value)
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.addItemsSuccess') + ' — ' + t('kitchen.kitchenPrintOk'))
    } else {
      ElMessage.warning(t('kitchen.addItemsSuccess') + (result.kitchen_print?.error ? ' — ' + t('kitchen.kitchenPrintFail') : ''))
    }
    await showOrderDetail(detailOrder.value) // Refresh
    await loadMyOrders()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function handleDetailCancelItem({ item, qty, reason }) {
  try {
    const result = await api.cancelOrderItem(
      detailOrder.value.id, item.id, qty, reason, locale.value
    )
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.cancelItemSuccess') + ' — ' + t('kitchen.kitchenPrintOk'))
    } else {
      ElMessage.warning(t('kitchen.cancelItemSuccess') + (result.kitchen_print?.error ? ' — ' + t('kitchen.kitchenPrintFail') : ''))
    }
    await showOrderDetail(detailOrder.value) // Refresh
    await loadMyOrders()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function handleDetailReprint() {
  if (!detailOrder.value) return
  try {
    const result = await api.kitchenReprint(detailOrder.value.id, locale.value)
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.reprintSuccess'))
    } else {
      ElMessage.warning(t('kitchen.kitchenPrintFail'))
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
  if (orderDetailDialogRef.value) {
    orderDetailDialogRef.value.reprinting = false
  }
}

function imageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return (serverUrl.value || '') + path
}

function avatarColor(name) {
  const colors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#00D4AA', '#FF85C0', '#9B59B6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

watch(locale, v => { currentLang.value = v })

onMounted(async () => {
  await refreshPendingCount()
  await checkServer()
  if (serverOk.value) {
    // 在线：先同步离线队列，再加载菜单
    if (offlinePending.value > 0) await syncOfflineOrders()
    if (!currentUser.value) showWaiterLogin.value = true
    else {
      await loadDishes()
      await loadMyOrders()
    }
  } else {
    // 离线：尝试从缓存加载菜单
    try {
      const cached = await getCachedMenu()
      if (cached) {
        dishes.value = cached.dishes
        categoryList.value = cached.categories
      }
    } catch {}
    if (!currentUser.value) showWaiterLogin.value = true
    else if (!dishes.value.length) showServerConfig.value = true
  }

  // 检查是否有被踢出的消息
  const msg = sessionStorage.getItem('kickedOutMsg')
  if (msg) {
    sessionStorage.removeItem('kickedOutMsg')
    ElMessage.warning(msg)
  }
})
</script>

<style scoped src="./OrderPage.css"></style>
