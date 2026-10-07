import type {
  User,
  ClassItem,
  AttendanceSession,
  AttendanceLog,
  ComplaintRequest,
  AuditLog,
  Role,
  RegisterFormData,
} from '../types'
import {
  httpClient,
  setStoredToken,
  removeStoredToken,
  getStoredToken,
} from './httpClient'
import {
  INITIAL_USERS,
  INITIAL_CLASSES,
  INITIAL_SESSIONS,
  INITIAL_ATTENDANCE_LOGS,
  INITIAL_COMPLAINTS,
  INITIAL_AUDIT_LOGS,
} from './mockData'

// Helpers to sync with localStorage for client-side state / offline cache
const getStored = <T>(key: string, defaultVal: T): T => {
  try {
    const item = localStorage.getItem(`attendly_${key}`)
    return item ? JSON.parse(item) : defaultVal
  } catch {
    return defaultVal
  }
}

const setStored = <T>(key: string, val: T): void => {
  try {
    localStorage.setItem(`attendly_${key}`, JSON.stringify(val))
  } catch (e) {
    console.error('Storage error:', e)
  }
}

// In-memory + storage cache
let usersCache = getStored<User[]>('users', INITIAL_USERS)
let classesCache = getStored<ClassItem[]>('classes', INITIAL_CLASSES)
let sessionsCache = getStored<AttendanceSession[]>('sessions', INITIAL_SESSIONS)
let attendanceLogsCache = getStored<AttendanceLog[]>('attendanceLogs', INITIAL_ATTENDANCE_LOGS)
let complaintsCache = getStored<ComplaintRequest[]>('complaints', INITIAL_COMPLAINTS)
let auditLogsCache = getStored<AuditLog[]>('auditLogs', INITIAL_AUDIT_LOGS)

// Backend DTO Types
interface BackendUserResponse {
  id: number
  email: string
  full_name: string
  role: 'admin' | 'lecturer' | 'student'
  status: 'active' | 'inactive' | 'locked'
  student_profile?: {
    user_id: number
    student_code: string
    date_of_birth?: string
    cohort?: string
    major?: string
    administrative_class?: string
  }
  lecturer_profile?: {
    user_id: number
    lecturer_code: string
    department?: string
    academic_title?: string
  }
}

interface BackendStudentItem {
  user_id: number
  student_code: string
  date_of_birth?: string
  cohort?: string
  major?: string
  administrative_class?: string
  user?: {
    id: number
    username: string
    email: string
    full_name: string
    role: string
    status: string
  }
}

interface BackendLecturerItem {
  user_id: number
  lecturer_code: string
  department?: string
  academic_title?: string
  user?: {
    id: number
    username: string
    email: string
    full_name: string
    role: string
    status: string
  }
}

interface BackendCourseItem {
  id: number
  course_code: string
  course_name: string
  credits: number
  is_active: boolean
}

interface BackendSectionItem {
  id: number
  section_code: string
  course_id: number
  semester_id: number
  lecturer_id: number
  room?: string
  status: string
}

interface BackendEnrollmentItem {
  id: number
  section_id: number
  student_id: number
  status: string
  enrolled_at: string
}

// Transform backend user response to frontend User model
function mapBackendUserToFrontend(u: BackendUserResponse): User {
  const role: Role = u.role === 'lecturer' ? 'teacher' : (u.role as Role)
  const userId =
    u.student_profile?.student_code ||
    u.lecturer_profile?.lecturer_code ||
    (u.role === 'admin' ? `AD${u.id.toString().padStart(4, '0')}` : `USR${u.id.toString().padStart(4, '0')}`)
  const department = u.student_profile?.major || u.lecturer_profile?.department || 'Khoa Công nghệ thông tin'

  const initials = u.full_name
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return {
    id: u.id,
    userId,
    username: u.email.split('@')[0],
    fullName: u.full_name,
    email: u.email,
    role,
    isActive: u.status === 'active',
    department,
    hasFaceRegistered: false,
    avatar: initials || 'ND',
  }
}

// Transform backend student item to frontend User
function mapBackendStudentToFrontend(s: BackendStudentItem): User {
  const u = s.user
  const fullName = u?.full_name || 'Sinh viên'
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return {
    id: s.user_id,
    userId: s.student_code,
    username: u?.username || s.student_code.toLowerCase(),
    fullName,
    email: u?.email || `${s.student_code.toLowerCase()}@ptit.edu.vn`,
    role: 'student',
    isActive: u ? u.status === 'active' : true,
    department: s.major || 'Công nghệ thông tin',
    hasFaceRegistered: false,
    avatar: initials || 'SV',
  }
}

// Transform backend lecturer item to frontend User
function mapBackendLecturerToFrontend(l: BackendLecturerItem): User {
  const u = l.user
  const fullName = u?.full_name || 'Giảng viên'
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return {
    id: l.user_id,
    userId: l.lecturer_code,
    username: u?.username || l.lecturer_code.toLowerCase(),
    fullName,
    email: u?.email || `${l.lecturer_code.toLowerCase()}@ptit.edu.vn`,
    role: 'teacher',
    isActive: u ? u.status === 'active' : true,
    department: l.department || 'Khoa Công nghệ thông tin',
    hasFaceRegistered: false,
    avatar: initials || 'GV',
  }
}

// Audit Log helper
export const recordAuditLog = (
  action: string,
  actor: string,
  detail: string,
  tone: 'teal' | 'amber' | 'coral' | 'blue' = 'teal'
) => {
  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const newLog: AuditLog = {
    id: Date.now(),
    time: timeStr,
    action,
    actor,
    detail,
    tone,
    timestamp: now.toISOString(),
  }
  auditLogsCache = [newLog, ...auditLogsCache]
  setStored('auditLogs', auditLogsCache)
  return newLog
}

// Health check service
export const healthService = {
  checkHealth: async (): Promise<boolean> => {
    try {
      const res = await httpClient.get<{ status: string }>('/health', { skipAuth: true })
      return res && res.status === 'ok'
    } catch {
      return false
    }
  },
}

// 1. Auth Service (Connects to /api/v1/auth)
export const authService = {
  getCurrentUser: (role: Role): User => {
    const found = usersCache.find((u) => u.role === role)
    return (
      found || {
        id: 99,
        userId: 'USER001',
        username: 'default.user',
        fullName: 'Người dùng',
        email: 'user@ptit.edu.vn',
        role,
        isActive: true,
        avatar: 'ND',
      }
    )
  },

  getMe: async (): Promise<User | null> => {
    const token = getStoredToken()
    if (!token) return null
    try {
      const backendUser = await httpClient.get<BackendUserResponse>('/api/v1/auth/me')
      if (backendUser && backendUser.id) {
        const user = mapBackendUserToFrontend(backendUser)
        // Update user in cache
        usersCache = [user, ...usersCache.filter((u) => u.id !== user.id)]
        setStored('users', usersCache)
        return user
      }
      return null
    } catch {
      return null
    }
  },

  login: async (usernameOrEmail: string, pass: string, selectedRole?: Role): Promise<User> => {
    // If clicking fast demo login button for a role
    if (selectedRole && !usernameOrEmail.trim()) {
      await new Promise((r) => setTimeout(r, 200))
      const user = usersCache.find((u) => u.role === selectedRole) || authService.getCurrentUser(selectedRole)
      recordAuditLog('Đăng nhập nhanh (Demo)', `${user.fullName} · ${user.role}`, 'Đăng nhập demo thành công', 'teal')
      return user
    }

    // 1. Try real backend API authentication
    try {
      const formData = new URLSearchParams()
      formData.append('username', usernameOrEmail.trim())
      formData.append('password', pass)

      const tokenRes = await httpClient.post<{ access_token: string; token_type: string }>(
        '/api/v1/auth/login',
        formData.toString(),
        {
          skipAuth: true,
          isFormUrlEncoded: true,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      if (tokenRes && tokenRes.access_token) {
        setStoredToken(tokenRes.access_token)

        // Fetch full profile of authenticated user
        const profile = await httpClient.get<BackendUserResponse>('/api/v1/auth/me')
        const user = mapBackendUserToFrontend(profile)

        // Sync with cache & localStorage
        usersCache = [user, ...usersCache.filter((u) => u.id !== user.id && u.userId !== user.userId)]
        setStored('users', usersCache)

        recordAuditLog(
          'Đăng nhập hệ thống (API)',
          `${user.fullName} · ${user.role}`,
          'Đăng nhập Backend thành công qua JWT',
          'teal'
        )
        return user
      }
    } catch (apiError: any) {
      if (apiError.status === 401 || apiError.status === 400 || apiError.status === 403) {
        throw new Error(apiError.message || 'Sai tên đăng nhập hoặc mật khẩu!')
      }
      console.warn('Backend login error or offline, checking local accounts:', apiError.message)
    }

    // Fallback for fast demo login if backend is offline
    await new Promise((r) => setTimeout(r, 300))
    const normalised = usernameOrEmail.toLowerCase().trim()
    let user = usersCache.find(
      (u) =>
        u.username.toLowerCase() === normalised ||
        u.email.toLowerCase() === normalised ||
        u.userId.toLowerCase() === normalised
    )
    if (!user && selectedRole) {
      user = usersCache.find((u) => u.role === selectedRole)
    }
    if (!user) {
      throw new Error('Sai tên đăng nhập hoặc mật khẩu!')
    }
    if (!user.isActive) {
      throw new Error('Tài khoản của bạn đã bị khóa bởi Quản trị viên!')
    }
    recordAuditLog('Đăng nhập hệ thống', `${user.fullName} · ${user.role}`, 'Đăng nhập thành công', 'teal')
    return user
  },

  register: async (data: RegisterFormData): Promise<User> => {
    // Try Backend API registration first
    try {
      const isStudent = data.role === 'student'
      if (isStudent) {
        const payload = {
          username: data.email.split('@')[0],
          email: data.email,
          password: data.password,
          full_name: data.fullName,
          student: {
            student_code: data.userId,
            major: data.department || 'Công nghệ thông tin',
            administrative_class: 'K18',
          },
        }
        const res = await httpClient.post<BackendStudentItem>('/api/v1/students/', payload, { skipAuth: true })
        if (res && res.student_code) {
          const newUser = mapBackendStudentToFrontend(res)
          usersCache = [newUser, ...usersCache.filter((u) => u.userId !== newUser.userId)]
          setStored('users', usersCache)
          recordAuditLog(
            'Đăng ký tài khoản mới (API)',
            `${newUser.fullName} (${newUser.userId})`,
            'Đã tạo tài khoản Sinh viên vào Database',
            'teal'
          )
          return newUser
        }
      } else {
        const payload = {
          username: data.email.split('@')[0],
          email: data.email,
          password: data.password,
          full_name: data.fullName,
          lecturer: {
            lecturer_code: data.userId,
            department: data.department || 'Khoa Công nghệ thông tin',
            academic_title: 'Thạc sĩ',
          },
        }
        const res = await httpClient.post<BackendLecturerItem>('/api/v1/lecturers/', payload, { skipAuth: true })
        if (res && res.lecturer_code) {
          const newUser = mapBackendLecturerToFrontend(res)
          usersCache = [newUser, ...usersCache.filter((u) => u.userId !== newUser.userId)]
          setStored('users', usersCache)
          recordAuditLog(
            'Đăng ký tài khoản mới (API)',
            `${newUser.fullName} (${newUser.userId})`,
            'Đã tạo tài khoản Giảng viên vào Database',
            'teal'
          )
          return newUser
        }
      }
    } catch (apiError: any) {
      if (apiError.status === 409 || apiError.status === 422 || apiError.status === 400) {
        throw new Error(apiError.message || 'Mã tài khoản hoặc email đã tồn tại!')
      }
      console.warn('Backend register error or offline, fallback to local storage:', apiError.message)
    }

    // Local fallback
    await new Promise((r) => setTimeout(r, 400))
    const duplicate = usersCache.find(
      (u) =>
        u.email.toLowerCase() === data.email.toLowerCase() ||
        u.userId.toLowerCase() === data.userId.toLowerCase()
    )
    if (duplicate) {
      if (duplicate.email.toLowerCase() === data.email.toLowerCase()) {
        throw new Error('Email này đã được sử dụng!')
      }
      throw new Error('MSSV/Mã GV đã tồn tại trong hệ thống!')
    }

    const prefix = data.role === 'student' ? 'SV' : 'GV'
    const newUser: User = {
      id: Date.now(),
      userId: data.userId || `${prefix}${Date.now().toString().slice(-6)}`,
      username: data.email.split('@')[0],
      fullName: data.fullName,
      email: data.email,
      role: data.role,
      isActive: true,
      department: data.department || 'CNTT',
      hasFaceRegistered: false,
    }

    usersCache = [newUser, ...usersCache]
    setStored('users', usersCache)
    recordAuditLog(
      'Đăng ký tài khoản mới',
      `${newUser.fullName} (${newUser.userId})`,
      `Tài khoản ${newUser.role === 'student' ? 'Sinh viên' : 'Giảng viên'} được tạo thành công`,
      'teal'
    )
    return newUser
  },

  logout: async (): Promise<void> => {
    try {
      await httpClient.post('/api/v1/auth/logout')
    } catch (e) {
      console.warn('Logout API error:', e)
    } finally {
      removeStoredToken()
    }
  },
}

// 2. User Management Service (Connects to /api/v1/students & /api/v1/lecturers)
export const userService = {
  getUsers: async (): Promise<User[]> => {
    try {
      const [studentsRes, lecturersRes] = await Promise.allSettled([
        httpClient.get<BackendStudentItem[]>('/api/v1/students?skip=0&limit=100'),
        httpClient.get<BackendLecturerItem[]>('/api/v1/lecturers?skip=0&limit=100'),
      ])

      const fetchedUsers: User[] = []

      if (studentsRes.status === 'fulfilled' && Array.isArray(studentsRes.value)) {
        for (const s of studentsRes.value) {
          fetchedUsers.push(mapBackendStudentToFrontend(s))
        }
      }

      if (lecturersRes.status === 'fulfilled' && Array.isArray(lecturersRes.value)) {
        for (const l of lecturersRes.value) {
          fetchedUsers.push(mapBackendLecturerToFrontend(l))
        }
      }

      // Add admin if not present
      const adminExists = fetchedUsers.some((u) => u.role === 'admin')
      if (!adminExists) {
        const localAdmin = usersCache.find((u) => u.role === 'admin')
        if (localAdmin) fetchedUsers.push(localAdmin)
      }

      if (fetchedUsers.length > 0) {
        usersCache = fetchedUsers
        setStored('users', usersCache)
        return fetchedUsers
      }
    } catch (err) {
      console.warn('Failed to load users from backend, fallback to cache:', err)
    }

    return [...usersCache]
  },

  toggleUserStatus: async (userId: string): Promise<boolean> => {
    const target = usersCache.find((u) => u.userId === userId)
    if (target && target.role === 'student') {
      try {
        await httpClient.patch(`/api/v1/students/${target.id}/lock`)
      } catch (e) {
        console.warn('API lock student error:', e)
      }
    }

    let newStatus = true
    usersCache = usersCache.map((u) => {
      if (u.userId === userId) {
        newStatus = !u.isActive
        return { ...u, isActive: newStatus }
      }
      return u
    })
    setStored('users', usersCache)
    recordAuditLog(
      newStatus ? 'Mở khóa tài khoản' : 'Khóa tài khoản',
      'Quản trị viên',
      `Tài khoản ${userId} chuyển sang ${newStatus ? 'Hoạt động' : 'Bị khóa'}`,
      newStatus ? 'teal' : 'amber'
    )
    return newStatus
  },

  updateUserRole: async (userId: string, newRole: Role): Promise<void> => {
    usersCache = usersCache.map((u) => (u.userId === userId ? { ...u, role: newRole } : u))
    setStored('users', usersCache)
    recordAuditLog('Cập nhật vai trò RBAC', 'Quản trị viên', `Gán quyền ${newRole} cho người dùng ${userId}`, 'blue')
  },

  createUser: async (data: Omit<User, 'id'>): Promise<User> => {
    try {
      if (data.role === 'student') {
        const payload = {
          username: data.username || data.userId.toLowerCase(),
          email: data.email,
          password: 'Password123!',
          full_name: data.fullName,
          student: {
            student_code: data.userId,
            major: data.department || 'Công nghệ thông tin',
            administrative_class: 'K18',
          },
        }
        const res = await httpClient.post<BackendStudentItem>('/api/v1/students/', payload)
        if (res && res.student_code) {
          const newUser = mapBackendStudentToFrontend(res)
          usersCache = [newUser, ...usersCache]
          setStored('users', usersCache)
          recordAuditLog('Thêm người dùng mới (API)', 'Quản trị viên', `Tạo tài khoản ${newUser.fullName} (${newUser.userId})`, 'teal')
          return newUser
        }
      } else if (data.role === 'teacher') {
        const payload = {
          username: data.username || data.userId.toLowerCase(),
          email: data.email,
          password: 'Password123!',
          full_name: data.fullName,
          lecturer: {
            lecturer_code: data.userId,
            department: data.department || 'Khoa Công nghệ thông tin',
            academic_title: 'Thạc sĩ',
          },
        }
        const res = await httpClient.post<BackendLecturerItem>('/api/v1/lecturers/', payload)
        if (res && res.lecturer_code) {
          const newUser = mapBackendLecturerToFrontend(res)
          usersCache = [newUser, ...usersCache]
          setStored('users', usersCache)
          recordAuditLog('Thêm người dùng mới (API)', 'Quản trị viên', `Tạo tài khoản ${newUser.fullName} (${newUser.userId})`, 'teal')
          return newUser
        }
      }
    } catch (e: any) {
      console.warn('API createUser error, using local storage fallback:', e.message)
    }

    const newUser: User = {
      ...data,
      id: Date.now(),
    }
    usersCache = [newUser, ...usersCache]
    setStored('users', usersCache)
    recordAuditLog('Thêm người dùng mới', 'Quản trị viên', `Tạo tài khoản ${newUser.fullName} (${newUser.userId})`, 'teal')
    return newUser
  },

  deleteUser: async (userId: string): Promise<void> => {
    const target = usersCache.find((u) => u.userId === userId)
    if (target) {
      try {
        if (target.role === 'student') {
          await httpClient.delete(`/api/v1/students/${target.id}`)
        } else if (target.role === 'teacher') {
          await httpClient.delete(`/api/v1/lecturers/${target.id}`)
        }
      } catch (e) {
        console.warn('API deleteUser error:', e)
      }
    }

    usersCache = usersCache.filter((u) => u.userId !== userId)
    setStored('users', usersCache)
    recordAuditLog('Xóa tài khoản', 'Quản trị viên', `Đã xóa tài khoản ${userId}`, 'coral')
  },

  updateUser: async (userId: string, data: Partial<User>): Promise<User> => {
    const target = usersCache.find((u) => u.userId === userId)
    if (target) {
      try {
        if (target.role === 'student') {
          await httpClient.patch(`/api/v1/students/${target.id}`, {
            student_code: target.userId,
            major: data.department || target.department,
          })
        } else if (target.role === 'teacher') {
          await httpClient.patch(`/api/v1/lecturers/${target.id}`, {
            lecturer_code: target.userId,
            department: data.department || target.department,
          })
        }
      } catch (e) {
        console.warn('API updateUser error:', e)
      }
    }

    let updatedUser: User | null = null
    usersCache = usersCache.map((u) => {
      if (u.userId === userId) {
        updatedUser = { ...u, ...data }
        return updatedUser
      }
      return u
    })
    setStored('users', usersCache)
    recordAuditLog('Cập nhật thông tin người dùng', 'Quản trị viên', `Cập nhật tài khoản ${userId}`, 'teal')
    if (!updatedUser) throw new Error('Không tìm thấy người dùng!')
    return updatedUser
  },
}

// 3. Class & Academic Service (Connects to /api/v1/academic)
export const classService = {
  getClasses: async (): Promise<ClassItem[]> => {
    try {
      const [coursesRes, semestersRes] = await Promise.allSettled([
        httpClient.get<BackendCourseItem[]>('/api/v1/academic/courses'),
        httpClient.get<{ id: number; code: string; name: string }[]>('/api/v1/academic/semesters'),
      ])

      if (coursesRes.status === 'fulfilled' && Array.isArray(coursesRes.value) && coursesRes.value.length > 0) {
        const courses = coursesRes.value
        const semesters = semestersRes.status === 'fulfilled' ? semestersRes.value : []

        // If semesters exist, query sections for the active semester
        let sections: BackendSectionItem[] = []
        if (semesters.length > 0) {
          try {
            const secRes = await httpClient.get<BackendSectionItem[]>(
              `/api/v1/academic/sections?semester_id=${semesters[0].id}`
            )
            if (Array.isArray(secRes)) sections = secRes
          } catch {
            // ignore section load error
          }
        }

        if (sections.length > 0) {
          const mappedClasses: ClassItem[] = []
          for (const sec of sections) {
            const c = courses.find((crs) => crs.id === sec.course_id)
            let enrolledStudentIds: string[] = []
            try {
              const enrollments = await httpClient.get<BackendEnrollmentItem[]>(
                `/api/v1/academic/sections/${sec.id}/enrollments`
              )
              if (Array.isArray(enrollments)) {
                enrolledStudentIds = enrollments.map((e) => `SV${e.student_id}`)
              }
            } catch {
              // ignore enrollment error
            }

            mappedClasses.push({
              id: sec.id,
              classId: sec.section_code || (c ? c.course_code : `SEC${sec.id}`),
              className: c ? c.course_name : `Học phần ${sec.section_code}`,
              teacherId: sec.lecturer_id || 2,
              teacherName: 'Nguyễn Thị Lan',
              room: sec.room || 'Phòng A-301',
              schedule: 'Thứ 2 · 08:00 - 10:00',
              department: 'Khoa Công nghệ thông tin',
              studentCount: enrolledStudentIds.length,
              maxStudents: 45,
              studentIds: enrolledStudentIds,
            })
          }

          if (mappedClasses.length > 0) {
            classesCache = mappedClasses
            setStored('classes', classesCache)
            return mappedClasses
          }
        }
      }
    } catch (err) {
      console.warn('API getClasses error, fallback to local storage:', err)
    }

    return [...classesCache]
  },

  createClass: async (data: Omit<ClassItem, 'id' | 'studentCount' | 'studentIds'>): Promise<ClassItem> => {
    try {
      // 1. Create Course in Backend
      const course = await httpClient.post<BackendCourseItem>('/api/v1/academic/courses', {
        course_code: data.classId,
        course_name: data.className,
        credits: 3,
      })

      // 2. Fetch or ensure Semester exists
      let semesters = await httpClient.get<{ id: number }[]>('/api/v1/academic/semesters')
      if (!Array.isArray(semesters) || semesters.length === 0) {
        const newSem = await httpClient.post<{ id: number }>('/api/v1/academic/semesters', {
          code: 'FA26',
          name: 'Fall 2026',
          start_date: '2026-09-01',
          end_date: '2026-12-31',
        })
        semesters = [newSem]
      }

      // 3. Create ClassSection
      if (course && course.id && semesters[0]) {
        await httpClient.post<BackendSectionItem>('/api/v1/academic/sections', {
          section_code: data.classId,
          course_id: course.id,
          semester_id: semesters[0].id,
          lecturer_id: data.teacherId || 1,
          room: data.room || 'Phòng A-301',
        })
      }
    } catch (e: any) {
      console.warn('API createClass error, persisting locally:', e.message)
    }

    const newClass: ClassItem = {
      ...data,
      id: Date.now(),
      studentCount: 0,
      studentIds: [],
    }
    classesCache = [newClass, ...classesCache]
    setStored('classes', classesCache)
    recordAuditLog('Tạo lớp học mới', 'Giảng viên', `Tạo lớp ${newClass.className} (${newClass.classId})`, 'teal')
    return newClass
  },

  addStudentToClass: async (classId: string, studentId: string): Promise<void> => {
    const target = classesCache.find((c) => c.classId === classId)
    if (target) {
      try {
        const studentNumId = parseInt(studentId.replace(/\D/g, '')) || 1
        await httpClient.post(`/api/v1/academic/sections/${target.id}/enrollments`, {
          student_id: studentNumId,
          section_id: target.id,
        })
      } catch (e) {
        console.warn('API enroll student error:', e)
      }
    }

    classesCache = classesCache.map((cls) => {
      if (cls.classId === classId && !cls.studentIds.includes(studentId)) {
        return {
          ...cls,
          studentIds: [...cls.studentIds, studentId],
          studentCount: cls.studentCount + 1,
        }
      }
      return cls
    })
    setStored('classes', classesCache)
  },

  removeStudentFromClass: async (classId: string, studentId: string): Promise<void> => {
    const target = classesCache.find((c) => c.classId === classId)
    if (target) {
      try {
        const studentNumId = parseInt(studentId.replace(/\D/g, '')) || 1
        await httpClient.delete(`/api/v1/academic/sections/${target.id}/enrollments/${studentNumId}`)
      } catch (e) {
        console.warn('API unenroll student error:', e)
      }
    }

    classesCache = classesCache.map((cls) => {
      if (cls.classId === classId) {
        return {
          ...cls,
          studentIds: cls.studentIds.filter((id) => id !== studentId),
          studentCount: Math.max(0, cls.studentCount - 1),
        }
      }
      return cls
    })
    setStored('classes', classesCache)
  },
}

// 4. Session & Attendance Service (TEA_02, TEA_03)
export const sessionService = {
  getSessions: async (): Promise<AttendanceSession[]> => {
    return [...sessionsCache]
  },
  getActiveSession: (): AttendanceSession | undefined => {
    return sessionsCache.find((s) => s.status === 'active')
  },
  hasActiveSessionForClass: (classId: string): boolean => {
    return sessionsCache.some((s) => s.classId === classId && s.status === 'active')
  },
  createSession: async (data: {
    classId: string
    className: string
    room: string
    startTime: string
    endTime: string
    lateAfter: string
    teacherId: number
    teacherName: string
  }): Promise<AttendanceSession> => {
    const existingActive = sessionsCache.find((s) => s.classId === data.classId && s.status === 'active')
    if (existingActive) {
      throw new Error(`Lớp ${data.className} đang có phiên điểm danh đang mở! Vui lòng đóng phiên trước.`)
    }

    const targetClass = classesCache.find((c) => c.classId === data.classId)
    const newSession: AttendanceSession = {
      id: Date.now(),
      sessionId: `SES-${data.classId}-${Date.now().toString().slice(-4)}`,
      classId: data.classId,
      className: data.className,
      room: data.room,
      startTime: data.startTime,
      endTime: data.endTime,
      lateAfter: data.lateAfter,
      status: 'active',
      createdBy: data.teacherId,
      createdByName: data.teacherName,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      totalEnrolled: targetClass ? targetClass.studentCount : 42,
      presentCount: 0,
      lateCount: 0,
      absentCount: targetClass ? targetClass.studentCount : 42,
    }
    sessionsCache = [newSession, ...sessionsCache]
    setStored('sessions', sessionsCache)
    recordAuditLog(
      'Mở phiên điểm danh',
      data.teacherName,
      `Khởi tạo phiên ${newSession.sessionId} cho lớp ${data.className}`,
      'teal'
    )
    return newSession
  },
  closeSession: async (sessionId: string): Promise<void> => {
    sessionsCache = sessionsCache.map((s) => (s.sessionId === sessionId ? { ...s, status: 'closed' } : s))
    setStored('sessions', sessionsCache)
    recordAuditLog('Đóng phiên điểm danh', 'Giảng viên', `Đã kết thúc phiên ${sessionId}`, 'amber')
  },
}

// 5. Attendance Log & AI Review Service (FR-07..FR-10)
export const attendanceService = {
  getLogs: async (sessionId?: string): Promise<AttendanceLog[]> => {
    if (sessionId) {
      return attendanceLogsCache.filter((log) => log.sessionId === sessionId)
    }
    return [...attendanceLogsCache]
  },
  getStudentLogs: async (studentId: string): Promise<AttendanceLog[]> => {
    return attendanceLogsCache.filter((log) => log.studentId === studentId)
  },
  approveLog: async (logId: number): Promise<void> => {
    attendanceLogsCache = attendanceLogsCache.map((log) =>
      log.id === logId ? { ...log, reviewStatus: 'approved' as const } : log
    )
    setStored('attendanceLogs', attendanceLogsCache)
    recordAuditLog('Phê duyệt nhận diện AI', 'Giảng viên', `Duyệt kết quả điểm danh mã #${logId}`, 'teal')
  },
  rejectLog: async (logId: number): Promise<void> => {
    attendanceLogsCache = attendanceLogsCache.map((log) =>
      log.id === logId ? { ...log, reviewStatus: 'rejected' as const, status: 'absent' as const } : log
    )
    setStored('attendanceLogs', attendanceLogsCache)
    recordAuditLog('Từ chối nhận diện AI', 'Giảng viên', `Từ chối kết quả điểm danh mã #${logId}`, 'coral')
  },
  addRealtimeRecognition: (log: Omit<AttendanceLog, 'id' | 'createdAt'>): AttendanceLog => {
    const existing = attendanceLogsCache.find(
      (l) => l.sessionId === log.sessionId && l.studentId === log.studentId && l.reviewStatus !== 'rejected'
    )
    if (existing) {
      return existing
    }
    const newLog: AttendanceLog = {
      ...log,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    }
    attendanceLogsCache = [newLog, ...attendanceLogsCache]
    setStored('attendanceLogs', attendanceLogsCache)
    return newLog
  },
}

// 6. Complaint Service (STU_04, TEA_05)
export const complaintService = {
  getComplaints: async (): Promise<ComplaintRequest[]> => {
    return [...complaintsCache]
  },
  getStudentComplaints: async (studentId: string): Promise<ComplaintRequest[]> => {
    return complaintsCache.filter((c) => c.studentId === studentId)
  },
  createComplaint: async (data: {
    sessionId: string
    className: string
    studentId: string
    studentName: string
    reason: string
  }): Promise<ComplaintRequest> => {
    const hasPending = complaintsCache.some(
      (c) => c.sessionId === data.sessionId && c.studentId === data.studentId && c.requestStatus === 'pending'
    )
    if (hasPending) {
      throw new Error('Bạn đã có khiếu nại đang chờ xử lý cho buổi học này!')
    }

    const newComplaint: ComplaintRequest = {
      id: Date.now(),
      requestId: `CMP-2026-${String(complaintsCache.length + 1).padStart(3, '0')}`,
      sessionId: data.sessionId,
      className: data.className,
      studentId: data.studentId,
      studentName: data.studentName,
      reason: data.reason,
      requestStatus: 'pending',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    }
    complaintsCache = [newComplaint, ...complaintsCache]
    setStored('complaints', complaintsCache)
    recordAuditLog(
      'Gửi khiếu nại',
      `${data.studentName} (${data.studentId})`,
      `Gửi khiếu nại buổi học ${data.className}`,
      'amber'
    )
    return newComplaint
  },
  approveComplaint: async (id: number, teacherNote: string): Promise<void> => {
    let resolvedStudentId = ''
    let resolvedSessionId = ''
    complaintsCache = complaintsCache.map((c) => {
      if (c.id === id) {
        resolvedStudentId = c.studentId
        resolvedSessionId = c.sessionId
        return {
          ...c,
          requestStatus: 'approved' as const,
          teacherNote,
          resolvedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        }
      }
      return c
    })
    setStored('complaints', complaintsCache)

    if (resolvedStudentId && resolvedSessionId) {
      const existingLog = attendanceLogsCache.find(
        (l) => l.sessionId === resolvedSessionId && l.studentId === resolvedStudentId
      )
      if (existingLog) {
        attendanceLogsCache = attendanceLogsCache.map((log) => {
          if (log.sessionId === resolvedSessionId && log.studentId === resolvedStudentId) {
            return { ...log, status: 'present' as const, reviewStatus: 'approved' as const }
          }
          return log
        })
      }
      setStored('attendanceLogs', attendanceLogsCache)
    }

    recordAuditLog('Duyệt khiếu nại', 'Giảng viên', `Chấp thuận khiếu nại #${id}: ${teacherNote}`, 'teal')
  },
  rejectComplaint: async (id: number, teacherNote: string): Promise<void> => {
    complaintsCache = complaintsCache.map((c) =>
      c.id === id
        ? {
            ...c,
            requestStatus: 'rejected' as const,
            teacherNote,
            resolvedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
          }
        : c
    )
    setStored('complaints', complaintsCache)
    recordAuditLog('Từ chối khiếu nại', 'Giảng viên', `Từ chối khiếu nại #${id}: ${teacherNote}`, 'coral')
  },
}

// 7. Audit Log Service
export const auditService = {
  getLogs: async (): Promise<AuditLog[]> => {
    return [...auditLogsCache]
  },
}

// 8. Face Registration Service (FR-02, FR-03)
export const faceService = {
  registerFaceSamples: async (
    studentId: string,
    sampleCount: number
  ): Promise<{ success: boolean; qualityScore: number }> => {
    await new Promise((r) => setTimeout(r, 600))
    usersCache = usersCache.map((u) => (u.userId === studentId ? { ...u, hasFaceRegistered: true } : u))
    setStored('users', usersCache)
    recordAuditLog(
      'Đăng ký dữ liệu khuôn mặt',
      studentId,
      `Đã trích xuất đặc trưng 512D từ ${sampleCount} mẫu ảnh`,
      'teal'
    )
    return { success: true, qualityScore: 98.6 }
  },
}
