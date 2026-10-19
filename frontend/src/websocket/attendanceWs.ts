import { getStoredToken } from '../services/httpClient'

export type WsEventType = 'attendance_detected' | 'review_required' | 'session_status' | 'error'

export interface WsMessage {
  type: WsEventType
  payload: Record<string, unknown>
  timestamp: string
}

export type WsListener = (message: WsMessage) => void

/** Connects only to the authenticated Backend WebSocket. */
export class AttendanceWebSocketClient {
  private socket: WebSocket | null = null
  private readonly listeners = new Set<WsListener>()
  private readonly sessionId: number

  constructor(sessionId: number) {
    this.sessionId = sessionId
  }

  connect(wsBaseUrl?: string) {
    const token = getStoredToken()
    if (!token) return this.emit('error', { message: 'Authentication is required.' })

    const apiUrl = import.meta.env.VITE_API_URL || window.location.origin
    const base = wsBaseUrl || apiUrl.replace(/^http/, 'ws').replace(/\/$/, '')
    this.socket = new WebSocket(`${base}/api/v1/ws/sessions/${this.sessionId}?token=${encodeURIComponent(token)}`)
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit(data.event as WsEventType, data.payload || {})
      } catch {
        this.emit('error', { message: 'Invalid realtime payload.' })
      }
    }
    this.socket.onerror = () => this.emit('error', { message: 'Realtime connection failed.' })
  }

  subscribe(listener: WsListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  disconnect() {
    this.socket?.close()
    this.socket = null
  }

  private emit(type: WsEventType, payload: Record<string, unknown>) {
    const message = { type, payload, timestamp: new Date().toISOString() }
    this.listeners.forEach((listener) => listener(message))
  }
}
