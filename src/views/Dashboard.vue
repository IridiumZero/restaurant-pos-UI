<template>
  <div class="dashboard">
    <!-- 左侧菜品区 -->
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
      <el-empty v-if="filteredDishes.length === 0" description="暂无菜品，请先在菜品管理中添加" />
    </div>

    <!-- 右侧购物车 -->
    <div class="cart-panel">
      <div class="cart-header">
        <h3>购物车</h3>
        <el-button v-if="cart.length" type="danger" size="small" link @click="clearCart">清空</el-button>
      </div>
      <div class="cart-items">
        <div v-for="(item, index) in cart" :key="index" class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">{{ item.name }}</span>
            <span class="cart-item-price">&yen;{{ item.price }}</span>
          </div>
          <div class="cart-item-actions">
            <el-button size="small" :icon="Minus" circle @click="changeQty(index, -1)" :disabled="item.qty <= 1" />
            <span class="qty">{{ item.qty }}</span>
            <el-button size="small" :icon="Plus" circle @click="changeQty(index, 1)" />
            <el-button size="small" type="danger" :icon="Delete" circle @click="removeItem(index)" />
          </div>
          <div class="cart-item-subtotal">&yen;{{ (item.price * item.qty).toFixed(2) }}</div>
        </div>
        <el-empty v-if="cart.length === 0" description="点击左侧菜品添加" :image-size="80" />
      </div>
      <div class="cart-footer">
        <div class="cart-total-row">
          <span>合计金额</span>
          <span class="total-price">&yen;{{ total.toFixed(2) }}</span>
        </div>
        <div class="cart-count-row">共 {{ cartCount }} 件商品</div>
        <div class="cart-buttons">
          <el-button type="success" size="large" @click="showCashDialog" :disabled="cart.length === 0" style="width: 48%">
            现金支付
          </el-button>
          <el-button type="primary" size="large" @click="posPay" :disabled="cart.length === 0" style="width: 48%">
            POS支付
          </el-button>
        </div>
      </div>
    </div>

    <!-- 现金支付对话框 -->
    <el-dialog v-model="cashDialogVisible" title="现金支付" width="420px" :close-on-click-modal="false">
      <div class="cash-pay">
        <div class="cash-label">应付金额</div>
        <div class="cash-total">&yen;{{ total.toFixed(2) }}</div>
        <el-divider />
        <div class="cash-label">收款金额</div>
        <el-input-number
          v-model="cashReceived"
          :min="0"
          :precision="2"
          :step="10"
          size="large"
          style="width: 100%; margin-top: 8px"
          placeholder="请输入收款金额"
          :controls="false"
        />
        <div class="quick-amounts">
          <el-button
            v-for="amt in quickAmounts"
            :key="amt"
            size="small"
            @click="cashReceived = amt"
          >&yen;{{ amt }}</el-button>
        </div>
        <div v-if="cashReceived >= total" class="cash-change">
          应找零 <strong>&yen;{{ (cashReceived - total).toFixed(2) }}</strong>
        </div>
      </div>
      <template #footer>
        <el-button @click="cashDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="cashPay" :disabled="cashReceived < total">确认收款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Minus, Plus, Delete } from '@element-plus/icons-vue'
import { getAll, add, initDB } from '../db'

const dishes = ref([])
const cart = reactive([])
const activeCategory = ref('全部')
const cashDialogVisible = ref(false)
const cashReceived = ref(0)

const categories = computed(() => {
  const cats = [...new Set(dishes.value.map((d) => d.category))]
  return cats.sort()
})

const filteredDishes = computed(() => {
  if (activeCategory.value === '全部') return dishes.value
  return dishes.value.filter((d) => d.category === activeCategory.value)
})

const total = computed(() => cart.reduce((sum, i) => sum + i.price * i.qty, 0))

const cartCount = computed(() => cart.reduce((sum, i) => sum + i.qty, 0))

const quickAmounts = computed(() => {
  const t = total.value
  if (t <= 0) return [50, 100, 200]
  const rounded = Math.ceil(t / 10) * 10
  const list = [rounded]
  for (let i = 1; i <= 5; i++) {
    const candidate = rounded + 10 * i
    if (!list.includes(candidate)) list.push(candidate)
  }
  return list.slice(0, 6)
})

function cartQty(dishId) {
  const item = cart.find((i) => i.id === dishId)
  return item ? item.qty : 0
}

async function loadDishes() {
  dishes.value = await getAll('dishes')
}

function addToCart(dish) {
  const existing = cart.find((item) => item.id === dish.id)
  if (existing) {
    existing.qty++
  } else {
    cart.push({ id: dish.id, name: dish.name, price: dish.price, category: dish.category, qty: 1 })
  }
}

function changeQty(index, delta) {
  cart[index].qty += delta
  if (cart[index].qty <= 0) cart.splice(index, 1)
}

function removeItem(index) {
  cart.splice(index, 1)
}

function clearCart() {
  cart.splice(0, cart.length)
}

function showCashDialog() {
  cashReceived.value = 0
  cashDialogVisible.value = true
}

async function saveOrder(paymentMethod, cashReceivedVal = 0, changeVal = 0) {
  const order = {
    items: cart.map((i) => ({ ...i })),
    totalAmount: total.value,
    paymentMethod,
    cashReceived: cashReceivedVal,
    change: changeVal,
    createdAt: new Date().toISOString(),
  }
  await add('orders', order)
}

async function cashPay() {
  if (cashReceived.value < total.value) {
    ElMessage.warning('收款金额不足')
    return
  }
  const change = cashReceived.value - total.value
  await saveOrder('现金', cashReceived.value, change)
  ElMessage.success(`收款成功！找零 ${change.toFixed(2)} 元`)
  cashDialogVisible.value = false
  clearCart()
}

async function posPay() {
  try {
    await ElMessageBox.confirm('确认进行POS刷卡支付？', 'POS支付', {
      confirmButtonText: '确认刷卡',
      cancelButtonText: '取消',
      type: 'info',
    })
    const msg = ElMessage({ message: 'POS机处理中...', type: 'info', duration: 0 })
    await new Promise((r) => setTimeout(r, 2000))
    msg.close()
    await saveOrder('POS机')
    ElMessage.success('POS支付成功！')
    clearCart()
  } catch {
    // user cancelled
  }
}

onMounted(async () => {
  await initDB()
  await loadDishes()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  height: 100%;
  gap: 16px;
}

/* 左侧菜品面板 */
.menu-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}
.dish-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px 0;
  flex: 1;
  align-content: start;
}
.dish-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px 12px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid #ebeef5;
  text-align: center;
  position: relative;
  user-select: none;
}
.dish-card:hover {
  border-color: #409EFF;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}
.dish-card:active {
  transform: scale(0.97);
}
.dish-icon {
  width: 48px;
  height: 48px;
  line-height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  margin: 0 auto 8px;
}
.dish-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.dish-category {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
.dish-price {
  font-size: 18px;
  color: #f56c6c;
  font-weight: bold;
}
.dish-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 26px;
  height: 26px;
  line-height: 26px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 13px;
  font-weight: bold;
}

/* 右侧购物车 */
.cart-panel {
  width: 380px;
  background: #fff;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  min-height: 0;
}
.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #ebeef5;
}
.cart-header h3 {
  margin: 0;
  font-size: 17px;
}
.cart-items {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 0;
}
.cart-item {
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
}
.cart-item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.cart-item-name {
  font-weight: 600;
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
.qty {
  width: 28px;
  text-align: center;
  font-weight: bold;
  font-size: 15px;
}
.cart-item-subtotal {
  text-align: right;
  color: #f56c6c;
  font-weight: bold;
  font-size: 14px;
  margin-top: 4px;
}
.cart-footer {
  padding: 16px;
  border-top: 2px solid #ebeef5;
  background: #fafafa;
  border-radius: 0 0 8px 8px;
}
.cart-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  margin-bottom: 4px;
}
.total-price {
  color: #f56c6c;
  font-size: 26px;
  font-weight: bold;
}
.cart-count-row {
  text-align: right;
  color: #909399;
  font-size: 13px;
  margin-bottom: 14px;
}
.cart-buttons {
  display: flex;
  justify-content: space-between;
  gap: 4%;
}

/* 现金支付对话框 */
.cash-pay {
  text-align: center;
}
.cash-label {
  font-size: 14px;
  color: #909399;
}
.cash-total {
  font-size: 32px;
  font-weight: bold;
  color: #f56c6c;
  margin: 4px 0;
}
.quick-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  justify-content: center;
}
.cash-change {
  margin-top: 16px;
  font-size: 18px;
  color: #67c23a;
}
.cash-change strong {
  font-size: 24px;
}
</style>
