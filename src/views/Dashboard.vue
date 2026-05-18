<template>
  <div class="dashboard">
    <!-- 菜品区 -->
    <div class="menu-panel">
      <el-radio-group v-model="activeCategory" size="large">
        <el-radio-button value="全部">全部</el-radio-button>
        <el-radio-button v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</el-radio-button>
      </el-radio-group>
      <div class="dish-grid">
        <div
          v-for="dish in filteredDishes"
          :key="dish.id"
          class="dish-card"
          @click="addToCart(dish)"
        >
          <div class="dish-icon">{{ dish.name.charAt(0) }}</div>
          <div class="dish-name">{{ dish.name }}</div>
          <div class="dish-category">{{ dish.category }}</div>
          <div class="dish-price">&yen;{{ dish.price }}</div>
          <div v-if="cartQty(dish.id)" class="dish-badge">{{ cartQty(dish.id) }}</div>
        </div>
      </div>
    </div>

    <!-- 购物车 -->
    <div class="cart-panel">
      <div class="cart-header">
        <span>购物车</span>
        <span class="cart-count">{{ cart.length }} 件</span>
        <el-button size="small" @click="clearCart" :disabled="!cart.length">清空</el-button>
      </div>
      <div class="cart-items">
        <div v-for="item in cart" :key="item.id" class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">{{ item.name }}</span>
            <span class="cart-item-price">&yen;{{ item.price }}</span>
          </div>
          <div class="cart-item-actions">
            <el-button circle size="small" @click="decreaseQty(item.id)">−</el-button>
            <span class="cart-item-qty">{{ item.qty }}</span>
            <el-button circle size="small" @click="increaseQty(item.id)">+</el-button>
            <div class="cart-item-subtotal">&yen;{{ (item.price * item.qty).toFixed(2) }}</div>
          </div>
        </div>
        <div v-if="!cart.length" class="cart-empty">暂无商品，点击左侧菜品添加</div>
      </div>
      <div class="cart-footer">
        <div class="cart-total-row">
          <span>合计</span>
          <span class="total-price">&yen;{{ total.toFixed(2) }}</span>
        </div>
        <div class="cart-buttons">
          <el-button type="success" size="large" @click="cashDialogVisible = true" :disabled="!cart.length" style="flex:1">
            现金支付
          </el-button>
          <el-button type="primary" size="large" @click="posPay" :disabled="!cart.length" style="flex:1">
            POS支付
          </el-button>
        </div>
      </div>
    </div>

    <!-- 现金收款弹窗 -->
    <el-dialog v-model="cashDialogVisible" title="现金收款" width="360px" :close-on-click-modal="false">
      <div class="cash-total">应收 <span class="money">&yen;{{ total.toFixed(2) }}</span></div>
      <el-input v-model="cashInput" placeholder="输入收款金额" size="large" style="margin-top: 12px" @input="onCashInput" />
      <div class="cash-shortcuts">
        <el-button
          v-for="amt in shortcuts"
          :key="amt"
          size="small"
          @click="cashInput = amt.toFixed(2)"
        >&yen;{{ amt }}</el-button>
      </div>
      <div class="cash-change" v-if="cashReceived >= total">
        找零 <span class="money">&yen;{{ (cashReceived - total).toFixed(2) }}</span>
      </div>
      <template #footer>
        <el-button @click="cashDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="cashPay" :disabled="cashReceived < total">确认收款</el-button>
      </template>
    </el-dialog>

    <!-- ====== 模拟小票：开始 ====== -->
    <el-dialog v-model="receiptVisible" title="小票预览（模拟打印）" width="320px" :close-on-click-modal="false">
      <div class="receipt-paper">
        <div class="receipt-line receipt-title">餐厅收银系统</div>
        <div class="receipt-line receipt-dash">------------------------</div>
        <div class="receipt-line">单号: {{ lastReceipt?.orderNo }}</div>
        <div class="receipt-line">时间: {{ lastReceipt?.time }}</div>
        <div class="receipt-line">支付: {{ lastReceipt?.method }}</div>
        <div class="receipt-line receipt-dash">------------------------</div>
        <div v-for="(item, i) in lastReceipt?.items" :key="i" class="receipt-row">
          <span>{{ item.name }}</span>
          <span>{{ item.qty }} × &yen;{{ item.price }}</span>
        </div>
        <div class="receipt-line receipt-dash">------------------------</div>
        <div class="receipt-line">合计: &yen;{{ lastReceipt?.total }}</div>
        <div v-if="lastReceipt?.method === '现金'" class="receipt-line">收款: &yen;{{ lastReceipt?.cash }}</div>
        <div v-if="lastReceipt?.method === '现金'" class="receipt-line">找零: &yen;{{ lastReceipt?.change }}</div>
        <div class="receipt-line receipt-dash">------------------------</div>
        <div class="receipt-line receipt-footer">谢谢惠顾，欢迎再次光临</div>
      </div>
      <template #footer>
        <el-button type="primary" @click="receiptVisible = false">确认</el-button>
      </template>
    </el-dialog>
    <!-- ====== 模拟小票：结束 ====== -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAll, add, initDB } from '../db'

const dishes = ref([])
const cart = reactive([])
const activeCategory = ref('全部')
const cashDialogVisible = ref(false)
const cashInput = ref('')

// --- 模拟打印 开始 ---
const receiptVisible = ref(false)
const lastReceipt = ref(null)
// --- 模拟打印 结束 ---

const categories = computed(() => {
  return [...new Set(dishes.value.map((d) => d.category))].sort()
})

const filteredDishes = computed(() => {
  if (activeCategory.value === '全部') return dishes.value
  return dishes.value.filter((d) => d.category === activeCategory.value)
})

const total = computed(() => {
  return cart.reduce((s, item) => s + item.price * item.qty, 0)
})

const cashReceived = computed(() => parseFloat(cashInput.value) || 0)

const shortcuts = computed(() => {
  const t = total.value
  if (!t) return []
  const base = Math.ceil(t / 10) * 10
  return [...new Set([base, base + 10, base + 20, base + 50])]
})

function cartQty(id) {
  const item = cart.find((i) => i.id === id)
  return item ? item.qty : 0
}

function addToCart(dish) {
  const item = cart.find((i) => i.id === dish.id)
  if (item) {
    item.qty++
  } else {
    cart.push({ ...dish, qty: 1 })
  }
}

function increaseQty(id) {
  const item = cart.find((i) => i.id === id)
  if (item) item.qty++
}

function decreaseQty(id) {
  const item = cart.find((i) => i.id === id)
  if (!item) return
  if (item.qty <= 1) {
    const idx = cart.findIndex((i) => i.id === id)
    cart.splice(idx, 1)
  } else {
    item.qty--
  }
}

function clearCart() {
  cart.length = 0
}

function onCashInput() {
  // keep model updated via computed
}

async function saveOrder(method, cashAmount, changeAmount) {
  const order = {
    items: cart.map((i) => ({
      name: i.name,
      price: i.price,
      category: i.category,
      qty: i.qty,
    })),
    totalAmount: total.value,
    paymentMethod: method,
    cashReceived: cashAmount,
    change: changeAmount,
    createdAt: new Date().toISOString(),
  }
  await add('orders', order)
  return order
}

// --- 模拟打印 开始 ---
// 模拟向 ESC/POS 热敏打印机发送打印指令
// 实际集成时替换为 Capacitor 蓝牙插件调用
function simulatePrint(receipt) {
  return new Promise((resolve) => {
    ElMessage({
      message: '正在连接打印机...',
      type: 'info',
      duration: 800,
    })
    setTimeout(() => {
      ElMessage({
        message: '打印机已连接，正在打印...',
        type: 'info',
        duration: 600,
      })
    }, 800)
    setTimeout(() => {
      lastReceipt.value = receipt
      receiptVisible.value = true
      ElMessage.success('小票打印完成！')
      resolve()
    }, 1500)
  })
}
// --- 模拟打印 结束 ---

async function cashPay() {
  if (cashReceived.value < total.value) {
    ElMessage.warning('收款金额不足')
    return
  }
  const change = cashReceived.value - total.value
  const order = await saveOrder('现金', cashReceived.value, change)

  // --- 模拟打印 开始 ---
  await simulatePrint({
    orderNo: String(order).padStart?.(6, '0') || order,
    time: new Date().toLocaleString('zh-CN'),
    method: '现金',
    items: cart.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
    total: total.value.toFixed(2),
    cash: cashReceived.value.toFixed(2),
    change: change.toFixed(2),
  })
  // --- 模拟打印 结束 ---

  cashDialogVisible.value = false
  clearCart()
}

async function posPay() {
  try {
    await ElMessageBox.confirm(`确认POS刷卡 ¥${total.value.toFixed(2)}？`, 'POS支付', {
      confirmButtonText: '确认刷卡',
      cancelButtonText: '取消',
      type: 'info',
    })
  } catch {
    return
  }

  // --- 模拟打印 开始 ---
  const processingMsg = ElMessage({
    message: 'POS机处理中...',
    type: 'info',
    duration: 0,
  })
  await new Promise((r) => setTimeout(r, 2000))
  processingMsg.close()
  // --- 模拟打印 结束 ---

  const order = await saveOrder('POS机', null, null)

  // --- 模拟打印 开始 ---
  await simulatePrint({
    orderNo: String(order).padStart?.(6, '0') || order,
    time: new Date().toLocaleString('zh-CN'),
    method: 'POS机',
    items: cart.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
    total: total.value.toFixed(2),
    cash: null,
    change: null,
  })
  // --- 模拟打印 结束 ---

  clearCart()
}

onMounted(async () => {
  await initDB()
  dishes.value = await getAll('dishes')
})
</script>

<style scoped>
.dashboard {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ---- 菜品区 ---- */
.menu-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow: hidden;
  min-width: 0;
}
.menu-panel .el-radio-group {
  overflow-x: auto;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-overflow-scrolling: touch;
}
.dish-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  margin-top: 10px;
  overflow-y: auto;
  flex: 1;
  align-content: start;
  -webkit-overflow-scrolling: touch;
}
.dish-card {
  background: #fff;
  border-radius: 8px;
  padding: 10px 6px;
  text-align: center;
  cursor: pointer;
  position: relative;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: transform 0.1s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.dish-card:active {
  transform: scale(0.96);
}
.dish-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ecf5ff;
  color: #409EFF;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 4px;
  font-size: 16px;
  font-weight: bold;
}
.dish-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dish-category {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}
.dish-price {
  color: #f56c6c;
  font-weight: bold;
  font-size: 14px;
  margin-top: 4px;
}
.dish-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

/* ---- 购物车 ---- */
.cart-panel {
  width: 320px;
  background: #fff;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.cart-header {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e4e7ed;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}
.cart-count {
  color: #909399;
  font-weight: normal;
  font-size: 13px;
}
.cart-header .el-button {
  margin-left: auto;
}
.cart-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  -webkit-overflow-scrolling: touch;
}
.cart-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
  font-size: 14px;
}
.cart-item {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.cart-item-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.cart-item-name {
  font-weight: 500;
  font-size: 14px;
}
.cart-item-price {
  color: #909399;
  font-size: 13px;
}
.cart-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cart-item-qty {
  min-width: 24px;
  text-align: center;
  font-weight: 600;
}
.cart-item-subtotal {
  margin-left: auto;
  color: #f56c6c;
  font-weight: bold;
}
.cart-footer {
  border-top: 1px solid #e4e7ed;
  padding: 12px;
}
.cart-total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  font-size: 15px;
}
.total-price {
  font-size: 22px;
  font-weight: bold;
  color: #f56c6c;
}
.cart-buttons {
  display: flex;
  gap: 8px;
}

/* ---- 现金弹窗 ---- */
.cash-total {
  text-align: center;
  font-size: 18px;
}
.cash-shortcuts {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.cash-change {
  text-align: center;
  font-size: 18px;
  margin-top: 12px;
  color: #67c23a;
}
.money {
  color: #f56c6c;
  font-weight: bold;
}

/* ---- 模拟小票 ---- */
.receipt-paper {
  background: #fffef7;
  border: 1px solid #e8e4d0;
  padding: 16px 12px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.8;
  border-radius: 4px;
}
.receipt-line {
  text-align: center;
}
.receipt-title {
  font-weight: bold;
  font-size: 15px;
}
.receipt-dash {
  color: #c0c4cc;
}
.receipt-footer {
  font-size: 12px;
  color: #909399;
}
.receipt-row {
  display: flex;
  justify-content: space-between;
}

/* ---- 平板竖屏 / 小屏适配 ---- */
@media (max-width: 768px) {
  .dashboard {
    flex-direction: column;
  }
  .cart-panel {
    width: 100%;
    max-height: 42%;
    border-left: none;
    border-top: 2px solid #409EFF;
    flex-shrink: 1;
  }
  .dish-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 6px;
  }
  .dish-card {
    padding: 8px 4px;
  }
  .dish-icon {
    width: 30px;
    height: 30px;
    font-size: 14px;
  }
  .dish-name {
    font-size: 12px;
  }
  .dish-price {
    font-size: 12px;
  }
}
</style>
