import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import enLocale from 'element-plus/dist/locale/en.mjs'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { useI18n } from './i18n'

const { locale } = useI18n()

const elLocales = {
  zh: zhCn,
  en: enLocale,
  // Element Plus does not ship pt locale in dist; fall back to en
  pt: enLocale,
}

const app = createApp(App)

// Use stored locale for Element Plus initial language
const storedLang = localStorage.getItem('lang') || 'zh'
app.use(ElementPlus, { locale: elLocales[storedLang] || zhCn })

app.use(router)
app.config.globalProperties.$t = useI18n().t
app.config.globalProperties.$fc = useI18n().formatCurrency
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.mount('#app')
