import { useState, useEffect } from 'react'
import {
  CalendarCheck,
  Clock3,
  BookOpen,
  ShieldCheck,
  Camera,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import type { User, ClassItem, AttendanceLog, ComplaintRequest } from '../../types'
import { classService, attendanceService, complaintService } from '../../services/api'
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
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [complaints, setComplaints] = useState<ComplaintRequest[]>([])
  useEffect(() => {
    const loadRealStudentData = async () => {
      try {
        const [clsRes, logRes, cmpRes] = await Promise.all([
          classService.getClasses().catch(() => []),
          attendanceService.getStudentLogs(currentUser.userId).catch(() => []),
          complaintService.getStudentComplaints(currentUser.userId).catch(() => []),
        ])
        setClasses(clsRes)
        setLogs(logRes)
        setComplaints(cmpRes)
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu sinh viên:', err)
      }
    }
    loadRealStudentData()
  }, [currentUser.userId])

  // Dynamic calculations
  const totalLogs = logs.length
  const presentCount = logs.filter((l) => l.status === 'present').length
  const attendanceRate = totalLogs > 0 ? Math.round((presentCount / totalLogs) * 100) : 100
  const pendingComplaints = complaints.filter((c) => c.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarCheck}
          label="TỶ LỆ CHUYÊN CẦN"
          value={`${attendanceRate}%`}
          detail={totalLogs > 0 ? `Tính trên ${totalLogs} buổi điểm danh` : 'Chưa có buổi điểm danh nào'}
          tone="teal"
          trend={attendanceRate >= 90 ? 'Đạt chuẩn' : 'Cần chú ý'}
        />
        <StatCard
          icon={Clock3}
          label="BUỔI CÓ MẶT"
          value={String(presentCount).padStart(2, '0')}
          detail={`Trên tổng số ${totalLogs} buổi học đã ghi nhận`}
          tone="blue"
        />
        <StatCard
          icon={BookOpen}
          label="LỚP HỌC KỲ NÀY"
          value={String(classes.length).padStart(2, '0')}
          detail="Học phần đăng ký trong học kỳ"
          tone="amber"
        />
        <StatCard
          icon={ShieldCheck}
          label="KHIẾU NẠI ĐIỂM DANH"
          value={String(pendingComplaints).padStart(2, '0')}
          detail="Xem trạng thái khiếu nại →"
          tone="coral"
          onClick={onGoToComplaints}
        />
      </section>

      {/* Main Grid: Class Schedule & Attendance Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Classes list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-800">Danh sách lớp học phần</h2>
              <p className="text-xs text-slate-500 mt-0.5">Dữ liệu đăng ký học kỳ FA26 từ cơ sở dữ liệu</p>
            </div>
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
              {classes.length} Lớp học phần
            </span>
          </div>

          <div className="p-5 divide-y divide-slate-100">
            {classes.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-600">Bạn chưa được ghi danh vào lớp học phần nào.</p>
                <p className="text-[11px] text-slate-400 mt-1">Vui lòng liên hệ phòng đào tạo hoặc giảng viên quản lý.</p>
              </div>
            ) : (
              classes.map((cls) => {
                const classLogs = logs.filter((l) => l.classId === cls.classId)
                const classPresent = classLogs.filter((l) => l.status === 'present').length
                const classRate = classLogs.length > 0 ? Math.round((classPresent / classLogs.length) * 100) : 100

                return (
                  <div
                    key={cls.id || cls.classId}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-4 hover:bg-slate-50/50 p-2 rounded-lg transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0 mt-0.5">
                      <BookOpen size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{cls.className}</h3>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span className="font-mono text-slate-600 font-medium">{cls.classId}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1"><MapPin size={12} /> {cls.room || 'Phòng học tiêu chuẩn'}</span>
                        <span>·</span>
                        <span>{cls.teacherName || 'Giảng viên phụ trách'}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                      <CheckCircle2 size={13} />
                      {classLogs.length > 0 ? `Chuyên cần: ${classRate}%` : 'Sẵn sàng'}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Attendance Summary */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800">Tóm tắt chuyên cần</h2>
              <p className="text-xs text-slate-500 mt-0.5">Tổng quan học kỳ hiện tại</p>
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
                    strokeDasharray={`${attendanceRate}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-slate-800">{attendanceRate}%</span>
                  <span className="text-[11px] font-medium text-slate-400">Tỷ lệ có mặt</span>
                </div>
              </div>
            </div>

            {/* Bars for registered classes */}
            <div className="space-y-3 pt-2">
              {classes.slice(0, 3).map((cls) => {
                const classLogs = logs.filter((l) => l.classId === cls.classId)
                const classPresent = classLogs.filter((l) => l.status === 'present').length
                const rate = classLogs.length > 0 ? Math.round((classPresent / classLogs.length) * 100) : 100

                return (
                  <div key={cls.id || cls.classId}>
                    <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                      <span className="truncate pr-2">{cls.className}</span>
                      <span className="text-teal-600 font-semibold">{rate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-teal-500 h-full rounded-full" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                )
              })}
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
              : 'Hãy đăng ký mẫu ảnh khuôn mặt qua webcam để hệ thống tự động nhận diện và điểm danh khi vào lớp.'}
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
