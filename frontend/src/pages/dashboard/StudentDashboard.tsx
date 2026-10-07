import {
  CalendarCheck,
  Clock3,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  Camera,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import type { User } from '../../types'
import { cn } from '../../lib/utils'

interface StudentDashboardProps {
  currentUser: User
  onGoToFaceRegistration: () => void
  onGoToComplaints: () => void
}

export function StudentDashboard({
  currentUser,
  onGoToFaceRegistration,
  onGoToComplaints,
}: StudentDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarCheck}
          label="ĐIỂM DANH THÁNG NÀY"
          value="96.4%"
          detail="Tốt hơn 3.2% tháng trước"
          tone="teal"
          trend="+3.2%"
        />
        <StatCard
          icon={Clock3}
          label="CÓ MẶT"
          value="27"
          detail="Trên tổng số 28 buổi học"
          tone="blue"
        />
        <StatCard
          icon={BookOpen}
          label="LỚP HÔM NAY"
          value="03"
          detail="Buổi học tiếp theo 13:30"
          tone="amber"
        />
        <StatCard
          icon={ShieldCheck}
          label="KHIẾU NẠI"
          value="01"
          detail="Xem đơn đang chờ duyệt →"
          tone="coral"
          onClick={onGoToComplaints}
        />
      </section>

      {/* Main Grid: Today's Schedule & Attendance Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schedule List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-800">Lịch học hôm nay</h2>
              <p className="text-xs text-slate-500 mt-0.5">Thứ tư · 11 tháng 09, 2026</p>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors">
              Hôm nay <ChevronDown size={14} />
            </button>
          </div>

          <div className="p-5 divide-y divide-slate-100">
            {/* Session 1 */}
            <div className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-4 hover:bg-slate-50/50 p-2 rounded-lg transition-colors">
              <div className="text-center w-14 shrink-0 bg-slate-50 py-1.5 rounded-md border border-slate-100">
                <span className="text-xs font-bold text-slate-800 block">08:00</span>
                <span className="text-[11px] text-slate-400">10:00</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0 mt-0.5">
                <BookOpen size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 truncate">Lập trình Web nâng cao</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                  <span className="font-mono text-slate-600">IT308</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><MapPin size={12} /> Phòng A-301</span>
                  <span>·</span>
                  <span>Cô Nguyễn Thị Lan</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                <CheckCircle2 size={13} />
                Đã điểm danh (98.4%)
              </span>
            </div>

            {/* Session 2 */}
            <div className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-4 hover:bg-slate-50/50 p-2 rounded-lg transition-colors">
              <div className="text-center w-14 shrink-0 bg-slate-50 py-1.5 rounded-md border border-slate-100">
                <span className="text-xs font-bold text-slate-800 block">13:30</span>
                <span className="text-[11px] text-slate-400">15:30</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                <BookOpen size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 truncate">Cơ sở dữ liệu nâng cao</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                  <span className="font-mono text-slate-600">IT204</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><MapPin size={12} /> Phòng B-202</span>
                  <span>·</span>
                  <span>Cô Nguyễn Thị Lan</span>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
                Sắp tới
              </span>
            </div>

            {/* Session 3 */}
            <div className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-4 hover:bg-slate-50/50 p-2 rounded-lg transition-colors">
              <div className="text-center w-14 shrink-0 bg-slate-50 py-1.5 rounded-md border border-slate-100">
                <span className="text-xs font-bold text-slate-800 block">16:00</span>
                <span className="text-[11px] text-slate-400">18:00</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                <BookOpen size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 truncate">Kỹ năng nghề nghiệp</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                  <span className="font-mono text-slate-600">SS101</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><MapPin size={12} /> Phòng C-105</span>
                  <span>·</span>
                  <span>Thầy Trần Văn Hùng</span>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                Chưa diễn ra
              </span>
            </div>
          </div>
        </div>

        {/* Attendance Summary */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800">Tóm tắt chuyên cần</h2>
              <p className="text-xs text-slate-500 mt-0.5">Học kỳ Fall 2026</p>
            </div>

            {/* Circular Progress Display */}
            <div className="flex flex-col items-center justify-center my-4 py-3">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-teal-600 transition-all duration-1000 ease-out"
                    strokeDasharray="96, 100"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-slate-800">96%</span>
                  <span className="text-[11px] font-medium text-slate-400">Tỷ lệ có mặt</span>
                </div>
              </div>
            </div>

            {/* Bars */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Lập trình Web</span>
                  <span className="text-teal-600 font-semibold">98%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-teal-500 h-full rounded-full" style={{ width: '98%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Cơ sở dữ liệu</span>
                  <span className="text-teal-600 font-semibold">94%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-teal-500 h-full rounded-full" style={{ width: '94%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Kỹ năng nghề nghiệp</span>
                  <span className="text-teal-600 font-semibold">96%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-teal-500 h-full rounded-full" style={{ width: '96%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Face Registration Callout Banner */}
      <div
        className={cn(
          'p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center gap-4 transition-all',
          currentUser.hasFaceRegistered
            ? 'bg-teal-50/70 border-teal-200/80 text-teal-900'
            : 'bg-amber-50/80 border-amber-200 text-amber-900'
        )}
      >
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs',
            currentUser.hasFaceRegistered ? 'bg-teal-600 text-white' : 'bg-amber-500 text-white'
          )}
        >
          {currentUser.hasFaceRegistered ? <CheckCircle2 size={24} /> : <Camera size={24} />}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold">
            {currentUser.hasFaceRegistered
              ? 'Dữ liệu khuôn mặt đã được kích hoạt & sẵn sàng'
              : 'Bạn chưa hoàn tất đăng ký nhận diện khuôn mặt'}
          </h3>
          <p className="text-xs mt-1 text-slate-600 leading-relaxed">
            {currentUser.hasFaceRegistered
              ? 'Đặc trưng sinh trắc học 512D sẵn sàng điểm danh tự động khi bước vào lớp học.'
              : 'Hãy đăng ký 5–10 mẫu ảnh khuôn mặt qua webcam để hệ thống tự động nhận diện và điểm danh khi vào lớp.'}
          </p>
        </div>
        <button
          onClick={onGoToFaceRegistration}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg shrink-0 transition shadow-xs',
            currentUser.hasFaceRegistered
              ? 'bg-teal-700 text-white hover:bg-teal-800'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          )}
        >
          {currentUser.hasFaceRegistered ? 'Cập nhật khuôn mặt' : 'Đăng ký ngay'}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  trend,
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: 'teal' | 'blue' | 'amber' | 'coral'
  trend?: string
  onClick?: () => void
}) {
  const toneMap = {
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-100' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
    coral: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' },
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs hover:border-slate-300 transition-all flex items-start gap-3.5',
        onClick && 'cursor-pointer hover:shadow-md'
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border',
          toneMap[tone].bg,
          toneMap[tone].text,
          toneMap[tone].border
        )}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">{label}</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-black text-slate-800 tracking-tight">{value}</span>
          {trend && (
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp size={12} /> {trend}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1 truncate">{detail}</p>
      </div>
    </div>
  )
}
