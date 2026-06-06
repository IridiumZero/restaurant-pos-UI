/**
 * 后端 API 接口集成测试
 * 用法: node server/test.mjs
 * 需要服务器运行在 localhost:3000
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

const BASE = 'http://localhost:3000'
let adminToken = ''
let waiterToken = ''
let testOrderId = null
let testDishId = null
let testCatId = null
let testEmpId = null

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

// ── Health Check ─────────────────────────

describe('Health Check', () => {
  it('GET /api/health 返回 ok', async () => {
    const { status, data } = await req('GET', '/api/health')
    assert.equal(status, 200)
    assert.equal(data.status, 'ok')
    assert.ok(data.timestamp)
  })
})

// ── Auth ─────────────────────────────────

describe('Auth', () => {
  it('POST /api/auth/login 管理员登录', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
      employeeNo: 'admin', password: 'admin123'
    })
    // 如果默认密码不对，尝试其他常见密码
    if (status !== 200) {
      const r2 = await req('POST', '/api/auth/login', {
        employeeNo: 'admin', password: '123456'
      })
      if (r2.status === 200) {
        adminToken = r2.data.token
        assert.ok(r2.data.user)
        return
      }
    }
    assert.equal(status, 200)
    adminToken = data.token
    assert.ok(data.user)
    assert.equal(data.user.role, 'admin')
  })

  it('POST /api/auth/login 拒绝无效凭据', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      employeeNo: 'admin', password: 'wrongpassword'
    })
    assert.ok(status === 401 || status === 429)
  })

  it('GET /api/auth/me 返回当前用户', async () => {
    const { status, data } = await req('GET', '/api/auth/me', null, adminToken)
    assert.equal(status, 200)
    assert.ok(data.id)
  })

  it('拒绝无 token 访问', async () => {
    const { status } = await req('GET', '/api/employees')
    assert.equal(status, 401)
  })
})

// ── Categories ───────────────────────────

describe('Categories CRUD', () => {
  it('GET /api/categories 获取分类列表', async () => {
    const { status, data } = await req('GET', '/api/categories', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })

  it('POST /api/categories 创建分类', async () => {
    const { status, data } = await req('POST', '/api/categories', {
      name: '__test_cat__',
      name_pt: 'Test Cat PT',
      name_en: 'Test Cat EN'
    }, adminToken)
    assert.equal(status, 200)
    testCatId = data.id
    assert.ok(testCatId)
  })

  it('PUT /api/categories/:id 更新分类', async () => {
    const { status, data } = await req('PUT', `/api/categories/${testCatId}`, {
      name: '__test_cat_updated__'
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('POST /api/categories 拒绝重复名称', async () => {
    const { status } = await req('POST', '/api/categories', {
      name: '__test_cat_updated__'
    }, adminToken)
    assert.equal(status, 400)
  })

  it('DELETE /api/categories/:id 删除分类', async () => {
    const { status, data } = await req('DELETE', `/api/categories/${testCatId}`, null, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })
})

// ── Dishes ───────────────────────────────

describe('Dishes CRUD', () => {
  it('GET /api/dishes 获取菜品列表', async () => {
    const { status, data } = await req('GET', '/api/dishes', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })

  it('POST /api/dishes 创建菜品', async () => {
    const { status, data } = await req('POST', '/api/dishes', {
      name: '__test_dish__',
      name_pt: 'Test Dish PT',
      name_en: 'Test Dish EN',
      category: '主食',
      price: 99.99,
      status: 'active'
    }, adminToken)
    assert.equal(status, 200)
    testDishId = data.id
    assert.ok(testDishId)
  })

  it('PUT /api/dishes/:id 更新菜品', async () => {
    const { status, data } = await req('PUT', `/api/dishes/${testDishId}`, {
      price: 88.88,
      name: '__test_dish_updated__'
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('GET /api/dishes?search 搜索菜品', async () => {
    const { status, data } = await req('GET', '/api/dishes?search=__test_dish', null, adminToken)
    assert.equal(status, 200)
    assert.ok(data.length >= 1)
  })

  it('DELETE /api/dishes/:id 删除菜品', async () => {
    const { status, data } = await req('DELETE', `/api/dishes/${testDishId}`, null, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })
})

// ── Orders ───────────────────────────────

describe('Orders CRUD', () => {
  it('POST /api/orders 创建订单', async () => {
    // 先获取一个有效的菜品
    const { data: dishList } = await req('GET', '/api/dishes', null, adminToken)
    const dish = dishList.find(d => d.status === 'active')
    if (!dish) {
      console.log('  ⚠ 无可用菜品，跳过订单测试')
      return
    }
    const { status, data } = await req('POST', '/api/orders', {
      tableNumber: 99,
      status: 'draft',
      totalAmount: dish.price * 2,
      items: [{ dish_id: dish.id, name: dish.name, price: dish.price, qty: 2 }]
    }, adminToken)
    assert.equal(status, 200)
    testOrderId = data.id
    assert.ok(testOrderId)
  })

  it('GET /api/orders 获取订单列表（分页）', async () => {
    const { status, data } = await req('GET', '/api/orders?page=1&pageSize=5', null, adminToken)
    assert.equal(status, 200)
    assert.ok(data.orders || Array.isArray(data))
    if (data.total !== undefined) {
      assert.ok(typeof data.total === 'number')
      assert.ok(typeof data.page === 'number')
    }
  })

  it('PUT /api/orders/:id 更新订单', async () => {
    if (!testOrderId) return
    const { data: dishList } = await req('GET', '/api/dishes', null, adminToken)
    const dish = dishList.find(d => d.status === 'active')
    if (!dish) return
    const { status, data } = await req('PUT', `/api/orders/${testOrderId}`, {
      tableNumber: 98,
      totalAmount: dish.price * 3,
      items: [{ dish_id: dish.id, name: dish.name, price: dish.price, qty: 3 }]
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('POST /api/orders/:id/submit 提交订单', async () => {
    if (!testOrderId) return
    const { status, data } = await req('POST', `/api/orders/${testOrderId}/submit`, null, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('POST /api/orders/:id/cancel 取消订单', async () => {
    if (!testOrderId) return
    const { status, data } = await req('POST', `/api/orders/${testOrderId}/cancel`, null, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('POST /api/orders/:id/reopen 重新打开订单', async () => {
    if (!testOrderId) return
    const { status, data } = await req('POST', `/api/orders/${testOrderId}/reopen`, null, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('POST /api/orders/:id/checkout 结账', async () => {
    if (!testOrderId) return
    const { status, data } = await req('POST', `/api/orders/${testOrderId}/checkout`, {
      paymentMethod: 'cash',
      cashReceived: 200,
      change: 0,
      lang: 'zh'
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('DELETE /api/orders/:id 删除订单（管理员）', async () => {
    if (!testOrderId) return
    const { status, data } = await req('DELETE', `/api/orders/${testOrderId}`, null, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('GET /api/orders/export 导出订单', async () => {
    const { status, data } = await req('GET', '/api/orders/export', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })
})

// ── Employees ────────────────────────────

describe('Employees CRUD', () => {
  it('GET /api/employees 获取员工列表', async () => {
    const { status, data } = await req('GET', '/api/employees', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
    assert.ok(data.length > 0)
  })

  it('POST /api/employees 创建员工', async () => {
    const uniqueId = Date.now().toString(36)
    const { status, data } = await req('POST', '/api/employees', {
      username: `__test_${uniqueId}__`,
      name: 'Test Employee',
      role: 'waiter',
      password: 'test123456'
    }, adminToken)
    assert.equal(status, 200)
    testEmpId = data.id
    assert.ok(testEmpId)
  })

  it('PUT /api/employees/:id 更新员工', async () => {
    if (!testEmpId) return
    const { status, data } = await req('PUT', `/api/employees/${testEmpId}`, {
      name: 'Updated Employee'
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('PUT /api/employees/:id 修改密码', async () => {
    if (!testEmpId) return
    const { status, data } = await req('PUT', `/api/employees/${testEmpId}`, {
      password: 'newpassword123'
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })

  it('POST /api/employees 拒绝重复工号', async () => {
    // Use an existing employee's username
    const { data: emps } = await req('GET', '/api/employees', null, adminToken)
    const existing = emps[0]?.username || 'admin'
    const { status } = await req('POST', '/api/employees', {
      username: existing,
      name: 'Duplicate',
      role: 'waiter'
    }, adminToken)
    assert.equal(status, 400)
  })

  it('GET /api/waiters 获取服务员列表', async () => {
    const { status, data } = await req('GET', '/api/waiters', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })
})

// ── Reports ──────────────────────────────

describe('Reports', () => {
  it('GET /api/reports/today 今日报表', async () => {
    const { status, data } = await req('GET', '/api/reports/today', null, adminToken)
    assert.equal(status, 200)
    assert.ok('count' in data)
    assert.ok('revenue' in data)
  })

  it('GET /api/reports/monthly 月度报表', async () => {
    const { status, data } = await req('GET', '/api/reports/monthly', null, adminToken)
    assert.equal(status, 200)
    assert.ok('count' in data)
    assert.ok('revenue' in data)
  })

  it('GET /api/reports/monthly-trend 月度趋势', async () => {
    const { status, data } = await req('GET', '/api/reports/monthly-trend', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
    assert.equal(data.length, 30)
  })

  it('GET /api/reports/category-pie 分类饼图', async () => {
    const { status, data } = await req('GET', '/api/reports/category-pie', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })

  it('GET /api/reports/payment-pie 支付方式饼图', async () => {
    const { status, data } = await req('GET', '/api/reports/payment-pie', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })

  it('GET /api/reports/dishes-top 热门菜品', async () => {
    const { status, data } = await req('GET', '/api/reports/dishes-top', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })

  it('GET /api/reports/waiter-rank 服务员排名', async () => {
    const { status, data } = await req('GET', '/api/reports/waiter-rank', null, adminToken)
    assert.equal(status, 200)
    assert.ok(Array.isArray(data))
  })
})

// ── Database Backup ──────────────────────

describe('Database Backup', () => {
  it('GET /api/db/info 获取数据库信息', async () => {
    const { status, data } = await req('GET', '/api/db/info', null, adminToken)
    assert.equal(status, 200)
    assert.ok(data.db || data.db === null)
  })

  it('POST /api/db/backup 创建备份', async () => {
    const { status, data } = await req('POST', '/api/db/backup', null, adminToken)
    assert.equal(status, 200)
    assert.ok(data.message)
  })
})

// ── Cleanup ──────────────────────────────

describe('Cleanup test data', () => {
  it('删除测试员工', async () => {
    if (!testEmpId) return
    // 员工管理没有 DELETE 接口，通过 update 设为 inactive
    const { status, data } = await req('PUT', `/api/employees/${testEmpId}`, {
      status: 'inactive'
    }, adminToken)
    assert.equal(status, 200)
    assert.equal(data.success, true)
  })
})
