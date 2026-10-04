import type { User, ClassItem, AttendanceSession, AttendanceLog, ComplaintRequest, AuditLog, SystemHealth } from '../types'

export const INITIAL_USERS: User[] = [
  {
    id: 1,
    userId: 'SV20240128',
    username: 'khoa.tm',
    fullName: 'Trần Minh Khoa',
    email: 'khoa.tm@ptit.edu.vn',
    role: 'student',
    isActive: true,
    department: 'Công nghệ thông tin',
    hasFaceRegistered: true,
    avatar: 'TK',
  },
  {
    id: 2,
    userId: 'GV2021042',
    username: 'lan.nt',
    fullName: 'Nguyễn Thị Lan',
    email: 'lan.nt@ptit.edu.vn',
    role: 'teacher',
    isActive: true,
    department: 'Công nghệ phần mềm',
    hasFaceRegistered: true,
    avatar: 'LT',
  },
  {
    id: 3,
    userId: 'AD2020008',
    username: 'long.pd',
    fullName: 'Phạm Đức Long',
    email: 'long.pd@ptit.edu.vn',
    role: 'admin',
    isActive: true,
    department: 'Phòng Đào tạo & Khảo thí',
    hasFaceRegistered: true,
    avatar: 'PL',
  },
]

export const INITIAL_CLASSES: ClassItem[] = [
  {
    id: 1,
    classId: 'IT308',
    className: 'Lập trình Web nâng cao',
    teacherId: 2,
    teacherName: 'Nguyễn Thị Lan',
    room: 'Phòng A-301',
    schedule: 'Thứ 4 · 08:00 - 10:00',
    department: 'Khoa Công nghệ thông tin',
    studentCount: 5,
    maxStudents: 45,
    studentIds: ['SV20240128'],
  },
]

export const INITIAL_SESSIONS: AttendanceSession[] = [
  {
    id: 1,
    sessionId: 'SES-IT308-0911',
    classId: 'IT308',
    className: 'Lập trình Web nâng cao',
    room: 'Phòng A-301',
    startTime: '08:00',
    endTime: '10:00',
    lateAfter: '08:15',
    status: 'active',
    createdBy: 2,
    createdByName: 'Nguyễn Thị Lan',
    createdAt: '2026-09-11 08:00:00',
    totalEnrolled: 5,
    presentCount: 1,
    lateCount: 0,
    absentCount: 4,
  },
]

export const INITIAL_ATTENDANCE_LOGS: AttendanceLog[] = [
  {
    id: 1,
    sessionId: 'SES-IT308-0911',
    classId: 'IT308',
    studentId: 'SV20240128',
    studentName: 'Trần Minh Khoa',
    checkInTime: '08:02:15',
    confidenceScore: 98.4,
    status: 'present',
    reviewStatus: 'approved',
    method: 'Khuôn mặt',
    createdAt: '2026-09-11 08:02:15',
  },
]

export const INITIAL_COMPLAINTS: ComplaintRequest[] = [
  {
    id: 1,
    requestId: 'CMP-2026-001',
    sessionId: 'SES-IT308-0911',
    className: 'Lập trình Web nâng cao',
    studentId: 'SV20240128',
    studentName: 'Trần Minh Khoa',
    reason: 'Camera bị chói sáng lúc 08:02, xin xác nhận điểm danh.',
    requestStatus: 'pending',
    createdAt: '2026-09-11 08:30:00',
  },
]

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 1,
    time: '08:00',
    action: 'Mở phiên điểm danh mới',
    actor: 'Nguyễn Thị Lan · Giảng viên',
    detail: 'Khởi tạo phiên SES-IT308-0911 tại Phòng A-301',
    tone: 'teal',
    timestamp: '2026-09-11 08:00:00',
  },
]

export const SYSTEM_HEALTH: SystemHealth = {
  apiStatus: 'Hoạt động ổn định (Healthy)',
  apiUptime: 99.9,
  aiServiceStatus: 'InsightFace ArcFace 512D Ready',
  aiUptime: 98.7,
  dbStatus: 'MySQL 8.0 Connected',
  dbUptime: 100,
  activeWsConnections: 1,
  avgLatencyMs: 25,
}
