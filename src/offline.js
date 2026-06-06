/**
 * 离线模式支持 - IndexedDB 缓存 + 自动同步
 * 用于平板端在无网络时仍可浏览菜单、创建订单
 */

const DB_NAME = 'pos-offline'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getStore(storeName, mode = 'readonly') {
  const db = await openDB()
  return db.transaction(storeName, mode).objectStore(storeName)
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── 菜单缓存 ─────────────────────────────

export async function cacheMenu(dishes, categories) {
  const store = await getStore('cache', 'readwrite')
  await reqToPromise(store.put({ key: 'dishes', data: dishes, ts: Date.now() }))
  await reqToPromise(store.put({ key: 'categories', data: categories, ts: Date.now() }))
}

export async function getCachedMenu() {
  const store = await getStore('cache')
  const dishes = await reqToPromise(store.get('dishes'))
  const cats = await reqToPromise(store.get('categories'))
  if (!dishes) return null
  // 缓存超过 24 小时视为过期
  if (Date.now() - dishes.ts > 86400000) return null
  return { dishes: dishes.data, categories: cats?.data || [] }
}

// ── 离线订单队列 ─────────────────────────

export async function queueOrder(orderData) {
  const store = await getStore('orders', 'readwrite')
  const id = await reqToPromise(store.add({
    data: orderData,
    createdAt: Date.now(),
    synced: false
  }))
  return id
}

export async function getPendingOrders() {
  const store = await getStore('orders')
  const all = await reqToPromise(store.getAll())
  return all.filter(o => !o.synced)
}

export async function markSynced(id) {
  const store = await getStore('orders', 'readwrite')
  await reqToPromise(store.delete(id))
}

export async function syncPendingOrders(api) {
  const pending = await getPendingOrders()
  const results = []
  for (const order of pending) {
    try {
      const res = await api.addOrder(order.data)
      await markSynced(order.id)
      results.push({ id: order.id, success: true, serverId: res.id })
    } catch (e) {
      results.push({ id: order.id, success: false, error: e.message })
    }
  }
  return results
}

export async function getPendingCount() {
  const pending = await getPendingOrders()
  return pending.length
}

export async function clearSyncedOrders() {
  const store = await getStore('orders', 'readwrite')
  const all = await reqToPromise(store.getAll())
  for (const o of all.filter(x => x.synced)) {
    await reqToPromise(store.delete(o.id))
  }
}
