import { reactive } from 'vue'
import zh from './zh.js'
import pt from './pt.js'
import en from './en.js'

export const messages = { zh, pt, en }

export const state = reactive({
  locale: localStorage.getItem('lang') || 'zh',
})

export function getMessages() {
  return messages
}
