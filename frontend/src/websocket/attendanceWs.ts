import { getStoredToken } from '../services/httpClient'
import { buildTicketedWsUrl, reconnectDelayMs } from './wsTicket'

export type WsEventType = 'attendance_detected' | 'review_required' | 'session_status' | 'connection' | 'error'

export type WsConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface WsMessage {
  type: WsEventType
  payload: Record<string, unknown>
  timestamp: string
}

export type WsListener = (message: WsMessage) => void

const PING_INTERVAL_MS = 25000
// Policy violation: bad/expired ticket or no access to the session.
const WS_POLICY_VIOLATION = 1008
// After this many failed attempts in a row, stop and let the user retry manually.
const MAX_RECONNECT_ATTEMPTS = 8

/**
 * Connects to the authenticated Backend WebSocket of one attendance session and
 * keeps it alive: pings every 25s and reconnects with exponential backoff when
 * lecture-hall Wi-Fi drops. Emits `connection` events ({ state, attempt }).
 * After a reconnect, `connection` carries `resumed: true` so the view can reload
 * events missed while offline.
 */
export class AttendanceWebSocketClient {
  private socket: WebSocket | null = null
  private readonly listeners = new Set<WsListener>()
  private readonly sessionId: number
  private wsBaseUrl?: string
  private shouldReconnect = false
  private attempt = 0
  private hasConnectedBefore = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  constructor(sessionId: number) {
    this.sessionId = sessionId
  }

  connect(wsBaseUrl?: string) {
    this.wsBaseUrl = wsBaseUrl
    this.shouldReconnect = true
    this.attempt = 0
    void this.open()
  }

  /** Manual retry after the client gave up (state `offline`). */
  reconnectNow() {
    this.clearTimers()
    this.shouldReconnect = true
    this.attempt = 0
    void this.open()
  }

  subscribe(listener: WsListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  disconnect() {
    this.shouldReconnect = false
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    socket?.close()
  }

  private async open() {
    if (!getStoredToken()) {
      this.shouldReconnect = false
      this.emitConnection('offline')
      return this.emit('error', { message: 'Authentication is required.' })
    }
    this.emitConnection(this.attempt === 0 && !this.hasConnectedBefore ? 'connecting' : 'reconnecting')

    let url: string
    try {
      url = await buildTicketedWsUrl(`/api/v1/ws/sessions/${this.sessionId}`, this.wsBaseUrl)
    } catch {
      // Ticket request failed (network down or session expired): retry later.
      return this.scheduleReconnect()
    }
    if (!this.shouldReconnect) return

    const socket = new WebSocket(url)
    this.socket = socket
    socket.onopen = () => {
      const resumed = this.hasConnectedBefore
      this.hasConnectedBefore = true
      this.attempt = 0
      this.emitConnection('connected', { resumed })
      this.startPing()
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'pong') return
        this.emit(data.event as WsEventType, data.payload || {})
      } catch {
        this.emit('error', { message: 'Invalid realtime payload.' })
      }
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.stopPing()
      if (event.code === WS_POLICY_VIOLATION && !this.hasConnectedBefore) {
        // Access denied on the first try: retrying would not help.
        this.shouldReconnect = false
        this.emitConnection('offline')
        return this.emit('error', { message: 'Realtime access was denied for this session.' })
      }
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return
    if (this.attempt >= MAX_RECONNECT_ATTEMPTS) {
      this.shouldReconnect = false
      return this.emitConnection('offline')
    }
    const delay = reconnectDelayMs(this.attempt)
    this.attempt += 1
    this.emitConnection('reconnecting')
    this.reconnectTimer = setTimeout(() => void this.open(), delay)
  }

  private startPing() {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ event: 'ping' }))
      }
    }, PING_INTERVAL_MS)
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  private clearTimers() {
    this.stopPing()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private emitConnection(state: WsConnectionState, extra: Record<string, unknown> = {}) {
    this.emit('connection', { state, attempt: this.attempt, ...extra })
  }

  private emit(type: WsEventType, payload: Record<string, unknown>) {
    const message = { type, payload, timestamp: new Date().toISOString() }
    this.listeners.forEach((listener) => listener(message))
  }
}
