import { httpClient } from '../services/httpClient'

interface WsTicketResponse {
  ticket: string
  expires_in_seconds: number
}

/**
 * Builds a WebSocket URL authenticated by a single-use, 30-second ticket.
 * The JWT itself never goes into the URL (URLs end up in proxy logs and history).
 * A fresh ticket is needed for every (re)connect.
 */
export async function buildTicketedWsUrl(path: string, wsBaseUrl?: string): Promise<string> {
  const { ticket } = await httpClient.post<WsTicketResponse>('/api/v1/auth/ws-ticket')
  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin
  const base = wsBaseUrl || apiUrl.replace(/^http/, 'ws').replace(/\/$/, '')
  return `${base}${path}?ticket=${encodeURIComponent(ticket)}`
}

/** 1s, 2s, 4s, 8s, then 15s max, with jitter so clients do not reconnect in lockstep. */
export function reconnectDelayMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 15000)
  return base / 2 + Math.random() * (base / 2)
}
