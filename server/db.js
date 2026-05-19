const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DB_PATH = path.join(__dirname, 'data.sqlite')
const JSON_PATH = path.join(__dirname, 'data.json')
const BAK_PATH = path.join(__dirname, 'data.sqlite.bak')

let _db = null

// ── Init ─────────────────────────────────────────────

async function init() {
  const SQL = await initSqlJs()
  _db = new SQL.Database()

  if (fs.existsSync(DB_PATH)) {
    try {
      const buffer = fs.readFileSync(DB_PATH)
      _db = new SQL.Database(buffer)
    } catch {
      console.warn('  SQLite file corrupt, creating fresh database')
      _db = new SQL.Database()
    }
  }

  _createTables()

  // Migrate from old JSON
  if (fs.existsSync(JSON_PATH)) {
    try {
      const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
      if (jsonData.employees?.length || jsonData.dishes?.length) {
        _migrateFromJSON(jsonData)
        fs.renameSync(JSON_PATH, JSON_PATH + '.migrated')
        console.log('  Migrated data.json → SQLite (backup: data.json.migrated)')
      }
    } catch (e) {
      console.warn('  JSON migration skipped:', e.message)
    }
  }

  // Seed if empty
  if (_count('employees') === 0) _seed()

  persist()

  console.log(`  SQLite: ${_count('employees')} employees, ${_count('dishes')} dishes, ${_count('orders')} orders`)
}

function _createTables() {
  _db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'waiter',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  _db.run(`CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT DEFAULT '',
    stock INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  _db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER NOT NULL,
    waiter_id INTEGER,
    waiter_name TEXT,
    total_amount REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    cash_received REAL DEFAULT 0,
    change_amount REAL DEFAULT 0,
    cashier_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT
  )`)
  _db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id INTEGER NOT NULL REFERENCES dishes(id),
    dish_name TEXT NOT NULL,
    dish_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal REAL NOT NULL
  )`)
  _db.run('PRAGMA foreign_keys = ON')
}

function _migrateFromJSON(jsonData) {
  // Build set of valid column names for each table
  const schema = {
    employees: ['id', 'username', 'password', 'name', 'role', 'status', 'created_at'],
    dishes: ['id', 'name', 'category', 'price', 'image', 'stock', 'status', 'created_at', 'updated_at'],
    orders: ['id', 'table_number', 'waiter_id', 'waiter_name', 'total_amount', 'status', 'payment_method', 'cash_received', 'change_amount', 'cashier_id', 'created_at', 'paid_at'],
    order_items: ['id', 'order_id', 'dish_id', 'dish_name', 'dish_price', 'quantity', 'subtotal'],
  }

  for (const table of ['employees', 'dishes', 'orders', 'order_items']) {
    const rows = jsonData[table] || []
    const validCols = schema[table]
    for (const row of rows) {
      // Only include columns that exist in the table schema
      const keys = Object.keys(row).filter(k => validCols.includes(k))
      if (!keys.length) continue
      const placeholders = keys.map(() => '?').join(',')
      _db.run(`INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, keys.map(k => row[k]))
    }
  }

  // Reset auto-increment counters
  for (const table of ['employees', 'dishes', 'orders', 'order_items']) {
    const result = _db.exec(`SELECT MAX(id) FROM ${table}`)
    const maxId = result[0]?.values[0]?.[0] || 0
    if (maxId > 0) {
      try { _db.run(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, [maxId, table]) } catch {}
    }
  }
}

function _seed() {
  const now = new Date().toISOString()
  const hash = hashPassword('123456')

  const employees = [
    ['admin', hash, '管理员', 'admin'],
    ['cashier01', hash, '收银员', 'cashier'],
    ['waiter01', hash, '服务员A', 'waiter'],
    ['waiter02', hash, '服务员B', 'waiter'],
  ]
  for (const [username, password, name, role] of employees) {
    _db.run(`INSERT INTO employees (username, password, name, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`,
      [username, password, name, role, now])
  }

  const dishes = [
    ['宫保鸡丁', '热菜', 350, 50],
    ['麻婆豆腐', '热菜', 250, 50],
    ['红烧肉', '热菜', 450, 30],
    ['清蒸鲈鱼', '热菜', 650, 20],
    ['拍黄瓜', '凉菜', 150, 40],
    ['凉拌木耳', '凉菜', 180, 40],
    ['蛋炒饭', '主食', 180, 60],
    ['手工水饺', '主食', 300, 40],
    ['可乐', '饮品', 70, 100],
    ['雪碧', '饮品', 70, 100],
  ]
  for (const [name, category, price, stock] of dishes) {
    _db.run(`INSERT INTO dishes (name, category, price, stock, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [name, category, price, stock, now, now])
  }
}

// ── Internal helpers ─────────────────────────────────

function _all(sql, params = []) {
  if (params.length) {
    const stmt = _db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }
  const result = _db.exec(sql)
  if (!result.length) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const obj = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
}

function _count(table) {
  try {
    const r = _db.exec(`SELECT COUNT(*) FROM ${table}`)
    return r[0].values[0][0]
  } catch { return 0 }
}

// ── Persistence ──────────────────────────────────────

function persist() {
  const buffer = _db.export()
  const tmpPath = DB_PATH + '.tmp'
  fs.writeFileSync(tmpPath, Buffer.from(buffer))
  if (fs.existsSync(DB_PATH)) {
    try { fs.copyFileSync(DB_PATH, BAK_PATH) } catch {}
  }
  fs.renameSync(tmpPath, DB_PATH)
}

function save() {
  persist()
}

// ── CRUD ─────────────────────────────────────────────

function find(table, predicate) {
  const rows = _all(`SELECT * FROM ${table}`)
  return rows.filter(predicate)
}

function findOne(table, predicate) {
  return find(table, predicate)[0]
}

function insert(table, record) {
  const keys = Object.keys(record)
  const placeholders = keys.map(() => '?').join(',')
  _db.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, keys.map(k => record[k]))
  const r = _db.exec('SELECT last_insert_rowid()')
  const id = r[0].values[0][0]
  persist()
  return { ...record, id }
}

function update(table, id, fields) {
  const keys = Object.keys(fields)
  const sets = keys.map(k => `${k} = ?`).join(', ')
  const values = keys.map(k => fields[k])
  _db.run(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...values, parseInt(id)])
  const changed = _db.getRowsModified()
  persist()
  return changed > 0
}

function remove(table, id) {
  _db.run(`DELETE FROM ${table} WHERE id = ?`, [parseInt(id)])
  const changed = _db.getRowsModified()
  persist()
  return changed > 0
}

function removeWhere(table, predicate) {
  const rows = find(table, predicate)
  for (const row of rows) {
    _db.run(`DELETE FROM ${table} WHERE id = ?`, [row.id])
  }
  if (rows.length) persist()
  return rows.length
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex')
}

module.exports = { init, find, findOne, insert, update, remove, removeWhere, save, hashPassword }
