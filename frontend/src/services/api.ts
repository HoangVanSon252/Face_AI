import type {
  User,
  ClassItem,
  AttendanceSession,
  AttendanceLog,
  ComplaintRequest,
  AuditLog,
  Role,
  RegisterFormData,
  Subject,
} from '../types'
import {
  httpClient,
  setStoredToken,
  removeStoredToken,
} from './httpClient'
import { adminUserService } from './adminUsers'

// ─── Backend DTO Interfaces ──────────────────────────────────
interface BackendUserResponse {
  id: number
  email: string
  full_name: string
  role: 'ADMIN' | 'LECTURER' | 'STUDENT' | 'admin' | 'lecturer' | 'student'
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'active' | 'inactive' | 'locked'
  student_profile?: {
    user_id: number
    student_code: string
    major?: string
    cohort?: string
    administrative_class?: string
  }
  lecturer_profile?: {
    user_id: number
    lecturer_code: string
    department?: string
    academic_title?: string
  }
  has_face_registered?: boolean
}

interface BackendCourseItem {
  id: number
  course_code: string
  course_name: string
  credits: number
  is_active: boolean
}

const mapCourse = (course: BackendCourseItem): Subject => ({
  id: course.id,
  code: course.course_code,
  name: course.course_name,
  credits: course.credits,
  isActive: course.is_active,
})

interface BackendSemesterItem {
  id: number
  code: string
  name: string
  status: string
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

interface BackendSessionItem {
  id: number
  section_id: number
  session_no: number
  title?: string
  scheduled_start_at: string
  scheduled_end_at: string
  late_after_at: string
  opened_at?: string
  closed_at?: string
  status: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELLED'
  created_by: number
}

interface BackendAttendanceItem {
  id: number
  session_id: number
  student_id: number
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  verification_method: 'FACE' | 'MANUAL'
  check_in_at?: string
  confidence_score?: number
  liveness_score?: number
  review_status: 'AUTO_APPROVED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewed_by?: number
  reviewed_at?: string
  note?: string
}

interface BackendAppealItem {
  id: number
  attendance_record_id: number
  student_id: number
  reason: string
  evidence_uri?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  resolved_by?: number
  resolution_note?: string
  created_at: string
  resolved_at?: string
}

interface BackendAuditLogItem {
  id: number
  actor_user_id?: number
  action: string
  entity_type?: string
  entity_id?: string
  ip_address?: string
  user_agent?: string
  details?: Record<string, unknown>
  created_at: string
}

// ─── Helpers to map Backend -> Frontend ───────────────────────
function mapBackendUserToFrontend(u: BackendUserResponse): User {
  const rawRole = (u.role || '').toLowerCase()
  const role: Role = rawRole === 'lecturer' ? 'teacher' : rawRole === 'admin' ? 'admin' : 'student'
  const userId =
    u.student_profile?.student_code ||
    u.lecturer_profile?.lecturer_code ||
    (role === 'admin' ? `AD${u.id.toString().padStart(4, '0')}` : `USR${u.id.toString().padStart(4, '0')}`)
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
    isActive: (u.status || '').toLowerCase() === 'active',
    department,
    administrativeClass: u.student_profile?.administrative_class,
    hasFaceRegistered: Boolean(u.has_face_registered),
    avatar: initials || 'ND',
  }
}

// Global cached session state in memory
let cachedActiveSession: AttendanceSession | undefined = undefined

// ─── Health Check Service ─────────────────────────────────────
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

// ─── 1. Auth Service ──────────────────────────────────────────
export const authService = {
  getCurrentUser: (_role: Role): User => {
    return {
      id: 0,
      userId: 'UNKNOWN',
      username: '',
      fullName: '',
      email: '',
      role: _role,
      isActive: true,
      avatar: 'ND',
    }
  },

  getMe: async (): Promise<User | null> => {
    try {
      const profile = await httpClient.get<BackendUserResponse>('/api/v1/auth/me')
      if (profile && profile.id) {
        return mapBackendUserToFrontend(profile)
      }
      return null
    } catch {
      return null
    }
  },

  login: async (usernameOrEmail: string, pass: string, _selectedRole?: Role): Promise<User> => {
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

    if (!tokenRes || !tokenRes.access_token) {
      throw new Error('Đăng nhập không thành công: Không nhận được token')
    }

    setStoredToken(tokenRes.access_token)

    const profile = await httpClient.get<BackendUserResponse>('/api/v1/auth/me')
    return mapBackendUserToFrontend(profile)
  },

  register: async (data: RegisterFormData): Promise<User> => {
    return adminUserService.createUser(
      {
        userId: data.userId,
        username: data.email.split('@')[0],
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        isActive: true,
        department: data.department,
      },
      data.password
    )
  },

  logout: async (): Promise<void> => {
    try {
      await httpClient.post('/api/v1/auth/logout')
    } catch (e) {
      console.warn('Logout API error:', e)
    } finally {
      removeStoredToken()
      cachedActiveSession = undefined
    }
  },
}

// ─── 2. User Management Service ───────────────────────────────
export const userService = {
  getUsers: async (): Promise<User[]> => {
    return adminUserService.getUsers()
  },
  toggleUserStatus: async (userId: string): Promise<boolean> => {
    const all = await adminUserService.getUsers()
    const found = all.find((u) => u.userId === userId || String(u.id) === userId)
    if (!found) throw new Error('Không tìm thấy người dùng')
    const updated = await adminUserService.setUserActive(found, !found.isActive)
    return updated.isActive
  },
  updateUserRole: async (userId: string, newRole: Role): Promise<void> => {
    const all = await adminUserService.getUsers()
    const found = all.find((u) => u.userId === userId || String(u.id) === userId)
    if (!found) throw new Error('Không tìm thấy người dùng')
    await adminUserService.updateUser(found, { role: newRole })
  },
  createUser: async (data: Omit<User, 'id'>): Promise<User> => {
    return adminUserService.createUser(data, 'Password123!')
  },
  deleteUser: async (userId: string): Promise<void> => {
    const all = await adminUserService.getUsers()
    const found = all.find((u) => u.userId === userId || String(u.id) === userId)
    if (found) {
      await adminUserService.setUserActive(found, false)
    }
  },
  updateUser: async (userId: string, data: Partial<User>): Promise<User> => {
    const all = await adminUserService.getUsers()
    const found = all.find((u) => u.userId === userId || String(u.id) === userId)
    if (!found) throw new Error('Không tìm thấy người dùng')
    return adminUserService.updateUser(found, data)
  },
}

// ─── 3. Class & Academic Service ──────────────────────────────
export const classService = {
  getClasses: async (): Promise<ClassItem[]> => {
    try {
      const [courses, sections, users] = await Promise.all([
        httpClient.get<BackendCourseItem[]>('/api/v1/academic/courses').catch(() => []),
        httpClient.get<BackendSectionItem[]>('/api/v1/academic/sections').catch(() => []),
        adminUserService.getUsers().catch(() => []),
      ])

      if (!Array.isArray(sections) || sections.length === 0) {
        return []
      }

      const teachers = users.filter((u) => u.role === 'teacher')
      const mappedClasses: ClassItem[] = []

      for (const sec of sections) {
        const c = Array.isArray(courses) ? courses.find((crs) => crs.id === sec.course_id) : undefined
        const lecturer = teachers.find((t) => t.id === sec.lecturer_id)

        let enrolledStudentIds: string[] = []
        try {
          const enrollments = await httpClient.get<BackendEnrollmentItem[]>(
            `/api/v1/academic/sections/${sec.id}/enrollments`
          )
          if (Array.isArray(enrollments)) {
            enrolledStudentIds = enrollments.map((e) => {
              const matchedStudent = users.find((u) => u.id === e.student_id)
              return matchedStudent ? matchedStudent.userId : `SV${e.student_id}`
            })
          }
        } catch {
          // ignore enrollment fetch errors
        }

        mappedClasses.push({
          id: sec.id,
          classId: sec.section_code || (c ? c.course_code : `SEC${sec.id}`),
          className: c ? c.course_name : `Học phần ${sec.section_code}`,
          teacherId: sec.lecturer_id || 0,
          teacherName: lecturer ? lecturer.fullName : 'Giảng viên',
          room: sec.room || 'Phòng A-301',
          schedule: 'Thứ 2 · 08:00 - 10:00',
          department: lecturer?.department || 'Khoa Công nghệ thông tin',
          studentCount: enrolledStudentIds.length,
          maxStudents: 45,
          studentIds: enrolledStudentIds,
          courseId: sec.course_id,
          courseCode: c?.course_code,
        })
      }

      return mappedClasses
    } catch (err) {
      console.error('API getClasses error:', err)
      return []
    }
  },

  createClass: async (data: Omit<ClassItem, 'id' | 'studentCount' | 'studentIds'>): Promise<ClassItem> => {
    // 1. Get or create Course
    const courses = await httpClient.get<BackendCourseItem[]>('/api/v1/academic/courses').catch(() => [])
    let course = courses.find((c) => c.course_code === data.classId)
    if (!course) {
      course = await httpClient.post<BackendCourseItem>('/api/v1/academic/courses', {
        course_code: data.classId,
        course_name: data.className,
        credits: 3,
      })
    }

    // 2. Get active semester
    const semesters = await httpClient.get<BackendSemesterItem[]>('/api/v1/academic/semesters').catch(() => [])
    let activeSem = semesters.find((s) => s.status === 'ACTIVE' || s.status === 'active') || semesters[0]
    if (!activeSem) {
      activeSem = await httpClient.post<BackendSemesterItem>('/api/v1/academic/semesters', {
        code: 'FA26',
        name: 'Học kỳ 1 (2026-2027)',
        start_date: '2026-09-01',
        end_date: '2026-12-31',
      })
    }

    // 3. Create ClassSection
    const createdSection = await httpClient.post<BackendSectionItem>('/api/v1/academic/sections', {
      section_code: data.classId,
      course_id: course.id,
      semester_id: activeSem.id,
      lecturer_id: data.teacherId || 1,
      room: data.room || 'Phòng A-301',
    })

    return {
      id: createdSection.id,
      classId: createdSection.section_code,
      className: data.className,
      teacherId: createdSection.lecturer_id,
      teacherName: data.teacherName,
      room: createdSection.room || data.room,
      schedule: data.schedule,
      department: data.department,
      studentCount: 0,
      maxStudents: data.maxStudents,
      studentIds: [],
    }
  },

  addStudentToClass: async (sectionRef: number | string, studentId: string): Promise<void> => {
    const classes = await classService.getClasses()
    const target = typeof sectionRef === 'number'
      ? classes.find((c) => c.id === sectionRef)
      : classes.find((c) => c.classId === sectionRef)
    if (!target) throw new Error('Không tìm thấy lớp học')

    const users = await adminUserService.getUsers()
    const matchedStudent = users.find((u) => u.userId === studentId || String(u.id) === studentId)
    const studentNumericId = matchedStudent ? matchedStudent.id : parseInt(studentId.replace(/\D/g, '')) || 1

    await httpClient.post(`/api/v1/academic/sections/${target.id}/enrollments`, {
      student_id: studentNumericId,
      section_id: target.id,
    })
  },

  removeStudentFromClass: async (sectionRef: number | string, studentId: string): Promise<void> => {
    const classes = await classService.getClasses()
    const target = typeof sectionRef === 'number'
      ? classes.find((c) => c.id === sectionRef)
      : classes.find((c) => c.classId === sectionRef)
    if (!target) throw new Error('Không tìm thấy lớp học')

    const users = await adminUserService.getUsers()
    const matchedStudent = users.find((u) => u.userId === studentId || String(u.id) === studentId)
    const studentNumericId = matchedStudent ? matchedStudent.id : parseInt(studentId.replace(/\D/g, '')) || 1

    await httpClient.delete(`/api/v1/academic/sections/${target.id}/enrollments/${studentNumericId}`)
  },

  addClassToSection: async (sectionId: number, classCode: string): Promise<{ added_count: number }> => {
    return httpClient.post<{ added_count: number }>(
      `/api/v1/academic/sections/${sectionId}/classes/${encodeURIComponent(classCode)}`
    )
  },

  removeClassFromSection: async (sectionId: number, classCode: string): Promise<void> => {
    await httpClient.delete(
      `/api/v1/academic/sections/${sectionId}/classes/${encodeURIComponent(classCode)}`
    )
  },

  updateClass: async (
    sectionId: number,
    data: { room?: string; schedule?: string; maxStudents?: number; status?: string }
  ): Promise<void> => {
    await httpClient.patch(`/api/v1/academic/sections/${sectionId}`, {
      room: data.room,
      status: data.status || 'OPEN',
    })
  },

  deleteClass: async (sectionId: number): Promise<void> => {
    await httpClient.delete(`/api/v1/academic/sections/${sectionId}`)
  },

  // Tạo section (ca học) trực tiếp với đủ thông tin (course_id, semester_id)
  createSection: async (data: {
    sectionCode: string
    courseId: number
    semesterId: number
    lecturerId: number
    room?: string
  }): Promise<BackendSectionItem> => {
    return httpClient.post<BackendSectionItem>('/api/v1/academic/sections', {
      section_code: data.sectionCode,
      course_id: data.courseId,
      semester_id: data.semesterId,
      lecturer_id: data.lecturerId,
      room: data.room || 'Phòng A-301',
    })
  },
}

// ─── 4. Session & Attendance Service ──────────────────────────
export const subjectService = {
  getSubjects: async (): Promise<Subject[]> =>
    (await httpClient.get<BackendCourseItem[]>('/api/v1/academic/courses')).map(mapCourse),
  createSubject: async (data: Omit<Subject, 'id' | 'isActive'>): Promise<Subject> =>
    mapCourse(await httpClient.post<BackendCourseItem>('/api/v1/academic/courses', {
      course_code: data.code.trim().toUpperCase(), course_name: data.name.trim(), credits: data.credits,
    })),
  updateSubject: async (id: number, data: Omit<Subject, 'id' | 'isActive'>): Promise<Subject> =>
    mapCourse(await httpClient.patch<BackendCourseItem>(`/api/v1/academic/courses/${id}`, {
      course_code: data.code.trim().toUpperCase(), course_name: data.name.trim(), credits: data.credits,
    })),
  deleteSubject: async (id: number): Promise<void> => { await httpClient.delete(`/api/v1/academic/courses/${id}`) },
  getClasses: async (id: number): Promise<ClassItem[]> => {
    const assigned = await httpClient.get<BackendSectionItem[]>(`/api/v1/academic/courses/${id}/classes`)
    const all = await classService.getClasses()
    return assigned.map((section) => all.find((item) => item.id === section.id)).filter((item): item is ClassItem => Boolean(item))
  },
  addClass: async (subjectId: number, classId: number): Promise<void> => { await httpClient.post(`/api/v1/academic/courses/${subjectId}/classes/${classId}`) },
  removeClass: async (subjectId: number, classId: number): Promise<void> => { await httpClient.delete(`/api/v1/academic/courses/${subjectId}/classes/${classId}`) },
}

function mapBackendSessionToFrontend(
  s: BackendSessionItem,
  classesRes: ClassItem[],
  usersRes: User[],
  recordsRes: BackendAttendanceItem[]
): AttendanceSession {
  const cls = classesRes.find((c) => c.id === s.section_id)
  const creator = usersRes.find((u) => u.id === s.created_by)
  const formatTime = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const sessionRecords = Array.isArray(recordsRes)
    ? recordsRes.filter((record) => record.session_id === s.id && record.review_status !== 'REJECTED')
    : []
  const presentCount = sessionRecords.filter(
    (record) => record.status === 'PRESENT' || record.status === 'LATE'
  ).length
  const lateCount = sessionRecords.filter((record) => record.status === 'LATE').length
  const totalEnrolled = cls?.studentCount || 0

  let uiStatus: 'active' | 'closed' | 'scheduled' | 'cancelled' = 'closed'
  if (s.status === 'OPEN') uiStatus = 'active'
  else if (s.status === 'SCHEDULED') uiStatus = 'scheduled'
  else if (s.status === 'CANCELLED') uiStatus = 'cancelled'

  return {
    id: s.id,
    sectionId: s.section_id,
    sessionNo: s.session_no,
    title: s.title || `Buổi ${s.session_no}`,
    sessionId: `SES-${cls?.classId || s.section_id}-${s.session_no}`,
    classId: cls?.classId || `SEC${s.section_id}`,
    className: cls?.className || `Học phần ${s.section_id}`,
    room: cls?.room || 'Phòng A-301',
    startTime: formatTime(s.scheduled_start_at) || '08:00',
    endTime: formatTime(s.scheduled_end_at) || '10:00',
    lateAfter: formatTime(s.late_after_at) || '08:15',
    scheduledStartAt: s.scheduled_start_at,
    scheduledEndAt: s.scheduled_end_at,
    lateAfterAt: s.late_after_at,
    rawStatus: s.status,
    status: uiStatus,
    createdBy: s.created_by,
    createdByName: creator?.fullName || 'Giảng viên',
    createdAt: s.scheduled_start_at || new Date().toISOString(),
    totalEnrolled,
    presentCount,
    lateCount,
    absentCount: Math.max(0, totalEnrolled - presentCount),
  }
}

export const sessionService = {
  getSessions: async (): Promise<AttendanceSession[]> => {
    try {
      cachedActiveSession = undefined
      const [sessionsRes, classesRes, usersRes, recordsRes] = await Promise.all([
        httpClient.get<BackendSessionItem[]>('/api/v1/sessions').catch(() => []),
        classService.getClasses().catch(() => []),
        adminUserService.getUsers().catch(() => []),
        httpClient.get<BackendAttendanceItem[]>('/api/v1/attendance').catch(() => []),
      ])

      if (!Array.isArray(sessionsRes)) return []

      const mapped = sessionsRes.map((s) => {
        const item = mapBackendSessionToFrontend(s, classesRes, usersRes, recordsRes)
        if (s.status === 'OPEN') {
          cachedActiveSession = item
        }
        return item
      })

      return mapped
    } catch {
      return []
    }
  },

  getSessionsForSection: async (sectionId: number): Promise<AttendanceSession[]> => {
    try {
      const [sessionsRes, classesRes, usersRes, recordsRes] = await Promise.all([
        httpClient.get<BackendSessionItem[]>(`/api/v1/sections/${sectionId}/sessions`).catch(() => []),
        classService.getClasses().catch(() => []),
        adminUserService.getUsers().catch(() => []),
        httpClient.get<BackendAttendanceItem[]>('/api/v1/attendance').catch(() => []),
      ])

      if (!Array.isArray(sessionsRes)) return []
      return sessionsRes.map((s) => mapBackendSessionToFrontend(s, classesRes, usersRes, recordsRes))
    } catch {
      return []
    }
  },

  createSectionSession: async (
    sectionId: number,
    data: {
      title?: string
      scheduledStartAt: string
      scheduledEndAt: string
      lateAfterAt: string
      sessionNo?: number
    }
  ): Promise<AttendanceSession> => {
    const created = await httpClient.post<BackendSessionItem>(
      `/api/v1/sections/${sectionId}/sessions`,
      {
        session_no: data.sessionNo,
        title: data.title,
        scheduled_start_at: data.scheduledStartAt,
        scheduled_end_at: data.scheduledEndAt,
        late_after_at: data.lateAfterAt,
      }
    )

    const [classesRes, usersRes] = await Promise.all([
      classService.getClasses().catch(() => []),
      adminUserService.getUsers().catch(() => []),
    ])
    return mapBackendSessionToFrontend(created, classesRes, usersRes, [])
  },

  updateSession: async (
    sessionId: number,
    data: {
      title?: string
      scheduledStartAt?: string
      scheduledEndAt?: string
      lateAfterAt?: string
    }
  ): Promise<AttendanceSession> => {
    const updated = await httpClient.patch<BackendSessionItem>(
      `/api/v1/sessions/${sessionId}`,
      {
        title: data.title,
        scheduled_start_at: data.scheduledStartAt,
        scheduled_end_at: data.scheduledEndAt,
        late_after_at: data.lateAfterAt,
      }
    )
    const [classesRes, usersRes] = await Promise.all([
      classService.getClasses().catch(() => []),
      adminUserService.getUsers().catch(() => []),
    ])
    return mapBackendSessionToFrontend(updated, classesRes, usersRes, [])
  },

  deleteSession: async (sessionId: number): Promise<void> => {
    await httpClient.delete(`/api/v1/sessions/${sessionId}`)
  },

  generateSemesterSessions: async (
    sectionId: number,
    data: {
      daysOfWeek: number[]
      startTime: string
      endTime: string
      lateMinutes?: number
      startDate: string
      endDate: string
      totalSessions?: number
      titlePrefix?: string
    }
  ): Promise<AttendanceSession[]> => {
    const res = await httpClient.post<BackendSessionItem[]>(
      `/api/v1/sections/${sectionId}/sessions/batch`,
      {
        days_of_week: data.daysOfWeek,
        start_time: data.startTime,
        end_time: data.endTime,
        late_minutes: data.lateMinutes ?? 15,
        start_date: data.startDate,
        end_date: data.endDate,
        total_sessions: data.totalSessions,
        title_prefix: data.titlePrefix || 'Buổi',
      }
    )
    const [classesRes, usersRes] = await Promise.all([
      classService.getClasses().catch(() => []),
      adminUserService.getUsers().catch(() => []),
    ])
    return res.map((s) => mapBackendSessionToFrontend(s, classesRes, usersRes, []))
  },

  openSession: async (sessionId: number): Promise<AttendanceSession> => {
    const opened = await httpClient.post<BackendSessionItem>(
      `/api/v1/sessions/${sessionId}/open`
    )
    const [classesRes, usersRes] = await Promise.all([
      classService.getClasses().catch(() => []),
      adminUserService.getUsers().catch(() => []),
    ])
    const sessionObj = mapBackendSessionToFrontend(opened, classesRes, usersRes, [])
    cachedActiveSession = sessionObj
    return sessionObj
  },

  getActiveSession: (): AttendanceSession | undefined => {
    return cachedActiveSession
  },

  hasActiveSessionForClass: (classId: string): boolean => {
    return Boolean(cachedActiveSession && cachedActiveSession.classId === classId && cachedActiveSession.status === 'active')
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
    scheduledDate?: string
  }): Promise<AttendanceSession> => {
    const classes = await classService.getClasses()
    const targetClass = classes.find((c) => c.classId === data.classId)
    if (!targetClass) throw new Error('Không tìm thấy lớp học')

    const now = new Date()
    const localDateStr = data.scheduledDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const startLocal = new Date(`${localDateStr}T${data.startTime || '08:00'}:00`)
    const endLocal = new Date(`${localDateStr}T${data.endTime || '10:00'}:00`)
    const lateLocal = new Date(`${localDateStr}T${data.lateAfter || '08:15'}:00`)

    const scheduledStart = startLocal.toISOString()
    const scheduledEnd = endLocal.toISOString()
    const lateAfter = lateLocal.toISOString()

    // Count existing sessions in section to generate session_no
    const existing = await httpClient.get<BackendSessionItem[]>(
      `/api/v1/sections/${targetClass.id}/sessions`
    ).catch(() => [])
    const nextSessionNo = (existing.length || 0) + 1

    const created = await httpClient.post<BackendSessionItem>(
      `/api/v1/sections/${targetClass.id}/sessions`,
      {
        session_no: nextSessionNo,
        title: `Buổi ${nextSessionNo} - ${data.className}`,
        scheduled_start_at: scheduledStart,
        scheduled_end_at: scheduledEnd,
        late_after_at: lateAfter,
      }
    )

    // Open session
    const opened = await httpClient.post<BackendSessionItem>(
      `/api/v1/sessions/${created.id}/open`
    )

    const sessionObj: AttendanceSession = {
      id: opened.id,
      sectionId: targetClass.id,
      sessionNo: opened.session_no,
      title: opened.title || `Buổi ${opened.session_no}`,
      sessionId: `SES-${data.classId}-${opened.session_no}`,
      classId: data.classId,
      className: data.className,
      room: data.room,
      startTime: data.startTime,
      endTime: data.endTime,
      lateAfter: data.lateAfter,
      scheduledStartAt: opened.scheduled_start_at,
      scheduledEndAt: opened.scheduled_end_at,
      lateAfterAt: opened.late_after_at,
      rawStatus: opened.status,
      status: 'active',
      createdBy: data.teacherId,
      createdByName: data.teacherName,
      createdAt: new Date().toISOString(),
      totalEnrolled: targetClass.studentCount,
      presentCount: 0,
      lateCount: 0,
      absentCount: targetClass.studentCount,
    }

    cachedActiveSession = sessionObj
    return sessionObj
  },

  closeSession: async (sessionId: string | number): Promise<void> => {
    const numId = typeof sessionId === 'number' ? sessionId : (parseInt(sessionId.replace(/\D/g, '')) || cachedActiveSession?.id)
    if (numId) {
      await httpClient.post(`/api/v1/sessions/${numId}/close`).catch(() => {})
    }
    if (cachedActiveSession) {
      cachedActiveSession.status = 'closed'
    }
    cachedActiveSession = undefined
  },
}

// ─── 5. Attendance Log & Review Service ───────────────────────
export const attendanceService = {
  getLogs: async (sessionId?: string): Promise<AttendanceLog[]> => {
    try {
      const numSessionId = sessionId ? parseInt(sessionId.replace(/\D/g, '')) || undefined : undefined
      const endpoint = numSessionId ? `/api/v1/attendance?session_id=${numSessionId}` : '/api/v1/attendance'
      const [records, users, classes, sessions] = await Promise.all([
        httpClient.get<BackendAttendanceItem[]>(endpoint).catch(() => []),
        adminUserService.getUsers().catch(() => []),
        classService.getClasses().catch(() => []),
        sessionService.getSessions().catch(() => []),
      ])

      if (!Array.isArray(records)) return []

      return records.map((r) => {
        const student = users.find((u) => u.id === r.student_id)
        const currentSession = sessions.find((s) => s.id === r.session_id)
        const formatTime = (iso?: string) => {
          if (!iso) return 'Chưa ghi nhận'
          const d = new Date(iso)
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        }

        const statusMap: Record<string, 'present' | 'late' | 'absent'> = {
          PRESENT: 'present',
          LATE: 'late',
          ABSENT: 'absent',
          EXCUSED: 'present',
        }
        const reviewMap: Record<string, 'pending' | 'approved' | 'rejected'> = {
          AUTO_APPROVED: 'approved',
          PENDING: 'pending',
          APPROVED: 'approved',
          REJECTED: 'rejected',
        }

        let lateMinutes: number | undefined = undefined
        if (r.status === 'LATE' && r.check_in_at && currentSession?.lateAfterAt) {
          const diffMs = new Date(r.check_in_at).getTime() - new Date(currentSession.lateAfterAt).getTime()
          if (diffMs > 0) {
            lateMinutes = Math.max(1, Math.round(diffMs / 60000))
          }
        }

        return {
          id: r.id,
          sessionId: `SES-${r.session_id}`,
          classId: classes.find((c) => c.id === currentSession?.sectionId)?.classId || `SESSION-${r.session_id}`,
          studentId: student ? student.userId : `SV${r.student_id}`,
          studentName: student ? student.fullName : `Sinh viên #${r.student_id}`,
          checkInTime: formatTime(r.check_in_at),
          // API stores a cosine similarity in [0, 1]; UI consistently shows percent.
          confidenceScore: r.confidence_score == null ? 0 : Number(r.confidence_score) * 100,
          status: statusMap[r.status] || 'present',
          lateMinutes,
          reviewStatus: reviewMap[r.review_status] || 'approved',
          method: r.verification_method === 'FACE' ? 'Khuôn mặt' : 'Thủ công',
          createdAt: r.check_in_at || new Date().toISOString(),
        }
      })
    } catch {
      return []
    }
  },

  getStudentLogs: async (_studentId: string): Promise<AttendanceLog[]> => {
    try {
      const [records, classes, sessions] = await Promise.all([
        httpClient.get<BackendAttendanceItem[]>('/api/v1/students/me/attendance'),
        classService.getClasses(),
        sessionService.getSessions(),
      ])
      if (!Array.isArray(records)) return []
      return records.map((r) => {
        const currentSession = sessions.find((s) => s.id === r.session_id)
        let lateMinutes: number | undefined = undefined
        if (r.status === 'LATE' && r.check_in_at && currentSession?.lateAfterAt) {
          const diffMs = new Date(r.check_in_at).getTime() - new Date(currentSession.lateAfterAt).getTime()
          if (diffMs > 0) {
            lateMinutes = Math.max(1, Math.round(diffMs / 60000))
          }
        }
        return {
          id: r.id,
          sessionId: `SES-${r.session_id}`,
          classId: classes.find((c) => c.id === currentSession?.sectionId)?.classId || `SESSION-${r.session_id}`,
          studentId: _studentId,
          studentName: _studentId,
          checkInTime: r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString('vi-VN') : 'Chưa ghi nhận',
          confidenceScore: r.confidence_score == null ? 0 : Number(r.confidence_score) * 100,
          status: (r.status.toLowerCase() as 'present' | 'late' | 'absent') || 'present',
          lateMinutes,
          reviewStatus: (r.review_status === 'AUTO_APPROVED' ? 'approved' : r.review_status.toLowerCase() as 'pending' | 'approved' | 'rejected') || 'approved',
          method: r.verification_method === 'FACE' ? 'Khuôn mặt' : 'Thủ công',
          createdAt: r.check_in_at || new Date().toISOString(),
        }
      })
    } catch {
      return []
    }
  },

  approveLog: async (logId: number): Promise<void> => {
    await httpClient.post(`/api/v1/attendance/${logId}/approve`, {
      note: 'Phê duyệt qua hệ thống quản lý',
    })
  },

  rejectLog: async (logId: number): Promise<void> => {
    await httpClient.post(`/api/v1/attendance/${logId}/reject`, {
      note: 'Từ chối điểm danh',
    })
  },

  updateLogNote: async (logId: number, status: 'present' | 'late' | 'absent', note: string): Promise<void> => {
    await httpClient.patch(`/api/v1/attendance/${logId}`, {
      status: status.toUpperCase(),
      note,
    })
  },

}

// ─── 6. Complaint / Appeals Service ───────────────────────────
export const complaintService = {
  getComplaints: async (): Promise<ComplaintRequest[]> => {
    try {
      const [appeals, users, classes] = await Promise.all([
        httpClient.get<BackendAppealItem[]>('/api/v1/appeals').catch(() => []),
        adminUserService.getUsers().catch(() => []),
        classService.getClasses().catch(() => []),
      ])

      if (!Array.isArray(appeals)) return []

      return appeals.map((a) => {
        const student = users.find((u) => u.id === a.student_id)
        const statusMap: Record<string, 'pending' | 'approved' | 'rejected'> = {
          PENDING: 'pending',
          APPROVED: 'approved',
          REJECTED: 'rejected',
        }
        const mappedStatus = statusMap[a.status] || 'pending'
        return {
          id: a.id,
          requestId: `CMP-2026-${String(a.id).padStart(3, '0')}`,
          sessionId: `SES-${a.attendance_record_id}`,
        className: classes.find((c) => c.id === a.attendance_record_id)?.className || `Session ${a.attendance_record_id}`,
          studentId: student ? student.userId : `SV${a.student_id}`,
          studentName: student ? student.fullName : `Sinh viên #${a.student_id}`,
          reason: a.reason,
          status: mappedStatus,
          requestStatus: mappedStatus,
          teacherNote: a.resolution_note,
          responseNote: a.resolution_note,
          createdAt: a.created_at || new Date().toISOString(),
          resolvedAt: a.resolved_at,
        }
      })
    } catch {
      return []
    }
  },

  getStudentComplaints: async (studentId: string): Promise<ComplaintRequest[]> => {
    try {
      const appeals = await httpClient.get<BackendAppealItem[]>('/api/v1/appeals/me').catch(() => [])
      if (!Array.isArray(appeals)) return []

      return appeals.map((a) => {
        const statusMap: Record<string, 'pending' | 'approved' | 'rejected'> = {
          PENDING: 'pending',
          APPROVED: 'approved',
          REJECTED: 'rejected',
        }
        const mappedStatus = statusMap[a.status] || 'pending'
        return {
          id: a.id,
          requestId: `CMP-2026-${String(a.id).padStart(3, '0')}`,
          sessionId: `SES-${a.attendance_record_id}`,
          className: `Session ${a.attendance_record_id}`,
          studentId,
          studentName: 'Sinh viên',
          reason: a.reason,
          status: mappedStatus,
          requestStatus: mappedStatus,
          teacherNote: a.resolution_note,
          responseNote: a.resolution_note,
          createdAt: a.created_at || new Date().toISOString(),
          resolvedAt: a.resolved_at,
        }
      })
    } catch {
      return []
    }
  },

  createComplaint: async (data: {
    sessionId: string
    className: string
    studentId: string
    studentName: string
    reason: string
  }): Promise<ComplaintRequest> => {
    const recordId = parseInt(data.sessionId.replace(/\D/g, '')) || 1
    const res = await httpClient.post<BackendAppealItem>(`/api/v1/attendance/${recordId}/appeals`, {
      reason: data.reason,
    })

    return {
      id: res.id,
      requestId: `CMP-2026-${String(res.id).padStart(3, '0')}`,
      sessionId: data.sessionId,
      className: data.className,
      studentId: data.studentId,
      studentName: data.studentName,
      reason: data.reason,
      status: 'pending',
      requestStatus: 'pending',
      createdAt: res.created_at || new Date().toISOString(),
    }
  },

  approveComplaint: async (id: number, teacherNote: string): Promise<void> => {
    await httpClient.post(`/api/v1/appeals/${id}/resolve`, {
      decision: 'APPROVED',
      attendance_status: 'PRESENT',
      resolution_note: teacherNote,
    })
  },

  rejectComplaint: async (id: number, teacherNote: string): Promise<void> => {
    await httpClient.post(`/api/v1/appeals/${id}/resolve`, {
      decision: 'REJECTED',
      resolution_note: teacherNote,
    })
  },
}

// ─── 7. Audit Log Service ─────────────────────────────────────
export const auditService = {
  getLogs: async (): Promise<AuditLog[]> => {
    try {
      const logs = await httpClient.get<BackendAuditLogItem[]>('/api/v1/audit-logs')
      if (!Array.isArray(logs)) return []

      return logs.map((item) => {
        const d = new Date(item.created_at)
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        const actionLower = (item.action || '').toLowerCase()
        const tone: 'teal' | 'amber' | 'coral' | 'blue' =
          actionLower.includes('lock') || actionLower.includes('delete') || actionLower.includes('fail')
            ? 'coral'
            : actionLower.includes('update') || actionLower.includes('role')
            ? 'blue'
            : actionLower.includes('warn') || actionLower.includes('block')
            ? 'amber'
            : 'teal'

        let detailStr = ''
        if (item.details && typeof item.details === 'object') {
          detailStr = Object.entries(item.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        } else {
          detailStr = `${item.entity_type || 'Thực thể'} #${item.entity_id || ''}`
        }

        return {
          id: item.id,
          time: timeStr,
          action: item.action,
          actor: item.actor_user_id ? `User #${item.actor_user_id}` : 'System',
          detail: detailStr || 'Hành động kiểm toán hệ thống',
          tone,
          timestamp: item.created_at,
        }
      })
    } catch {
      return []
    }
  },
}

// ─── 8. Face Registration Service ─────────────────────────────
export const faceService = {
  registerFaceSamples: async (
    studentId: number,
    samples: string[]
  ): Promise<{ id: number; status: string; sample_count: number }> => {
    return httpClient.post(`/api/v1/students/${studentId}/face-profiles`, {
      consent: true,
      samples: samples.map((image_base64, index) => ({
        image_base64,
        is_primary: index === 0,
      })),
    })
  },

  getFaceProfile: async (
    studentId: number
  ): Promise<{
    id: number
    student_id: number
    status: string
    sample_count: number
    model_name: string
    model_version: string
    embedding_dimension: number
    consent_at: string
    activated_at?: string
  } | null> => {
    try {
      return await httpClient.get(`/api/v1/students/${studentId}/face-profile`)
    } catch {
      return null
    }
  },

  detectFrame: async (
    image_base64: string
  ): Promise<{
    detected: boolean
    face_count: number
    confidence: number
    faces: Array<{ bbox: number[]; confidence: number; landmarks: number[][] }>
  }> => {
    try {
      return await httpClient.post('/api/v1/face/detect-frame', { image_base64 })
    } catch {
      return { detected: false, face_count: 0, confidence: 0, faces: [] }
    }
  },

  recognize: async (sessionId: number, image_base64: string) =>
    httpClient.post<{
      matched: boolean
      student_id?: number
      attendance_record_id?: number
      confidence_score?: number
      quality_score?: number
      review_required?: boolean
      reason?: string
    }>(`/api/v1/sessions/${sessionId}/recognitions`, { image_base64 }),
}

export const recordAuditLog = (
  _action: string,
  _actor: string,
  _detail: string,
  _tone: 'teal' | 'amber' | 'coral' | 'blue' = 'teal'
) => {
  // Backend audit service logs actions automatically when endpoints are executed
}
