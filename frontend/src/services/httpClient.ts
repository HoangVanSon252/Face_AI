/**
 * HTTP Client for connecting frontend to FastAPI backend.
 * Handles JWT Access Tokens, Double Submit CSRF cookies, credentials and error parsing.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const TOKEN_STORAGE_KEY = 'attendly_access_token'

export class ApiError extends Error {
  status: number
  code?: string
  detail?: string

  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch (e) {
    console.error('Failed to store access token:', e)
  }
}

export function removeStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch (e) {
    console.error('Failed to remove access token:', e)
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const csrfToken = getCookie('csrf_token')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
      })

      if (!res.ok) {
        removeStoredToken()
        return null
      }

      const data = await res.json()
      if (data.access_token) {
        setStoredToken(data.access_token)
        return data.access_token
      }
      return null
    } catch {
      removeStoredToken()
      return null
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  isFormUrlEncoded?: boolean
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (!options.isFormUrlEncoded && !headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (!options.skipAuth) {
    const token = getStoredToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  const csrfToken = getCookie('csrf_token')
  if (csrfToken && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = csrfToken
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Ensure HttpOnly cookies (refresh_token) are sent
  }

  let response: Response
  try {
    response = await fetch(url, fetchOptions)
  } catch (err) {
    throw new ApiError(
      'Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra server backend đang chạy (http://127.0.0.1:8000).',
      0,
      'NETWORK_ERROR'
    )
  }

  // Handle 401 & Token Rotation / Refresh
  if (response.status === 401 && !options.skipAuth && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retryResponse = await fetch(url, { ...fetchOptions, headers })
      if (retryResponse.ok) {
        if (retryResponse.status === 204) return {} as T
        return (await retryResponse.json()) as T
      }
    }
  }

  if (response.status === 204) {
    return {} as T
  }

  let responseData: any = null
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    try {
      responseData = await response.json()
    } catch {
      responseData = null
    }
  } else {
    try {
      const text = await response.text()
      responseData = text ? { message: text } : null
    } catch {
      responseData = null
    }
  }

  if (!response.ok) {
    let errorMsg = 'Đã có lỗi xảy ra khi gọi API.'
    let errorCode: string | undefined

    if (responseData) {
      if (typeof responseData.detail === 'string') {
        errorMsg = responseData.detail
      } else if (Array.isArray(responseData.detail)) {
        errorMsg = responseData.detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join(', ')
      } else if (responseData.message) {
        errorMsg = responseData.message
      }
      errorCode = responseData.code
    }

    throw new ApiError(errorMsg, response.status, errorCode, JSON.stringify(responseData))
  }

  return responseData as T
}

export const httpClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: options?.isFormUrlEncoded ? body : body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
}
