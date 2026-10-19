import { getStoredToken, removeStoredToken } from '../services/httpClient'

export interface UserWsMessage {
  event: string
  payload?: any
  timestamp?: string
}

export class UserWebSocketClient {
  private ws: WebSocket | null = null
  private shouldReconnect: boolean = true
  private reconnectTimer: any = null
  private pingInterval: any = null

  public connect(wsUrl?: string): void {
    this.shouldReconnect = true
    const token = getStoredToken()
    if (!token || typeof window === 'undefined' || !('WebSocket' in window)) {
      return
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const targetUrl =
        wsUrl ||
        `${protocol}://${window.location.host}/api/v1/ws/users/me?token=${encodeURIComponent(token)}`

      this.ws = new WebSocket(targetUrl)

      this.ws.onopen = () => {
        // Start ping heartbeat every 25 seconds
        if (this.pingInterval) clearInterval(this.pingInterval)
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ event: 'ping' }))
          }
        }, 25000)
      }

      this.ws.onmessage = (e) => {
        try {
          const data: UserWsMessage = JSON.parse(e.data)
          if (data.event === 'FORCE_LOGOUT') {
            const reason =
              data.payload?.reason ||
              'Tài khoản của bạn đã bị khóa hoặc đăng xuất bởi Quản trị viên.'
            removeStoredToken()
            window.dispatchEvent(
              new CustomEvent('auth:force-logout', { detail: { message: reason } })
            )
            this.disconnect()
          } else if (data.event === 'ROLE_CHANGED' && data.payload?.role) {
            window.dispatchEvent(
              new CustomEvent('auth:role-changed', {
                detail: { role: data.payload.role },
              })
            )
          } else if (data.event === 'CLASS_ROSTER_CHANGED') {
            window.dispatchEvent(
              new CustomEvent('class-roster:changed', { detail: data.payload })
            )
            window.dispatchEvent(
              new CustomEvent('data:changed', { detail: { source: 'websocket', event: data.event, payload: data.payload } })
            )
          }
        } catch {
          // Ignore unparseable message
        }
      }

      this.ws.onclose = () => {
        if (this.pingInterval) clearInterval(this.pingInterval)
        if (this.shouldReconnect) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = setTimeout(() => {
            this.connect(wsUrl)
          }, 5000)
        }
      }

      this.ws.onerror = () => {
        // Handled via onclose
      }
    } catch (err) {
      console.warn('User websocket connection error:', err)
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // Ignore
      }
      this.ws = null
    }
  }
}

export const userWsClient = new UserWebSocketClient()

