import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/order', name: 'Order', component: () => import('./views/OrderPage.vue') },
  { path: '/login', name: 'Login', component: () => import('./views/Login.vue') },
  {
    path: '/admin',
    component: () => import('./views/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/admin/pending' },
      { path: 'pending', name: 'PendingOrders', component: () => import('./views/PendingOrders.vue') },
      { path: 'menu', name: 'MenuManage', component: () => import('./views/MenuManage.vue') },
      { path: 'orders', name: 'OrderHistory', component: () => import('./views/OrderHistory.vue') },
      { path: 'reports', name: 'Reports', component: () => import('./views/Reports.vue') },
      { path: 'employees', name: 'EmployeeManage', component: () => import('./views/EmployeeManage.vue') },
    ],
  },
  { path: '/', redirect: '/login' },
  { path: '/:pathMatch(.*)*', redirect: '/order' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  let userRole = ''
  try {
    userRole = JSON.parse(localStorage.getItem('user') || '{}').role || ''
  } catch {}

  // Admin routes: must be logged in AND have admin or cashier role
  if (to.matched.some((r) => r.meta.requiresAuth)) {
    if (!isLoggedIn) return next('/login')
    if (userRole !== 'admin' && userRole !== 'cashier') return next('/order')
  }

  // Already logged in and visiting /login
  if (to.path === '/login' && isLoggedIn) {
    return next(userRole === 'waiter' ? '/order' : '/admin')
  }

  next()
})

export default router
