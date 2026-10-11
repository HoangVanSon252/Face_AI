import { useState, useEffect } from 'react'
import {
  Users,
  CalendarCheck,
  Clock3,
  ShieldCheck,
  BookOpen,
  Search,
  Check,
  X,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import type { AttendanceLog, AttendanceSession, ClassItem, ComplaintRequest, AuditLog, User } from '../../types'
import { classService, sessionService, complaintService, auditService } from '../../services/api'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface TeacherDashboardProps {
  currentUser?: User
  pendingLogs: AttendanceLog[]
  onApproveLog: (id: number) => void
  onRejectLog: (id: number) => void
  onOpenLiveSession: () => void
  onGoToAttendance: () => void
}

const TONE_ICON: Record<string, string> = {
  teal: 'bg-[#e0f5f1] text-[#138d81]',
  blue: 'bg-[#e7effb] text-[#527db8]',
  amber: 'bg-[#fff2dc] text-[#cc8b30]',
  coral: 'bg-[#fbe8e2] text-[#c96d58]',
}

const TONE_DOT: Record<string, string> = {
  teal: 'bg-[#138d81]',
  blue: 'bg-[#527db8]',
  amber: 'bg-[#cc8b30]',
  coral: 'bg-[#c96d58]',
}

export function TeacherDashboard({
  currentUser,
  pendingLogs,
  onApproveLog,
  onRejectLog,
  onOpenLiveSession,
  onGoToAttendance,
}: TeacherDashboardProps) {
  const [query, setQuery] = useState('')
  const { showToast } = useToast()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [complaints, setComplaints] = useState<ComplaintRequest[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  useEffect(() => {
    const loadRealData = async () => {
      try {
        const [clsRes, sesRes, cmpRes, logRes] = await Promise.all([
          classService.getClasses().catch(() => []),
          sessionService.getSessions().catch(() => []),
          complaintService.getComplaints().catch(() => []),
          auditService.getLogs().catch(() => []),
        ])
        setClasses(clsRes)
        setSessions(sesRes)
        setComplaints(cmpRes)
        setAuditLogs(logRes)
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu giảng viên:', err)
      }
    }
    loadRealData()
  }, [])

  const filtered = pendingLogs.filter(
    (item) =>
      item.studentName.toLowerCase().includes(query.toLowerCase()) ||
      item.studentId.toLowerCase().includes(query.toLowerCase()) ||
      item.classId.toLowerCase().includes(query.toLowerCase())
  )

  // Dynamic calculations
  const totalStudents = classes.reduce((acc, c) => acc + (c.studentCount || 0), 0)
  const activeSession = sessions.find((s) => s.status === 'active')
  const pendingComplaints = complaints.filter((c) => c.status === 'pending').length

  const activities = auditLogs.slice(0, 5).map((l, idx) => ({
    time: l.time || 'Vừa xong',
    title: l.action,
    desc: `${l.actor}: ${l.detail}`,
    tone: idx % 3 === 0 ? 'teal' : idx % 3 === 1 ? 'blue' : 'amber',
  }))

  return (
    <>
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          icon={Users}
          label="TỔNG SINH VIÊN"
          value={totalStudents > 0 ? totalStudents.toLocaleString() : `${classes.length} Lớp`}
          detail={`Thuộc ${classes.length} lớp học phần phụ trách`}
          tone="teal"
        />
        <StatCard
          icon={CalendarCheck}
          label="PHIÊN ĐIỂM DANH"
          value={String(sessions.length).padStart(2, '0')}
          detail={activeSession ? `1 phiên đang mở (${activeSession.classId})` : 'Chưa có phiên nào đang mở'}
          tone="blue"
        />
        <StatCard
          icon={Clock3}
          label="CHỜ DUYỆT AI"
          value={String(pendingLogs.length).padStart(2, '0')}
          detail="Độ tin cậy 60% - 84%"
          tone="amber"
        />
        <StatCard
          icon={ShieldCheck}
          label="KHIẾU NẠI MỚI"
          value={String(pendingComplaints).padStart(2, '0')}
          detail="Cần phản hồi từ sinh viên"
          tone="coral"
        />
      </div>

      {/* Middle row: chart + live class */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 mb-4">
        {/* Chart */}
        <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[13px] font-bold text-[#172b35]">Tổng quan lớp học & phiên</h2>
              <p className="text-[11px] text-[#8b999d] mt-0.5">
                Dữ liệu thực tế từ cơ sở dữ liệu hệ thống{currentUser?.fullName ? ` · Giảng viên: ${currentUser.fullName}` : ''}
              </p>
            </div>
            <span className="text-xs font-semibold text-[#148f83] bg-[#e0f5f1] px-2.5 py-1 rounded-md">
              {classes.length} Lớp học phần
            </span>
          </div>

          {classes.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <BookOpen size={32} className="text-slate-300 mb-2" />
              <p className="text-xs font-medium">Chưa có lớp học phần nào được tạo.</p>
              <p className="text-[11px] text-slate-400 mt-1">Admin có thể thêm lớp mới trong mục "Lớp học".</p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {classes.slice(0, 4).map((cls) => {
                const classSessions = sessions.filter((s) => s.classId === cls.classId)
                const percent = cls.maxStudents > 0 ? Math.min(100, Math.round((cls.studentCount / cls.maxStudents) * 100)) : 0
                return (
                  <div key={cls.id || cls.classId} className="p-3 bg-[#f8fafc] rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="font-semibold text-slate-800">
                        {cls.className} <span className="text-slate-400 font-mono text-[11px]">({cls.classId})</span>
                      </div>
                      <span className="font-bold text-teal-700">{cls.studentCount} / {cls.maxStudents} SV ({percent}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600 rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5">
                      <span>Phòng: {cls.room || 'Phòng học tiêu chuẩn'}</span>
                      <span>Đã tạo: {classSessions.length} phiên</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Live class card */}
        <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[13px] font-bold text-[#172b35]">Phiên điểm danh</h2>
                <p className="text-[11px] text-[#8b999d] mt-0.5">Trạng thái thời gian thực</p>
              </div>
              {activeSession ? (
                <span className="flex items-center gap-1 bg-[#e0f5f1] text-[#138d81] text-[10px] font-bold px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-[#138d81] rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold px-2 py-1 rounded-full">
                  CLOSED
                </span>
              )}
            </div>

            {activeSession ? (
              <div className="bg-[#f5f8f8] border border-[#e4ebeb] rounded-xl p-3.5 mb-3">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-9 h-9 bg-[#e0f5f1] text-[#138d81] rounded-xl grid place-items-center flex-none">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#172b35] truncate">{activeSession.className}</p>
                    <p className="text-[10px] text-[#8b999d]">{activeSession.classId} · {activeSession.room}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#8b999d] mt-2 pt-2 border-t border-slate-200">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {activeSession.presentCount} / {activeSession.totalEnrolled} SV có mặt
                  </span>
                  <span>{activeSession.startTime} — {activeSession.endTime}</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center my-3">
                <BookOpen size={24} className="mx-auto text-slate-300 mb-1.5" />
                <p className="text-xs font-medium text-slate-700">Chưa có phiên nào đang mở</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Mở phiên điểm danh để bắt đầu quét nhận diện AI.</p>
              </div>
            )}
          </div>

          <button
            onClick={onOpenLiveSession}
            className="w-full flex items-center justify-center gap-1.5 border border-[#148f83] text-[#148f83] text-xs font-semibold rounded-xl py-2.5 hover:bg-[#eaf7f5] transition-colors mt-2"
          >
            {activeSession ? 'Xem chi tiết phiên điểm danh' : 'Mở phiên điểm danh mới'} <span>→</span>
          </button>
        </div>
      </div>

      {/* Bottom: pending + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
        {/* Pending AI review */}
        <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[13px] font-bold text-[#172b35]">Hàng chờ duyệt AI (Review Queue)</h2>
              <p className="text-[11px] text-[#8b999d] mt-0.5">Nhận diện độ tin cậy 60%–84% (FR-08)</p>
            </div>
            <button onClick={onGoToAttendance} className="text-xs text-[#148f83] font-semibold hover:underline">
              Xem tất cả →
            </button>
          </div>

          {/* Search */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-[#f5f8f8] border border-[#e4ebeb] rounded-xl px-3 py-2">
              <Search size={14} className="text-[#a8b5b8] flex-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm sinh viên theo tên hoặc MSSV..."
                className="flex-1 text-xs bg-transparent outline-none text-[#172b35] placeholder:text-[#b0bec2]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#8b999d]">
                Không có bản ghi nào trong hàng đợi cần duyệt thủ công.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e4ebeb]">
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Sinh viên</th>
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Lớp</th>
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Thời gian</th>
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Độ tin cậy</th>
                    <th className="text-center pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-[#f0f4f4] hover:bg-[#fafcfc]">
                      <td className="py-2.5 px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#e0f5f1] text-[#138d81] text-[10px] font-bold grid place-items-center flex-none">
                            {item.studentName.split(' ').slice(-1)[0][0]}
                          </div>
                          <div>
                            <p className="font-semibold text-[#172b35] leading-tight">{item.studentName}</p>
                            <p className="text-[10px] text-[#8b999d]">{item.studentId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-1 text-[#4a5d65]">{item.classId}</td>
                      <td className="py-2.5 px-1 text-[#6e7d82]">{item.checkInTime}</td>
                      <td className="py-2.5 px-1">
                        <span className="bg-[#fff2dc] text-[#cc8b30] font-bold text-[10px] px-1.5 py-0.5 rounded-md">
                          {item.confidenceScore.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { onApproveLog(item.id); showToast(`Đã duyệt: ${item.studentName}`, 'success') }}
                            className="w-7 h-7 grid place-items-center rounded-lg bg-[#e0f5f1] text-[#138d81] hover:bg-[#148f83] hover:text-white transition-colors"
                            title="Chấp thuận"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => { onRejectLog(item.id); showToast(`Đã từ chối: ${item.studentName}`, 'error') }}
                            className="w-7 h-7 grid place-items-center rounded-lg bg-[#fbe8e2] text-[#c96d58] hover:bg-[#c96d58] hover:text-white transition-colors"
                            title="Từ chối"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Activity feed */}
        <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[13px] font-bold text-[#172b35]">Nhật ký hệ thống</h2>
              <p className="text-[11px] text-[#8b999d] mt-0.5">Sự kiện kiểm toán thực</p>
            </div>
            <MoreHorizontal size={16} className="text-[#8b999d]" />
          </div>
          <div className="flex flex-col gap-0.5">
            {activities.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Chưa có nhật ký ghi nhận.</p>
            ) : (
              activities.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 py-2.5 border-b border-[#f0f4f4] last:border-0">
                  <div className={cn('w-2 h-2 rounded-full mt-1 flex-none', TONE_DOT[item.tone])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#172b35] leading-tight">{item.title}</p>
                    <p className="text-[10.5px] text-[#6e7d82] mt-0.5 truncate">{item.desc}</p>
                  </div>
                  <time className="text-[10px] text-[#a8b5b8] flex-none">{item.time}</time>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({ icon: Icon, label, value, detail, tone }: {
  icon: LucideIcon; label: string; value: string; detail: string; tone: string
}) {
  return (
    <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-4 flex items-start gap-3">
      <div className={cn('w-9 h-9 rounded-xl grid place-items-center flex-none', TONE_ICON[tone])}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold text-[#a8b5b8] tracking-widest uppercase">{label}</p>
        <p className="text-2xl font-black text-[#172b35] leading-tight mt-0.5">{value}</p>
        <p className="text-[10px] text-[#8b999d] mt-0.5 truncate">{detail}</p>
      </div>
    </div>
  )
}
