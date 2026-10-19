import { useState } from 'react'
import {
  CalendarCheck,
  LayoutDashboard,
  Camera,
  BookOpen,
  FileBarChart,
  ShieldCheck,
  Users,
  Zap,
  X,
  LogOut,
  Sliders,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import type { Role, View, User } from '../../types'
import { Modal } from '../common/Modal'
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
    { label: 'Nhật ký kiểm toán', icon: FileBarChart },
  ],
  teacher: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Môn học', icon: BookOpen },
    { label: 'Lớp học', icon: BookOpen },
    { label: 'Điểm danh', icon: CalendarCheck },
    { label: 'Khiếu nại', icon: ShieldCheck },
    { label: 'Báo cáo', icon: FileBarChart },
    { label: 'Nhật ký kiểm toán', icon: ShieldCheck },
  ],
  admin: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Người dùng', icon: Users },
    { label: 'Môn học', icon: BookOpen },
    { label: 'Lớp học', icon: BookOpen },
    { label: 'Điểm danh', icon: CalendarCheck },
    { label: 'Khiếu nại', icon: ShieldCheck },
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

  // AI Parameters Modal State (Thay thế alert bằng Modal chuyên nghiệp)
  const [showAiModal, setShowAiModal] = useState(false)
  const [autoApproveScore, setAutoApproveScore] = useState(80)
  const [reviewScore, setReviewScore] = useState(60)
  const [livenessScore, setLivenessScore] = useState(80)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSaveAiParams = (e: React.FormEvent) => {
    e.preventDefault()
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      setShowAiModal(false)
    }, 1000)
  }

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

        {/* Academic Institution Badge */}
        <div className="flex items-center gap-2.5 px-3 py-2 mx-3 mt-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="w-7 h-7 rounded-lg bg-teal-700 text-white grid place-items-center text-[10px] font-extrabold flex-none">
            EDU
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 truncate">Học viện Công nghệ Bưu Chính Viễn Thông</p>
            <p className="text-[10px] text-teal-700 font-medium truncate">Khoa Công nghệ Thông tin</p>
          </div>
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
            onClick={() => setShowAiModal(true)}
          >
            <Sliders size={15} />
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
              Nhận diện realtime · InsightFace 512D · Auto &ge;80%
            </p>
          </div>

          {/* Profile (Hiển thị tên thật từ CSDL, không bị lỗi hiển thị) */}
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

      {/* Modal Cài đặt tham số AI (Thay thế Alert) */}
      <Modal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        title="Cài đặt tham số nhận diện Face AI"
        maxWidth="520px"
      >
        <form onSubmit={handleSaveAiParams} className="space-y-4 text-xs">
          <p className="text-slate-500 text-xs">
            Cấu hình các ngưỡng độ tin cậy so khớp vector khuôn mặt (ArcFace 512D) và thuật toán chống giả mạo (Liveness).
          </p>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>Ngưỡng tự động duyệt (Auto-Approve):</span>
                <span className="text-teal-700 font-bold">&ge; {autoApproveScore}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="98"
                value={autoApproveScore}
                onChange={(e) => setAutoApproveScore(Number(e.target.value))}
                className="w-full accent-teal-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">
                Khuôn mặt có độ tin cậy từ {autoApproveScore}% trở lên sẽ được tự động ghi nhận có mặt.
              </span>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>Ngưỡng chuyển hàng đợi duyệt (Review Queue):</span>
                <span className="text-amber-700 font-bold">{reviewScore}% - {autoApproveScore - 1}%</span>
              </div>
              <input
                type="range"
                min="40"
                max="80"
                value={reviewScore}
                onChange={(e) => setReviewScore(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">
                Các bản ghi trong khoảng này sẽ vào hàng đợi chờ Giảng viên phê duyệt thủ công.
              </span>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>Ngưỡng chống giả mạo (Anti-Spoofing / Liveness):</span>
                <span className="text-teal-700 font-bold">&ge; {livenessScore}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={livenessScore}
                onChange={(e) => setLivenessScore(Number(e.target.value))}
                className="w-full accent-teal-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">
                Bảo vệ chống gian lận ảnh chụp điện thoại hoặc video phát lại.
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-600 text-[11px]">
            <p><strong>Mô hình trích xuất:</strong> InsightFace MobileFaceNet / ArcFace 512D</p>
            <p><strong>Dung lượng vector:</strong> 512 float32 (~2KB / khuôn mặt)</p>
            <p><strong>Khoảng cách so khớp:</strong> Cosine Similarity Metric</p>
          </div>

          {savedSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>Đã lưu cấu hình tham số AI thành công!</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAiModal(false)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-xs"
            >
              Lưu cấu hình
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
