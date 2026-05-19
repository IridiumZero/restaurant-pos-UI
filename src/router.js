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
  { path: '/', redirect: '/order' },
  { path: '/:pathMatch(.*)*', redirect: '/order' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  if (to.matched.some((r) => r.meta.requiresAuth) && !isLoggedIn) {
    next('/login')
  } else if (to.path === '/login' && isLoggedIn) {
    next('/admin')
  } else {
    next()
  }
})

export default router
