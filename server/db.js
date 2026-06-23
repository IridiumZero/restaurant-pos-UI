const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const DB_PATH = path.join(__dirname, 'data.sqlite')
const JSON_PATH = path.join(__dirname, 'data.json')
const BAK_PATH = path.join(__dirname, 'data.sqlite.bak')
const BACKUPS_DIR = path.join(__dirname, 'backups')
const MAX_BACKUPS = 7

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
  _migrateDishesMultilang()
  _migrateDishesRemark()
  _migrateCategoriesMultilang()
  _migrateSortOrder()
  _migrateTokenVersion()
  _migrateKitchenPrint()
  _migrateFlavors()
  _migrateIndexes()

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

  // Seed categories from existing dishes if categories table is empty
  if (_count('categories') === 0) {
    const dishCategories = _all('SELECT DISTINCT category FROM dishes')
    const seen = new Set()
    for (const row of dishCategories) {
      if (!seen.has(row.category)) {
        seen.add(row.category)
        _db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [row.category])
      }
    }
    persist()
  }

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
    name_pt TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    category TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    remark_pt TEXT DEFAULT '',
    remark_en TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)
  _db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_pt TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
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
  _db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT DEFAULT '{}',
    ip TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  _db.run('PRAGMA foreign_keys = ON')
}

function _migrateDishesMultilang() {
  const info = _all("PRAGMA table_info(dishes)")
  const cols = info.map(r => r.name)
  if (!cols.includes('name_pt')) {
    _db.run("ALTER TABLE dishes ADD COLUMN name_pt TEXT DEFAULT ''")
    console.log('  Migrated: added dishes.name_pt column')
  }
  if (!cols.includes('name_en')) {
    _db.run("ALTER TABLE dishes ADD COLUMN name_en TEXT DEFAULT ''")
    console.log('  Migrated: added dishes.name_en column')
  }
  if (!cols.includes('name_pt') || !cols.includes('name_en')) persist()
}

function _migrateDishesRemark() {
  const info = _all("PRAGMA table_info(dishes)")
  const cols = info.map(r => r.name)
  for (const col of ['remark', 'remark_pt', 'remark_en']) {
    if (!cols.includes(col)) {
      _db.run(`ALTER TABLE dishes ADD COLUMN ${col} TEXT DEFAULT ''`)
      console.log(`  Migrated: added dishes.${col} column`)
    }
  }
  if (!cols.includes('remark') || !cols.includes('remark_pt') || !cols.includes('remark_en')) persist()
}

function _migrateCategoriesMultilang() {
  const info = _all("PRAGMA table_info(categories)")
  const cols = info.map(r => r.name)
  if (!cols.includes('name_pt')) {
    _db.run("ALTER TABLE categories ADD COLUMN name_pt TEXT DEFAULT ''")
    console.log('  Migrated: added categories.name_pt column')
  }
  if (!cols.includes('name_en')) {
    _db.run("ALTER TABLE categories ADD COLUMN name_en TEXT DEFAULT ''")
    console.log('  Migrated: added categories.name_en column')
  }
  if (!cols.includes('name_pt') || !cols.includes('name_en')) persist()
}

function _migrateSortOrder() {
  let migrated = false
  for (const table of ['dishes', 'categories']) {
    const info = _all(`PRAGMA table_info(${table})`)
    const cols = info.map(r => r.name)
    if (!cols.includes('sort_order')) {
      _db.run(`ALTER TABLE ${table} ADD COLUMN sort_order INTEGER DEFAULT 0`)
      console.log(`  Migrated: added ${table}.sort_order column`)
      migrated = true
    }
  }
  if (migrated) persist()
}

function _migrateTokenVersion() {
  const info = _all("PRAGMA table_info(employees)")
  const cols = info.map(r => r.name)
  if (!cols.includes('token_version')) {
    _db.run("ALTER TABLE employees ADD COLUMN token_version INTEGER DEFAULT 0")
    console.log('  Migrated: added employees.token_version column')
    persist()
  }
}

function _migrateKitchenPrint() {
  const info = _all("PRAGMA table_info(order_items)")
  const cols = info.map(r => r.name)
  let migrated = false
  if (!cols.includes('kitchen_status')) {
    _db.run("ALTER TABLE order_items ADD COLUMN kitchen_status TEXT DEFAULT 'new'")
    console.log('  Migrated: added order_items.kitchen_status column')
    migrated = true
  }
  if (!cols.includes('printed_qty')) {
    _db.run("ALTER TABLE order_items ADD COLUMN printed_qty INTEGER DEFAULT 0")
    console.log('  Migrated: added order_items.printed_qty column')
    migrated = true
  }
  if (!cols.includes('item_status')) {
    _db.run("ALTER TABLE order_items ADD COLUMN item_status TEXT DEFAULT 'normal'")
    console.log('  Migrated: added order_items.item_status column')
    migrated = true
  }
  // Mark existing completed/cancelled order items as already printed
  if (migrated) {
    _db.run("UPDATE order_items SET kitchen_status = 'printed', printed_qty = quantity WHERE order_id IN (SELECT id FROM orders WHERE status IN ('completed','cancelled'))")
    persist()
  }
}

function _migrateFlavors() {
  // Create flavors template table
  _db.run(`CREATE TABLE IF NOT EXISTS flavors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_pt TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    options TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  // Create dish-flavor junction table
  _db.run(`CREATE TABLE IF NOT EXISTS dish_flavors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    flavor_id INTEGER NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
    required INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(dish_id, flavor_id)
  )`)

  // Add flavors column to order_items (JSON string storing selected flavors)
  const oiInfo = _all("PRAGMA table_info(order_items)")
  const oiCols = oiInfo.map(r => r.name)
  if (!oiCols.includes('flavors')) {
    _db.run("ALTER TABLE order_items ADD COLUMN flavors TEXT DEFAULT ''")
    console.log('  Migrated: added order_items.flavors column')
    persist()
  }

  // Add images column to dishes (JSON array of image paths)
  const dishInfo = _all("PRAGMA table_info(dishes)")
  const dishCols = dishInfo.map(r => r.name)
  if (!dishCols.includes('images')) {
    _db.run("ALTER TABLE dishes ADD COLUMN images TEXT DEFAULT ''")
    // Migrate existing single image into images array
    const allDishes = _all("SELECT id, image FROM dishes")
    for (const d of allDishes) {
      if (d.image) {
        _db.run("UPDATE dishes SET images = ? WHERE id = ?", [JSON.stringify([d.image]), d.id])
      }
    }
    console.log('  Migrated: added dishes.images column')
    persist()
  }

  // Seed preset flavors if table is empty
  if (_count('flavors') === 0) {
    const presets = [
      ['辣度', 'Picância', 'Spice Level', JSON.stringify(['不辣/Sem picante/Not spicy', '微辣/Ligeiramente picante/Mild', '中辣/Médio/Medium', '特辣/Muito picante/Hot']), 0],
      ['甜度', 'Doçura', 'Sweetness', JSON.stringify(['无糖/Sem açúcar/No sugar', '少甜/Pouco doce/Less sweet', '正常甜/Normal/Normal', '多糖/Muito doce/Very sweet']), 1],
      ['温度', 'Temperatura', 'Temperature', JSON.stringify(['热/Quente/Hot', '温/Morno/Warm', '冷/Frio/Cold', '加冰/Com gelo/With ice']), 2],
      ['份量', 'Porção', 'Portion', JSON.stringify(['小份/Pequeno/Small', '中份/Médio/Medium', '大份/Grande/Large']), 3],
    ]
    for (const [name, name_pt, name_en, options, order] of presets) {
      _db.run(`INSERT INTO flavors (name, name_pt, name_en, options, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [name, name_pt, name_en, options, order])
    }
    console.log('  Seeded 4 preset flavor templates')
    persist()
  }
}

function _migrateIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_waiter_id ON orders(waiter_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_number, status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at)',
    'CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_dish_flavors_dish_id ON dish_flavors(dish_id)',
    'CREATE INDEX IF NOT EXISTS idx_dish_flavors_flavor_id ON dish_flavors(flavor_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
  ]
  let created = 0
  for (const sql of indexes) {
    const name = sql.match(/idx_\w+/)?.[0] || ''
    // Check if index already exists
    const existing = _all(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [name])
    if (!existing.length) {
      _db.run(sql)
      created++
    }
  }
  if (created > 0) {
    console.log(`  Migrated: created ${created} SQL indexes`)
    persist()
  }
}

function _migrateFromJSON(jsonData) {
  // Build set of valid column names for each table
  const schema = {
    categories: ['id', 'name', 'name_pt', 'name_en', 'sort_order', 'created_at'],
    employees: ['id', 'username', 'password', 'name', 'role', 'status', 'created_at'],
    dishes: ['id', 'name', 'name_pt', 'name_en', 'category', 'price', 'image', 'remark', 'remark_pt', 'remark_en', 'sort_order', 'status', 'created_at', 'updated_at'],
    orders: ['id', 'table_number', 'waiter_id', 'waiter_name', 'total_amount', 'status', 'payment_method', 'cash_received', 'change_amount', 'cashier_id', 'created_at', 'paid_at'],
    order_items: ['id', 'order_id', 'dish_id', 'dish_name', 'dish_price', 'quantity', 'subtotal', 'kitchen_status', 'printed_qty', 'item_status'],
  }

  for (const table of ['categories', 'employees', 'dishes', 'orders', 'order_items']) {
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
  for (const table of ['categories', 'employees', 'dishes', 'orders', 'order_items']) {
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

  const categories = [
    ['热菜', 'Pratos Quentes', 'Hot Dishes', 0],
    ['凉菜', 'Pratos Frios', 'Cold Dishes', 1],
    ['主食', 'Acompanhamentos', 'Staples', 2],
    ['饮品', 'Bebidas', 'Drinks', 3],
  ]
  for (const [name, name_pt, name_en, order] of categories) {
    _db.run(`INSERT INTO categories (name, name_pt, name_en, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`, [name, name_pt, name_en, order, now])
  }

  const images = [
    '/uploads/ELDEN RING.png',
    '/uploads/GTAV.jpg',
    '/uploads/HADES22.jpg',
    '/uploads/SIFU.jpg',
    '/uploads/SEKIRO.jpg',
    '/uploads/BLACK MYTH WUKONG.jpg',
    '/uploads/Dave The Diver.png',
    '/uploads/Pokémon Scarlet.png',
    '/uploads/SpiderMan2.jpg',
    '/uploads/Cyber Punk2077.jpg',
  ]
  const dishes = [
    ['宫保鸡丁', 'Frango Gong Bao', 'Kung Pao Chicken', '热菜', 350, images[0], '微辣，含花生', 'Ligeiramente picante, com amendoim', 'Slightly spicy, contains peanuts'],
    ['麻婆豆腐', 'Tofu Mapo', 'Mapo Tofu', '热菜', 250, images[1], '麻辣，含花椒', 'Picante e entorpecente, com pimenta Sichuan', 'Numbing spicy, contains Sichuan pepper'],
    ['红烧肉', 'Barriga de Porco Braseada', 'Braised Pork Belly', '热菜', 450, images[2], '', '', ''],
    ['清蒸鲈鱼', 'Robalo Vapor', 'Steamed Sea Bass', '热菜', 650, images[3], '整鱼，约500g', 'Peixe inteiro, ~500g', 'Whole fish, ~500g'],
    ['拍黄瓜', 'Pepino com Alho', 'Smashed Cucumber', '凉菜', 150, images[4], '清爽开胃', 'Refrescante e apetitoso', 'Refreshing appetizer'],
    ['凉拌木耳', 'Salada de Fungo', 'Wood Ear Mushroom Salad', '凉菜', 180, images[5], '', '', ''],
    ['蛋炒饭', 'Arroz Frito c/ Ovo', 'Egg Fried Rice', '主食', 180, images[6], '经典主食', 'Clássico', 'Classic staple'],
    ['手工水饺', 'Pastéis de Massa', 'Handmade Dumplings', '主食', 300, images[7], '猪肉白菜馅，12个', 'Recheio de porco e repolho, 12 un.', 'Pork & cabbage filling, 12 pcs'],
    ['可乐', 'Coca-Cola', 'Coca-Cola', '饮品', 70, images[8], '330ml罐装', 'Lata 330ml', '330ml can'],
    ['雪碧', 'Sprite', 'Sprite', '饮品', 70, images[9], '', '', ''],
  ]
  for (let i = 0; i < dishes.length; i++) {
    const [name, name_pt, name_en, category, price, image = '', remark = '', remark_pt = '', remark_en = ''] = dishes[i]
    _db.run(`INSERT INTO dishes (name, name_pt, name_en, category, price, image, remark, remark_pt, remark_en, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [name, name_pt, name_en, category, price, image, remark, remark_pt, remark_en, i, now, now])
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

let _persistTimer = null
let _persistPending = false
const PERSIST_DEBOUNCE_MS = 200

function persist() {
  // 批量合并：同一事件循环 tick 内的多次 persist 调用只执行一次磁盘写入
  if (_persistPending) return
  _persistPending = true
  setImmediate(() => {
    _persistPending = false
    _doPersist()
  })
}

function _doPersist() {
  // 将 WASM 内存数据库导出并写入磁盘（原子写入：先写临时文件再重命名）
  const buffer = _db.export()
  const tmpPath = DB_PATH + '.tmp'
  fs.writeFileSync(tmpPath, Buffer.from(buffer))
  if (fs.existsSync(DB_PATH)) {
    try { fs.copyFileSync(DB_PATH, BAK_PATH) } catch {}
  }
  fs.renameSync(tmpPath, DB_PATH)
  // 时间戳备份改为防抖（避免连续 insert 产生大量备份）
  if (_persistTimer) clearTimeout(_persistTimer)
  _persistTimer = setTimeout(() => {
    _saveTimestampedBackup()
    _persistTimer = null
  }, PERSIST_DEBOUNCE_MS)
}

function _saveTimestampedBackup() {
  if (!fs.existsSync(DB_PATH)) return
  // 使用异步 I/O 避免阻塞事件循环
  setImmediate(async () => {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const dest = path.join(BACKUPS_DIR, `data-${ts}.sqlite`)
      await fs.promises.copyFile(DB_PATH, dest)
      // Rotate old backups
      _rotateBackups()
    } catch {}
  })
}

function _rotateBackups() {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('data-') && f.endsWith('.sqlite'))
      .sort()
    while (files.length > MAX_BACKUPS) {
      fs.unlinkSync(path.join(BACKUPS_DIR, files.shift()))
    }
  } catch {}
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('data-') && f.endsWith('.sqlite'))
      .sort()
      .reverse()
      .map(f => {
        const st = fs.statSync(path.join(BACKUPS_DIR, f))
        return { name: f, size: st.size, mtime: st.mtime.toISOString() }
      })
  } catch { return [] }
}

function save() {
  persist()
}

// ── CRUD ─────────────────────────────────────────────

/**
 * SQL WHERE 查询（利用索引，避免全表扫描）
 * @param {string} table - 表名
 * @param {string} where - SQL WHERE 子句，如 'status = ? AND waiter_id = ?'
 * @param {Array} params - 参数数组
 */
function findBy(table, where, params = []) {
  return _all(`SELECT * FROM ${table} WHERE ${where}`, params)
}

/**
 * SQL WHERE 查询单条记录
 */
function findOneBy(table, where, params = []) {
  const rows = _all(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`, params)
  return rows[0]
}

/**
 * SQL WHERE 删除（利用索引）
 */
function removeBy(table, where, params = []) {
  _db.run(`DELETE FROM ${table} WHERE ${where}`, params)
  const changed = _db.getRowsModified()
  if (changed > 0 && !_inTransaction) persist()
  return changed
}

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
  if (!_inTransaction) persist()
  return { ...record, id }
}

function update(table, id, fields) {
  const keys = Object.keys(fields)
  const sets = keys.map(k => `${k} = ?`).join(', ')
  const values = keys.map(k => fields[k])
  _db.run(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...values, parseInt(id)])
  const changed = _db.getRowsModified()
  if (!_inTransaction) persist()
  return changed > 0
}

function remove(table, id) {
  _db.run(`DELETE FROM ${table} WHERE id = ?`, [parseInt(id)])
  const changed = _db.getRowsModified()
  if (!_inTransaction) persist()
  return changed > 0
}

function removeWhere(table, predicate) {
  const rows = find(table, predicate)
  for (const row of rows) {
    _db.run(`DELETE FROM ${table} WHERE id = ?`, [row.id])
  }
  if (rows.length && !_inTransaction) persist()
  return rows.length
}

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10)
}

function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash)
}

// ── Audit Log ──────────────────────────────────────

/**
 * 记录操作审计日志
 * @param {number|null} userId - 操作用户ID
 * @param {string} username - 操作用户名
 * @param {string} action - 操作类型 (dish_delete, order_cancel, order_reopen, order_delete, category_delete, flavor_delete, cancel_item, db_restore, employee_create, employee_update)
 * @param {string} targetType - 目标类型 (dish, order, category, flavor, order_item, database, employee)
 * @param {string|number} targetId - 目标ID
 * @param {object} details - 额外详情
 * @param {string} ip - 客户端IP
 */
function auditLog(userId, username, action, targetType, targetId, details = {}, ip = '') {
  try {
    insert('audit_logs', {
      user_id: userId || null,
      username: username || '',
      action,
      target_type: targetType || '',
      target_id: targetId != null ? String(targetId) : '',
      details: typeof details === 'string' ? details : JSON.stringify(details),
      ip,
      created_at: new Date().toISOString()
    })
  } catch (e) {
    console.warn('[audit-log] Failed:', e.message)
  }
}

// ── Transaction ──────────────────────────────────────

let _inTransaction = false

function runTransaction(fn) {
  _inTransaction = true
  _db.run('BEGIN TRANSACTION')
  try {
    fn()
    _db.run('COMMIT')
    persist()
  } catch (e) {
    try { _db.run('ROLLBACK') } catch {}
    throw e
  } finally {
    _inTransaction = false
  }
}

module.exports = { init, find, findOne, findBy, findOneBy, removeBy, insert, update, remove, removeWhere, save, listBackups, hashPassword, verifyPassword, runTransaction, auditLog }
