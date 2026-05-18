<template>
  <div v-if="$route.path === '/login'" class="login-wrapper">
    <router-view />
  </div>
  <div v-else class="app-shell">
    <header class="top-bar">
      <span class="top-title">餐厅收银系统</span>
      <el-button type="danger" size="small" @click="logout" plain>退出</el-button>
    </header>
    <main class="main-content">
      <router-view />
    </main>
    <nav class="bottom-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.path"
        class="tab-item"
        :class="{ active: $route.path === tab.path }"
        @click="$router.push(tab.path)"
      >
        <el-icon :size="20"><component :is="tab.icon" /></el-icon>
        <span class="tab-label">{{ tab.label }}</span>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { Monitor, KnifeFork, Document, DataAnalysis } from '@element-plus/icons-vue'

const router = useRouter()

const tabs = [
  { path: '/', label: '收银', icon: Monitor },
  { path: '/menu', label: '菜品', icon: KnifeFork },
  { path: '/orders', label: '订单', icon: Document },
  { path: '/reports', label: '报表', icon: DataAnalysis },
]

function logout() {
  localStorage.removeItem('isLoggedIn')
  router.push('/login')
}
</script>

<style scoped>
.login-wrapper {
  height: 100%;
}
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}
.top-bar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #304156;
  color: #fff;
  flex-shrink: 0;
}
.top-title {
  font-size: 16px;
  font-weight: bold;
}
.main-content {
  flex: 1;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}
.bottom-tabs {
  height: 56px;
  display: flex;
  background: #fff;
  border-top: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.tab-item.active {
  color: #409EFF;
}
.tab-label {
  font-size: 11px;
  margin-top: 2px;
}
</style>
