export type Role = 'student' | 'teacher' | 'admin'

export type View =
  | 'Tổng quan'
  | 'Lớp học'
  | 'Môn học'
  | 'Điểm danh'
  | 'Chi tiết phiên điểm danh'
  | 'Đăng ký khuôn mặt'
  | 'Lịch sử điểm danh'
  | 'Khiếu nại'
  | 'Báo cáo'
  | 'Người dùng'
  | 'Nhật ký kiểm toán'
  | 'Danh sách sinh viên lớp'

  | 'Project management'

export interface User {
  id: number
  userId: string // e.g. SV20240128, GV2021042, AD2020008
  username: string
  fullName: string
  email: string
  role: Role
  isActive: boolean
  department?: string
  administrativeClass?: string
  hasFaceRegistered?: boolean
  avatar?: string
}

export interface RegisterFormData {
  fullName: string
  email: string
  userId: string        // MSSV hoặc Mã GV
  password: string
  confirmPassword: string
  role: 'student' | 'teacher'
  department?: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  failedAttempts: number
  lockedUntil?: number  // Unix ms
}

export interface ClassItem {
  id: number
  classId: string // e.g. IT308
  className: string
  teacherId: number
  teacherName: string
  room: string
  schedule: string
  department: string
  studentCount: number
  maxStudents: number
  studentIds: string[] // list of student userIds
  courseId?: number
  courseCode?: string
}

export interface Subject {
  id: number
  code: string
  name: string
  credits: number
  isActive: boolean
}

export interface AttendanceSession {
  id: number
  sectionId?: number
  sessionNo?: number
  sessionId: string // e.g. SES-IT308-1
  title?: string
  classId: string
  className: string
  room: string
  startTime: string
  endTime: string
  lateAfter: string // e.g. "08:15"
  scheduledStartAt?: string // ISO UTC string
  scheduledEndAt?: string // ISO UTC string
  lateAfterAt?: string // ISO UTC string
  rawStatus?: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELLED'
  status: 'active' | 'closed' | 'scheduled' | 'cancelled'
  createdBy: number
  createdByName: string
  createdAt: string
  totalEnrolled: number
  presentCount: number
  lateCount: number
  absentCount: number
}

export interface AttendanceLog {
  id: number
  sessionId: string
  classId: string
  studentId: string
  studentName: string
  checkInTime: string
  confidenceScore: number // e.g. 94.5%
  status: 'present' | 'late' | 'absent'
  lateMinutes?: number
  reviewStatus: 'approved' | 'pending' | 'rejected'
  capturedImage?: string
  livenessScore?: number
  method: 'Khuôn mặt' | 'Thủ công'
  createdAt: string
}

export interface ComplaintRequest {
  id: number
  requestId?: string
  sessionId: string
  className: string
  studentId: string
  studentName: string
  reason: string
  status?: 'pending' | 'approved' | 'rejected'
  requestStatus?: 'pending' | 'approved' | 'rejected'
  teacherNote?: string
  responseNote?: string
  createdAt: string
  resolvedAt?: string
}

export interface AuditLog {
  id: number
  time: string
  action: string
  actor: string
  detail: string
  tone: 'teal' | 'amber' | 'coral' | 'blue'
  timestamp: string
}

export interface SystemHealth {
  apiStatus: string
  apiUptime: number
  aiServiceStatus: string
  aiUptime: number
  dbStatus: string
  dbUptime: number
  activeWsConnections: number
  avgLatencyMs: number
}
