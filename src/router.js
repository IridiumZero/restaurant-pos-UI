import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/login', name: 'Login', component: () => import('./views/Login.vue') },
  { path: '/', name: 'Dashboard', component: () => import('./views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/menu', name: 'MenuManage', component: () => import('./views/MenuManage.vue'), meta: { requiresAuth: true } },
  { path: '/orders', name: 'OrderHistory', component: () => import('./views/OrderHistory.vue'), meta: { requiresAuth: true } },
  { path: '/reports', name: 'Reports', component: () => import('./views/Reports.vue'), meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login')
  } else if (to.path === '/login' && isLoggedIn) {
    next('/')
  } else {
    next()
  }
})

export default router
