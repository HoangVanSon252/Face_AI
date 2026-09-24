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
  INITIAL_USERS,
  INITIAL_CLASSES,
  INITIAL_SESSIONS,
  INITIAL_ATTENDANCE_LOGS,
  INITIAL_COMPLAINTS,
  INITIAL_AUDIT_LOGS,
} from './mockData'

// Helpers to sync with localStorage
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

// Audit Log helper
export const recordAuditLog = (action: string, actor: string, detail: string, tone: 'teal' | 'amber' | 'coral' | 'blue' = 'teal') => {
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

// 1. Auth Service (FR-01, STU_01)
export const authService = {
  getCurrentUser: (role: Role): User => {
    const found = usersCache.find((u) => u.role === role)
    return (
      found || {
        id: 99,
        userId: 'USER001',
        username: 'default.user',
        fullName: 'Người dùng',
        email: 'user@fpt.edu.vn',
        role,
        isActive: true,
        avatar: 'ND',
      }
    )
  },

  login: async (usernameOrEmail: string, _pass: string, selectedRole?: Role): Promise<User> => {
    await new Promise((r) => setTimeout(r, 400))
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
    await new Promise((r) => setTimeout(r, 500))

    // Check duplicate
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
}

// 2. Class Service (TEA_01, TEA_02)
export const classService = {
  getClasses: async (): Promise<ClassItem[]> => {
    return [...classesCache]
  },
  createClass: async (data: Omit<ClassItem, 'id' | 'studentCount' | 'studentIds'>): Promise<ClassItem> => {
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

// 3. Session & Attendance Service (TEA_02, TEA_03)
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
    // TEA_02: Không tạo session trùng cho cùng lớp khi đã có active
    const existingActive = sessionsCache.find(
      (s) => s.classId === data.classId && s.status === 'active'
    )
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
    recordAuditLog('Mở phiên điểm danh', data.teacherName, `Khởi tạo phiên ${newSession.sessionId} cho lớp ${data.className}`, 'teal')
    return newSession
  },
  closeSession: async (sessionId: string): Promise<void> => {
    sessionsCache = sessionsCache.map((s) =>
      s.sessionId === sessionId ? { ...s, status: 'closed' } : s
    )
    setStored('sessions', sessionsCache)
    recordAuditLog('Đóng phiên điểm danh', 'Giảng viên', `Đã kết thúc phiên ${sessionId}`, 'amber')
  },
}

// 4. Attendance Log & AI Review Service (FR-07..FR-10)
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
    // FR-10: Chống duplicate attendance trong cùng session
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

// 5. Complaint Service (STU_04, TEA_05)
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
    // STU_04: Check if student has a log for this session (valid session)
    const hasLog = attendanceLogsCache.some(
      (l) => l.sessionId === data.sessionId && l.studentId === data.studentId
    )
    // Check for duplicate pending complaint
    const hasPending = complaintsCache.some(
      (c) => c.sessionId === data.sessionId && c.studentId === data.studentId && c.requestStatus === 'pending'
    )
    if (hasPending) {
      throw new Error('Bạn đã có khiếu nại đang chờ xử lý cho buổi học này!')
    }
    if (!hasLog) {
      // Allow even without log (absence complaint)
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
    recordAuditLog('Gửi khiếu nại', `${data.studentName} (${data.studentId})`, `Gửi khiếu nại buổi học ${data.className}`, 'amber')
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

    // Business rule: When approved, adjust attendance log to "present"
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

// 6. User Management Service (ADM_01, ADM_02)
export const userService = {
  getUsers: async (): Promise<User[]> => {
    return [...usersCache]
  },
  toggleUserStatus: async (userId: string): Promise<boolean> => {
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
    usersCache = usersCache.filter((u) => u.userId !== userId)
    setStored('users', usersCache)
    recordAuditLog('Xóa tài khoản', 'Quản trị viên', `Đã xóa tài khoản ${userId}`, 'coral')
  },
  updateUser: async (userId: string, data: Partial<User>): Promise<User> => {
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

// 7. Audit Log Service
export const auditService = {
  getLogs: async (): Promise<AuditLog[]> => {
    return [...auditLogsCache]
  },
}

// 8. Face Registration Service (FR-02, FR-03)
export const faceService = {
  registerFaceSamples: async (studentId: string, sampleCount: number): Promise<{ success: boolean; qualityScore: number }> => {
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
