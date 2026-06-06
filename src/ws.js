/**
 * WebSocket 实时推送客户端
 * 用于接收订单状态变更通知
 */
import { ref, onUnmounted } from 'vue'

const connections = new Map()

export function useWebSocket(onMessage) {
  const connected = ref(false)
  const lastEvent = ref(null)
  let ws = null
  let reconnectTimer = null
  let closed = false

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

  function connect() {
    if (closed) return
    const url = getWsUrl()
    try {
      ws = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      connected.value = true
      // Authenticate immediately
      const token = localStorage.getItem('token')
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }))
      }
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        lastEvent.value = msg
        if (onMessage) onMessage(msg)
      } catch {}
    }

    ws.onclose = () => {
      connected.value = false
      if (!closed) scheduleReconnect()
    }

    ws.onerror = () => {
      connected.value = false
      try { ws.close() } catch {}
    }
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 5000)
  }

  function disconnect() {
    closed = true
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    if (ws) {
      try { ws.close() } catch {}
      ws = null
    }
    connected.value = false
  }

  connect()

  onUnmounted(() => disconnect())

  return { connected, lastEvent, disconnect, reconnect: () => { closed = false; connect() } }
}
