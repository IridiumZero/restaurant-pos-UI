const DB_NAME = 'RestaurantPOS'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('dishes')) {
        const store = db.createObjectStore('dishes', { keyPath: 'id', autoIncrement: true })
        store.createIndex('category', 'category', { unique: false })
      }
      if (!db.objectStoreNames.contains('orders')) {
        const store = db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true })
        store.createIndex('createdAt', 'createdAt', { unique: false })
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

const seedDishes = [
  { name: '宫保鸡丁', category: '热菜', price: 28 },
  { name: '麻婆豆腐', category: '热菜', price: 22 },
  { name: '红烧肉', category: '热菜', price: 38 },
  { name: '清蒸鲈鱼', category: '热菜', price: 58 },
  { name: '拍黄瓜', category: '凉菜', price: 12 },
  { name: '凉拌木耳', category: '凉菜', price: 15 },
  { name: '蛋炒饭', category: '主食', price: 15 },
  { name: '手工水饺', category: '主食', price: 25 },
  { name: '可乐', category: '饮品', price: 5 },
  { name: '雪碧', category: '饮品', price: 5 },
  { name: '绿豆汤', category: '饮品', price: 8 },
  { name: '银耳羹', category: '甜品', price: 12 },
]

export async function initDB() {
  const existing = await getAll('dishes')
  if (existing.length === 0) {
    for (const dish of seedDishes) {
      await add('dishes', dish)
    }
  }
}
