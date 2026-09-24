import {
  CalendarCheck,
  LayoutDashboard,
  Camera,
  BookOpen,
  FileBarChart,
  ShieldCheck,
  Users,
  Settings,
  Zap,
  ChevronDown,
  X,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import type { Role, View, User } from '../../types'
import { cn } from '../../lib/utils'

interface NavItem {
  label: View
  icon: LucideIcon
  count?: number
}

const NAV_ITEMS_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Đăng ký khuôn mặt', icon: Camera },
    { label: 'Lịch sử điểm danh', icon: CalendarCheck },
    { label: 'Khiếu nại', icon: ShieldCheck },
  ],
  teacher: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Lớp học', icon: BookOpen },
    { label: 'Điểm danh', icon: CalendarCheck },
    { label: 'Khiếu nại', icon: ShieldCheck },
    { label: 'Báo cáo', icon: FileBarChart },
  ],
  admin: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Người dùng', icon: Users },
    { label: 'Báo cáo', icon: FileBarChart },
    { label: 'Nhật ký kiểm toán', icon: ShieldCheck },
  ],
}

const AVATAR_ROLE_CLS: Record<Role, string> = {
  student: 'bg-[#fbe8e2] text-[#c96d58]',
  teacher: 'bg-[#e0f5f1] text-[#138d81]',
  admin: 'bg-[#fff2dc] text-[#cc8b30]',
}

interface SidebarProps {
  activeView: View
  onSelectView: (view: View) => void
  role: Role
  currentUser: User
  mobileOpen: boolean
  onCloseMobile: () => void
  onLogout?: () => void
}

export function Sidebar({
  activeView,
  onSelectView,
  role,
  currentUser,
  mobileOpen,
  onCloseMobile,
  onLogout,
}: SidebarProps) {
  const roleLabel = role === 'student' ? 'Sinh viên' : role === 'admin' ? 'Quản trị viên' : 'Giảng viên'
  const navList = NAV_ITEMS_BY_ROLE[role] || []

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 h-screen w-[220px] bg-white border-r border-[#e8efef] flex flex-col z-50',
          'transition-transform duration-300',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[#e8efef]">
          <div className="w-8 h-8 rounded-[9px] bg-[#148f83] grid place-items-center text-white flex-none">
            <CalendarCheck size={18} />
          </div>
          <div className="flex flex-col leading-none">
            <strong className="text-[15px] font-extrabold text-[#172b35] tracking-tight">Attendly</strong>
            <span className="text-[9px] font-bold text-[#8b999d] tracking-widest mt-0.5">SMART ATTENDANCE</span>
          </div>
          <button
            className="ml-auto w-7 h-7 grid place-items-center rounded-lg text-[#6e7d82] hover:bg-[#eef3f3] lg:hidden"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Workspace indicator */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 mx-3 mt-3 rounded-xl bg-[#f5f8f8] border border-[#e4ebeb]">
          <div className="w-7 h-7 rounded-lg bg-[#148f83] text-white grid place-items-center text-[10px] font-bold flex-none">
            FPT
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#172b35] truncate">Đại học FPT</p>
            <p className="text-[10px] text-[#8b999d] truncate">Khoa Công nghệ thông tin</p>
          </div>
          <ChevronDown size={13} className="text-[#8b999d] flex-none" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5" aria-label="Điều hướng chính">
          <p className="text-[9px] font-bold text-[#a8b5b8] tracking-widest uppercase px-2.5 mb-1.5 mt-1">
            Chức năng
          </p>
          {navList.map(({ label, icon: Icon, count }) => {
            const isActive = activeView === label
            return (
              <button
                key={label}
                onClick={() => { onSelectView(label); onCloseMobile() }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-[13px] font-medium transition-all text-left',
                  isActive
                    ? 'bg-[#eaf7f5] text-[#148f83] font-semibold'
                    : 'text-[#68797d] hover:bg-[#f0f7f6] hover:text-[#148f83]'
                )}
              >
                <Icon size={16} className="flex-none" />
                <span className="flex-1 truncate">{label}</span>
                {count !== undefined && count > 0 && (
                  <em className="not-italic bg-[#c96d58] text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {count}
                  </em>
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-[#e8efef] pt-3">
          <button
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-[12px] font-medium text-[#68797d] hover:bg-[#f0f7f6] hover:text-[#148f83] transition-colors text-left"
            onClick={() =>
              alert('Cài đặt: Ngưỡng Auto-Approve ≥ 85% | Review Queue 60%–84% | Từ chối < 60%')
            }
          >
            <Settings size={15} />
            <span>Cài đặt tham số AI</span>
          </button>

          {/* AI Info card */}
          <div className="bg-[#eaf7f5] border border-[#c2e8e2] rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 bg-[#148f83] rounded-md grid place-items-center text-white">
                <Zap size={12} />
              </div>
              <p className="text-[11px] font-bold text-[#0f6b62]">Quy trình Face AI</p>
            </div>
            <p className="text-[10.5px] text-[#4a7971] leading-relaxed">
              Nhận diện realtime · InsightFace 512D · Auto &ge;85%
            </p>
          </div>

          {/* Profile */}
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
              <p className="text-[12px] font-bold text-[#172b35] truncate leading-tight">{currentUser.fullName}</p>
              <p className="text-[10px] text-[#8b999d] truncate">{roleLabel} · {currentUser.userId}</p>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="w-7 h-7 grid place-items-center rounded-lg text-[#8b999d] hover:bg-[#eef3f3] hover:text-[#c96d58] transition-colors"
                title="Đăng xuất"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
