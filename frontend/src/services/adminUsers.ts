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
  student_profile?: { student_code: string; major?: string }
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
    hasFaceRegistered: false,
    avatar: avatar || 'ND',
  }
}

const toBackendRole = (role: Role): BackendRole => role === 'teacher' ? 'LECTURER' : role === 'admin' ? 'ADMIN' : 'STUDENT'

export const adminUserService = {
  async getUsers(): Promise<User[]> {
    const users = await httpClient.get<BackendUser[]>('/api/v1/users/?limit=100')
    return users.map(toFrontendUser)
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
}
