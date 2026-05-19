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
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

export const api = {
  // ── Auth ──────────────────────────────
  login(username, password) {
    return request('POST', '/api/auth/login', { username, password }, true)
  },

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
  checkoutOrder(id, data) { return request('POST', `/api/orders/${id}/checkout`, data) },

  // ── Employees ─────────────────────────
  getEmployees() { return request('GET', '/api/employees') },
  addEmployee(data) { return request('POST', '/api/employees', data) },
  updateEmployee(id, data) { return request('PUT', `/api/employees/${id}`, data) },
  resetPassword(id) { return request('PUT', `/api/employees/${id}/reset-pwd`) },

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
}
