const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const http = require('http')
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const os = require('os')
const WebSocket = require('ws')
const { init, find, findOne, insert, update, remove, removeWhere, save, listBackups, hashPassword, verifyPassword, runTransaction } = require('./db')
const { generateReceipt, generateKitchenTicket, formatReceiptText, printText, printKitchen, listPrinters, PRINTER_NAME, KITCHEN_PRINTER_NAME } = require('./printer')

const JWT_SECRET = process.env.JWT_SECRET || 'moz-restaurant-jwt-secret-2024-fixed-key'
const PORT = process.env.PORT || 3000

const app = express()
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true) // 允许无 origin（如 curl、APK）
    callback(null, true) // 局域网环境允许所有来源
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Health Check ───────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Image Upload ───────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

app.post('/api/upload', auth(['admin', 'cashier', 'waiter']), (req, res) => {
  const { image } = req.body
  if (!image || !image.startsWith('data:image/')) return res.status(400).json({ message: 'Invalid image data' })
  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches) return res.status(400).json({ message: 'Invalid base64 image' })
  // H4: 验证 MIME 类型
  const mime = matches[1].toLowerCase()
  const allowedMimes = ['png', 'jpg', 'jpeg', 'gif', 'webp']
  if (!allowedMimes.includes(mime)) return res.status(400).json({ message: '不支持的图片格式，仅允许 png/jpg/gif/webp' })
  // H4: 限制图片大小为 5MB（base64 编码后约 6.7MB）
  const base64Data = matches[2]
  if (base64Data.length > 6700000) return res.status(400).json({ message: '图片大小不能超过 5MB' })
  const ext = mime === 'jpeg' ? 'jpg' : mime
  const data = Buffer.from(base64Data, 'base64')
  // H4: 验证文件头魔术字节
  const magicBytes = {
    png: [0x89, 0x50, 0x4E, 0x47],
    jpg: [0xFF, 0xD8, 0xFF],
    gif: [0x47, 0x49, 0x46],
    webp: null // webp 需要特殊处理 RIFF....WEBP
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'gif') {
    const expected = magicBytes[ext]
    for (let i = 0; i < expected.length; i++) {
      if (data[i] !== expected[i]) return res.status(400).json({ message: '图片文件内容与格式不匹配' })
    }
  } else if (ext === 'webp') {
    if (data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) {
      return res.status(400).json({ message: '图片文件内容与格式不匹配' })
    }
  }
  const bytes = crypto.randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const uuid = bytes.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
  const filename = `${uuid}.${ext}`
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), data)
  res.json({ path: `/uploads/${filename}` })
})

// ── Login Rate Limiting ───────────────────────────────

const loginAttempts = new Map()
const LOGIN_WINDOW_MS = 5 * 60 * 1000 // 5分钟窗口
const LOGIN_MAX_ATTEMPTS = 10 // 最多10次

// ── Auth Middleware ───────────────────────────────────

function auth(roles) {
  return (req, res, next) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'not_logged_in' })
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET)
      if (roles && !roles.includes(payload.role)) return res.status(403).json({ error: 'permission_denied' })

      // Check session validity: if token_version has been incremented, this token is stale
      if (payload.ver !== undefined) {
        const emp = findOne('employees', e => e.id === payload.id)
        if (!emp || emp.status !== 'active') return res.status(401).json({ error: 'account_disabled' })
        if (emp.token_version !== payload.ver) return res.status(401).json({ error: 'session_kicked' })
      }

      req.user = payload
      next()
    } catch {
      res.status(401).json({ error: 'session_expired' })
    }
  }
}

// ── Auth ──────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  // H2: 速率限制检查
  const ip = req.ip || req.connection.remoteAddress
  const now = Date.now()
  const attempts = loginAttempts.get(ip) || []
  const recentAttempts = attempts.filter(t => now - t < LOGIN_WINDOW_MS)
  if (recentAttempts.length >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'login_rate_limited' })
  }
  loginAttempts.set(ip, [...recentAttempts, now])

  const employeeNo = req.body.employeeNo || req.body.username
  const { password } = req.body
  if (!employeeNo || !password) return res.status(400).json({ error: 'login_fields_required' })

  const emp = findOne('employees', e => e.username === employeeNo && e.status === 'active')
  if (!emp || !verifyPassword(password, emp.password)) return res.status(401).json({ error: 'login_failed' })

  // 登录成功，清除该 IP 的计数
  loginAttempts.delete(ip)

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
  if (category) result = result.filter(d => (d.category || '').split(/[,，]/).map(c => c.trim()).includes(category))
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
  const { name, name_pt, name_en, category, price, image, images, remark, remark_pt, remark_en, sort_order, status } = req.body
  if (!name || !category || !price) return res.status(400).json({ message: '名称、分类、价格为必填项' })
  // category can be comma-separated for multi-select
  const catStr = Array.isArray(category) ? category.join(',') : category
  // images: JSON array string; image = first image (cover)
  let imagesVal = ''
  if (images) {
    imagesVal = typeof images === 'string' ? images : JSON.stringify(images)
    try {
      const arr = JSON.parse(imagesVal)
      if (Array.isArray(arr) && arr.length) {
        // cover = first image
        var coverImage = arr[0]
      }
    } catch {}
  }
  if (!coverImage) coverImage = image || ''
  const allDishes = find('dishes', () => true)
  const maxOrder = allDishes.reduce((max, d) => Math.max(max, d.sort_order ?? 0), 0)
  const dish = insert('dishes', {
    name, name_pt: name_pt || '', name_en: name_en || '', category: catStr, price: Number(price), image: coverImage, images: imagesVal, remark: remark || '', remark_pt: remark_pt || '', remark_en: remark_en || '', sort_order: sort_order ?? (maxOrder + 1), status: status || 'active',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  })
  res.json({ id: dish.id })
})

app.put('/api/dishes/:id', auth(['admin', 'cashier']), (req, res) => {
  const fields = { updated_at: new Date().toISOString() }
  const keys = ['name', 'name_pt', 'name_en', 'category', 'price', 'image', 'images', 'remark', 'remark_pt', 'remark_en', 'sort_order', 'status']
  for (const k of keys) {
    if (req.body[k] !== undefined) {
      if (k === 'price') fields[k] = Number(req.body[k])
      else if (k === 'category' && Array.isArray(req.body[k])) fields[k] = req.body[k].join(',')
      else if (k === 'images') {
        fields[k] = typeof req.body[k] === 'string' ? req.body[k] : JSON.stringify(req.body[k])
        // Auto-update cover image
        try {
          const arr = JSON.parse(fields[k])
          if (Array.isArray(arr) && arr.length) fields.image = arr[0]
          else if (Array.isArray(arr) && !arr.length) fields.image = ''
        } catch {}
      }
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
    const dishes = find('dishes', d => (d.category || '').split(/[,，]/).map(c => c.trim()).includes(cat.name))
    for (const d of dishes) {
      const newCats = d.category.split(/[,，]/).map(c => c.trim() === cat.name ? name.trim() : c.trim()).join(',')
      update('dishes', d.id, { category: newCats })
    }
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

// ── Flavors (口味模板) ──────────────────────────────────

app.get('/api/flavors', auth(), (req, res) => {
  const rows = find('flavors', () => true)
  rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
  // Parse options JSON for each row
  for (const r of rows) {
    try { r.options = JSON.parse(r.options) } catch { r.options = [] }
  }
  res.json(rows)
})

app.post('/api/flavors', auth(['admin']), (req, res) => {
  const { name, name_pt, name_en, options, sort_order } = req.body
  if (!name?.trim()) return res.status(400).json({ message: '口味名称不能为空' })
  const opts = Array.isArray(options) ? JSON.stringify(options) : (options || '[]')
  const flavor = insert('flavors', {
    name: name.trim(), name_pt: name_pt || '', name_en: name_en || '',
    options: opts, sort_order: sort_order ?? 99,
    created_at: new Date().toISOString()
  })
  res.json({ ...flavor, options: JSON.parse(flavor.options) })
})

app.put('/api/flavors/:id', auth(['admin']), (req, res) => {
  const { name, name_pt, name_en, options, sort_order } = req.body
  const fields = {}
  if (name !== undefined) fields.name = name.trim()
  if (name_pt !== undefined) fields.name_pt = name_pt
  if (name_en !== undefined) fields.name_en = name_en
  if (options !== undefined) fields.options = Array.isArray(options) ? JSON.stringify(options) : options
  if (sort_order !== undefined) fields.sort_order = sort_order
  update('flavors', req.params.id, fields)
  res.json({ success: true })
})

app.delete('/api/flavors/:id', auth(['admin']), (req, res) => {
  const id = parseInt(req.params.id)
  remove('flavors', id)
  // Clean up junction table
  const { removeWhere } = require('./db')
  removeWhere('dish_flavors', df => df.flavor_id === id)
  res.json({ success: true })
})

// ── Dish flavor associations ──────────────────────────

app.get('/api/dishes/:id/flavors', auth(), (req, res) => {
  const dishId = parseInt(req.params.id)
  const dishFlavors = find('dish_flavors', df => df.dish_id === dishId)
  // Enrich with flavor template data
  const result = []
  for (const df of dishFlavors.sort((a, b) => a.sort_order - b.sort_order)) {
    const flavor = findOne('flavors', f => f.id === df.flavor_id)
    if (flavor) {
      let opts = flavor.options
      try { opts = JSON.parse(opts) } catch { opts = [] }
      result.push({
        id: df.id, flavor_id: flavor.id, required: !!df.required,
        sort_order: df.sort_order,
        name: flavor.name, name_pt: flavor.name_pt, name_en: flavor.name_en,
        options: opts
      })
    }
  }
  res.json(result)
})

app.put('/api/dishes/:id/flavors', auth(['admin', 'cashier']), (req, res) => {
  const dishId = parseInt(req.params.id)
  const { flavors } = req.body  // Array of { flavor_id, required, sort_order }
  if (!Array.isArray(flavors)) return res.status(400).json({ message: 'flavors must be an array' })
  // Remove existing associations
  const { removeWhere } = require('./db')
  removeWhere('dish_flavors', df => df.dish_id === dishId)
  // Add new associations
  for (let i = 0; i < flavors.length; i++) {
    const f = flavors[i]
    insert('dish_flavors', {
      dish_id: dishId, flavor_id: parseInt(f.flavor_id),
      required: f.required ? 1 : 0, sort_order: f.sort_order ?? i
    })
  }
  res.json({ success: true })
})

// ── Orders ────────────────────────────────────────────

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

app.get('/api/orders', auth(), (req, res) => {
  const { status, waiter_id, table, page = '1', pageSize = '20' } = req.query
  let result = find('orders', () => true)
  if (status) result = result.filter(o => o.status === status)
  if (waiter_id) result = result.filter(o => o.waiter_id === parseInt(waiter_id))
  if (table) result = result.filter(o => o.table_number === parseInt(table))
  result.sort((a, b) => b.id - a.id)

  const total = result.length
  const p = Math.max(1, parseInt(page))
  const ps = Math.max(1, parseInt(pageSize))
  const startIdx = (p - 1) * ps
  result = result.slice(startIdx, startIdx + ps)

  // Attach items
  for (const o of result) {
    o.items = find('order_items', oi => oi.order_id === o.id)
  }
  res.json({ orders: result, total, page: p, pageSize: ps })
})

app.post('/api/orders', auth(), (req, res) => {
  const { tableNumber, items, totalAmount, status } = req.body
  if (!tableNumber || !items?.length) return res.status(400).json({ error: 'order_table_required' })

  // Check table conflict: prevent multiple pending orders on the same table
  if (status === 'pending') {
    const existing = findOne('orders', o => o.table_number === tableNumber && o.status === 'pending')
    if (existing) return res.status(409).json({ error: 'table_conflict', orderId: existing.id })
  }

  let order
  runTransaction(() => {
    order = insert('orders', {
      table_number: tableNumber, waiter_id: req.user.id, waiter_name: req.user.name,
      total_amount: Number(totalAmount), status: status || 'pending',
      payment_method: null, cash_received: null, change_amount: null,
      cashier_id: null, created_at: new Date().toISOString(), paid_at: null
    })
    for (const item of items) {
      const flavorsStr = item.flavors
        ? (typeof item.flavors === 'string' ? item.flavors : JSON.stringify(item.flavors))
        : ''
      insert('order_items', {
        order_id: order.id, dish_id: item.dish_id || item.dishId, dish_name: item.name,
        dish_price: Number(item.price), quantity: item.qty, subtotal: item.price * item.qty,
        kitchen_status: 'new', printed_qty: 0, item_status: 'normal',
        flavors: flavorsStr
      })
    }
  })

  // Kitchen print for pending orders
  const finalStatus = status || 'pending'
  let kitchenPrint = { success: false }
  if (finalStatus === 'pending') {
    try {
      order.items = find('order_items', oi => oi.order_id === order.id)
      for (const item of order.items) {
        const dish = findOne('dishes', d => d.id === item.dish_id)
        if (dish) {
          item.dish_name_pt = dish.name_pt
          item.dish_name_en = dish.name_en
          item.remark = dish.remark
          item.remark_pt = dish.remark_pt
          item.remark_en = dish.remark_en
        }
      }
      const lang = req.body.lang || 'zh'
      const ticketLines = generateKitchenTicket(order, 'new', order.items, lang)
      const ticketText = formatReceiptText(ticketLines)
      kitchenPrint = printKitchen(ticketText)
      kitchenPrint.ticket_text = ticketText
      if (kitchenPrint.success) {
        for (const item of order.items) {
          update('order_items', item.id, { kitchen_status: 'printed', printed_qty: item.quantity })
        }
      }
    } catch (e) {
      kitchenPrint = { success: false, error: e.message }
      console.error('[kitchen-print] Exception on order create:', e.message)
    }
  }

  broadcast('order_created', { id: order.id, table: order.table_number, waiter: req.user.name })
  res.json({ id: order.id, kitchen_print: kitchenPrint })
})

app.put('/api/orders/:id', auth(), (req, res) => {
  const { tableNumber, items, totalAmount, status } = req.body
  if (!tableNumber || !items?.length) return res.status(400).json({ error: 'order_table_required' })
  if (totalAmount === undefined || totalAmount === null) return res.status(400).json({ error: 'order_amount_required' })
  // Only allow editing pending or draft orders
  const existing = findOne('orders', o => o.id === parseInt(req.params.id))
  if (!existing) return res.status(404).json({ error: 'order_not_found' })
  if (existing.status !== 'pending' && existing.status !== 'draft') return res.status(400).json({ error: 'order_not_editable' })
  runTransaction(() => {
    const orderFields = {
      table_number: tableNumber, total_amount: Number(totalAmount)
    }
    if (status !== undefined) orderFields.status = status
    update('orders', req.params.id, orderFields)
    // Replace order items
    removeWhere('order_items', oi => oi.order_id === parseInt(req.params.id))
    for (const item of items) {
      const flavorsStr = item.flavors
        ? (typeof item.flavors === 'string' ? item.flavors : JSON.stringify(item.flavors))
        : ''
      insert('order_items', {
        order_id: parseInt(req.params.id), dish_id: item.dish_id || item.dishId, dish_name: item.name,
        dish_price: Number(item.price), quantity: item.qty, subtotal: item.price * item.qty,
        kitchen_status: 'new', printed_qty: 0, item_status: 'normal',
        flavors: flavorsStr
      })
    }
  })
  broadcast('order_updated', { id: parseInt(req.params.id), table: tableNumber })
  res.json({ success: true })
})

app.post('/api/orders/:id/submit', auth(), (req, res) => {
  const order = findOne('orders', o => o.id === parseInt(req.params.id))
  if (!order) return res.status(404).json({ error: 'order_not_found' })
  if (order.status !== 'draft') return res.status(400).json({ error: 'order_draft_only' })
  // 检查桌号冲突
  if (order.table_number) {
    const existing = findOne('orders', o => o.table_number === order.table_number && o.status === 'pending' && o.id !== order.id)
    if (existing) return res.status(409).json({ error: 'table_conflict', orderId: existing.id })
  }
  update('orders', req.params.id, { status: 'pending' })

  // Kitchen print
  const lang = req.body.lang || 'zh'
  let kitchenPrint = { success: false }
  try {
    order.items = find('order_items', oi => oi.order_id === order.id)
    // Enrich items with multilingual dish names
    for (const item of order.items) {
      const dish = findOne('dishes', d => d.id === item.dish_id)
      if (dish) {
        item.dish_name_pt = dish.name_pt
        item.dish_name_en = dish.name_en
        item.remark = dish.remark
        item.remark_pt = dish.remark_pt
        item.remark_en = dish.remark_en
      }
    }
    const ticketLines = generateKitchenTicket(order, 'new', order.items, lang)
    const ticketText = formatReceiptText(ticketLines)
    kitchenPrint = printKitchen(ticketText)
    kitchenPrint.ticket_text = ticketText
    // Mark all items as printed
    if (kitchenPrint.success) {
      for (const item of order.items) {
        update('order_items', item.id, { kitchen_status: 'printed', printed_qty: item.quantity })
      }
    }
  } catch (e) {
    kitchenPrint = { success: false, error: e.message }
    console.error('[kitchen-print] Exception:', e.message)
  }

  broadcast('order_submitted', { id: parseInt(req.params.id), table: order.table_number })
  res.json({ success: true, kitchen_print: kitchenPrint })
})

app.post('/api/orders/:id/cancel', auth(['admin', 'cashier']), (req, res) => {
  const order = findOne('orders', o => o.id === parseInt(req.params.id))
  if (!order) return res.status(404).json({ error: 'order_not_found' })
  if (order.status === 'completed') return res.status(400).json({ error: 'order_already_completed' })
  update('orders', parseInt(req.params.id), { status: 'cancelled' })
  broadcast('order_cancelled', { id: parseInt(req.params.id) })
  res.json({ success: true })
})

// ── Kitchen: Add items to existing order ──────────────

app.post('/api/orders/:id/add-items', auth(), (req, res) => {
  const orderId = parseInt(req.params.id)
  const order = findOne('orders', o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'order_not_found' })
  if (order.status !== 'pending') return res.status(400).json({ error: 'order_must_be_pending' })

  const { items, lang } = req.body
  if (!items?.length) return res.status(400).json({ error: 'items_required' })

  const newItems = []
  let addedAmount = 0

  runTransaction(() => {
    for (const item of items) {
      const qty = item.qty || 1
      const price = Number(item.price)
      const subtotal = price * qty
      addedAmount += subtotal
      const flavorsStr = item.flavors
        ? (typeof item.flavors === 'string' ? item.flavors : JSON.stringify(item.flavors))
        : ''
      const inserted = insert('order_items', {
        order_id: orderId, dish_id: item.dish_id || item.dishId,
        dish_name: item.name, dish_price: price,
        quantity: qty, subtotal,
        kitchen_status: 'new', printed_qty: 0, item_status: 'normal',
        flavors: flavorsStr
      })
      newItems.push({ ...inserted, print_qty: qty })
    }
    // Update order total
    update('orders', orderId, { total_amount: Number(order.total_amount) + addedAmount })
  })

  // Enrich new items with multilingual names for kitchen ticket
  for (const item of newItems) {
    const dish = findOne('dishes', d => d.id === item.dish_id)
    if (dish) {
      item.dish_name_pt = dish.name_pt
      item.dish_name_en = dish.name_en
      item.remark = dish.remark
      item.remark_pt = dish.remark_pt
      item.remark_en = dish.remark_en
    }
  }

  // Print addon kitchen ticket
  let kitchenPrint = { success: false }
  try {
    const ticketLines = generateKitchenTicket(order, 'addon', newItems, lang || 'zh')
    const ticketText = formatReceiptText(ticketLines)
    kitchenPrint = printKitchen(ticketText)
    kitchenPrint.ticket_text = ticketText
    if (kitchenPrint.success) {
      for (const item of newItems) {
        update('order_items', item.id, { kitchen_status: 'printed', printed_qty: item.quantity })
      }
    }
  } catch (e) {
    kitchenPrint = { success: false, error: e.message }
    console.error('[kitchen-addon] Exception:', e.message)
  }

  broadcast('order_updated', { id: orderId, table: order.table_number })
  res.json({ success: true, added_count: newItems.length, kitchen_print: kitchenPrint })
})

// ── Kitchen: Cancel single item ──────────────────────

app.post('/api/orders/:id/cancel-item', auth(['admin', 'cashier', 'waiter']), (req, res) => {
  const orderId = parseInt(req.params.id)
  const order = findOne('orders', o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'order_not_found' })

  const { item_id, cancel_qty, reason, lang } = req.body
  if (!item_id) return res.status(400).json({ error: 'item_id_required' })

  const item = findOne('order_items', oi => oi.id === parseInt(item_id) && oi.order_id === orderId)
  if (!item) return res.status(404).json({ error: 'item_not_found' })
  if (item.item_status === 'cancelled') return res.status(400).json({ error: 'item_already_cancelled' })

  const qtyToCancel = Math.min(cancel_qty || item.quantity, item.quantity)

  runTransaction(() => {
    if (qtyToCancel >= item.quantity) {
      // Cancel entire item
      update('order_items', item.id, { item_status: 'cancelled', kitchen_status: 'cancel_pending' })
    } else {
      // Partial cancel: reduce quantity
      const newQty = item.quantity - qtyToCancel
      const newSubtotal = item.dish_price * newQty
      update('order_items', item.id, { quantity: newQty, subtotal: newSubtotal, kitchen_status: 'cancel_pending' })
    }
    // Recalculate order total
    const allItems = find('order_items', oi => oi.order_id === orderId)
    let newTotal = 0
    for (const oi of allItems) {
      if (oi.item_status !== 'cancelled') newTotal += oi.subtotal
    }
    update('orders', orderId, { total_amount: newTotal })
  })

  // Print cancel kitchen ticket
  const cancelItem = {
    ...item,
    print_qty: qtyToCancel,
    cancel_reason: reason || '',
  }
  // Enrich with multilingual names
  const dish = findOne('dishes', d => d.id === item.dish_id)
  if (dish) {
    cancelItem.dish_name_pt = dish.name_pt
    cancelItem.dish_name_en = dish.name_en
  }

  let kitchenPrint = { success: false }
  try {
    const ticketLines = generateKitchenTicket(order, 'cancel', [cancelItem], lang || 'zh')
    const ticketText = formatReceiptText(ticketLines)
    kitchenPrint = printKitchen(ticketText)
    kitchenPrint.ticket_text = ticketText
    if (kitchenPrint.success) {
      update('order_items', item.id, { kitchen_status: 'cancelled' })
    }
  } catch (e) {
    kitchenPrint = { success: false, error: e.message }
    console.error('[kitchen-cancel] Exception:', e.message)
  }

  broadcast('order_item_cancelled', { orderId, itemId: item.id })
  res.json({ success: true, cancelled_qty: qtyToCancel, kitchen_print: kitchenPrint })
})

// ── Kitchen: Manual reprint ──────────────────────────

app.post('/api/orders/:id/kitchen-reprint', auth(['admin', 'cashier']), (req, res) => {
  const orderId = parseInt(req.params.id)
  const order = findOne('orders', o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'order_not_found' })

  const { lang } = req.body || {}
  order.items = find('order_items', oi => oi.order_id === orderId && oi.item_status !== 'cancelled')
  if (!order.items.length) return res.status(400).json({ error: 'no_printable_items' })

  // Enrich items
  for (const item of order.items) {
    const dish = findOne('dishes', d => d.id === item.dish_id)
    if (dish) {
      item.dish_name_pt = dish.name_pt
      item.dish_name_en = dish.name_en
      item.remark = dish.remark
      item.remark_pt = dish.remark_pt
      item.remark_en = dish.remark_en
    }
  }

  let kitchenPrint = { success: false }
  try {
    const ticketLines = generateKitchenTicket(order, 'reprint', order.items, lang || 'zh')
    const ticketText = formatReceiptText(ticketLines)
    kitchenPrint = printKitchen(ticketText)
    kitchenPrint.ticket_text = ticketText
  } catch (e) {
    kitchenPrint = { success: false, error: e.message }
    console.error('[kitchen-reprint] Exception:', e.message)
  }

  res.json({ success: kitchenPrint.success, kitchen_print: kitchenPrint })
})

// Delete order (admin only)
app.delete('/api/orders/:id', auth(['admin']), (req, res) => {
  const orderId = parseInt(req.params.id)
  if (isNaN(orderId)) return res.status(400).json({ error: 'order_id_invalid' })
  const order = findOne('orders', o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'order_not_found' })
  runTransaction(() => {
    removeWhere('order_items', oi => oi.order_id === orderId)
    remove('orders', orderId)
  })
  broadcast('order_deleted', { id: orderId })
  res.json({ success: true })
})

app.post('/api/orders/:id/checkout', auth(['admin', 'cashier']), (req, res) => {
  const { paymentMethod, cashReceived, change, lang } = req.body
  const orderId = parseInt(req.params.id)
  const orderCheck = findOne('orders', o => o.id === orderId)
  if (!orderCheck) return res.status(404).json({ error: 'order_not_found' })
  if (orderCheck.status !== 'pending') return res.status(400).json({ error: 'order_not_pending' })
  update('orders', orderId, {
    status: 'completed', payment_method: paymentMethod,
    cash_received: cashReceived || null, change_amount: change || null,
    cashier_id: req.user.id, paid_at: new Date().toISOString()
  })

  // Auto-print receipt
  let printResult = { success: false, error: 'No order found' }
  try {
    const order = findOne('orders', o => o.id === orderId)
    if (order) {
      order.items = find('order_items', oi => oi.order_id === order.id)
      // Enrich items with translated dish names from dishes table
      for (const item of order.items) {
        const dish = findOne('dishes', d => d.id === item.dish_id)
        if (dish) {
          item.dish_name_pt = dish.name_pt
          item.dish_name_en = dish.name_en
        }
      }
      const receiptLines = generateReceipt(order, lang || 'zh')
      const receiptText = formatReceiptText(receiptLines)
      printResult = printText(receiptText)
      printResult.ticket_text = receiptText
    }
  } catch (e) {
    printResult = { success: false, error: e.message }
    console.error('Print exception:', e.message)
  }

  broadcast('order_checkout', { id: orderId, paymentMethod })
  res.json({ success: true, print: printResult })
})

app.post('/api/orders/:id/reopen', auth(['admin', 'cashier']), (req, res) => {
  update('orders', req.params.id, { status: 'pending' })
  broadcast('order_reopened', { id: parseInt(req.params.id) })
  res.json({ success: true })
})

// ── Receipt Printing ─────────────────────────────────

app.post('/api/orders/:id/print', auth(['admin', 'cashier']), (req, res) => {
  const orderId = parseInt(req.params.id)
  const order = findOne('orders', o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'order_not_found' })
  order.items = find('order_items', oi => oi.order_id === order.id)
  for (const item of order.items) {
    const dish = findOne('dishes', d => d.id === item.dish_id)
    if (dish) {
      item.dish_name_pt = dish.name_pt
      item.dish_name_en = dish.name_en
    }
  }
  try {
    const receiptLines = generateReceipt(order, req.query.lang || 'zh')
    const receiptText = formatReceiptText(receiptLines)
    const printRes = printText(receiptText)
    res.json({ success: true, printer: PRINTER_NAME || '(Default Printer)', ticket_text: receiptText, ...printRes })
  } catch (e) {
    res.status(500).json({ error: 'print_failed', detail: e.message })
  }
})

app.get('/api/printers', auth(['admin', 'cashier']), (req, res) => {
  res.json({
    printers: listPrinters(),
    current: PRINTER_NAME || '(Default Printer)',
    kitchen: KITCHEN_PRINTER_NAME || PRINTER_NAME || '(Default Printer)',
  })
})

// ── Employees ─────────────────────────────────────────

app.get('/api/employees', auth(['admin', 'cashier']), (req, res) => {
  const rows = find('employees', () => true).map(e => ({ id: e.id, username: e.username, name: e.name, role: e.role, status: e.status, created_at: e.created_at }))
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
  const fields = {}
  if (name !== undefined) fields.name = name
  if (role !== undefined) fields.role = role
  if (status !== undefined) fields.status = status
  if (plainPwd) {
    fields.password = hashPassword(plainPwd)
    // 修改密码时递增 token_version，使该员工当前会话立即失效
    const emp = findOne('employees', e => e.id === parseInt(req.params.id))
    if (emp) fields.token_version = (emp.token_version || 0) + 1
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ message: '没有需要更新的字段' })
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
  res.json({ success: true, message_code: 'backup_completed', time: new Date().toISOString() })
})

app.post('/api/db/restore', auth(['admin']), (req, res) => {
  const { name } = req.body
  const bakPath = name
    ? path.join(__dirname, 'backups', name)
    : path.join(__dirname, 'data.sqlite.bak')

  if (name) {
    // Validate the backup name to prevent path traversal
    if (!/^data-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/.test(name)) {
      return res.status(400).json({ error: 'backup_name_invalid' })
    }
    if (!fs.existsSync(bakPath)) return res.status(404).json({ error: 'backup_not_found' })
  } else {
    if (!fs.existsSync(bakPath)) return res.status(404).json({ error: 'backup_file_missing' })
  }

  const safetyPath = path.join(__dirname, 'data.sqlite.before_restore')
  const dbPath = path.join(__dirname, 'data.sqlite')
  try {
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safetyPath)
    fs.copyFileSync(bakPath, dbPath)
    res.json({ success: true, message_code: 'restore_completed' })
  } catch (e) {
    res.status(500).json({ error: 'restore_failed' })
  }
})

// ── WebSocket Server ──────────────────────────────────

let wss = null

function setupWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' })
  wss.on('connection', (ws, req) => {
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw)
        // Client authentication via WebSocket
        if (msg.type === 'auth' && msg.token) {
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET)
            ws.userId = payload.id
            ws.userRole = payload.role
            ws.isAuthenticated = true
            ws.send(JSON.stringify({ type: 'auth_ok' }))
          } catch {
            ws.send(JSON.stringify({ type: 'auth_error', error: 'ws_auth_failed' }))
          }
        }
      } catch {}
    })
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }))
  })

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    if (!wss) { clearInterval(heartbeatInterval); return }
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)

  wss.on('close', () => clearInterval(heartbeatInterval))
}

function broadcast(event, data) {
  if (!wss) return
  const payload = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() })
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && ws.isAuthenticated) {
      ws.send(payload)
    }
  })
}

// ── Error Handler ─────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)
  res.status(500).json({ error: 'server_error' })
})

function getLanIp() {
  // Manual override via env var
  if (process.env.LAN_IP) return process.env.LAN_IP
  const nets = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== 'IPv4' || net.internal) continue
      // Skip link-local (169.254.x.x) and loopback
      if (net.address.startsWith('169.254.') || net.address.startsWith('127.')) continue
      candidates.push({ name, address: net.address })
    }
  }
  // Prefer 192.168.x.x (typical LAN), then 10.x.x.x, then 172.16-31.x.x
  const lan = candidates.find(c => c.address.startsWith('192.168.'))
  if (lan) return lan.address
  const priv = candidates.find(c => c.address.startsWith('10.'))
  if (priv) return priv.address
  const privB = candidates.find(c => {
    const parts = c.address.split('.').map(Number)
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
  })
  if (privB) return privB.address
  // Fallback to first candidate or localhost
  return candidates[0]?.address || 'localhost'
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

  const server = http.createServer(app)
  setupWebSocket(server)

  server.listen(PORT, '0.0.0.0', () => {
    const lanIp = getLanIp()
    console.log('')
    console.log('  ========================================')
    console.log('    Restaurant POS Server v1.0')
    console.log('  ========================================')
    console.log('')
    console.log(`  Local:   http://localhost:${PORT}`)
    console.log(`  Network: http://${lanIp}:${PORT}`)
    console.log(`  API:     http://${lanIp}:${PORT}/api`)
    console.log(`  WS:      ws://${lanIp}:${PORT}/ws`)
    console.log('')
    console.log('  Press Ctrl+C to stop')
    console.log('')
  })
})()

// Graceful shutdown: persist in-memory DB before exit
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down, saving database...`)
  try { save() } catch (e) { console.error('Save on shutdown failed:', e.message) }
  process.exit(0)
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
