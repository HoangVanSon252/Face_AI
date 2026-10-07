import {
  Users,
  CalendarCheck,
  Clock3,
  ShieldCheck,
  Activity,
  Database,
  Server,
  Cpu,
  ArrowRight,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface AdminDashboardProps {
  onGoToUsers: () => void
  onGoToAuditLogs: () => void
}

export function AdminDashboard({ onGoToUsers, onGoToAuditLogs }: AdminDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Admin Stat Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="TỔNG NGƯỜI DÙNG"
          value="1,486"
          detail="1,248 SV · 182 GV · 56 QTV"
          tone="teal"
          trend="+12 tuần này"
        />
        <StatCard
          icon={CalendarCheck}
          label="PHIÊN HÔM NAY"
          value="86"
          detail="82 phiên đã đóng an toàn"
          tone="blue"
        />
        <StatCard
          icon={Clock3}
          label="ĐỘ ỔN ĐỊNH HỆ THỐNG"
          value="99.8%"
          detail="Không ghi nhận sự cố lớn"
          tone="amber"
        />
        <StatCard
          icon={Activity}
          label="WS REALTIME"
          value="42"
          detail="Kết nối đồng thời đang mở"
          tone="coral"
        />
      </section>

      {/* Main Row: Service Health & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Health */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="border-b border-slate-100 pb-4 mb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-800">Sức khỏe dịch vụ & hạ tầng AI</h2>
              <p className="text-xs text-slate-500 mt-0.5">Giám sát thời gian thực (Heartbeat & Latency)</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Tất cả dịch vụ xanh
            </span>
          </div>

          <div className="space-y-4">
            {/* Service 1 */}
            <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-2 font-semibold">
                  <Server size={15} className="text-teal-600" /> API Gateway (FastAPI)
                </span>
                <span className="text-slate-500">99.9% · 28ms</span>
              </div>
              <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                <div className="bg-teal-600 h-full rounded-full" style={{ width: '99%' }} />
              </div>
            </div>

            {/* Service 2 */}
            <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-2 font-semibold">
                  <Cpu size={15} className="text-teal-600" /> AI Face Recognition (ArcFace 512D)
                </span>
                <span className="text-slate-500">98.7% · 112ms</span>
              </div>
              <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                <div className="bg-teal-600 h-full rounded-full" style={{ width: '96%' }} />
              </div>
            </div>

            {/* Service 3 */}
            <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-2 font-semibold">
                  <Database size={15} className="text-teal-600" /> MySQL 8.0 & Redis Cache
                </span>
                <span className="text-slate-500">100% · Kết nối ổn định</span>
              </div>
              <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                <div className="bg-teal-600 h-full rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Department Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="border-b border-slate-100 pb-4 mb-4">
            <h2 className="text-base font-bold text-slate-800">Phân bổ sinh viên theo khoa</h2>
            <p className="text-xs text-slate-500 mt-0.5">Tổng số sinh viên có dữ liệu sinh trắc học</p>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <span className="text-sm font-medium text-slate-800 block">Công nghệ thông tin</span>
                <span className="text-xs text-slate-400">SE · IA · AI · CS</span>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                486 sinh viên
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <span className="text-sm font-medium text-slate-800 block">Quản trị kinh doanh & Marketing</span>
                <span className="text-xs text-slate-400">BA · IB · Digital Marketing</span>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                352 sinh viên
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <span className="text-sm font-medium text-slate-800 block">Thiết kế mỹ thuật số & Đồ họa</span>
                <span className="text-xs text-slate-400">GD · UI/UX Design</span>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                214 sinh viên
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <span className="text-sm font-medium text-slate-800 block">Ngôn ngữ quốc tế</span>
                <span className="text-xs text-slate-400">Tiếng Anh · Nhật · Hàn</span>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                196 sinh viên
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Action Card */}
      <div className="bg-linear-to-r from-slate-900 to-slate-800 text-white p-6 rounded-xl border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Trung tâm quản trị hệ thống (Admin Control Center)</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Quản lý danh sách người dùng, phân quyền vai trò (RBAC), cấu hình ngưỡng nhận diện khuôn mặt và tra cứu nhật ký kiểm toán hệ thống.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
          <button
            onClick={onGoToUsers}
            className="flex-1 md:flex-initial px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition shadow-sm inline-flex items-center justify-center gap-1.5"
          >
            Quản lý người dùng <ArrowRight size={14} />
          </button>
          <button
            onClick={onGoToAuditLogs}
            className="flex-1 md:flex-initial px-4 py-2.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white transition border border-white/15 inline-flex items-center justify-center gap-1.5"
          >
            Nhật ký kiểm toán <ArrowRight size={14} />
          </button>
        </div>
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
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: 'teal' | 'blue' | 'amber' | 'coral'
  trend?: string
}) {
  const toneMap = {
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-100' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
    coral: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' },
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs hover:border-slate-300 transition-all flex items-start gap-3.5">
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
