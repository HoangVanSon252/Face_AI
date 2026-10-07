import { useState, useEffect } from 'react'
import {
  ChevronDown,
  Search,
  Eye,
  Calendar,
  UserCheck,
  Clock,
  XCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { AttendanceLog, Role, User } from '../../types'
import { attendanceService } from '../../services/api'
import { Modal } from '../../components/common/Modal'
import { cn } from '../../lib/utils'

interface AttendanceHistoryViewProps {
  role: Role
  currentUser: User
}

export function AttendanceHistoryView({ role, currentUser }: AttendanceHistoryViewProps) {
  const isStudent = role === 'student'
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all')
  const [selectedLog, setSelectedLog] = useState<AttendanceLog | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)

  useEffect(() => {
    const fetchLogs = async () => {
      const all = await attendanceService.getLogs()
      if (isStudent) {
        setLogs(all.filter((l) => l.studentId === currentUser.userId))
      } else {
        setLogs(all)
      }
    }
    fetchLogs()
  }, [isStudent, currentUser.userId])

  const filteredLogs = logs.filter((log) => {
    const matchQuery =
      log.studentName.toLowerCase().includes(query.toLowerCase()) ||
      log.studentId.toLowerCase().includes(query.toLowerCase()) ||
      log.classId.toLowerCase().includes(query.toLowerCase())
    const matchStatus = statusFilter === 'all' || log.status === statusFilter
    return matchQuery && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const startIndex = (currentPage - 1) * pageSize
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize)

  const handleQueryChange = (val: string) => {
    setQuery(val)
    setCurrentPage(1)
  }

  const handleStatusFilterChange = (val: 'all' | 'present' | 'late' | 'absent') => {
    setStatusFilter(val)
    setCurrentPage(1)
  }

  const presentCount = logs.filter((l) => l.status === 'present').length
  const lateCount = logs.filter((l) => l.status === 'late').length
  const absentCount = logs.filter((l) => l.status === 'absent').length
  const totalCount = logs.length || (isStudent ? 28 : 86)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            NHẬT KÝ ĐIỂM DANH
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isStudent ? 'Lịch sử điểm danh cá nhân' : 'Quản lý lịch sử điểm danh'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isStudent
              ? 'Kiểm tra chi tiết các buổi học, thời gian check-in và trạng thái chuyên cần của bạn.'
              : 'Theo dõi toàn bộ nhật ký điểm danh theo buổi học, độ tin cậy AI và trạng thái kiểm duyệt.'}
          </p>
        </div>

        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs hover:bg-slate-50 transition">
          <Calendar size={14} className="text-teal-600" /> Tháng 09/2026 <ChevronDown size={14} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-slate-500 font-medium">Tổng buổi học</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{totalCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <UserCheck size={14} /> Có mặt
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {isStudent ? presentCount || 27 : 1176}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <Clock size={14} /> Đi trễ
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {isStudent ? lateCount || 1 : 18}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs text-rose-600 font-medium flex items-center gap-1">
            <XCircle size={14} /> Vắng mặt
          </div>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {isStudent ? absentCount || 1 : 42}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search and Filters */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Tìm theo mã sinh viên, tên, lớp..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'present', label: 'Có mặt' },
                { id: 'late', label: 'Đi trễ' },
                { id: 'absent', label: 'Vắng' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                onClick={() => handleStatusFilterChange(st.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap',
                  statusFilter === st.id
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Sinh viên</th>
                <th className="py-3 px-4">Lớp học</th>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Độ tin cậy AI</th>
                <th className="py-3 px-4">Phương thức</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Không tìm thấy bản ghi điểm danh nào.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const isPres = log.status === 'present'
                  const isLat = log.status === 'late'
                  const isAbs = log.status === 'absent'

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{log.studentName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{log.studentId}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-600">{log.classId}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{log.checkInTime}</td>
                      <td className="py-3.5 px-4">
                        {log.confidenceScore > 0 ? (
                          <span className="font-semibold text-slate-800">
                            {log.confidenceScore.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600">
                          {log.method}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border',
                            isPres && 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
                            isLat && 'bg-amber-50 text-amber-700 border-amber-200/60',
                            isAbs && 'bg-rose-50 text-rose-700 border-rose-200/60'
                          )}
                        >
                          {isPres && <CheckCircle2 size={12} />}
                          {isLat && <Clock size={12} />}
                          {isAbs && <XCircle size={12} />}
                          {isPres ? 'Có mặt' : isLat ? 'Đi trễ' : 'Vắng mặt'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition"
                          title="Xem chi tiết"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls (STU_03) */}
        {filteredLogs.length > 0 && (
          <div className="p-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <span>
                Hiển thị{' '}
                <strong className="text-slate-700">
                  {startIndex + 1}–{Math.min(startIndex + pageSize, filteredLogs.length)}
                </strong>{' '}
                trên tổng số <strong className="text-slate-700">{filteredLogs.length}</strong> bản ghi
              </span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span>Mỗi trang:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:border-teal-500"
                >
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Trang trước"
              >
                <ChevronLeft size={15} />
              </button>

              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      'w-7 h-7 rounded-lg text-xs font-semibold transition',
                      currentPage === pageNum
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {pageNum}
                  </button>
                )
              })}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Trang tiếp"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detail */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Chi tiết bản ghi điểm danh"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block text-[11px]">Sinh viên</span>
                <b className="text-slate-800 text-sm">{selectedLog.studentName}</b>
                <span className="font-mono text-slate-500 block">{selectedLog.studentId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Học phần / Lớp</span>
                <b className="text-slate-800 text-sm font-mono">{selectedLog.classId}</b>
                <span className="text-slate-500 block">Phiên: {selectedLog.sessionId}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Thời gian điểm danh:</span>
                <span className="font-mono font-bold text-slate-800">{selectedLog.checkInTime}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Độ tin cậy ArcFace (Cosine Sim):</span>
                <span className="font-bold text-teal-700">
                  {selectedLog.confidenceScore > 0 ? `${selectedLog.confidenceScore}%` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Phương thức xác thực:</span>
                <span className="font-semibold text-slate-700">{selectedLog.method}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Trạng thái duyệt AI:</span>
                <span className="font-semibold capitalize text-slate-800">{selectedLog.reviewStatus}</span>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
