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
            <span class="cart-item-name">{{ item.name }}</span>
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
    <el-dialog v-model="dishDetailVisible" :title="getDishName(selectedDish || {})" width="480px"
      :close-on-click-modal="true" class="dish-detail-dialog" destroy-on-close>
      <div v-if="selectedDish" class="dish-detail-body" v-loading="flavorsLoading">
        <!-- 菜品图片轮播 -->
        <div v-if="dishImages.length" class="dish-detail-image">
          <el-carousel v-if="dishImages.length > 1" height="220px" indicator-position="outside" class="dish-detail-carousel">
            <el-carousel-item v-for="(img, idx) in dishImages" :key="idx">
              <el-image :src="imageUrl(img)" fit="cover" class="dish-detail-img" />
            </el-carousel-item>
          </el-carousel>
          <el-image v-else :src="imageUrl(dishImages[0])" fit="cover" class="dish-detail-img" />
        </div>
        <!-- 菜品名称 -->
        <h3 class="dish-detail-name">{{ getDishName(selectedDish) }}</h3>
        <!-- 描述 -->
        <p v-if="getDishRemark(selectedDish)" class="dish-detail-remark">{{ getDishRemark(selectedDish) }}</p>
        <!-- 价格 -->
        <div class="dish-detail-price">{{ formatCurrency(selectedDish.price) }}</div>

        <!-- 口味选择 -->
        <div v-if="dishFlavors.length" class="dish-detail-flavors">
          <div v-for="(flavor, fi) in dishFlavors" :key="flavor.flavor_id" class="flavor-group">
            <div class="flavor-label">
              {{ getFlavorName(flavor) }}
              <span v-if="flavor.required" class="flavor-required">{{ t('menu.flavorRequired') }}</span>
            </div>
            <el-radio-group v-model="selectedFlavors[flavor.flavor_id]" class="flavor-options" size="small">
              <el-radio-button v-for="opt in flavor.options" :key="opt" :value="opt" class="flavor-btn">
                {{ localizeOption(opt) }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 数量选择 -->
        <div class="dish-detail-qty-row">
          <span class="dish-detail-qty-label">{{ t('order.qty', '数量') }}</span>
          <div class="dish-detail-qty-controls">
            <el-button circle :icon="Minus" size="small" @click="detailQty > 1 && detailQty--" :disabled="detailQty <= 1" />
            <span class="dish-detail-qty-value">{{ detailQty }}</span>
            <el-button circle :icon="Plus" size="small" @click="detailQty++" />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dishDetailVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmAddToCart" :loading="flavorsLoading">
          {{ t('order.addToCart', '加入购物车') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 订单详情对话框（加菜/退菜/补打） -->
    <el-dialog v-model="detailVisible" :title="`#${detailOrder?.id} | ${detailOrder?.table_number}${t('order.table')}`" width="600px" :close-on-click-modal="true" class="order-detail-dialog">
      <div class="order-detail-body" v-if="detailOrder">
        <!-- 菜品列表 -->
        <div class="detail-items">
          <div v-for="item in detailOrder.items" :key="item.id"
            :class="['detail-item-row', { 'detail-item-cancelled': item.item_status === 'cancelled' }]">
            <div class="detail-item-info">
              <span class="detail-item-name">{{ getItemName(item) }}</span>
              <span class="detail-item-price">{{ item.dish_price }} MT × {{ item.quantity }}</span>
            </div>
            <div class="detail-item-actions" v-if="item.item_status !== 'cancelled'">
              <el-input-number v-model="detailCancelQty[item.id]" :min="0" :max="item.quantity" size="small" style="width:100px" />
              <el-button size="small" type="danger" plain :disabled="!detailCancelQty[item.id]"
                @click="handleDetailCancelItem(item)">{{ t('kitchen.cancelItem') }}</el-button>
            </div>
            <el-tag v-else size="small" type="danger" effect="dark">{{ t('kitchen.cancelled') }}</el-tag>
          </div>
        </div>
        <div class="detail-total">
          <span>{{ t('order.totalAmount') }}</span>
          <span class="detail-total-amount">{{ formatCurrency(detailOrder.total_amount) }}</span>
        </div>

        <!-- 退菜原因 -->
        <el-input v-model="detailCancelReason" :placeholder="t('kitchen.cancelReasonPlaceholder')" size="small" style="margin-top:12px" />

        <!-- 加菜面板（折叠） -->
        <el-divider />
        <div class="add-panel-header" @click="showAddPanel = !showAddPanel">
          <span>{{ t('kitchen.addItems') }}</span>
          <el-icon :style="{ transform: showAddPanel ? 'rotate(180deg)' : '' }"><ArrowRight /></el-icon>
        </div>
        <div v-if="showAddPanel" class="add-panel">
          <el-input v-model="detailDishSearch" :placeholder="t('common.search')" clearable size="small" style="margin-bottom:10px" />
          <div class="add-dish-grid">
            <div v-for="dish in detailFilteredDishes" :key="dish.id"
              :class="['add-dish-card', { selected: detailAddCart[dish.id] }]"
              @click="toggleDetailAddDish(dish)">
              <span class="add-dish-name">{{ getDishName(dish) }}</span>
              <span class="add-dish-price">{{ dish.price }} MT</span>
              <div v-if="detailAddCart[dish.id]" class="add-dish-qty" @click.stop>
                <el-button size="small" circle @click.stop="detailDecQty(dish.id)">-</el-button>
                <span>{{ detailAddCart[dish.id].qty }}</span>
                <el-button size="small" circle @click.stop="detailIncQty(dish.id)">+</el-button>
              </div>
            </div>
          </div>
          <div v-if="detailAddCartCount > 0" style="margin-top:12px">
            <el-button type="primary" @click="handleDetailAddItems" :loading="detailAdding" style="width:100%">
              {{ t('kitchen.confirmAddItems') }} ({{ detailAddCartCount }}{{ t('order.cartItem') }})
            </el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="handleDetailReprint" :loading="detailReprinting" size="small">{{ t('kitchen.reprint') }}</el-button>
        <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Minus, Plus, Delete, UserFilled, ArrowRight, Setting, User, Lock } from '@element-plus/icons-vue'
import { useI18n, localeOptions, getDishName, getCategoryName, getDishRemark, getFlavorName, localizeOption } from '../i18n'
import { api } from '../api'
import { cacheMenu, getCachedMenu, queueOrder, syncPendingOrders, getPendingCount } from '../offline'
import { useWebSocket } from '../ws'

// 在控制台打印厨打单内容（方便调试）
function logKitchenTicket(result, label) {
  const ticket = result?.kitchen_print?.ticket_text
  if (ticket) {
    console.log(`\n%c🧾 ${label} — Kitchen Ticket`, 'color:#667eea;font-weight:bold;font-size:13px')
    console.log(ticket.replace(/\r\n/g, '\n'))
  }
}

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
    const cats = (d.category || '').split(',').map(c => c.trim())
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
const detailCancelQty = ref({})
const detailCancelReason = ref('')
const detailReprinting = ref(false)
const showAddPanel = ref(false)
const detailAddCart = ref({})
const detailDishSearch = ref('')
const detailAdding = ref(false)

// ── 菜品详情/口味选择 ──────────────────
const dishDetailVisible = ref(false)
const selectedDish = ref(null)
const dishFlavors = ref([])
const selectedFlavors = ref({})
const flavorsLoading = ref(false)
const detailQty = ref(1)

const dishImages = computed(() => {
  const dish = selectedDish.value
  if (!dish) return []
  if (dish.images) {
    try {
      const arr = typeof dish.images === 'string' ? JSON.parse(dish.images) : dish.images
      if (Array.isArray(arr) && arr.length) return arr
    } catch {}
  }
  return dish.image ? [dish.image] : []
})

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

function addToCart(dish) {
  if (dish.status === 'inactive' || dish.status === 'sold_out') return
  const existing = cart.value.find(i => i.dishId === dish.id && !i.flavors?.length)
  if (existing) {
    existing.qty++
  } else {
    cart.value.push({
      dishId: dish.id,
      name: getDishName(dish),
      price: dish.price,
      qty: 1,
      flavors: []
    })
  }
}

async function openDishDetail(dish) {
  if (dish.status === 'inactive' || dish.status === 'sold_out') return
  selectedDish.value = dish
  dishFlavors.value = []
  selectedFlavors.value = {}
  detailQty.value = 1
  dishDetailVisible.value = true

  // Load flavors (if any)
  try {
    flavorsLoading.value = true
    const flavors = await api.getDishFlavors(dish.id)
    dishFlavors.value = flavors || []
    // Initialize empty selections for each flavor
    const init = {}
    dishFlavors.value.forEach(f => { init[f.flavor_id] = '' })
    selectedFlavors.value = init
  } catch (e) {
    // API failed - just show dialog without flavors
    dishFlavors.value = []
  } finally {
    flavorsLoading.value = false
  }
}

function confirmAddToCart() {
  if (!selectedDish.value) return
  // Validate required flavors
  for (const flavor of dishFlavors.value) {
    if (flavor.required && !selectedFlavors.value[flavor.flavor_id]) {
      ElMessage.warning((t('order.flavorRequired', '请选择') + ' ' + getFlavorName(flavor)))
      return
    }
  }
  const flavors = dishFlavors.value
    .filter(f => selectedFlavors.value[f.flavor_id])
    .map(f => ({ name: f.name, name_pt: f.name_pt || '', name_en: f.name_en || '', value: selectedFlavors.value[f.flavor_id] }))

  // Find existing cart item with same dish and same flavors
  const existing = cart.value.find(
    i => i.dishId === selectedDish.value.id && flavorsMatch(i.flavors, flavors)
  )
  if (existing) {
    existing.qty += detailQty.value
  } else {
    cart.value.push({
      dishId: selectedDish.value.id,
      name: getDishName(selectedDish.value),
      price: selectedDish.value.price,
      qty: detailQty.value,
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
      logKitchenTicket(result, 'New Order')
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
      console.log(`尝试回退到 ${origin}`)
      try {
        const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          serverUrl.value = origin
          localStorage.setItem('serverUrl', origin)
          await api.ping()
          serverOk.value = true
          console.log(`已自动切换到 ${origin}`)
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
  tableNumber.value = order.table_number
  cart.value = (order.items || []).map(i => ({
    dishId: i.dish_id,
    name: i.dish_name || i.name,
    price: i.dish_price || i.price,
    qty: i.quantity || i.qty,
    flavors: i.flavors || []
  }))
  // 删除草稿
  try { await api.cancelOrder(order.id) } catch (e) { console.error('删除草稿失败:', e) }
  await loadMyOrders()
}

// ── 订单详情功能 ──────────────────

function getItemName(item) {
  if (!item) return ''
  // Try localized field first (enriched by backend)
  if (locale.value === 'pt' && item.dish_name_pt) return item.dish_name_pt
  if (locale.value === 'en' && item.dish_name_en) return item.dish_name_en
  // Fallback to dish map for local name lookup
  const d = dishes.value.find(dd => dd.id === item.dish_id)
  if (d) return getDishName(d)
  return item.dish_name || ''
}

const detailFilteredDishes = computed(() => {
  let list = dishes.value.filter(d => d.status === 'active')
  if (detailDishSearch.value) {
    const q = detailDishSearch.value.toLowerCase()
    list = list.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.name_pt || '').toLowerCase().includes(q) ||
      (d.name_en || '').toLowerCase().includes(q)
    )
  }
  return list
})

const detailAddCartCount = computed(() => Object.values(detailAddCart.value).reduce((s, i) => s + i.qty, 0))

async function showOrderDetail(order) {
  // Refresh order data from server to get latest items
  try {
    const res = await api.getOrders({ waiter_id: currentUser.value.id })
    const fresh = (res.orders || res).find(o => o.id === order.id)
    detailOrder.value = fresh || order
  } catch {
    detailOrder.value = order
  }
  detailCancelQty.value = {}
  detailCancelReason.value = ''
  detailAddCart.value = {}
  detailDishSearch.value = ''
  showAddPanel.value = false
  for (const item of (detailOrder.value.items || [])) {
    if (item.item_status !== 'cancelled') {
      detailCancelQty.value[item.id] = 0
    }
  }
  detailVisible.value = true
}

function toggleDetailAddDish(dish) {
  if (detailAddCart.value[dish.id]) {
    delete detailAddCart.value[dish.id]
  } else {
    detailAddCart.value[dish.id] = { dish, qty: 1 }
  }
}

function detailIncQty(dishId) {
  if (detailAddCart.value[dishId]) detailAddCart.value[dishId].qty++
}

function detailDecQty(dishId) {
  if (detailAddCart.value[dishId]) {
    detailAddCart.value[dishId].qty--
    if (detailAddCart.value[dishId].qty <= 0) delete detailAddCart.value[dishId]
  }
}

async function handleDetailAddItems() {
  if (!detailOrder.value) return
  detailAdding.value = true
  try {
    const items = Object.values(detailAddCart.value).map(c => ({
      dish_id: c.dish.id,
      name: getDishName(c.dish),
      price: c.dish.price,
      qty: c.qty,
    }))
    const result = await api.addItemsToOrder(detailOrder.value.id, items, locale.value)
    logKitchenTicket(result, 'Add Items')
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.addItemsSuccess') + ' — ' + t('kitchen.kitchenPrintOk'))
    } else {
      ElMessage.warning(t('kitchen.addItemsSuccess') + (result.kitchen_print?.error ? ' — ' + t('kitchen.kitchenPrintFail') : ''))
    }
    detailAddCart.value = {}
    await showOrderDetail(detailOrder.value) // Refresh
    await loadMyOrders()
  } catch (e) {
    ElMessage.error(e.message)
  }
  detailAdding.value = false
}

async function handleDetailCancelItem(item) {
  const qty = detailCancelQty.value[item.id]
  if (!qty || qty <= 0) return
  try {
    const result = await api.cancelOrderItem(
      detailOrder.value.id, item.id, qty, detailCancelReason.value, locale.value
    )
    logKitchenTicket(result, 'Cancel Item')
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.cancelItemSuccess') + ' — ' + t('kitchen.kitchenPrintOk'))
    } else {
      ElMessage.warning(t('kitchen.cancelItemSuccess') + (result.kitchen_print?.error ? ' — ' + t('kitchen.kitchenPrintFail') : ''))
    }
    detailCancelReason.value = ''
    await showOrderDetail(detailOrder.value) // Refresh
    await loadMyOrders()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function handleDetailReprint() {
  if (!detailOrder.value) return
  detailReprinting.value = true
  try {
    const result = await api.kitchenReprint(detailOrder.value.id, locale.value)
    logKitchenTicket(result, 'Reprint')
    if (result.kitchen_print?.success) {
      ElMessage.success(t('kitchen.reprintSuccess'))
    } else {
      ElMessage.warning(t('kitchen.kitchenPrintFail'))
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
  detailReprinting.value = false
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

<style scoped>
/* ==================== 整体布局 ==================== */
.order-page { 
  height: 100%; 
  display: flex; 
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.left-panel { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  background: rgba(255, 255, 255, 0.95); 
  backdrop-filter: blur(10px);
  margin: 12px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.right-panel { 
  width: clamp(320px, 32vw, 400px); 
  display: flex; 
  flex-direction: column; 
  background: rgba(255, 255, 255, 0.95); 
  backdrop-filter: blur(10px);
  margin: 12px 12px 12px 0;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  flex-shrink: 0; 
}

/* ==================== 顶部标题栏 ==================== */
.panel-header { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 18px 24px; 
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff; 
  flex-shrink: 0; 
  gap: 12px;
  border-radius: 16px 16px 0 0;
}

.panel-header h2 { 
  font-size: 20px; 
  margin: 0; 
  font-weight: 700;
  letter-spacing: 0.5px;
}

.header-actions { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
}

.header-actions :deep(.el-button) {
  background: rgba(255, 255, 255, 0.2) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
  color: #ffffff !important;
  transition: all 0.3s ease;
}

.header-actions :deep(.el-button:hover) {
  background: rgba(255, 255, 255, 0.3) !important;
  transform: translateY(-2px);
}

/* ==================== 服务员信息栏 ==================== */
.waiter-bar { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 12px 24px; 
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
  border-bottom: 1.5px solid rgba(102, 126, 234, 0.15); 
  font-size: 14px; 
  flex-shrink: 0; 
}

.waiter-info { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  font-weight: 600;
  color: #2d3748;
}

.role-tag { 
  color: #718096; 
  font-size: 12px; 
  font-weight: 500;
}

/* ==================== 服务器状态（仅失败时显示）==================== */
.server-status { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  padding: 12px 24px; 
  font-size: 13px; 
  flex-shrink: 0; 
  font-weight: 500;
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.15) 0%, rgba(255, 107, 43, 0.15) 100%);
  color: #f56c6c; 
  border-bottom: 1.5px solid rgba(245, 108, 108, 0.2);
}

.status-dot { 
  width: 8px; 
  height: 8px; 
  border-radius: 50%; 
  display: inline-block;
  background: #f56c6c;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 离线同步状态栏 */
.server-status.offline-sync {
  background: linear-gradient(135deg, rgba(230, 162, 60, 0.15) 0%, rgba(245, 166, 35, 0.15) 100%);
  color: #e6a23c;
  border-bottom: 1.5px solid rgba(230, 162, 60, 0.2);
}

.server-status.offline-sync .status-dot.sync {
  background: #e6a23c;
  animation: pulse 1.5s infinite;
}

.server-status.ws-ok {
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.12) 0%, rgba(64, 158, 255, 0.12) 100%);
  color: #67c23a;
  border-bottom: 1.5px solid rgba(103, 194, 58, 0.2);
  font-size: 12px;
  padding: 8px 24px;
}

.server-status.ws-ok .status-dot.ok {
  background: #67c23a;
  width: 6px;
  height: 6px;
}

/* ==================== 分类Tab栏 ==================== */
.category-bar { 
  padding: 16px 24px; 
  overflow-x: auto; 
  white-space: nowrap; 
  flex-shrink: 0; 
  background: rgba(255, 255, 255, 0.6);
  border-bottom: 1.5px solid rgba(102, 126, 234, 0.1);
}

/* Tab group styling */
.category-tabs {
  display: inline-flex !important;
  gap: 8px;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  flex-wrap: nowrap;
}

/* Individual tab button */
.category-tab :deep(.el-radio-button__inner) {
  padding: 8px 20px !important;
  border: 2px solid #e2e8f0 !important;
  border-radius: 10px !important;
  font-weight: 500 !important;
  font-size: 14px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04) !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  position: relative;
  overflow: hidden;
}

/* Tab hover effect */
.category-tab :deep(.el-radio-button__inner:hover) {
  border-color: #667eea !important;
  color: #667eea !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
  background: rgba(102, 126, 234, 0.05) !important;
}

/* Active/Selected tab */
.category-tab :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: 2px solid #667eea !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
  transform: translateY(-3px) scale(1.02) !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
  position: relative;
}

/* ==================== 菜品网格 ==================== */
.dish-grid { 
  flex: 1; 
  overflow-y: auto; 
  padding: 20px; 
  display: grid; 
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
  gap: 16px; 
  align-content: start; 
  -webkit-overflow-scrolling: touch; 
}

.dish-card { 
  position: relative; 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  padding: 18px 14px; 
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border-radius: 16px; 
  cursor: pointer; 
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 2px solid transparent;
  -webkit-tap-highlight-color: transparent; 
  user-select: none; 
}

.dish-card:hover { 
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
  border-color: rgba(102, 126, 234, 0.3);
}

.dish-card:active { 
  transform: translateY(-2px) scale(1.01);
}

.dish-card.inactive { 
  opacity: 0.45; 
  cursor: not-allowed; 
  filter: grayscale(50%);
}

.dish-card.soldout { 
  opacity: 0.6; 
  filter: grayscale(30%);
}

/* 菜品头像 */
.dish-avatar { 
  width: clamp(64px, 55%, 120px); 
  aspect-ratio: 1; 
  border-radius: 14px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  overflow: hidden; 
  margin-bottom: 12px; 
  flex-shrink: 0; 
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.dish-card:hover .dish-avatar {
  transform: scale(1.05);
}

.dish-avatar-img { 
  width: 100%; 
  height: 100%; 
  object-fit: cover; 
}

.dish-avatar-letter { 
  width: 100%; 
  height: 100%; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  color: #fff; 
  font-size: clamp(20px, 10vw, 36px); 
  font-weight: bold; 
}

/* 菜品信息 */
.dish-info { 
  text-align: center; 
  width: 100%; 
}

.dish-name { 
  display: block; 
  font-size: clamp(14px, 2.5vw, 16px); 
  font-weight: 700; 
  color: #2d3748; 
  margin-bottom: 4px; 
}

.dish-remark { 
  display: block; 
  font-size: clamp(11px, 2vw, 13px); 
  color: #718096; 
  margin-bottom: 4px; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
}

.dish-price { 
  display: block; 
  font-size: clamp(15px, 2.5vw, 18px); 
  font-weight: 800; 
  color: #f56c6c; 
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.1) 0%, rgba(255, 107, 43, 0.1) 100%);
  padding: 4px 12px;
  border-radius: 8px;
  display: inline-block;
}

/* 数量徽章 */
.dish-badge { 
  position: absolute; 
  top: 8px;
  right: 8px; 
  background: linear-gradient(135deg, #f56c6c 0%, #ff4b2b 100%); 
  color: #fff; 
  font-size: clamp(11px, 2vw, 13px); 
  font-weight: bold; 
  min-width: 24px;
  height: 24px;
  border-radius: 12px; 
  display: flex;
  align-items: center;
  justify-content: center; 
  padding: 0 6px; 
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.4);
  animation: badge-pulse 2s infinite;
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* 售罄标签 */
.dish-soldout { 
  position: absolute; 
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); 
  font-size: clamp(13px, 2vw, 16px); 
  color: #f56c6c; 
  font-weight: bold; 
  background: rgba(255, 255, 255, 0.95); 
  padding: 6px 16px; 
  border-radius: 8px; 
  pointer-events: none; 
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 空提示 */
.empty-hint { 
  grid-column: 1/-1; 
  text-align: center; 
  color: #a0aec0; 
  padding: 80px 0; 
  font-size: 15px; 
}

/* ==================== 右侧购物车 ==================== */
.cart-header { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  padding: 18px 24px; 
  border-bottom: 1.5px solid rgba(102, 126, 234, 0.15); 
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
}

.cart-header h3 { 
  margin: 0; 
  font-size: 18px; 
  font-weight: 700;
  color: #2d3748;
}

.cart-count { 
  color: #718096; 
  font-size: 13px; 
  font-weight: 500;
  background: rgba(102, 126, 234, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
}

/* 清空购物车按钮 */
.cart-header :deep(.el-button--danger) {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%) !important;
  border: none !important;
  color: #ffffff !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  padding: 8px 16px !important;
  border-radius: 20px !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 4px 12px rgba(238, 90, 82, 0.3) !important;
  margin-left: auto !important;
}

.cart-header :deep(.el-button--danger:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 16px rgba(238, 90, 82, 0.4) !important;
  background: linear-gradient(135deg, #ff5252 0%, #e53935 100%) !important;
}

.cart-header :deep(.el-button--danger:active) {
  transform: translateY(0) !important;
}

.cart-header :deep(.el-button--danger.is-disabled) {
  background: #e0e0e0 !important;
  box-shadow: none !important;
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

.cart-list { 
  flex: 1; 
  overflow-y: auto; 
  padding: 12px 24px; 
  -webkit-overflow-scrolling: touch; 
  max-height: 400px; 
}

.cart-item { 
  padding: 12px 0; 
  border-bottom: 1px solid rgba(102, 126, 234, 0.1); 
  transition: all 0.3s ease;
  border-radius: 8px;
}

.cart-item:hover {
  background: rgba(102, 126, 234, 0.05);
  padding-left: 8px;
  padding-right: 8px;
}

.cart-item:last-child {
  border-bottom: none;
}

.cart-item-info { 
  display: flex; 
  justify-content: space-between; 
  margin-bottom: 8px; 
}

.cart-item-name { 
  font-weight: 600; 
  font-size: 15px; 
  color: #2d3748; 
}

.cart-item-price { 
  color: #718096; 
  font-size: 13px; 
  font-weight: 500;
}

.cart-item-actions { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
}

/* 删除按钮样式 */
.cart-item-actions :deep(.el-button--danger) {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%) !important;
  border: none !important;
  color: #ffffff !important;
  width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  border-radius: 8px !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 3px 8px rgba(238, 90, 82, 0.3) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.cart-item-actions :deep(.el-button--danger:hover) {
  transform: scale(1.1) !important;
  box-shadow: 0 5px 12px rgba(238, 90, 82, 0.4) !important;
  background: linear-gradient(135deg, #ff5252 0%, #e53935 100%) !important;
}

.cart-item-actions :deep(.el-button--danger:active) {
  transform: scale(0.95) !important;
}

.cart-item-actions :deep(.el-button--danger .el-icon) {
  font-size: 16px !important;
}

.cart-item-qty { 
  font-size: 16px; 
  font-weight: bold; 
  min-width: 28px; 
  text-align: center; 
  color: #2d3748;
}

.cart-empty { 
  text-align: center; 
  color: #cbd5e0; 
  padding: 40px 0; 
  font-size: 14px; 
}

/* 购物车底部 */
.cart-footer { 
  padding: 16px 24px; 
  border-top: 1.5px solid rgba(102, 126, 234, 0.15); 
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 249, 250, 0.95) 100%);
  flex-shrink: 0; 
}

.cart-total { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 12px; 
  font-size: 15px; 
  color: #2d3748; 
  font-weight: 600;
}

.total-amount { 
  font-size: 24px; 
  font-weight: 800; 
  color: #f56c6c; 
  text-shadow: 0 2px 8px rgba(245, 108, 108, 0.3);
}

.table-select { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  margin-bottom: 12px; 
  font-size: 14px; 
  color: #2d3748; 
  font-weight: 600;
}

.table-select span { 
  flex-shrink: 0; 
}

.cart-buttons { 
  display: flex; 
  gap: 10px; 
}

.cart-buttons :deep(.el-button) {
  transition: all 0.3s ease;
}

.cart-buttons :deep(.el-button:not(:disabled):hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

/* ==================== 我的订单区域 ==================== */
.my-orders-section { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  border-top: 2px solid rgba(102, 126, 234, 0.15); 
  overflow: hidden; 
}

.orders-header { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 14px 24px 0; 
  flex-shrink: 0; 
}

.orders-title { 
  font-size: 16px; 
  font-weight: 700; 
  color: #2d3748;
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
  padding: 0 16px; 
}

.mini-order-card { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 12px 14px; 
  margin-bottom: 8px; 
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  border-radius: 10px; 
  cursor: pointer; 
  font-size: 14px; 
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.mini-order-card:hover {
  transform: translateX(4px);
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.mini-order-card:active { 
  transform: translateX(2px);
}

.mini-order-card.clickable {
  cursor: pointer;
}

.mini-order-card.clickable:hover {
  border-color: rgba(230, 162, 60, 0.4);
  box-shadow: 0 4px 12px rgba(230, 162, 60, 0.15);
}

.pending-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-empty { 
  text-align: center; 
  color: #cbd5e0; 
  padding: 30px 0; 
  font-size: 14px; 
}

/* ==================== 服务员登录弹窗 ==================== */
.waiter-login-form {
  background: #ffffff !important;
  padding: 24px !important;
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
}

.waiter-login-form :deep(.el-form-item) {
  margin-bottom: 20px !important;
}

.waiter-login-form :deep(.el-input__wrapper) {
  border-radius: 10px !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  padding: 12px 16px !important;
  transition: all 0.3s ease !important;
}

.waiter-login-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
}

.waiter-login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2) !important;
}

.waiter-login-form :deep(.el-button--primary) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  border-radius: 10px !important;
  font-weight: 600 !important;
  font-size: 16px !important;
  padding: 14px !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
}

.waiter-login-form :deep(.el-button--primary:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4) !important;
}

/* ==================== 服务器配置弹窗 ==================== */
.server-url-input {
  margin: 20px 0 !important;
}

.server-url-input :deep(.el-input__wrapper) {
  border-radius: 10px !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  padding: 12px 16px !important;
  transition: all 0.3s ease !important;
}

.server-url-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
}

.server-config-dialog :deep(.el-button--primary) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
  transition: all 0.3s ease !important;
}

.server-config-dialog :deep(.el-button--primary:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
}

/* ==================== 响应式设计 ==================== */

/* 平板竖屏 / 小窗 */
@media (max-width: 900px) {
  .dish-grid { 
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); 
    gap: 12px; 
    padding: 16px;
  }
  
  .right-panel { 
    width: 320px; 
  }
}

/* 手机：上下布局 */
@media (max-width: 600px) {
  .order-page { 
    flex-direction: column; 
  }
  
  .left-panel { 
    flex: none; 
    height: 55%; 
    margin: 8px;
  }
  
  .dish-grid { 
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); 
    gap: 10px; 
    padding: 12px; 
  }
  
  .dish-card { 
    padding: 14px 10px; 
  }
  
  .right-panel { 
    width: 100%; 
    flex: 1; 
    margin: 0 8px 8px 8px;
  }
  
  .cart-list { 
    /* max-height: 160px;  */
  }
  
  .panel-header {
    padding: 14px 16px;
  }
  
  .panel-header h2 {
    font-size: 18px;
  }
}

/* ── Order detail dialog ─────────────── */

.order-detail-body {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  transition: all 0.2s;
}

.detail-item-row:hover {
  border-color: #c0c4cc;
}

.detail-item-cancelled {
  opacity: 0.45;
  text-decoration: line-through;
  background: rgba(245, 108, 108, 0.06);
}

.detail-item-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.detail-item-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.detail-item-price {
  font-size: 13px;
  color: #909399;
  white-space: nowrap;
}

.detail-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.detail-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 14px 0;
  font-size: 15px;
  font-weight: 500;
  color: #606266;
}

.detail-total-amount {
  font-size: 22px;
  font-weight: 700;
  color: #f56c6c;
}

/* Add panel (collapsible) */
.add-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: #667eea;
  user-select: none;
}

.add-panel-header:hover {
  color: #764ba2;
}

.add-panel {
  padding: 8px 0;
}

.add-dish-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.add-dish-card {
  padding: 8px 10px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-dish-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.12);
}

.add-dish-card.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.06);
}

.add-dish-name {
  font-size: 12px;
  font-weight: 500;
  color: #303133;
  line-height: 1.3;
}

.add-dish-price {
  font-size: 11px;
  color: #909399;
}

.add-dish-qty {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.add-dish-qty span {
  font-weight: 600;
  font-size: 14px;
  color: #667eea;
  min-width: 16px;
  text-align: center;
}

/* ==================== 购物车口味标签 ==================== */
.cart-item-flavors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.flavor-tag {
  font-size: 11px !important;
  border-radius: 4px !important;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================== 菜品详情对话框 ==================== */
.dish-detail-dialog :deep(.el-dialog) {
  border-radius: 16px !important;
  overflow: hidden;
}

.dish-detail-body {
  padding: 4px 0;
}

.dish-detail-image {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.dish-detail-carousel {
  border-radius: 12px;
  overflow: hidden;
}

.dish-detail-carousel :deep(.el-carousel__indicators--outside) {
  position: relative;
  margin-top: -24px;
}

.dish-detail-carousel :deep(.el-carousel__indicator .el-carousel__button) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
}

.dish-detail-carousel :deep(.el-carousel__indicator.is-active .el-carousel__button) {
  background: #667eea;
}

.dish-detail-img {
  width: 100%;
  height: 220px;
  display: block;
}

.dish-detail-img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dish-detail-name {
  font-size: 20px;
  font-weight: 700;
  color: #2d3748;
  margin: 0 0 6px 0;
}

.dish-detail-remark {
  font-size: 14px;
  color: #718096;
  margin: 0 0 10px 0;
  line-height: 1.5;
}

.dish-detail-price {
  font-size: 22px;
  font-weight: 800;
  color: #f56c6c;
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.1) 0%, rgba(255, 107, 43, 0.1) 100%);
  padding: 6px 16px;
  border-radius: 10px;
  display: inline-block;
  margin-bottom: 18px;
}

.dish-detail-flavors {
  margin-bottom: 18px;
}

.flavor-group {
  margin-bottom: 12px;
}

.flavor-group:last-child {
  margin-bottom: 0;
}

.flavor-label {
  font-size: 13px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.flavor-required {
  font-size: 11px;
  font-weight: 600;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(245, 108, 108, 0.3);
}

.flavor-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flavor-btn {
  margin-right: 0 !important;
}

.flavor-btn :deep(.el-radio-button__inner) {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 6px !important;
  border: 1px solid #dcdfe6 !important;
  box-shadow: none !important;
  color: #606266;
  background: #f5f7fa;
}

.flavor-btn:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border-color: #667eea !important;
}

.dish-detail-qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 4px;
  border-top: 1px solid rgba(102, 126, 234, 0.1);
}

.dish-detail-qty-label {
  font-size: 15px;
  font-weight: 600;
  color: #2d3748;
}

.dish-detail-qty-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dish-detail-qty-value {
  font-size: 18px;
  font-weight: 700;
  color: #667eea;
  min-width: 28px;
  text-align: center;
}

.dish-detail-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px 20px;
}

.dish-detail-dialog :deep(.el-button--primary) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  border-radius: 10px !important;
  font-weight: 600 !important;
  flex: 1;
  transition: all 0.3s ease !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3) !important;
}

.dish-detail-dialog :deep(.el-button--primary:hover) {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4) !important;
}

/* Mobile responsive for dish detail dialog */
@media (max-width: 600px) {
  .dish-detail-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 480px !important;
  }

  .dish-detail-img {
    height: 160px;
  }

  .dish-detail-name {
    font-size: 18px;
  }

  .dish-detail-price {
    font-size: 18px;
  }
}
</style>
