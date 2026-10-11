import type { AttendanceLog } from '../types'
import { getStoredToken } from '../services/httpClient'

export type WsEventType =
  | 'attendance_detected'
  | 'review_required'
  | 'session_status'
  | 'duplicate_prevented'
  | 'error'

export interface WsMessage {
  type: WsEventType
  payload: any
  timestamp: string
}

export type WsListener = (msg: WsMessage) => void

export class AttendanceWebSocketClient {
  private sessionId: string
  private listeners: Set<WsListener> = new Set()
  private isConnected: boolean = false

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  public connect(useRealWs: boolean = true, wsUrl?: string) {
    this.isConnected = true
    const token = getStoredToken()
    if (!token) {
      this.isConnected = false
      this.broadcast({
        type: 'error',
        payload: { message: 'Authentication is required for realtime updates.' },
        timestamp: new Date().toISOString(),
      })
      return
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const targetUrl = wsUrl || `${protocol}://${window.location.host}/api/v1/ws/sessions/${this.sessionId}?token=${encodeURIComponent(token || '')}`

    if (useRealWs && token && typeof window !== 'undefined' && 'WebSocket' in window) {
      try {
        const ws = new WebSocket(targetUrl)
        ws.onopen = () => {
          this.broadcast({
            type: 'session_status',
            payload: { status: 'connected', sessionId: this.sessionId },
            timestamp: new Date().toLocaleTimeString(),
          })
        }
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.broadcast({
              type: data.event || data.type,
              payload: data.payload,
              timestamp: data.timestamp || new Date().toISOString(),
            })
          } catch (err) {
            console.error('WS parse error:', err)
          }
        }
        ws.onerror = () => {
          this.broadcast({
            type: 'error',
            payload: { message: 'Realtime connection failed.' },
            timestamp: new Date().toISOString(),
          })
        }
        ws.onclose = () => {
          this.isConnected = false
        }
        return
      } catch (e) {
        console.warn('Real WS unavailable, falling back to simulated WS pipeline:', e)
      }
    }

    this.broadcast({
      type: 'error',
      payload: { message: 'Realtime updates are unavailable.' },
      timestamp: new Date().toISOString(),
    })
  }

  public subscribe(listener: WsListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public sendFrameSample(_imageDataBase64: string) {
    // Send frame to server or trigger simulated match
    if (!this.isConnected) return
  }

  public simulateManualDetection(studentName: string, studentId: string, confidence: number) {
    const isHigh = confidence >= 85
    const now = new Date().toTimeString().slice(0, 8)
    const log: AttendanceLog = {
      id: Date.now(),
      sessionId: this.sessionId,
      classId: 'IT308',
      studentId,
      studentName,
      checkInTime: now,
      confidenceScore: confidence,
      status: 'present',
      reviewStatus: isHigh ? 'approved' : 'pending',
      method: 'Khuôn mặt',
      createdAt: new Date().toISOString(),
    }

    this.broadcast({
      type: isHigh ? 'attendance_detected' : 'review_required',
      payload: log,
      timestamp: now,
    })
  }

  private broadcast(msg: WsMessage) {
    this.listeners.forEach((fn) => fn(msg))
  }

  public disconnect() {
    this.isConnected = false
  }
}
