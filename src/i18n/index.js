import { computed } from 'vue'
import { state, messages } from './state.js'

export const localeOptions = [
  { value: 'zh', label: '中文' },
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
]

function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj)
}

/**
 * Returns the dish name in the currently selected locale.
 * Falls back: locale-specific name → dish.name (Chinese) → ''
 */
export function getCategoryName(cat) {
  if (!cat) return ''
  if (state.locale === 'pt' && cat.name_pt) return cat.name_pt
  if (state.locale === 'en' && cat.name_en) return cat.name_en
  return cat.name || ''
}

export function getDishName(dish) {
  if (!dish) return ''
  if (state.locale === 'pt' && dish.name_pt) return dish.name_pt
  if (state.locale === 'en' && dish.name_en) return dish.name_en
  return dish.name || ''
}

export function getDishRemark(dish) {
  if (!dish) return ''
  if (state.locale === 'pt' && dish.remark_pt) return dish.remark_pt
  if (state.locale === 'en' && dish.remark_en) return dish.remark_en
  return dish.remark || ''
}

export function useI18n() {
  const t = (key, arg1) => {
    const msg = messages[state.locale]
    let value = getByPath(msg, key)
    if (value === undefined) {
      const zhVal = getByPath(messages.zh, key)
      if (zhVal !== undefined) value = zhVal
      else return typeof arg1 === 'string' ? arg1 : key
    }
    // Parameter interpolation: t('key', { name: 'foo' }) replaces {name}
    if (typeof arg1 === 'object' && arg1 !== null) {
      Object.entries(arg1).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      })
    }
    return value
  }

  const locale = computed(() => state.locale)

  const setLocale = (loc) => {
    if (messages[loc]) {
      state.locale = loc
      localStorage.setItem('lang', loc)
    }
  }

  const formatCurrency = (value) => {
    return `${Number(value).toFixed(2)} ${t('currency.symbol')}`
  }

  return { t, locale, setLocale, formatCurrency }
}
