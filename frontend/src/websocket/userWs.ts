import { getStoredToken, removeStoredToken } from '../services/httpClient'
import { buildTicketedWsUrl, reconnectDelayMs } from './wsTicket'

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
  private attempt = 0

  public connect(wsBaseUrl?: string): void {
    this.shouldReconnect = true
    this.attempt = 0
    void this.open(wsBaseUrl)
  }

  private scheduleReconnect(wsBaseUrl?: string): void {
    if (!this.shouldReconnect) return
    clearTimeout(this.reconnectTimer)
    const delay = reconnectDelayMs(this.attempt)
    this.attempt = Math.min(this.attempt + 1, 10)
    this.reconnectTimer = setTimeout(() => void this.open(wsBaseUrl), delay)
  }

  private async open(wsBaseUrl?: string): Promise<void> {
    const token = getStoredToken()
    if (!token || typeof window === 'undefined' || !('WebSocket' in window)) {
      return
    }

    try {
      let targetUrl: string
      try {
        // Single-use ticket: the JWT never appears in the WebSocket URL.
        targetUrl = await buildTicketedWsUrl('/api/v1/ws/users/me', wsBaseUrl)
      } catch {
        return this.scheduleReconnect(wsBaseUrl)
      }
      if (!this.shouldReconnect) return

      this.ws = new WebSocket(targetUrl)

      this.ws.onopen = () => {
        this.attempt = 0
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
          } else if (data.event === 'NOTIFICATION') {
            window.dispatchEvent(new CustomEvent('notification:new', { detail: data.payload }))
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
        this.scheduleReconnect(wsBaseUrl)
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

