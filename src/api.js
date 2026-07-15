const BASE_URL = () => {
  const origin = location.origin

  // Capacitor/APK: origin is capacitor://localhost or https://localhost — useless for API
  // Must rely on localStorage.serverUrl (set by user in Login page)
  if (origin.startsWith('capacitor://') || origin.includes('localhost')) {
    const saved = localStorage.getItem('serverUrl')
    if (saved) return saved
    return 'http://localhost:3000'
  }

  // Browser: page was served by the Express server → location.origin IS the server
  // Exception: Vite dev server on :5173/:5174 → use localhost:3000 for API
  // Match any hostname with Vite port (localhost, 127.0.0.1, or LAN IP like 192.168.x.x)
  if (/:517[0-9]/.test(origin)) {
    return 'http://localhost:3000'
  }

  // Production/start-server.bat: use location.origin (this is the correct server URL)
  // Stale localStorage.serverUrl is ignored — origin always reflects the actual address
  return origin || 'http://localhost:3000'
}
const REQUEST_TIMEOUT = 30000 // 30 seconds

// ── 错误码翻译 ──────────────────────────────────────
import { state as i18nState, getMessages } from './i18n/state.js'

function translateError(data) {
  // 优先使用 error code
  if (data?.error) {
    const locale = i18nState.locale || 'zh'
    const msgs = getMessages()
    const errMap = msgs[locale]?.errors || msgs.zh?.errors
    if (errMap?.[data.error]) return errMap[data.error]
  }
  // fallback to server message or status text
  return data?.message || `HTTP ${data?.status || 'error'}`
}

async function request(method, path, body, isPublic) {
  const headers = { 'Content-Type': 'application/json' }
  if (!isPublic) {
    const token = localStorage.getItem('token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const res = await fetch(`${BASE_URL()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const data = await res.json().catch(() => ({ message: res.statusText }))
    if (!res.ok) {
      if (res.status === 401 && !isPublic) {
        // Token expired or invalidated by another login
        localStorage.removeItem('token')
        localStorage.removeItem('isLoggedIn')
        localStorage.removeItem('user')
        localStorage.removeItem('waiterUser')
        // Save kick-out message for the next page to show
        const errMsg = translateError(data)
        if (errMsg) sessionStorage.setItem('kickedOutMsg', errMsg)
        // Redirect management pages to login
        if (window.location.hash.startsWith('#/admin')) {
          window.location.hash = '#/login'
        } else {
          // For waiter/order page: reload so onMounted detects missing user
          window.location.reload()
        }
      }
      throw new Error(translateError(data))
    }
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      const msgs = getMessages()
      const locale = i18nState.locale || 'zh'
      const timeoutMsg = msgs[locale]?.errors?.request_timeout || msgs.zh?.errors?.request_timeout || 'Request timed out'
      throw new Error(timeoutMsg)
    }
    throw error
  }
}

export const api = {
  // ── Health Check ──────────────────────
  ping() { return request('GET', '/api/health', null, true) },

  // ── Upload ───────────────────────────
  uploadImage(base64) { return request('POST', '/api/upload', { image: base64 }) },
  deleteImage(path) { return request('DELETE', '/api/images', { path }) },

  // ── Auth ──────────────────────────────
  login(employeeNo, password) {
    return request('POST', '/api/auth/login', { employeeNo, password }, true)
  },

  // ── Categories ────────────────────────
  getCategories() { return request('GET', '/api/categories') },
  addCategory(data) { return request('POST', '/api/categories', data) },
  updateCategory(id, data) { return request('PUT', `/api/categories/${id}`, data) },
  deleteCategory(id) { return request('DELETE', `/api/categories/${id}`) },

  // ── Dishes ────────────────────────────
  getDishes(params = {}) {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/dishes${qs ? '?' + qs : ''}`)
  },
  addDish(data) { return request('POST', '/api/dishes', data) },
  updateDish(id, data) { return request('PUT', `/api/dishes/${id}`, data) },
  deleteDish(id) { return request('DELETE', `/api/dishes/${id}`) },

  // ── Flavors ────────────────────────────
  getFlavors() { return request('GET', '/api/flavors') },
  addFlavor(data) { return request('POST', '/api/flavors', data) },
  updateFlavor(id, data) { return request('PUT', `/api/flavors/${id}`, data) },
  deleteFlavor(id) { return request('DELETE', `/api/flavors/${id}`) },
  getDishFlavors(dishId) { return request('GET', `/api/dishes/${dishId}/flavors`) },
  setDishFlavors(dishId, flavors) { return request('PUT', `/api/dishes/${dishId}/flavors`, { flavors }) },

  // ── Orders ────────────────────────────
  getOrders(params = {}) {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/orders${qs ? '?' + qs : ''}`)
  },
  addOrder(data) { return request('POST', '/api/orders', data) },
  updateOrder(id, data) { return request('PUT', `/api/orders/${id}`, data) },
  submitOrder(id, lang) { return request('POST', `/api/orders/${id}/submit`, { lang }) },
  cancelOrder(id) { return request('POST', `/api/orders/${id}/cancel`) },
  deleteOrder(id) { return request('DELETE', `/api/orders/${id}`) },
  checkoutOrder(id, data) { return request('POST', `/api/orders/${id}/checkout`, data) },
  reopenOrder(id) { return request('POST', `/api/orders/${id}/reopen`) },
  printOrder(id, lang) { return request('POST', `/api/orders/${id}/print${lang ? '?lang=' + lang : ''}`) },
  getPrinters() { return request('GET', '/api/printers') },

  // ── Kitchen operations ────────────────
  addItemsToOrder(id, items, lang) { return request('POST', `/api/orders/${id}/add-items`, { items, lang }) },
  cancelOrderItem(id, itemId, cancelQty, reason, lang) { return request('POST', `/api/orders/${id}/cancel-item`, { item_id: itemId, cancel_qty: cancelQty, reason, lang }) },
  kitchenReprint(id, lang) { return request('POST', `/api/orders/${id}/kitchen-reprint`, { lang }) },

  // ── Employees ─────────────────────────
  getEmployees() { return request('GET', '/api/employees') },
  addEmployee(data) { return request('POST', '/api/employees', data) },
  updateEmployee(id, data) { return request('PUT', `/api/employees/${id}`, data) },

  // ── Waiters (tablet) ─────────────────
  getWaiters() { return request('GET', '/api/waiters') },
  getOrdersByWaiter(waiterId) {
    return request('GET', `/api/orders?waiter_id=${waiterId}`)
  },

  // ── Reports ───────────────────────────
  getTodayReport() { return request('GET', '/api/reports/today') },
  getMonthlyReport() { return request('GET', '/api/reports/monthly') },
  getMonthlyTrend() { return request('GET', '/api/reports/monthly-trend') },
  getCategoryPie() { return request('GET', '/api/reports/category-pie') },
  getPaymentPie() { return request('GET', '/api/reports/payment-pie') },
  getDishesTop() { return request('GET', '/api/reports/dishes-top') },
  getWaiterRank() { return request('GET', '/api/reports/waiter-rank') },
  exportOrders(params = {}) {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/orders/export${qs ? '?' + qs : ''}`)
  },

  // ── Database backup/restore (admin) ────
  getDbInfo() { return request('GET', '/api/db/info') },
  backupDb() { return request('POST', '/api/db/backup') },
  restoreDb(name) { return request('POST', '/api/db/restore', name ? { name } : {}) },
}
