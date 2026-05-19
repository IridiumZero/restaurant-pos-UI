const DB_NAME = 'RestaurantPOS'
const DB_VERSION = 3

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      const ver = e.oldVersion

      if (ver < 1) {
        const dishStore = db.createObjectStore('dishes', { keyPath: 'id', autoIncrement: true })
        dishStore.createIndex('category', 'category', { unique: false })
        const orderStore = db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true })
        orderStore.createIndex('createdAt', 'createdAt', { unique: false })
        orderStore.createIndex('status', 'status', { unique: false })
        orderStore.createIndex('tableNumber', 'tableNumber', { unique: false })
      }

      if (ver >= 1 && ver < 2) {
        const tx = e.target.transaction
        const orderStore = tx.objectStore('orders')
        if (!orderStore.indexNames.contains('status')) {
          orderStore.createIndex('status', 'status', { unique: false })
        }
        if (!orderStore.indexNames.contains('tableNumber')) {
          orderStore.createIndex('tableNumber', 'tableNumber', { unique: false })
        }
      }

      if (ver < 3) {
        if (!db.objectStoreNames.contains('employees')) {
          const empStore = db.createObjectStore('employees', { keyPath: 'id', autoIncrement: true })
          empStore.createIndex('username', 'username', { unique: true })
          empStore.createIndex('role', 'role', { unique: false })
        }
        // Add waiterId index on orders
        if (ver >= 2) {
          const tx = e.target.transaction
          const orderStore = tx.objectStore('orders')
          if (!orderStore.indexNames.contains('waiterId')) {
            orderStore.createIndex('waiterId', 'waiterId', { unique: false })
          }
        } else if (ver < 2) {
          const orderStore = e.target.transaction.objectStore('orders')
          if (!orderStore.indexNames.contains('waiterId')) {
            orderStore.createIndex('waiterId', 'waiterId', { unique: false })
          }
        }
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
  return dbPromise
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAll(storeName) {
  const db = await openDB()
  return promisify(db.transaction(storeName, 'readonly').objectStore(storeName).getAll())
}

export async function getById(storeName, id) {
  const db = await openDB()
  return promisify(db.transaction(storeName, 'readonly').objectStore(storeName).get(Number(id)))
}

export async function add(storeName, item) {
  const db = await openDB()
  return promisify(db.transaction(storeName, 'readwrite').objectStore(storeName).add(item))
}

export async function update(storeName, item) {
  const db = await openDB()
  return promisify(db.transaction(storeName, 'readwrite').objectStore(storeName).put(item))
}

export async function remove(storeName, id) {
  const db = await openDB()
  return promisify(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(Number(id)))
}

export async function getByIndex(storeName, indexName, value) {
  const db = await openDB()
  const store = db.transaction(storeName, 'readonly').objectStore(storeName)
  if (!store.indexNames.contains(indexName)) return []
  const index = store.index(indexName)
  return promisify(index.getAll(value))
}

// Seed data — prices in MZN (Mozambican Metical)
const seedDishes = [
  { name: '宫保鸡丁', category: '热菜', price: 350, image: '', stock: 50, status: 'active' },
  { name: '麻婆豆腐', category: '热菜', price: 250, image: '', stock: 50, status: 'active' },
  { name: '红烧肉', category: '热菜', price: 450, image: '', stock: 30, status: 'active' },
  { name: '清蒸鲈鱼', category: '热菜', price: 650, image: '', stock: 20, status: 'active' },
  { name: '拍黄瓜', category: '凉菜', price: 150, image: '', stock: 40, status: 'active' },
  { name: '凉拌木耳', category: '凉菜', price: 180, image: '', stock: 40, status: 'active' },
  { name: '蛋炒饭', category: '主食', price: 180, image: '', stock: 60, status: 'active' },
  { name: '手工水饺', category: '主食', price: 300, image: '', stock: 30, status: 'active' },
  { name: '可乐', category: '饮品', price: 70, image: '', stock: 100, status: 'active' },
  { name: '雪碧', category: '饮品', price: 70, image: '', stock: 100, status: 'active' },
]

const seedEmployees = [
  { username: 'admin', password: '123456', name: '管理员', role: 'admin', status: 'active' },
  { username: 'cashier01', password: '123456', name: '收银员小王', role: 'cashier', status: 'active' },
  { username: 'waiter01', password: '123456', name: '服务员张三', role: 'waiter', status: 'active' },
  { username: 'waiter02', password: '123456', name: '服务员李四', role: 'waiter', status: 'active' },
]

export async function initDB() {
  const dishes = await getAll('dishes')
  if (dishes.length === 0) {
    for (const dish of seedDishes) {
      await add('dishes', dish)
    }
  }
  const employees = await getAll('employees')
  if (employees.length === 0) {
    for (const emp of seedEmployees) {
      await add('employees', emp)
    }
  }
}
