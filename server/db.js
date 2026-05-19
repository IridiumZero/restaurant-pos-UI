const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DATA_FILE = path.join(__dirname, 'data.json')

// In-memory data store
let data = { employees: [], dishes: [], orders: [], order_items: [], _nextId: { employees: 1, dishes: 1, orders: 1, order_items: 1 } }

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to load data.json, starting fresh:', e.message)
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function nextId(table) {
  if (!data._nextId) data._nextId = {}
  if (!data._nextId[table]) data._nextId[table] = 1
  return data._nextId[table]++
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex')
}

// ── Seed Data ─────────────────────────────────────────

const seedDishes = [
  { name: '宫保鸡丁', category: '热菜', price: 350, image: '', stock: 50, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '麻婆豆腐', category: '热菜', price: 250, image: '', stock: 50, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '红烧肉', category: '热菜', price: 450, image: '', stock: 30, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '清蒸鲈鱼', category: '热菜', price: 650, image: '', stock: 20, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '拍黄瓜', category: '凉菜', price: 150, image: '', stock: 40, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '凉拌木耳', category: '凉菜', price: 180, image: '', stock: 40, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '蛋炒饭', category: '主食', price: 180, image: '', stock: 60, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '手工水饺', category: '主食', price: 300, image: '', stock: 30, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '可乐', category: '饮品', price: 70, image: '', stock: 100, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { name: '雪碧', category: '饮品', price: 70, image: '', stock: 100, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

const seedEmployees = [
  { username: 'admin', password: hashPassword('123456'), name: '管理员', role: 'admin', status: 'active', created_at: new Date().toISOString() },
  { username: 'cashier01', password: hashPassword('123456'), name: '收银员小王', role: 'cashier', status: 'active', created_at: new Date().toISOString() },
  { username: 'waiter01', password: hashPassword('123456'), name: '服务员张三', role: 'waiter', status: 'active', created_at: new Date().toISOString() },
  { username: 'waiter02', password: hashPassword('123456'), name: '服务员李四', role: 'waiter', status: 'active', created_at: new Date().toISOString() },
]

function init() {
  load()
  let changed = false

  if (data.employees.length === 0) {
    for (const e of seedEmployees) {
      data.employees.push({ id: nextId('employees'), ...e })
    }
    changed = true
  }

  if (data.dishes.length === 0) {
    for (const d of seedDishes) {
      data.dishes.push({ id: nextId('dishes'), ...d })
    }
    changed = true
  }

  if (changed) save()

  console.log(`Data file: ${DATA_FILE}`)
  console.log(`Employees: ${data.employees.length}`)
  console.log(`Dishes: ${data.dishes.length}`)
  console.log(`Orders: ${data.orders.length}`)
}

// ── Query Helpers ─────────────────────────────────────

function find(table, predicate) {
  return (data[table] || []).filter(predicate)
}

function findOne(table, predicate) {
  return (data[table] || []).find(predicate)
}

function insert(table, record) {
  record.id = nextId(table)
  data[table].push(record)
  save()
  return record
}

function update(table, id, fields) {
  const idx = data[table].findIndex(r => r.id === parseInt(id))
  if (idx === -1) return false
  Object.assign(data[table][idx], fields)
  save()
  return true
}

function remove(table, id) {
  const idx = data[table].findIndex(r => r.id === parseInt(id))
  if (idx === -1) return false
  data[table].splice(idx, 1)
  save()
  return true
}

// ── Exports ───────────────────────────────────────────

module.exports = { init, find, findOne, insert, update, remove, save, hashPassword, data }
