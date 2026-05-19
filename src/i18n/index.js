import { reactive, computed } from 'vue'
import zh from './zh.js'
import pt from './pt.js'
import en from './en.js'

const messages = { zh, pt, en }

const state = reactive({
  locale: localStorage.getItem('lang') || 'zh',
})

export const localeOptions = [
  { value: 'zh', label: '中文' },
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
]

function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj)
}

export function useI18n() {
  const t = (key, fallback) => {
    const msg = messages[state.locale]
    const value = getByPath(msg, key)
    if (value !== undefined) return value
    // fallback to zh
    const zhVal = getByPath(messages.zh, key)
    if (zhVal !== undefined) return zhVal
    return fallback || key
  }

  const locale = computed(() => state.locale)

  const setLocale = (loc) => {
    if (messages[loc]) {
      state.locale = loc
      localStorage.setItem('lang', loc)
    }
  }

  const formatCurrency = (value) => {
    return `${Number(value).toFixed(2)} MT`
  }

  return { t, locale, setLocale, formatCurrency }
}
