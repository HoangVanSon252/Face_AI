import { useState } from 'react'
import {
  Users,
  CalendarCheck,
  Clock3,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  Search,
  Check,
  X,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import type { AttendanceLog } from '../../types'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface TeacherDashboardProps {
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
  pendingLogs,
  onApproveLog,
  onRejectLog,
  onOpenLiveSession,
  onGoToAttendance,
}: TeacherDashboardProps) {
  const [query, setQuery] = useState('')
  const { showToast } = useToast()

  const filtered = pendingLogs.filter(
    (item) =>
      item.studentName.toLowerCase().includes(query.toLowerCase()) ||
      item.studentId.toLowerCase().includes(query.toLowerCase()) ||
      item.classId.toLowerCase().includes(query.toLowerCase())
  )

  const activities = [
    { time: '08:05', title: 'Phiên điểm danh hoàn tất', desc: 'Lập trình Web - K17 · 35/42 có mặt', tone: 'teal' },
    { time: '07:58', title: 'Cần kiểm duyệt AI', desc: 'Cơ sở dữ liệu · Độ tin cậy 67%', tone: 'amber' },
    { time: '07:45', title: 'Khiếu nại mới từ sinh viên', desc: 'Trần Minh Khoa · SV20240128', tone: 'coral' },
    { time: 'Hôm qua', title: 'Báo cáo chuyên cần tháng', desc: 'Đã tổng hợp 86 phiên học', tone: 'blue' },
  ]

  return (
    <>
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Users} label="TỔNG SINH VIÊN" value="1,248" detail="↑ 4.8% so với kỳ trước" tone="teal" />
        <StatCard icon={CalendarCheck} label="ĐIỂM DANH HÔM NAY" value="94.2%" detail="↑ 2.1% so với hôm qua" tone="blue" />
        <StatCard
          icon={Clock3}
          label="CHỜ DUYỆT AI"
          value={String(pendingLogs.length).padStart(2, '0')}
          detail="Confidence 60% - 84%"
          tone="amber"
        />
        <StatCard icon={ShieldCheck} label="KHIẾU NẠI MỚI" value="04" detail="Cần phản hồi sớm" tone="coral" />
      </div>

      {/* Middle row: chart + live class */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 mb-4">
        {/* Chart */}
        <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[13px] font-bold text-[#172b35]">Tỷ lệ điểm danh</h2>
              <p className="text-[11px] text-[#8b999d] mt-0.5">Tổng quan 7 ngày học gần nhất</p>
            </div>
            <button className="flex items-center gap-1.5 text-xs text-[#6e7d82] bg-[#f5f8f8] border border-[#e4ebeb] rounded-lg px-2.5 py-1.5 hover:border-[#148f83]/40">
              7 ngày qua <ChevronDown size={13} />
            </button>
          </div>
          <MiniChart />
        </div>

        {/* Live class */}
        <div className="bg-white border border-[#e4ebeb] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[13px] font-bold text-[#172b35]">Lớp đang diễn ra</h2>
              <p className="text-[11px] text-[#8b999d] mt-0.5">Thứ tư · Phòng A-301</p>
            </div>
            <span className="flex items-center gap-1 bg-[#e0f5f1] text-[#138d81] text-[10px] font-bold px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-[#138d81] rounded-full animate-pulse" />
              LIVE
            </span>
          </div>

          <div className="bg-[#f5f8f8] border border-[#e4ebeb] rounded-xl p-3.5 mb-3">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-9 h-9 bg-[#e0f5f1] text-[#138d81] rounded-xl grid place-items-center flex-none">
                <BookOpen size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#172b35] truncate">Lập trình Web nâng cao</p>
                <p className="text-[10px] text-[#8b999d]">IT308 · Phòng A-301</p>
              </div>
              <strong className="ml-auto text-[#138d81] text-sm font-bold">83%</strong>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-[#e4ebeb] rounded-full overflow-hidden mb-2.5">
              <div className="h-full bg-[#148f83] rounded-full" style={{ width: '83%' }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#8b999d]">
              <span className="flex items-center gap-1"><Users size={12} /> 35 / 42 sinh viên có mặt</span>
              <span>08:00 — 10:00</span>
            </div>
          </div>

          <button
            onClick={onOpenLiveSession}
            className="w-full flex items-center justify-center gap-1.5 border border-[#148f83] text-[#148f83] text-xs font-semibold rounded-xl py-2.5 hover:bg-[#eaf7f5] transition-colors"
          >
            Xem chi tiết phiên điểm danh <span>→</span>
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
              <p className="text-[11px] text-[#8b999d] mt-0.5">Nhận diện confidence 60%–84% (FR-08)</p>
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
            <button className="flex items-center gap-1.5 text-xs text-[#6e7d82] bg-[#f5f8f8] border border-[#e4ebeb] rounded-xl px-3 hover:border-[#148f83]/40">
              Tất cả lớp <ChevronDown size={13} />
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#8b999d]">Không có bản ghi nào cần duyệt.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e4ebeb]">
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Sinh viên</th>
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Lớp</th>
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Thời gian</th>
                    <th className="text-left pb-2 text-[10px] font-bold text-[#a8b5b8] tracking-wide uppercase px-1">Confidence</th>
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
              <h2 className="text-[13px] font-bold text-[#172b35]">Hoạt động gần đây</h2>
              <p className="text-[11px] text-[#8b999d] mt-0.5">Cập nhật realtime</p>
            </div>
            <MoreHorizontal size={16} className="text-[#8b999d]" />
          </div>
          <div className="flex flex-col gap-0.5">
            {activities.map((item) => (
              <div key={item.time + item.title} className="flex items-start gap-3 py-2.5 border-b border-[#f0f4f4] last:border-0">
                <div className={cn('w-2 h-2 rounded-full mt-1 flex-none', TONE_DOT[item.tone])} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#172b35] leading-tight">{item.title}</p>
                  <p className="text-[10.5px] text-[#6e7d82] mt-0.5 truncate">{item.desc}</p>
                </div>
                <time className="text-[10px] text-[#a8b5b8] flex-none">{item.time}</time>
              </div>
            ))}
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
        <p className="text-[10px] text-[#8b999d] mt-0.5">{detail}</p>
      </div>
    </div>
  )
}

function MiniChart() {
  const bars = [88, 94, 91, 96, 89, 93, 97]
  const days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
  return (
    <div className="flex flex-col gap-3">
      {/* SVG area chart */}
      <div className="h-[130px] relative">
        <svg viewBox="0 0 600 180" preserveAspectRatio="none" className="w-full h-full" aria-label="Biểu đồ tỷ lệ điểm danh">
          <path
            d="M0,76 C40,68 48,92 86,81 S139,54 171,67 S210,83 257,61 S303,45 342,57 S392,31 428,47 S470,65 514,43 S555,34 600,26 V180 H0Z"
            fill="rgba(20, 143, 131, 0.12)"
          />
          <path
            d="M0,76 C40,68 48,92 86,81 S139,54 171,67 S210,83 257,61 S303,45 342,57 S392,31 428,47 S470,65 514,43 S555,34 600,26"
            fill="none"
            stroke="#148f83"
            strokeWidth="2.5"
          />
        </svg>
      </div>
      {/* Bar labels + values */}
      <div className="grid grid-cols-7 gap-1">
        {bars.map((val, i) => (
          <div key={days[i]} className="flex flex-col items-center gap-1">
            <div className="h-12 w-full flex items-end">
              <div
                className="w-full rounded-t-[3px] bg-[#148f83]/20 hover:bg-[#148f83]/40 transition-colors"
                style={{ height: `${val}%` }}
              />
            </div>
            <span className="text-[9px] text-[#a8b5b8] font-medium">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
