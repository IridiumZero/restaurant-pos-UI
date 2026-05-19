<template>
  <div class="admin-layout">
    <header class="admin-topbar">
      <span class="admin-logo">{{ t('admin.title') }}</span>
      <div class="topbar-actions">
        <el-select v-model="currentLang" size="small" style="width: 110px" @change="setLocale">
          <el-option v-for="opt in localeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-button type="danger" size="small" plain @click="logout">{{ t('common.logout') }}</el-button>
      </div>
    </header>
    <div class="admin-body">
      <aside class="admin-sidebar">
        <el-menu :default-active="activeMenu" @select="handleSelect" :collapse="false">
          <el-menu-item index="/admin/pending">
            <el-icon><List /></el-icon>
            <span>{{ t('nav.pendingOrders') }}</span>
          </el-menu-item>
          <el-menu-item index="/admin/menu">
            <el-icon><KnifeFork /></el-icon>
            <span>{{ t('nav.menuManage') }}</span>
          </el-menu-item>
          <el-menu-item index="/admin/orders">
            <el-icon><Document /></el-icon>
            <span>{{ t('nav.orderHistory') }}</span>
          </el-menu-item>
          <el-menu-item index="/admin/reports">
            <el-icon><DataAnalysis /></el-icon>
            <span>{{ t('nav.reports') }}</span>
          </el-menu-item>
          <el-menu-item index="/admin/employees">
            <el-icon><User /></el-icon>
            <span>{{ t('nav.employeeManage') }}</span>
          </el-menu-item>
        </el-menu>
      </aside>
      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { List, KnifeFork, Document, DataAnalysis, User } from '@element-plus/icons-vue'
import { useI18n, localeOptions } from '../i18n'

const { t, locale, setLocale } = useI18n()
const currentLang = computed({
  get: () => locale.value,
  set: (val) => setLocale(val),
})

const router = useRouter()
const route = useRoute()

const activeMenu = computed(() => route.path)

function handleSelect(path) {
  router.push(path)
}

function logout() {
  localStorage.removeItem('isLoggedIn')
  router.push('/login')
}
</script>

<style scoped>
.admin-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.admin-topbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #304156;
  color: #fff;
  flex-shrink: 0;
}
.admin-logo {
  font-size: 16px;
  font-weight: bold;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.admin-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.admin-sidebar {
  width: 200px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  flex-shrink: 0;
  overflow-y: auto;
}
.admin-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: #f0f2f5;
}

@media (max-width: 768px) {
  .admin-sidebar {
    width: 60px;
  }
  .admin-sidebar :deep(.el-menu-item span) {
    display: none;
  }
  .admin-sidebar :deep(.el-menu-item) {
    justify-content: center;
    padding: 0 !important;
  }
}
</style>
