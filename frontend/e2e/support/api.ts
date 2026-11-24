import { request, type APIRequestContext, type APIResponse } from '@playwright/test'
import { BASE_URL } from './env'

export interface Reply<T = any> {
  status: number
  body: T
  headers: Record<string, string>
}

/** Thin JSON client over Playwright's request context, signed in as one user. */
export class Api {
  private constructor(private ctx: APIRequestContext, public token: string, public username: string) {}

  static async login(username: string, password: string): Promise<Api> {
    const ctx = await request.newContext({ baseURL: BASE_URL })
    const res = await ctx.post('/api/v1/auth/login', { form: { username, password } })
    if (!res.ok()) throw new Error(`login ${username} -> ${res.status()} ${await res.text()}`)
    return new Api(ctx, (await res.json()).access_token, username)
  }

  /** Raw login attempt, for negative auth tests. */
  static async tryLogin(username: string, password: string): Promise<Reply> {
    const ctx = await request.newContext({ baseURL: BASE_URL })
    try {
      return await toReply(await ctx.post('/api/v1/auth/login', { form: { username, password } }))
    } finally {
      await ctx.dispose()
    }
  }

  /** Unauthenticated client. */
  static async anonymous(): Promise<Api> {
    return new Api(await request.newContext({ baseURL: BASE_URL }), '', 'anonymous')
  }

  private headers() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  async get<T = any>(path: string) { return toReply<T>(await this.ctx.get(path, { headers: this.headers() })) }
  async post<T = any>(path: string, data?: unknown) { return toReply<T>(await this.ctx.post(path, { headers: this.headers(), data })) }
  async patch<T = any>(path: string, data?: unknown) { return toReply<T>(await this.ctx.patch(path, { headers: this.headers(), data })) }
  async delete<T = any>(path: string) { return toReply<T>(await this.ctx.delete(path, { headers: this.headers() })) }
  /** POST that refreshes using the HttpOnly cookie kept by this context. */
  async refresh(): Promise<Reply> {
    const state = await this.ctx.storageState()
    const csrf = state.cookies.find((cookie) => cookie.name.toLowerCase().includes('csrf'))?.value
    return toReply(await this.ctx.post('/api/v1/auth/refresh', { headers: csrf ? { 'X-CSRF-Token': csrf } : {} }))
  }

  async logout(): Promise<Reply> {
    const state = await this.ctx.storageState()
    const csrf = state.cookies.find((cookie) => cookie.name.toLowerCase().includes('csrf'))?.value
    return toReply(await this.ctx.post('/api/v1/auth/logout', { headers: { ...this.headers(), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } }))
  }

  async dispose() { await this.ctx.dispose() }
}

async function toReply<T>(res: APIResponse): Promise<Reply<T>> {
  const text = await res.text()
  let body: any = text
  try { body = text ? JSON.parse(text) : null } catch { /* CSV and other text bodies */ }
  return { status: res.status(), body, headers: res.headers() }
}

/** Campus local time (UTC+7) → ISO UTC, as the UI sends it. */
export function campusIso(day: Date, hh: number, mm: number): string {
  const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hh - 7, mm))
  return d.toISOString()
}

export function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}
