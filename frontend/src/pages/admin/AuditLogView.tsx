import { useState, useEffect } from 'react'
import { ChevronDown, Search, ShieldCheck, Calendar, Activity } from 'lucide-react'
import type { AuditLog } from '../../types'
import { auditService } from '../../services/api'
import { cn } from '../../lib/utils'

export function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    const fetchLogs = async () => {
      const data = await auditService.getLogs()
      setLogs(data)
    }
    fetchLogs()
  }, [])

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(query.toLowerCase()) ||
      l.actor.toLowerCase().includes(query.toLowerCase()) ||
      l.detail.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            KIỂM TOÁN & GIÁM SÁT AN TOÀN (AUDIT LOGS)
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">Nhật ký kiểm toán hệ thống</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi mọi hành vi nhạy cảm: phân quyền RBAC, khóa tài khoản, duyệt kết quả AI và đăng ký sinh trắc học.
          </p>
        </div>

        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs hover:bg-slate-50 transition">
          <Calendar size={14} className="text-teal-600" /> Hôm nay <ChevronDown size={14} />
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Tìm theo hành động, người thực hiện..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
          <ShieldCheck size={16} />
          Đã ghi nhận {logs.length} sự kiện kiểm toán bảo mật
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Không tìm thấy sự kiện kiểm toán nào phù hợp.
          </div>
        ) : (
          filtered.map((item) => {
            const toneDot =
              item.tone === 'teal'
                ? 'bg-teal-500 ring-teal-100'
                : item.tone === 'blue'
                ? 'bg-blue-500 ring-blue-100'
                : item.tone === 'amber'
                ? 'bg-amber-500 ring-amber-100'
                : 'bg-rose-500 ring-rose-100'

            return (
              <div
                key={item.id}
                className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <span className={cn('w-2.5 h-2.5 rounded-full ring-4 shrink-0 mt-1.5', toneDot)} />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-800">{item.action}</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.detail}</p>
                    <div className="text-[11px] text-teal-700 font-semibold mt-1 flex items-center gap-1">
                      <Activity size={12} />
                      Thực hiện bởi: <span className="font-bold">{item.actor}</span>
                    </div>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-slate-400 shrink-0 whitespace-nowrap">
                  {item.time}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
