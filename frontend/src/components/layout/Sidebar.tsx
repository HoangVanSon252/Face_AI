import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  Camera,
  BookOpen,
  FileBarChart,
  ShieldCheck,
  ScrollText,
  Users,
  UsersRound,
  History,
  MessageSquareWarning,
  X,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import type { Role, View, User } from '../../types'
import { cn } from '../../lib/utils'

interface NavItem {
  view: View
  label?: string
  icon: LucideIcon
  step?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

/**
 * Menus follow each role's part of the same process:
 * admin sets up the semester → lecturer runs the sessions → student attends.
 */
const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  admin: [
    { title: 'Tổng quan', items: [{ view: 'Tổng quan', icon: LayoutDashboard }] },
    {
      title: 'Thiết lập đào tạo',
      items: [
        { view: 'Học kỳ', icon: CalendarRange, step: 1 },
        { view: 'Người dùng', icon: Users, step: 2 },
        { view: 'Lớp học', label: 'Lớp hành chính', icon: UsersRound, step: 3 },
        { view: 'Môn học', label: 'Môn học & ca học', icon: BookOpen, step: 4 },
        { view: 'Lịch học', label: 'Lịch học toàn trường', icon: CalendarDays },
      ],
    },
    {
      title: 'Vận hành',
      items: [
        { view: 'Điểm danh', icon: CalendarCheck },
        { view: 'Khiếu nại', icon: MessageSquareWarning },
        { view: 'Báo cáo', icon: FileBarChart },
        { view: 'Nhật ký kiểm toán', icon: ScrollText },
      ],
    },
  ],
  teacher: [
    { title: 'Tổng quan', items: [{ view: 'Tổng quan', icon: LayoutDashboard }] },
    {
      title: 'Giảng dạy',
      items: [
        { view: 'Lịch học', label: 'Lịch dạy', icon: CalendarDays },
        { view: 'Môn học', label: 'Ca học của tôi', icon: BookOpen },
        { view: 'Lớp học', label: 'Lớp hành chính', icon: UsersRound },
      ],
    },
    {
      title: 'Điểm danh',
      items: [
        { view: 'Điểm danh', label: 'Phiên & lịch sử', icon: CalendarCheck },
        { view: 'Khiếu nại', icon: MessageSquareWarning },
        { view: 'Báo cáo', icon: FileBarChart },
      ],
    },
  ],
  student: [
    { title: 'Tổng quan', items: [{ view: 'Tổng quan', icon: LayoutDashboard }] },
    {
      title: 'Học tập',
      items: [
        { view: 'Lịch học', icon: CalendarDays },
        { view: 'Lịch sử điểm danh', icon: History },
      ],
    },
    {
      title: 'Cá nhân',
      items: [
        { view: 'Đăng ký khuôn mặt', icon: Camera },
        { view: 'Khiếu nại', icon: ShieldCheck },
      ],
    },
  ],
}

const AVATAR_ROLE_CLS: Record<Role, string> = {
  student: 'bg-[#fbe8e2] text-[#c96d58]',
  teacher: 'bg-[#e0f5f1] text-[#138d81]',
  admin: 'bg-[#fff2dc] text-[#cc8b30]',
}

const ROLE_HINT: Record<Role, string> = {
  admin: 'Thiết lập học kỳ, môn, ca học và phân công giảng viên.',
  teacher: 'Lập lịch buổi học, mở điểm danh và duyệt kết quả.',
  student: 'Đăng ký khuôn mặt, xem lịch và đứng trước camera lớp để điểm danh.',
}

interface SidebarProps {
  activeView: View
  onSelectView: (view: View) => void
  role: Role
  currentUser: User
  mobileOpen: boolean
  onCloseMobile: () => void
  onLogout?: () => void
  /** Small counters next to menu items (e.g. pending reviews). */
  badges?: Partial<Record<View, number>>
  /** A view that has something live right now (open attendance session). */
  liveView?: View
}

export function Sidebar({
  activeView,
  onSelectView,
  role,
  currentUser,
  mobileOpen,
  onCloseMobile,
  onLogout,
  badges = {},
  liveView,
}: SidebarProps) {
  const roleLabel = role === 'student' ? 'Sinh viên' : role === 'admin' ? 'Quản trị viên' : 'Giảng viên'
  const groups = NAV_BY_ROLE[role] || []
  // The live attendance page belongs to the attendance menu entry.
  const highlighted: View = activeView === 'Chi tiết phiên điểm danh' || activeView === 'Lịch sử điểm danh'
    ? (role === 'student' ? 'Lịch sử điểm danh' : 'Điểm danh')
    : activeView === 'Danh sách sinh viên lớp' ? 'Lớp học' : activeView

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="animate-overlay-in fixed inset-0 z-40 bg-[#0d2a2f]/30 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 h-screen w-[232px] bg-white border-r border-[#e8efef] flex flex-col z-50',
          'transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[#e8efef]">
          <div className="w-9 h-9 rounded-[11px] bg-gradient-to-br from-[#16a394] to-[#0f7a70] grid place-items-center text-white flex-none shadow-[0_4px_12px_rgba(20,143,131,0.35)]">
            <CalendarCheck size={18} />
          </div>
          <div className="flex flex-col leading-none">
            <strong className="text-[15px] font-extrabold text-[#172b35] tracking-tight">EduFace AI</strong>
            <span className="text-[9px] font-bold text-[#148f83] tracking-widest mt-0.5">SMART ATTENDANCE</span>
          </div>
          <button
            className="ml-auto w-7 h-7 grid place-items-center rounded-lg text-[#6e7d82] hover:bg-[#eef3f3] lg:hidden"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3" aria-label="Điều hướng chính">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              {group.title !== 'Tổng quan' && (
                <p className="text-[9.5px] font-bold text-[#a8b5b8] tracking-widest uppercase px-2.5 mb-1">
                  {group.title}
                </p>
              )}
              {group.items.map(({ view, label, icon: Icon, step }) => {
                const isActive = highlighted === view
                const count = badges[view]
                const isLive = liveView === view
                return (
                  <button
                    key={view}
                    onClick={() => { onSelectView(view); onCloseMobile() }}
                    className={cn(
                      'group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] font-medium text-left',
                      isActive
                        ? 'bg-[#eaf7f5] text-[#0f7a70] font-semibold'
                        : 'text-[#5f7175] hover:bg-[#f2f8f7] hover:text-[#148f83]'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[#148f83] transition-all duration-300',
                        isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'
                      )}
                    />
                    <Icon size={16} className={cn('flex-none transition-transform duration-200', !isActive && 'group-hover:scale-110')} />
                    <span className="flex-1 truncate">{label || view}</span>
                    {isLive && <span className="live-dot w-2 h-2 rounded-full bg-emerald-500" title="Đang mở điểm danh" />}
                    {count !== undefined && count > 0 && (
                      <em className="animate-pop-in not-italic bg-[#c96d58] text-white text-[9px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1">
                        {count > 99 ? '99+' : count}
                      </em>
                    )}
                    {step !== undefined && !count && (
                      <span className={cn(
                        'text-[9px] font-bold w-4 h-4 grid place-items-center rounded-full',
                        isActive ? 'bg-[#148f83] text-white' : 'bg-[#eef3f3] text-[#91a0a4]'
                      )}>
                        {step}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-[#e8efef] pt-3">
          <div className="bg-gradient-to-br from-[#eaf7f5] to-[#f4fbfa] border border-[#cfeae5] rounded-xl p-3">
            <p className="text-[11px] font-bold text-[#0f6b62]">Vai trò: {roleLabel}</p>
            <p className="text-[10.5px] text-[#4a7971] leading-relaxed mt-0.5">{ROLE_HINT[role]}</p>
          </div>

          <div className="flex items-center gap-2 py-1.5 px-1">
            <div
              className={cn(
                'w-8 h-8 rounded-xl grid place-items-center text-xs font-bold flex-none',
                AVATAR_ROLE_CLS[role]
              )}
            >
              {currentUser.avatar || currentUser.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[12px] font-bold text-[#172b35] truncate leading-tight"
                title={currentUser.fullName}
              >
                {currentUser.fullName}
              </p>
              <p className="text-[10px] text-[#8b999d] truncate">
                {roleLabel} · {currentUser.userId}
              </p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-[10px] text-[12px] font-semibold text-[#6e7d82] border border-[#e4ebeb] hover:bg-[#fbe8e2] hover:text-[#c96d58] hover:border-[#f3cfc5]"
            >
              <LogOut size={14} />
              Đăng xuất
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
