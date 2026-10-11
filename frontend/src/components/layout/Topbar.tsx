import { useState, useEffect } from 'react'
import { Menu, ChevronRight, Bell, CheckCircle2, X } from 'lucide-react'
import type { Role, View, User } from '../../types'
import { auditService } from '../../services/api'
import { cn } from '../../lib/utils'

interface TopbarProps {
  activeView: View
  role: Role
  currentUser: User
  onOpenMobileMenu: () => void
}

const AVATAR_BG: Record<Role, string> = {
  student: 'bg-[#c96d58]',
  teacher: 'bg-[#148f83]',
  admin: 'bg-[#cc8b30]',
}

interface NotificationItem {
  id: number
  title: string
  time: string
  unread: boolean
}

export function Topbar({ activeView, role, currentUser, onOpenMobileMenu }: TopbarProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const logs = await auditService.getLogs()
        if (Array.isArray(logs) && logs.length > 0) {
          const mapped: NotificationItem[] = logs.slice(0, 5).map((l, idx) => ({
            id: l.id || idx,
            title: `${l.action}: ${l.detail.slice(0, 45)}...`,
            time: l.time || 'Vừa xong',
            unread: idx < 2,
          }))
          setNotifications(mapped)
        } else {
          setNotifications([])
        }
      } catch {
        setNotifications([])
      }
    }
    loadNotifications()
  }, [])

  const unreadCount = notifications.filter((n) => n.unread).length

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  const roleLabel =
    role === 'admin'
      ? 'Quản trị viên'
      : role === 'teacher'
      ? 'Giảng viên'
      : 'Sinh viên'

  const roleBadgeCls =
    role === 'admin'
      ? 'bg-[#fff2dc] text-[#cc8b30] border-[#f5d98a]'
      : role === 'teacher'
      ? 'bg-[#e0f5f1] text-[#138d81] border-[#b2e0d8]'
      : 'bg-[#fbe8e2] text-[#c96d58] border-[#f4c5b5]'

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

      {/* Right: real account role badge + notifications + avatar */}
      <div className="flex items-center gap-3">
        {/* Real User Role Badge (Đã bỏ nút đổi quyền ảo theo yêu cầu) */}
        <span
          className={cn(
            'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all select-none',
            roleBadgeCls
          )}
        >
          {roleLabel}
        </span>

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
            <div className="absolute top-11 right-0 w-[300px] bg-white border border-[#e4ebeb] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.1)] z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4ebeb]">
                <span className="text-xs font-bold text-[#172b35]">Thông báo hệ thống</span>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] text-[#148f83] font-semibold hover:underline"
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-[#8b999d] hover:text-[#172b35]"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              <div className="p-3 flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Không có thông báo mới nào
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        'p-2.5 rounded-xl text-xs transition-colors',
                        n.unread
                          ? 'bg-[#f5fbf9] border border-[#dff2ee]'
                          : 'hover:bg-[#f8fafa]'
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 size={13} className="text-[#148f83] mt-0.5 flex-none" />
                        <span className="font-semibold text-[#273f47] leading-tight line-clamp-2">
                          {n.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#91a0a4] mt-0.5 block pl-5">{n.time}</span>
                    </div>
                  ))
                )}
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
          title={currentUser.fullName}
        >
          {currentUser.avatar || currentUser.fullName.slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
