<template>
  <div class="login-container">
    <div class="login-card">
      <h2>{{ t('login.title') }}</h2>

      <!-- Server URL config -->
      <div class="server-config">
        <el-input v-model="serverUrl" :placeholder="t('login.serverPlaceholder')" size="small">
          <template #prepend>{{ t('login.serverLabel') }}</template>
        </el-input>
        <p class="server-hint">{{ t('login.serverHint') }}</p>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" :placeholder="t('login.placeholderUser')" size="large">
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
      <p class="hint">{{ t('login.hint') }}</p>
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
const serverUrl = ref(localStorage.getItem('serverUrl') || 'http://localhost:3000')

const form = reactive({ username: 'admin', password: '123456' })
const rules = {
  username: [{ required: true, message: 'Required', trigger: 'blur' }],
  password: [{ required: true, message: 'Required', trigger: 'blur' }],
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
    const res = await api.login(form.username, form.password)
    localStorage.setItem('token', res.token)
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('user', JSON.stringify(res.user))
    ElMessage.success(t('login.success'))
    router.push('/admin')
  } catch (e) {
    ElMessage.error(e.message || t('login.error'))
  }
  loading.value = false
}

onMounted(() => {
  saveServerUrl()
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
