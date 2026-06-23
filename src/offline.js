/**
 * 离线模式支持 - IndexedDB 缓存 + 通用操作队列 + 自动同步
 * 用于平板端在无网络时仍可浏览菜单、创建订单、加菜、取消等操作
 */

const DB_NAME = 'pos-offline'
const DB_VERSION = 2

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('operations')) {
        const opStore = db.createObjectStore('operations', { keyPath: 'id', autoIncrement: true })
        opStore.createIndex('createdAt', 'createdAt')
      }
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

// ── 离线订单队列（向后兼容） ──────────────────

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

// ── 通用离线操作队列 ─────────────────────────

/**
 * 操作类型：
 * - create_order: 创建订单 { orderData }
 * - add_items: 加菜 { orderId, items, lang }
 * - cancel_item: 取消单品 { orderId, item_id, cancel_qty, reason, lang }
 * - cancel_order: 取消订单 { orderId }
 * - checkout: 结账 { orderId, paymentMethod, cashReceived, change, lang }
 * - submit_order: 提交草稿订单 { orderId, lang }
 */

export async function queueOperation(type, data) {
  const store = await getStore('operations', 'readwrite')
  const id = await reqToPromise(store.add({
    type,
    data,
    createdAt: Date.now(),
    synced: false,
    retryCount: 0
  }))
  return id
}

export async function getPendingOperations() {
  try {
    const store = await getStore('operations')
    const all = await reqToPromise(store.getAll())
    return all.filter(o => !o.synced).sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export async function getPendingOperationCount() {
  try {
    const ops = await getPendingOperations()
    return ops.length
  } catch {
    return 0
  }
}

async function removeOperation(id) {
  const store = await getStore('operations', 'readwrite')
  await reqToPromise(store.delete(id))
}

/**
 * 同步所有离线操作（按时间顺序依次回放）
 * 需要传入已登录的 api 对象
 * @param {object} api - API 对象
 * @param {object} opts - 选项
 * @param {Function} opts.onProgress - 进度回调 (current, total, result)
 * @param {Map} opts.orderIdMap - 离线订单ID → 服务端ID 映射（create_order 返回后填入）
 */
export async function syncAllOperations(api, opts = {}) {
  const { onProgress, orderIdMap = new Map() } = opts

  // 1. 先同步旧版订单队列
  const oldResults = await syncPendingOrders(api)
  for (const r of oldResults) {
    if (r.success && r.serverId) {
      // 记录临时ID → 服务端ID 映射
      orderIdMap.set(`old_${r.id}`, r.serverId)
    }
  }

  // 2. 同步通用操作队列
  const pending = await getPendingOperations()
  const results = []
  const total = pending.length

  for (let i = 0; i < pending.length; i++) {
    const op = pending[i]
    let result
    try {
      result = await _executeOperation(api, op, orderIdMap)
      await removeOperation(op.id)
      result = { id: op.id, type: op.type, success: true, ...result }
    } catch (e) {
      result = { id: op.id, type: op.type, success: false, error: e.message }
      // 超过 3 次重试则放弃
      if (op.retryCount >= 3) {
        await removeOperation(op.id)
        result.abandoned = true
      } else {
        // 增加重试计数
        const store = await getStore('operations', 'readwrite')
        await reqToPromise(store.put({ ...op, retryCount: (op.retryCount || 0) + 1 }))
      }
    }
    results.push(result)
    if (onProgress) onProgress(i + 1, total, result)
  }

  return { oldResults, results, orderIdMap }
}

async function _executeOperation(api, op, orderIdMap) {
  const { type, data } = op

  switch (type) {
    case 'create_order': {
      const res = await api.addOrder(data.orderData)
      // 记录临时ID → 服务端ID 映射
      if (data.tempId && res.id) {
        orderIdMap.set(data.tempId, res.id)
      }
      return { serverId: res.id }
    }
    case 'add_items': {
      const orderId = _resolveOrderId(data.orderId, orderIdMap)
      await api.addItemsToOrder(orderId, data.items, data.lang)
      return { orderId }
    }
    case 'cancel_item': {
      const orderId = _resolveOrderId(data.orderId, orderIdMap)
      await api.cancelOrderItem(orderId, data.item_id, data.cancel_qty, data.reason, data.lang)
      return { orderId }
    }
    case 'cancel_order': {
      const orderId = _resolveOrderId(data.orderId, orderIdMap)
      await api.cancelOrder(orderId)
      return { orderId }
    }
    case 'checkout': {
      const orderId = _resolveOrderId(data.orderId, orderIdMap)
      await api.checkoutOrder(orderId, { paymentMethod: data.paymentMethod, cashReceived: data.cashReceived, change: data.change, lang: data.lang })
      return { orderId }
    }
    case 'submit_order': {
      const orderId = _resolveOrderId(data.orderId, orderIdMap)
      await api.submitOrder(orderId, data.lang)
      return { orderId }
    }
    default:
      throw new Error(`Unknown operation type: ${type}`)
  }
}

function _resolveOrderId(id, orderIdMap) {
  // 如果是临时ID（字符串形式如 "temp_xxx"），从映射表查找服务端ID
  if (typeof id === 'string' && orderIdMap.has(id)) {
    return orderIdMap.get(id)
  }
  return id
}

// ── 在线状态检测 ─────────────────────────────

let _online = navigator.onLine

export function isOnline() {
  return _online
}

export function onOnlineChange(callback) {
  const handler = () => {
    _online = navigator.onLine
    callback(_online)
  }
  window.addEventListener('online', handler)
  window.addEventListener('offline', handler)
  return () => {
    window.removeEventListener('online', handler)
    window.removeEventListener('offline', handler)
  }
}
