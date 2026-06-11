/**
 * WebSocket 实时推送客户端（单例模式）
 * 所有组件共享同一个 WebSocket 连接，避免多连接重复报错
 */
import { onUnmounted } from 'vue'

let ws = null
let reconnectTimer = null
let reconnectDelay = 3000
let listeners = new Set()

function getWsUrl() {
  const saved = localStorage.getItem('serverUrl')
  let base = saved || ''
  if (!base) {
    const origin = location.origin
    if (origin.includes('localhost:') || origin.includes('127.0.0.1:')) {
      base = 'http://localhost:3000'
    } else {
      base = origin
    }
  }
  return base.replace(/^http/, 'ws') + '/ws'
}

function notify(msg) {
  listeners.forEach(fn => {
    try { fn(msg) } catch {}
  })
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return
  if (listeners.size === 0) return // 无监听者不连接

  const url = getWsUrl()
  try {
    ws = new WebSocket(url)
  } catch {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    reconnectDelay = 3000 // 连接成功，重置退避
    const token = localStorage.getItem('token')
    if (token) {
      ws.send(JSON.stringify({ type: 'auth', token }))
    }
  }

  ws.onmessage = (evt) => {
    try {
      notify(JSON.parse(evt.data))
    } catch {}
  }

  ws.onclose = () => {
    ws = null
    if (listeners.size > 0) scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose 会在 onerror 后自动触发，不需要在这里处理
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000) // 指数退避，上限 30s
    connect()
  }, reconnectDelay)
}

function ensureConnected() {
  if (!reconnectTimer && (!ws || ws.readyState === WebSocket.CLOSED)) {
    reconnectDelay = 3000
    connect()
  }
}

export function useWebSocket(onMessage) {
  if (onMessage) listeners.add(onMessage)

  ensureConnected()

  onUnmounted(() => {
    if (onMessage) listeners.delete(onMessage)
    // 所有组件卸载后停止重连
    if (listeners.size === 0) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
      if (ws) { try { ws.close() } catch {} ws = null }
    }
  })

  return {
    disconnect() {
      if (onMessage) listeners.delete(onMessage)
      if (listeners.size === 0) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
        if (ws) { try { ws.close() } catch {} ws = null }
      }
    }
  }
}
