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
.db-info { font-size:14px; }
.db-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f0f0f0; gap:12px; }
.db-label { font-weight:600; min-width:80px; }
.db-time { color:#909399; font-size:12px; }
.db-loading { text-align:center; padding:20px; color:#c0c4cc; }
.db-section-title { font-weight:600; font-size:13px; color:#606266; margin-top:16px; padding-bottom:8px; border-bottom:1px solid #ebeef5; }
.backup-list { max-height:200px; overflow-y:auto; }
.backup-row { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #f5f7fa; }
.backup-name { font-size:13px; color:#303133; font-family:monospace; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.backup-size { font-size:12px; color:#909399; min-width:60px; text-align:right; }
.empty-hint-db { text-align:center; padding:16px; color:#c0c4cc; font-size:13px; }
</style>
