const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const os = require('os')
const { init, find, findOne, insert, update, remove, removeWhere, save, listBackups, hashPassword } = require('./db')

const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-pos-secret-change-in-production'
const PORT = process.env.PORT || 3000

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Image Upload ───────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

app.post('/api/upload', auth(['admin', 'cashier', 'waiter']), (req, res) => {
  const { image } = req.body
  if (!image || !image.startsWith('data:image/')) return res.status(400).json({ message: 'Invalid image data' })
  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches) return res.status(400).json({ message: 'Invalid base64 image' })
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
  const data = Buffer.from(matches[2], 'base64')
  const bytes = crypto.randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const uuid = bytes.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
  const filename = `${uuid}.${ext}`
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), data)
  res.json({ path: `/uploads/${filename}` })
})

// ── Auth Middleware ───────────────────────────────────

function auth(roles) {
  return (req, res, next) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: '未登录' })
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET)
      if (roles && !roles.includes(payload.role)) return res.status(403).json({ message: '权限不足' })

      // Check session validity: if token_version has been incremented, this token is stale
      if (payload.ver !== undefined) {
        const emp = findOne('employees', e => e.id === payload.id)
        if (!emp || emp.status !== 'active') return res.status(401).json({ message: '账号已被禁用' })
        if (emp.token_version !== payload.ver) return res.status(401).json({ message: '该账号已在其他设备登录，请重新登录' })
      }

      req.user = payload
      next()
    } catch {
      res.status(401).json({ message: '登录已过期' })
    }
  }
}

// ── Auth ──────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const employeeNo = req.body.employeeNo || req.body.username
  const { password } = req.body
  if (!employeeNo || !password) return res.status(400).json({ message: '请输入工号和密码' })

  const emp = findOne('employees', e => e.username === employeeNo && e.password === hashPassword(password) && e.status === 'active')
  if (!emp) return res.status(401).json({ message: '工号或密码错误' })

  // Invalidate previous sessions: increment token_version so old tokens are rejected
  const newVersion = (emp.token_version || 0) + 1
  update('employees', emp.id, { token_version: newVersion })

  const token = jwt.sign({ id: emp.id, username: emp.username, name: emp.name, role: emp.role, ver: newVersion }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: emp.id, username: emp.username, name: emp.name, role: emp.role } })
})

app.get('/api/auth/me', auth(), (req, res) => res.json(req.user))

// ── Dishes ────────────────────────────────────────────

app.get('/api/dishes', auth(), (req, res) => {
  const { category, status, search } = req.query
  let result = find('dishes', () => true)
  if (category) result = result.filter(d => d.category === category)
  if (status) result = result.filter(d => d.status === status)
  if (search) {
    const q = search.toLowerCase()
    result = result.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.name_pt || '').toLowerCase().includes(q) ||
      (d.name_en || '').toLowerCase().includes(q)
    )
  }
  result.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
  res.json(result)
})

app.post('/api/dishes', auth(['admin', 'cashier']), (req, res) => {
  const { name, name_pt, name_en, category, price, image, remark, remark_pt, remark_en, sort_order, status } = req.body
  if (!name || !category || !price) return res.status(400).json({ message: '名称、分类、价格为必填项' })
  // category can be comma-separated for multi-select
  const catStr = Array.isArray(category) ? category.join(',') : category
  const allDishes = find('dishes', () => true)
  const maxOrder = allDishes.reduce((max, d) => Math.max(max, d.sort_order ?? 0), 0)
  const dish = insert('dishes', {
    name, name_pt: name_pt || '', name_en: name_en || '', category: catStr, price: Number(price), image: image || '', remark: remark || '', remark_pt: remark_pt || '', remark_en: remark_en || '', sort_order: sort_order ?? (maxOrder + 1), status: status || 'active',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  })
  res.json({ id: dish.id })
})

app.put('/api/dishes/:id', auth(['admin', 'cashier']), (req, res) => {
  const fields = { updated_at: new Date().toISOString() }
  const keys = ['name', 'name_pt', 'name_en', 'category', 'price', 'image', 'remark', 'remark_pt', 'remark_en', 'sort_order', 'status']
  for (const k of keys) {
    if (req.body[k] !== undefined) {
      if (k === 'price') fields[k] = Number(req.body[k])
      else if (k === 'category' && Array.isArray(req.body[k])) fields[k] = req.body[k].join(',')
      else fields[k] = req.body[k]
    }
  }
  update('dishes', req.params.id, fields)
  res.json({ success: true })
})

app.delete('/api/dishes/:id', auth(['admin', 'cashier']), (req, res) => {
  remove('dishes', req.params.id)
  res.json({ success: true })
})

// ── Categories ─────────────────────────────────────────

app.get('/api/categories', auth(), (req, res) => {
  const rows = find('categories', () => true)
  rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
  res.json(rows)
})

app.post('/api/categories', auth(['admin', 'cashier']), (req, res) => {
  const { name, name_pt, name_en } = req.body
  if (!name?.trim()) return res.status(400).json({ message: '分类名称不能为空' })
  if (findOne('categories', c => c.name === name.trim())) return res.status(400).json({ message: '分类已存在' })
  const cat = insert('categories', { name: name.trim(), name_pt: name_pt || '', name_en: name_en || '', created_at: new Date().toISOString() })
  res.json(cat)
})

app.put('/api/categories/:id', auth(['admin', 'cashier']), (req, res) => {
  const { name, name_pt, name_en, sort_order } = req.body
  const cat = findOne('categories', c => c.id === parseInt(req.params.id))
  if (!cat) return res.status(404).json({ message: '分类不存在' })
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: '分类名称不能为空' })
    if (findOne('categories', c => c.name === name.trim() && c.id !== cat.id)) return res.status(400).json({ message: '分类已存在' })
  }
  const fields = {}
  if (name !== undefined) fields.name = name.trim()
  if (name_pt !== undefined) fields.name_pt = name_pt
  if (name_en !== undefined) fields.name_en = name_en
  if (sort_order !== undefined) fields.sort_order = sort_order
  // If renaming, sync dish categories
  if (name !== undefined && name.trim() !== cat.name) {
    const dishes = find('dishes', d => d.category === cat.name)
    for (const d of dishes) update('dishes', d.id, { category: name.trim() })
  }
  if (Object.keys(fields).length) update('categories', req.params.id, fields)
  res.json({ success: true })
})

app.delete('/api/categories/:id', auth(['admin']), (req, res) => {
  const cat = findOne('categories', c => c.id === parseInt(req.params.id))
  if (!cat) return res.status(404).json({ message: '分类不存在' })
  remove('categories', req.params.id)
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

  // Check table conflict: prevent multiple pending orders on the same table
  if (status === 'pending') {
    const existing = findOne('orders', o => o.table_number === tableNumber && o.status === 'pending')
    if (existing) return res.status(409).json({ message: `该桌号已有待结账订单 #${existing.id}，请先结账后再下单` })
  }

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
  removeWhere('order_items', oi => oi.order_id === parseInt(req.params.id))
  for (const item of items) {
    insert('order_items', {
      order_id: parseInt(req.params.id), dish_id: item.dishId, dish_name: item.name,
      dish_price: Number(item.price), quantity: item.qty, subtotal: item.price * item.qty
    })
  }
  res.json({ success: true })
})

app.post('/api/orders/:id/submit', auth(), (req, res) => {
  update('orders', req.params.id, { status: 'pending' })
  res.json({ success: true })
})

app.post('/api/orders/:id/cancel', auth(['admin', 'cashier']), (req, res) => {
  update('orders', req.params.id, { status: 'cancelled' })
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

app.post('/api/orders/:id/reopen', auth(['admin', 'cashier']), (req, res) => {
  update('orders', req.params.id, { status: 'pending' })
  res.json({ success: true })
})

// ── Employees ─────────────────────────────────────────

app.get('/api/employees', auth(['admin', 'cashier']), (req, res) => {
  const rows = find('employees', () => true).map(e => ({ id: e.id, username: e.username, name: e.name, role: e.role, status: e.status, password: e.password, created_at: e.created_at }))
  rows.sort((a, b) => a.id - b.id)
  res.json(rows)
})

app.post('/api/employees', auth(['admin']), (req, res) => {
  const { username, name, role, status, password: plainPwd } = req.body
  if (!username || !name) return res.status(400).json({ message: '工号和姓名为必填项' })
  if (findOne('employees', e => e.username === username)) return res.status(400).json({ message: '工号已存在' })
  const emp = insert('employees', {
    username, password: hashPassword(plainPwd || '123456'), name, role: role || 'waiter', status: status || 'active',
    created_at: new Date().toISOString()
  })
  res.json({ id: emp.id })
})

app.put('/api/employees/:id', auth(['admin']), (req, res) => {
  const { name, role, status, password: plainPwd } = req.body
  const fields = { name, role, status }
  if (plainPwd) fields.password = hashPassword(plainPwd)
  update('employees', req.params.id, fields)
  res.json({ success: true })
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
  // 按点单次数统计：每个菜品属于多个分类时，每个分类各计 1 次
  const completedOrders = find('orders', o => o.status === 'completed')
  const catMap = {}
  for (const o of completedOrders) {
    const items = find('order_items', oi => oi.order_id === o.id)
    for (const item of items) {
      const dish = findOne('dishes', d => d.id === item.dish_id)
      const cats = (dish?.category || '其他').split(/[,，]/).map(c => c.trim()).filter(Boolean)
      for (const cat of cats) {
        catMap[cat] = (catMap[cat] || 0) + 1
      }
    }
  }
  const result = Object.entries(catMap).map(([category, count]) => ({ category, count }))
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
      if (!dishMap[item.dish_id]) {
        const dish = findOne('dishes', d => d.id === item.dish_id)
        dishMap[item.dish_id] = { id: item.dish_id, name: dish?.name || item.dish_name, qty: 0 }
      }
      dishMap[item.dish_id].qty += item.quantity
    }
  }
  const sorted = Object.values(dishMap).sort((a, b) => b.qty - a.qty).slice(0, 10)
  res.json(sorted)
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

// ── Database Backup / Restore (admin only) ────────────

app.get('/api/db/info', auth(['admin']), (req, res) => {
  const dbPath = path.join(__dirname, 'data.sqlite')
  const bakPath = path.join(__dirname, 'data.sqlite.bak')
  const info = {}
  try {
    const st = fs.statSync(dbPath)
    info.db = { size: st.size, mtime: st.mtime.toISOString() }
  } catch { info.db = null }
  try {
    const st = fs.statSync(bakPath)
    info.bak = { size: st.size, mtime: st.mtime.toISOString() }
  } catch { info.bak = null }
  info.backups = listBackups()
  res.json(info)
})

app.post('/api/db/backup', auth(['admin']), (req, res) => {
  save()
  res.json({ message: '备份完成', time: new Date().toISOString() })
})

app.post('/api/db/restore', auth(['admin']), (req, res) => {
  const { name } = req.body
  const bakPath = name
    ? path.join(__dirname, 'backups', name)
    : path.join(__dirname, 'data.sqlite.bak')

  if (name) {
    // Validate the backup name to prevent path traversal
    if (!/^data-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/.test(name)) {
      return res.status(400).json({ message: '无效的备份文件名' })
    }
    if (!fs.existsSync(bakPath)) return res.status(404).json({ message: '指定的备份文件不存在' })
  } else {
    if (!fs.existsSync(bakPath)) return res.status(404).json({ message: '备份文件不存在' })
  }

  const safetyPath = path.join(__dirname, 'data.sqlite.before_restore')
  const dbPath = path.join(__dirname, 'data.sqlite')
  try {
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safetyPath)
    fs.copyFileSync(bakPath, dbPath)
    res.json({ message: '已从备份恢复，请重启服务以加载数据' })
  } catch (e) {
    res.status(500).json({ message: '恢复失败: ' + e.message })
  }
})

// ── Error Handler ─────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: '服务器内部错误' })
})

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

// ── Start ─────────────────────────────────────────────
;(async () => {
  await init()

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
})()
