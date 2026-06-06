<template>
  <div class="admin-layout">
    <header class="admin-topbar">
      <span class="admin-logo">{{ t('admin.title') }}</span>
      <div class="topbar-actions">
        <el-select v-model="currentLang" size="small" style="width: 110px" @change="setLocale">
          <el-option v-for="opt in localeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-button v-if="isAdmin" size="small" plain @click="showDbDialog = true">{{ t('common.dbInfo') }}</el-button>
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
          <el-menu-item v-if="isAdmin" index="/admin/reports">
            <el-icon><DataAnalysis /></el-icon>
            <span>{{ t('nav.reports') }}</span>
          </el-menu-item>
          <el-menu-item v-if="isAdmin" index="/admin/employees">
            <el-icon><User /></el-icon>
            <span>{{ t('nav.employeeManage') }}</span>
          </el-menu-item>
        </el-menu>
      </aside>
      <main class="admin-content">
        <router-view />
      </main>
    </div>

    <!-- Database backup/restore dialog -->
    <el-dialog v-model="showDbDialog" :title="t('common.dbInfo')" width="560px">
      <div v-if="dbInfo" class="db-info">
        <div class="db-row"><span class="db-label">{{ t('common.dbSize') }}:</span><span>{{ formatDbSize(dbInfo.db?.size) }}</span><span class="db-time">{{ dbInfo.db?.mtime }}</span></div>
        <div class="db-row"><span class="db-label">{{ t('common.bakSize') }}:</span><span>{{ dbInfo.bak ? formatDbSize(dbInfo.bak.size) : t('common.noBackup') }}</span><span class="db-time">{{ dbInfo.bak?.mtime }}</span></div>
        <div class="db-section-title">{{ t('common.bakSize') }}</div>
        <div v-if="dbInfo.backups?.length" class="backup-list">
          <div v-for="b in dbInfo.backups" :key="b.name" class="backup-row">
            <span class="backup-name">{{ b.name }}</span>
            <span class="backup-size">{{ formatDbSize(b.size) }}</span>
            <el-button size="small" type="danger" @click="handleRestore(b.name)">{{ t('common.restoreNow') }}</el-button>
          </div>
        </div>
        <div v-else class="empty-hint-db">{{ t('common.noBackup') }}</div>
      </div>
      <div v-else class="db-loading">{{ t('common.loading') }}</div>
      <template #footer>
        <el-button @click="showDbDialog = false">{{ t('common.close') }}</el-button>
        <el-button type="primary" @click="handleBackup" :loading="dbSaving">{{ t('common.backupNow') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { List, KnifeFork, Document, DataAnalysis, User } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n, localeOptions } from '../i18n'
import { api } from '../api'

const { t, locale, setLocale } = useI18n()
const currentLang = computed({
  get: () => locale.value,
  set: (val) => setLocale(val),
})

const router = useRouter()
const route = useRoute()

const userRole = ref(
  (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role || '' } catch { return '' } })()
)
const isAdmin = computed(() => userRole.value === 'admin')

// Database backup/restore
const showDbDialog = ref(false)
const dbInfo = ref(null)
const dbSaving = ref(false)

function formatDbSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

async function loadDbInfo() {
  try { dbInfo.value = await api.getDbInfo() } catch {}
}

async function handleBackup() {
  dbSaving.value = true
  try {
    await api.backupDb()
    ElMessage.success(t('common.backupSuccess'))
    await loadDbInfo()
  } catch (e) { ElMessage.error(e.message) }
  dbSaving.value = false
}

async function handleRestore(name) {
  try {
    await ElMessageBox.confirm(t('common.restoreConfirm'), t('common.confirm'), {
      confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning'
    })
    dbSaving.value = true
    await api.restoreDb(name || null)
    ElMessage.success(t('common.restoreSuccess'))
    await loadDbInfo()
  } catch {}
  dbSaving.value = false
}

watch(showDbDialog, (open) => { if (open) loadDbInfo() })

const activeMenu = computed(() => route.path)

function handleSelect(path) {
  router.push(path)
}

function logout() {
  localStorage.removeItem('isLoggedIn')
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
</script>

<style scoped>
.admin-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.admin-topbar {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.admin-topbar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
}

.admin-logo {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.5px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Language selector specific styles */
.topbar-actions :deep(.el-select) {
  width: 110px !important;
}

.topbar-actions :deep(.el-select .el-input__wrapper) {
  border-radius: 8px !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06) !important;
  background-color: #ffffff !important;
  border: 1.5px solid #e2e8f0 !important;
  padding: 6px 10px !important;
  height: 36px !important;
}

.topbar-actions :deep(.el-select .el-input__inner) {
  text-align: center !important;
  font-size: 13px !important;
  color: #2d3748 !important;
}

.topbar-actions :deep(.el-select__selected-item) {
  text-align: center !important;
}

.topbar-actions :deep(.el-select__caret) {
  font-size: 12px !important;
}

.topbar-actions :deep(.el-select .el-input__wrapper:hover) {
  border-color: #cbd5e0 !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08) !important;
}

.topbar-actions :deep(.el-select .el-input__wrapper.is-focus) {
  border-color: #667eea !important;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12), 0 4px 12px rgba(102, 126, 234, 0.15) !important;
}

/* Language dropdown */
.topbar-actions :deep(.el-select-dropdown) {
  border-radius: 8px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  border: 1px solid #e2e8f0 !important;
  overflow: hidden !important;
  padding: 6px !important;
  min-width: 120px !important;
}

.topbar-actions :deep(.el-select-dropdown__item) {
  border-radius: 6px !important;
  margin: 2px 0 !important;
  padding: 10px 12px !important;
  font-size: 13px !important;
  text-align: center !important;
  transition: all 0.2s ease !important;
  line-height: 1.4 !important;
}

.topbar-actions :deep(.el-select-dropdown__item:hover) {
  background-color: rgba(102, 126, 234, 0.08) !important;
  color: #667eea !important;
}

.topbar-actions :deep(.el-select-dropdown__item.is-selected) {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.12) 0%, rgba(118, 75, 162, 0.12) 100%) !important;
  color: #667eea !important;
  font-weight: 600 !important;
}

.topbar-actions :deep(.el-button) {
  transition: all 0.3s ease;
}

.topbar-actions :deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.admin-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: transparent;
}

.admin-sidebar {
  width: 220px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-right: none;
  flex-shrink: 0;
  overflow-y: auto;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.admin-sidebar :deep(.el-menu) {
  border-right: none;
  background: transparent;
}

.admin-sidebar :deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
  margin: 4px 8px;
  border-radius: 8px;
  transition: all 0.3s ease;
  color: #606266;
}

.admin-sidebar :deep(.el-menu-item:hover) {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  color: #667eea;
}

.admin-sidebar :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.admin-sidebar :deep(.el-menu-item .el-icon) {
  font-size: 18px;
  margin-right: 12px;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: rgba(240, 242, 245, 0.6);
  backdrop-filter: blur(10px);
  padding: 20px;
}

/* Database info dialog styling */
.db-info { 
  font-size: 14px;
  padding: 8px 0;
}

.db-row { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 12px 16px; 
  margin: 8px 0;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  border-radius: 8px;
  border-left: 3px solid #667eea;
  gap: 12px;
  transition: all 0.3s ease;
}

.db-row:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.db-label { 
  font-weight: 600; 
  min-width: 80px; 
  color: #303133;
}

.db-time { 
  color: #909399; 
  font-size: 12px;
  font-family: 'Courier New', monospace;
}

.db-loading { 
  text-align: center; 
  padding: 32px; 
  color: #c0c4cc;
  font-size: 14px;
}

.db-section-title { 
  font-weight: 600; 
  font-size: 14px; 
  color: #303133; 
  margin-top: 20px; 
  padding-bottom: 12px; 
  border-bottom: 2px solid #e4e7ed;
  position: relative;
}

.db-section-title::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
}

.backup-list { 
  max-height: 240px; 
  overflow-y: auto;
  padding: 8px 0;
}

.backup-row { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  padding: 12px 16px;
  margin: 8px 0;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  transition: all 0.3s ease;
}

.backup-row:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.backup-name { 
  font-size: 13px; 
  color: #303133; 
  font-family: 'Courier New', monospace; 
  flex: 1; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap;
}

.backup-size { 
  font-size: 12px; 
  color: #909399; 
  min-width: 70px; 
  text-align: right;
  font-weight: 500;
}

.empty-hint-db { 
  text-align: center; 
  padding: 32px; 
  color: #c0c4cc; 
  font-size: 14px;
}

/* Responsive design */
@media (max-width: 768px) {
  .admin-sidebar {
    width: 70px;
  }
  
  .admin-sidebar :deep(.el-menu-item span) {
    display: none;
  }
  
  .admin-sidebar :deep(.el-menu-item) {
    justify-content: center;
    padding: 0 !important;
    margin: 4px;
  }
  
  .admin-sidebar :deep(.el-menu-item .el-icon) {
    margin-right: 0;
    font-size: 20px;
  }
  
  .admin-topbar {
    padding: 0 16px;
    height: 56px;
  }
  
  .admin-logo {
    font-size: 16px;
  }
  
  .admin-content {
    padding: 12px;
  }
}

/* Scrollbar styling */
.admin-sidebar::-webkit-scrollbar,
.admin-content::-webkit-scrollbar {
  width: 6px;
}

.admin-sidebar::-webkit-scrollbar-track,
.admin-content::-webkit-scrollbar-track {
  background: transparent;
}

.admin-sidebar::-webkit-scrollbar-thumb,
.admin-content::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.admin-sidebar::-webkit-scrollbar-thumb:hover,
.admin-content::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}
</style>
