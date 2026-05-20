const BASE_URL = () => localStorage.getItem('serverUrl') || location.origin || 'http://localhost:3000'

async function request(method, path, body, isPublic) {
  const headers = { 'Content-Type': 'application/json' }
  if (!isPublic) {
    const token = localStorage.getItem('token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({ message: res.statusText }))
  if (!res.ok) {
    if (res.status === 401 && !isPublic) {
      // Token expired or invalidated by another login
      localStorage.removeItem('token')
      localStorage.removeItem('isLoggedIn')
      localStorage.removeItem('user')
      // Save kick-out message for the next page to show
      if (data.message) sessionStorage.setItem('kickedOutMsg', data.message)
      // Redirect management pages to login
      if (window.location.hash.startsWith('#/admin')) {
        window.location.hash = '#/login'
      }
    }
    throw new Error(data.message || `HTTP ${res.status}`)
  }
  return data
}

export const api = {
  // ── Upload ───────────────────────────
  uploadImage(base64) { return request('POST', '/api/upload', { image: base64 }) },

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

  // ── Orders ────────────────────────────
  getOrders(params = {}) {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/orders${qs ? '?' + qs : ''}`)
  },
  addOrder(data) { return request('POST', '/api/orders', data) },
  updateOrder(id, data) { return request('PUT', `/api/orders/${id}`, data) },
  submitOrder(id) { return request('POST', `/api/orders/${id}/submit`) },
  cancelOrder(id) { return request('POST', `/api/orders/${id}/cancel`) },
  checkoutOrder(id, data) { return request('POST', `/api/orders/${id}/checkout`, data) },
  reopenOrder(id) { return request('POST', `/api/orders/${id}/reopen`) },

  // ── Employees ─────────────────────────
  getEmployees() { return request('GET', '/api/employees') },
  addEmployee(data) { return request('POST', '/api/employees', data) },
  updateEmployee(id, data) { return request('PUT', `/api/employees/${id}`, data) },

  // ── Waiters (tablet) ─────────────────
  getWaiters() { return request('GET', '/api/waiters') },

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
