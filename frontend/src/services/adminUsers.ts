import type { Role, User } from '../types'
import { httpClient } from './httpClient'

type BackendRole = 'STUDENT' | 'LECTURER' | 'ADMIN'

interface BackendUser {
  id: number
  username: string
  email: string
  full_name: string
  role: BackendRole
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED'
  has_face_registered?: boolean
  student_profile?: { student_code: string; major?: string; administrative_class?: string }
  lecturer_profile?: { lecturer_code: string; department?: string }
}

const toFrontendUser = (user: BackendUser): User => {
  const role: Role = user.role === 'LECTURER' ? 'teacher' : user.role === 'ADMIN' ? 'admin' : 'student'
  const userId = user.student_profile?.student_code || user.lecturer_profile?.lecturer_code || `AD${String(user.id).padStart(4, '0')}`
  const avatar = user.full_name.split(' ').filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
  return {
    id: user.id,
    userId,
    username: user.username,
    fullName: user.full_name,
    email: user.email,
    role,
    isActive: user.status === 'ACTIVE',
    department: user.student_profile?.major || user.lecturer_profile?.department,
    administrativeClass: user.student_profile?.administrative_class,
    hasFaceRegistered: Boolean(user.has_face_registered),
    avatar: avatar || 'ND',
  }
}

const toBackendRole = (role: Role): BackendRole => role === 'teacher' ? 'LECTURER' : role === 'admin' ? 'ADMIN' : 'STUDENT'

const PAGE_LIMIT = 500
// Many views call getUsers() at once as a lookup table; share one fetch for a
// few seconds and drop it after any mutation.
const CACHE_TTL_MS = 5000
let allUsersCache: { at: number; promise: Promise<User[]> } | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('data:changed', () => { allUsersCache = null })
}

export interface UserPageQuery {
  page: number
  pageSize: number
  query?: string
  role?: Role
}

export interface UserPage {
  items: User[]
  total: number
}

async function fetchUsers(params: URLSearchParams): Promise<{ users: BackendUser[]; total: number | null }> {
  let total: number | null = null
  const users = await httpClient.get<BackendUser[]>(`/api/v1/users/?${params}`, {
    onHeaders: (headers) => {
      const value = headers.get('X-Total-Count')
      total = value === null ? null : Number(value)
    },
  })
  return { users, total }
}

async function fetchAllUsers(): Promise<User[]> {
  const all: BackendUser[] = []
  for (let skip = 0; ; skip += PAGE_LIMIT) {
    const { users, total } = await fetchUsers(new URLSearchParams({ skip: String(skip), limit: String(PAGE_LIMIT) }))
    all.push(...users)
    if (users.length < PAGE_LIMIT || (total !== null && all.length >= total)) break
  }
  return all.map(toFrontendUser)
}

export const adminUserService = {
  /** Every user the caller may see (all pages), for lookups such as id -> name. */
  async getUsers(): Promise<User[]> {
    if (!allUsersCache || Date.now() - allUsersCache.at > CACHE_TTL_MS) {
      const promise = fetchAllUsers()
      allUsersCache = { at: Date.now(), promise }
      promise.catch(() => { if (allUsersCache?.promise === promise) allUsersCache = null })
    }
    // Copy: callers may sort/filter in place without corrupting the shared cache.
    return allUsersCache.promise.then((users) => [...users])
  },

  /** One server-side page for list screens. */
  async getUsersPage({ page, pageSize, query, role }: UserPageQuery): Promise<UserPage> {
    const params = new URLSearchParams({ skip: String((page - 1) * pageSize), limit: String(pageSize) })
    if (query?.trim()) params.set('query', query.trim())
    if (role) params.set('role', toBackendRole(role))
    const { users, total } = await fetchUsers(params)
    return { items: users.map(toFrontendUser), total: total ?? users.length }
  },

  async updateUser(user: User, changes: Partial<User>): Promise<User> {
    const payload: Record<string, string> = {}
    if (changes.fullName !== undefined) payload.full_name = changes.fullName
    if (changes.email !== undefined) payload.email = changes.email
    if (changes.department !== undefined) payload.department = changes.department
    if (changes.role !== undefined) payload.role = toBackendRole(changes.role)
    const updated = await httpClient.patch<BackendUser>(`/api/v1/users/${user.id}`, payload)
    return toFrontendUser(updated)
  },

  async setUserActive(user: User, isActive: boolean): Promise<User> {
    const updated = await httpClient.patch<BackendUser>(`/api/v1/users/${user.id}`, {
      status: isActive ? 'ACTIVE' : 'LOCKED',
    })
    return toFrontendUser(updated)
  },

  async createUser(data: Omit<User, 'id' | 'avatar' | 'hasFaceRegistered'>, password: string): Promise<User> {
    const role = toBackendRole(data.role)
    const payload: Record<string, unknown> = {
      username: data.username,
      email: data.email,
      password,
      full_name: data.fullName,
      role,
    }
    if (role === 'STUDENT') {
      payload.student = { student_code: data.userId, major: data.department || null }
    }
    if (role === 'LECTURER') {
      payload.lecturer = { lecturer_code: data.userId, department: data.department || null }
    }
    const created = await httpClient.post<BackendUser>('/api/v1/users/', payload)
    return toFrontendUser(created)
  },

  async resetPassword(user: User, newPassword: string): Promise<void> {
    await httpClient.post(`/api/v1/users/${user.id}/reset-password`, { new_password: newPassword })
  },

  async deleteUser(user: User): Promise<void> {
    await httpClient.delete(`/api/v1/users/${user.id}`)
  },
}
