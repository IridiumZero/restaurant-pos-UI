const path = require('path')
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const os = require('os')
const { init, find, findOne, insert, update, remove, save, hashPassword } = require('./db')

const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-pos-secret-change-in-production'
const PORT = process.env.PORT || 3000

init()

const app = express()
app.use(cors())
app.use(express.json())

// ── Auth Middleware ───────────────────────────────────

function auth(roles) {
  return (req, res, next) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: '未登录' })
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET)
      if (roles && !roles.includes(payload.role)) return res.status(403).json({ message: '权限不足' })
      req.user = payload
      next()
    } catch {
      res.status(401).json({ message: '登录已过期' })
    }
  }
}

// ── Auth ──────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ message: '请输入账号和密码' })

  const emp = findOne('employees', e => e.username === username && e.password === hashPassword(password) && e.status === 'active')
  if (!emp) return res.status(401).json({ message: '账号或密码错误' })

  const token = jwt.sign({ id: emp.id, username: emp.username, name: emp.name, role: emp.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: emp.id, username: emp.username, name: emp.name, role: emp.role } })
})

app.get('/api/auth/me', auth(), (req, res) => res.json(req.user))

// ── Dishes ────────────────────────────────────────────

app.get('/api/dishes', auth(), (req, res) => {
  const { category, status, search } = req.query
  let result = find('dishes', () => true)
  if (category) result = result.filter(d => d.category === category)
  if (status) result = result.filter(d => d.status === status)
  if (search) result = result.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
  result.sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id)
  res.json(result)
})

app.post('/api/dishes', auth(['admin', 'cashier']), (req, res) => {
  const { name, category, price, image, stock, status } = req.body
  if (!name || !category || !price) return res.status(400).json({ message: '名称、分类、价格为必填项' })
  const dish = insert('dishes', {
    name, category, price: Number(price), image: image || '', stock: stock || 0, status: status || 'active',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  })
  res.json({ id: dish.id })
})

app.put('/api/dishes/:id', auth(['admin', 'cashier']), (req, res) => {
  const { name, category, price, image, stock, status } = req.body
  update('dishes', req.params.id, {
    name, category, price: Number(price), image: image || '', stock: stock || 0, status: status || 'active',
    updated_at: new Date().toISOString()
  })
  res.json({ success: true })
})

app.delete('/api/dishes/:id', auth(['admin', 'cashier']), (req, res) => {
  remove('dishes', req.params.id)
  res.json({ success: true })
})

// ── Orders ────────────────────────────────────────────

app.get('/api/orders', auth(), (req, res) => {
  const { status, waiter_id, table } = req.query
  let result = find('orders', () => true)
  if (status) result = result.filter(o => o.status === status)
  if (waiter_id) result = result.filter(o => o.waiter_id === parseInt(waiter_id))
  if (table) result = result.filter(o => o.table_number === parseInt(table))
  result.sort((a, b) => b.created_at.localeCompare(a.created_at))

  // Attach items
  for (const o of result) {
    o.items = find('order_items', oi => oi.order_id === o.id)
  }
  res.json(result)
})

app.post('/api/orders', auth(), (req, res) => {
  const { tableNumber, items, totalAmount, status } = req.body
  if (!tableNumber || !items?.length) return res.status(400).json({ message: '请选择桌号并添加菜品' })

  const order = insert('orders', {
    table_number: tableNumber, waiter_id: req.user.id, waiter_name: req.user.name,
    total_amount: Number(totalAmount), status: status || 'pending',
    payment_method: null, cash_received: null, change_amount: null,
    cashier_id: null, created_at: new Date().toISOString(), paid_at: null
  })
  for (const item of items) {
    insert('order_items', {
      order_id: order.id, dish_id: item.dishId, dish_name: item.name,
      dish_price: Number(item.price), quantity: item.qty, subtotal: item.price * item.qty
    })
  }
  res.json({ id: order.id })
})

app.put('/api/orders/:id', auth(), (req, res) => {
  const { tableNumber, items, totalAmount, status } = req.body
  update('orders', req.params.id, {
    table_number: tableNumber, total_amount: Number(totalAmount), status
  })
  // Replace order items
  const { data } = require('./db')
  data.order_items = data.order_items.filter(oi => oi.order_id !== parseInt(req.params.id))
  for (const item of items) {
    insert('order_items', {
      order_id: parseInt(req.params.id), dish_id: item.dishId, dish_name: item.name,
      dish_price: Number(item.price), quantity: item.qty, subtotal: item.price * item.qty
    })
  }
  save()
  res.json({ success: true })
})

app.post('/api/orders/:id/submit', auth(), (req, res) => {
  update('orders', req.params.id, { status: 'pending' })
  res.json({ success: true })
})

app.post('/api/orders/:id/checkout', auth(['admin', 'cashier']), (req, res) => {
  const { paymentMethod, cashReceived, change } = req.body
  update('orders', req.params.id, {
    status: 'completed', payment_method: paymentMethod,
    cash_received: cashReceived || null, change_amount: change || null,
    cashier_id: req.user.id, paid_at: new Date().toISOString()
  })
  res.json({ success: true })
})

// ── Employees ─────────────────────────────────────────

app.get('/api/employees', auth(['admin', 'cashier']), (req, res) => {
  const rows = find('employees', () => true).map(e => ({ id: e.id, username: e.username, name: e.name, role: e.role, status: e.status, created_at: e.created_at }))
  rows.sort((a, b) => a.id - b.id)
  res.json(rows)
})

app.post('/api/employees', auth(['admin']), (req, res) => {
  const { username, name, role, status } = req.body
  if (!username || !name) return res.status(400).json({ message: '工号和姓名为必填项' })
  if (findOne('employees', e => e.username === username)) return res.status(400).json({ message: '工号已存在' })
  const emp = insert('employees', {
    username, password: hashPassword('123456'), name, role: role || 'waiter', status: status || 'active',
    created_at: new Date().toISOString()
  })
  res.json({ id: emp.id })
})

app.put('/api/employees/:id', auth(['admin']), (req, res) => {
  const { name, role, status } = req.body
  update('employees', req.params.id, { name, role, status })
  res.json({ success: true })
})

app.put('/api/employees/:id/reset-pwd', auth(['admin']), (req, res) => {
  update('employees', req.params.id, { password: hashPassword('123456') })
  res.json({ success: true, message: '密码已重置为 123456' })
})

// ── Waiters (for tablet selection) ───────────────────

app.get('/api/waiters', auth(), (req, res) => {
  const rows = find('employees', e => e.role === 'waiter' && e.status === 'active')
    .map(e => ({ id: e.id, username: e.username, name: e.name }))
  res.json(rows)
})

// ── Reports ───────────────────────────────────────────

app.get('/api/reports/today', auth(['admin', 'cashier']), (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const completed = find('orders', o => o.status === 'completed' && o.paid_at?.startsWith(today))
  res.json({ count: completed.length, revenue: completed.reduce((s, o) => s + o.total_amount, 0) })
})

app.get('/api/reports/monthly', auth(['admin', 'cashier']), (req, res) => {
  const month = new Date().toISOString().slice(0, 7)
  const completed = find('orders', o => o.status === 'completed' && o.paid_at?.startsWith(month))
  res.json({ count: completed.length, revenue: completed.reduce((s, o) => s + o.total_amount, 0) })
})

app.get('/api/reports/monthly-trend', auth(['admin', 'cashier']), (req, res) => {
  const days = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const data = days.map(day => {
    const orders = find('orders', o => o.status === 'completed' && o.paid_at?.startsWith(day))
    return { date: day, revenue: orders.reduce((s, o) => s + o.total_amount, 0), count: orders.length }
  })
  res.json(data)
})

app.get('/api/reports/category-pie', auth(['admin', 'cashier']), (req, res) => {
  // Get completed order items with dish categories
  const completedOrders = find('orders', o => o.status === 'completed')
  const catMap = {}
  for (const o of completedOrders) {
    const items = find('order_items', oi => oi.order_id === o.id)
    for (const item of items) {
      const dish = findOne('dishes', d => d.id === item.dish_id)
      const cat = dish?.category || '其他'
      catMap[cat] = (catMap[cat] || 0) + item.subtotal
    }
  }
  const result = Object.entries(catMap).map(([category, total]) => ({ category, total }))
  res.json(result)
})

app.get('/api/reports/payment-pie', auth(['admin', 'cashier']), (req, res) => {
  const completed = find('orders', o => o.status === 'completed')
  const map = {}
  completed.forEach(o => { map[o.payment_method] = (map[o.payment_method] || 0) + 1 })
  res.json(Object.entries(map).map(([name, value]) => ({ name, value })))
})

app.get('/api/reports/dishes-top', auth(['admin', 'cashier']), (req, res) => {
  const completedOrders = find('orders', o => o.status === 'completed')
  const dishMap = {}
  for (const o of completedOrders) {
    const items = find('order_items', oi => oi.order_id === o.id)
    for (const item of items) {
      dishMap[item.dish_name] = (dishMap[item.dish_name] || 0) + item.quantity
    }
  }
  const sorted = Object.entries(dishMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
  res.json(sorted.map(([name, qty]) => ({ name, qty })))
})

app.get('/api/reports/waiter-rank', auth(['admin', 'cashier']), (req, res) => {
  const completed = find('orders', o => o.status === 'completed')
  const map = {}
  completed.forEach(o => {
    const name = o.waiter_name || '未知'
    if (!map[name]) map[name] = { name, orders: 0, revenue: 0 }
    map[name].orders++
    map[name].revenue += o.total_amount
  })
  res.json(Object.values(map).sort((a, b) => b.revenue - a.revenue))
})

app.get('/api/orders/export', auth(['admin', 'cashier']), (req, res) => {
  const { start, end, waiter_id, table } = req.query
  let result = find('orders', o => o.status === 'completed')
  if (start) result = result.filter(o => o.paid_at >= start)
  if (end) result = result.filter(o => o.paid_at <= end + 'T23:59:59')
  if (waiter_id) result = result.filter(o => o.waiter_id === parseInt(waiter_id))
  if (table) result = result.filter(o => o.table_number === parseInt(table))
  result.sort((a, b) => b.paid_at.localeCompare(a.paid_at))
  for (const o of result) {
    o.items = find('order_items', oi => oi.order_id === o.id)
  }
  res.json(result)
})

// ── Error Handler ─────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: '服务器内部错误' })
})

// ── Start ─────────────────────────────────────────────

function getLanIp() {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return 'localhost'
}

// Serve built frontend (production)
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'))
  }
})

app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp()
  console.log('')
  console.log('  ========================================')
  console.log('    Restaurant POS Server v1.0')
  console.log('  ========================================')
  console.log('')
  console.log(`  Local:   http://localhost:${PORT}`)
  console.log(`  Network: http://${lanIp}:${PORT}`)
  console.log(`  API:     http://${lanIp}:${PORT}/api`)
  console.log('')
  console.log('  Press Ctrl+C to stop')
  console.log('')
})
