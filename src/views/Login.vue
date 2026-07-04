<template>
  <div class="login-container">
    <div class="login-card">
      <h2>{{ t('login.title') }}</h2>

      <!-- Server URL config -->
      <div class="server-config">
        <el-input v-model="serverUrl" :placeholder="t('login.serverPlaceholder')" size="small">
          <template #prepend>
            <span class="server-status-dot" :class="serverStatus"></span>
            {{ t('login.serverLabel') }}
          </template>
        </el-input>
        <p class="server-hint">
          <span v-if="serverStatus === 'checking'" style="color:#E6A23C">{{ t('login.checking') || '正在检测服务器…' }}</span>
          <span v-else-if="serverStatus === 'ok'" style="color:#67C23A">{{ t('login.connected') || '已连接' }}</span>
          <span v-else-if="serverStatus === 'fail'" style="color:#F56C6C">{{ t('login.connectFail') || '连接失败，请检查服务器地址' }}</span>
          <span v-else>{{ t('login.serverHint') }}</span>
        </p>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <el-form-item prop="employeeNo">
          <el-input v-model="form.employeeNo" :placeholder="t('login.placeholderUser')" size="large">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" :placeholder="t('login.placeholderPass')" size="large" show-password>
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" @click="handleLogin" :loading="loading" style="width: 100%">
            {{ t('login.loginBtn') }}
          </el-button>
        </el-form-item>
      </el-form>
      <div class="lang-switch">
        <el-select v-model="currentLang" size="small" style="width: 130px" @change="setLocale">
          <el-option v-for="opt in localeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n, localeOptions } from '../i18n'
import { api } from '../api'

const { t, locale, setLocale } = useI18n()
const currentLang = ref(locale.value)

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const serverStatus = ref('checking') // 'checking' | 'ok' | 'fail' | ''
function normalizeUrl(url) {
  if (!url) return url
  // 开发环境下，前端端口（5173/5174等）≠ 后端端口（3000），强制纠正
  if (url.includes('localhost:') || url.includes('127.0.0.1:')) {
    return 'http://localhost:3000'
  }
  return url
}

const serverUrl = ref(
  normalizeUrl(localStorage.getItem('serverUrl')) ||
  (location.origin.includes('localhost:') || location.origin.includes('127.0.0.1:')
    ? 'http://localhost:3000'
    : location.origin) ||
  'http://localhost:3000'
)

function isCapacitorApp() {
  return !!(window.Capacitor) || location.origin.startsWith('capacitor://')
}

async function probeUrl(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

async function detectServer() {
  serverStatus.value = 'checking'
  serverUrl.value = normalizeUrl(serverUrl.value)
  const saved = serverUrl.value.replace(/\/+$/, '')

  // In browser (not Capacitor), try location.origin FIRST — the page was served
  // from the server, so origin IS the correct server URL. This avoids stale
  // localStorage caching from a previous session with a different IP.
  if (!isCapacitorApp()) {
    const origin = normalizeUrl(location.origin)
    if (await probeUrl(origin)) {
      serverUrl.value = origin
      localStorage.setItem('serverUrl', origin)
      serverStatus.value = 'ok'
      return
    }
  }

  // 2. Try saved URL (essential for Capacitor/APK, fallback for browser)
  if (saved && saved !== normalizeUrl(location.origin)) {
    if (await probeUrl(saved)) {
      serverUrl.value = saved
      serverStatus.value = 'ok'
      return
    }
  }

  // 3. Try localhost:3000 as last resort
  if (saved !== 'http://localhost:3000' && !saved.includes(location.hostname)) {
    if (await probeUrl('http://localhost:3000')) {
      serverUrl.value = 'http://localhost:3000'
      localStorage.setItem('serverUrl', 'http://localhost:3000')
      serverStatus.value = 'ok'
      return
    }
  }

  serverStatus.value = 'fail'
}

const form = reactive({ employeeNo: '', password: '' })
const rules = {
  employeeNo: [{ required: true, message: t('common.required'), trigger: 'blur' }],
  password: [{ required: true, message: t('common.required'), trigger: 'blur' }],
}

function saveServerUrl() {
  const url = serverUrl.value.replace(/\/+$/, '')
  localStorage.setItem('serverUrl', url)
}

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saveServerUrl()
  loading.value = true
  try {
    const res = await api.login(form.employeeNo, form.password)
    if (res.user.role !== 'admin' && res.user.role !== 'cashier') {
      ElMessage.error(t('login.accessDenied'))
      loading.value = false
      return
    }
    serverStatus.value = 'ok'
    localStorage.setItem('token', res.token)
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('user', JSON.stringify(res.user))
    ElMessage.success(t('login.success'))
    router.push('/admin')
  } catch (e) {
    // If connection error (not auth error), re-probe server
    if (e.name !== 'AbortError' && !e.message?.includes('login')) {
      await detectServer()
    }
    ElMessage.error(e.message || t('login.error'))
  }
  loading.value = false
}

onMounted(() => {
  detectServer()

  const msg = sessionStorage.getItem('kickedOutMsg')
  if (msg) {
    sessionStorage.removeItem('kickedOutMsg')
    setTimeout(() => ElMessage.warning(msg), 300)
  }
})
</script>

<style scoped>
.login-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}
.login-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.login-card h2 {
  text-align: center;
  margin-bottom: 20px;
  color: #303133;
  font-size: 20px;
}
.server-config {
  margin-bottom: 16px;
}
.server-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
  background: #C0C4CC;
}
.server-status-dot.checking {
  background: #E6A23C;
  animation: pulse 1s infinite;
}
.server-status-dot.ok {
  background: #67C23A;
}
.server-status-dot.fail {
  background: #F56C6C;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.server-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #909399;
  line-height: 1.4;
}
.hint {
  text-align: center;
  color: #909399;
  font-size: 13px;
}
.lang-switch {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
</style>
