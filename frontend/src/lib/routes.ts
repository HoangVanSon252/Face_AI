import type { Role, View } from '../types'

/**
 * URL <-> view mapping. The URL is the source of truth for the current page,
 * so F5 keeps the page, Back/Forward work and pages can be deep-linked
 * (e.g. /sessions/15/live for a lecturer's live attendance screen).
 */
const VIEW_PATHS: Record<View, string> = {
  'Tổng quan': '/dashboard',
  'Lớp học': '/classes',
  'Môn học': '/subjects',
  'Điểm danh': '/attendance',
  'Lịch sử điểm danh': '/attendance/history',
  'Chi tiết phiên điểm danh': '/sessions/live',
  'Đăng ký khuôn mặt': '/face-registration',
  'Khiếu nại': '/complaints',
  'Báo cáo': '/reports',
  'Người dùng': '/admin/users',
  'Nhật ký kiểm toán': '/audit-logs',
  'Danh sách sinh viên lớp': '/classes/roster',
  'Project management': '/projects',
}

const SESSION_PATH = /^\/sessions\/(\d+)\/live\/?$/
const ROSTER_PATH = /^\/classes\/([^/]+)\/roster\/?$/

export interface RouteState {
  view: View
  sessionId?: number
  rosterClassId?: string
}

export function parsePath(pathname: string): RouteState {
  const session = SESSION_PATH.exec(pathname)
  if (session) return { view: 'Chi tiết phiên điểm danh', sessionId: Number(session[1]) }
  const roster = ROSTER_PATH.exec(pathname)
  if (roster) return { view: 'Danh sách sinh viên lớp', rosterClassId: decodeURIComponent(roster[1]) }
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const match = (Object.entries(VIEW_PATHS) as [View, string][]).find(([, path]) => path === normalized)
  return { view: match ? match[0] : 'Tổng quan' }
}

export function pathFor(view: View, params: { sessionId?: number; rosterClassId?: string } = {}): string {
  if (view === 'Chi tiết phiên điểm danh' && params.sessionId) return `/sessions/${params.sessionId}/live`
  if (view === 'Danh sách sinh viên lớp' && params.rosterClassId) {
    return `/classes/${encodeURIComponent(params.rosterClassId)}/roster`
  }
  return VIEW_PATHS[view]
}

/** Pages each role may open; anything else redirects to the dashboard. */
const ROLE_VIEWS: Record<Role, View[]> = {
  student: ['Tổng quan', 'Đăng ký khuôn mặt', 'Lịch sử điểm danh', 'Khiếu nại'],
  teacher: [
    'Tổng quan', 'Môn học', 'Lớp học', 'Điểm danh', 'Lịch sử điểm danh', 'Chi tiết phiên điểm danh',
    'Danh sách sinh viên lớp', 'Khiếu nại', 'Báo cáo', 'Đăng ký khuôn mặt',
  ],
  admin: [
    'Tổng quan', 'Người dùng', 'Môn học', 'Lớp học', 'Điểm danh', 'Lịch sử điểm danh',
    'Chi tiết phiên điểm danh', 'Danh sách sinh viên lớp', 'Khiếu nại', 'Báo cáo', 'Nhật ký kiểm toán',
    'Đăng ký khuôn mặt', 'Project management',
  ],
}

export function canOpen(role: Role, view: View): boolean {
  return ROLE_VIEWS[role].includes(view)
}
