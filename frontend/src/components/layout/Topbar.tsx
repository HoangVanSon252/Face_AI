import { useState } from 'react'
import { Menu, ChevronRight, Bell, CheckCircle2, X } from 'lucide-react'
import type { Role, View, User } from '../../types'
import { cn } from '../../lib/utils'

interface TopbarProps {
  activeView: View
  role: Role
  currentUser: User
  onRoleChange: (newRole: Role) => void
  onOpenMobileMenu: () => void
}

const AVATAR_BG: Record<Role, string> = {
  student: 'bg-[#c96d58]',
  teacher: 'bg-[#148f83]',
  admin: 'bg-[#cc8b30]',
}

export function Topbar({ activeView, role, currentUser, onRoleChange, onOpenMobileMenu }: TopbarProps) {
  const [showNotifications, setShowNotifications] = useState(false)

  const notifications = [
    { id: 1, title: 'Phiên điểm danh IT308 kết thúc', time: '08:05', unread: true },
    { id: 2, title: 'Có 3 bản ghi AI cần kiểm duyệt', time: '07:58', unread: true },
    { id: 3, title: 'Khiếu nại mới từ sinh viên SV20240128', time: '07:45', unread: false },
  ]

  const unreadCount = notifications.filter((n) => n.unread).length

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-white border-b border-[#e8efef] sticky top-0 z-30 shrink-0">
      {/* Left: menu + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          className="w-9 h-9 grid place-items-center rounded-lg text-[#6e7d82] hover:bg-[#eef3f3] lg:hidden transition-colors"
          onClick={onOpenMobileMenu}
          aria-label="Mở menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-1.5 text-xs text-[#8b999d]">
          <span className="hidden sm:block">Hệ thống điểm danh AI</span>
          <ChevronRight size={13} className="hidden sm:block" />
          <b className="text-[#172b35] text-[13px] font-bold">{activeView}</b>
        </div>
      </div>

      {/* Right: role switcher + notifications + avatar */}
      <div className="flex items-center gap-2">
        {/* Role switcher */}
        <div className="hidden sm:flex items-center gap-0.5 bg-[#f0f4f4] rounded-xl p-0.5">
          {(['student', 'teacher', 'admin'] as Role[]).map((r) => {
            const label = r === 'student' ? 'Sinh viên' : r === 'teacher' ? 'Giảng viên' : 'Quản trị viên'
            return (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                className={cn(
                  'px-3 py-1 rounded-lg text-[11px] font-semibold transition-all',
                  role === r
                    ? 'bg-white text-[#148f83] shadow-sm'
                    : 'text-[#8b999d] hover:text-[#172b35]'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            className="relative w-9 h-9 grid place-items-center rounded-xl text-[#6e7d82] hover:bg-[#eef3f3] transition-colors"
            aria-label="Thông báo"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#c96d58] rounded-full border-2 border-white" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute top-11 right-0 w-[290px] bg-white border border-[#e4ebeb] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.1)] z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4ebeb]">
                <span className="text-xs font-bold text-[#172b35]">Thông báo hệ thống</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-[10px] text-[#148f83] font-semibold hover:underline"
                  >
                    Đánh dấu đã đọc
                  </button>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-[#8b999d] hover:text-[#172b35]"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              <div className="p-3 flex flex-col gap-1.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'p-2.5 rounded-xl text-xs',
                      n.unread
                        ? 'bg-[#f5fbf9] border border-[#dff2ee]'
                        : 'hover:bg-[#f8fafa]'
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <CheckCircle2 size={13} className="text-[#148f83] mt-0.5 flex-none" />
                      <span className="font-semibold text-[#273f47] leading-tight">{n.title}</span>
                    </div>
                    <span className="text-[10px] text-[#91a0a4] mt-0.5 block pl-5">{n.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div
          className={cn(
            'w-8 h-8 rounded-xl grid place-items-center text-white text-xs font-bold',
            AVATAR_BG[role]
          )}
        >
          {currentUser.avatar || currentUser.fullName.slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
