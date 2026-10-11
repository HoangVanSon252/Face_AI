import { useState, useEffect } from 'react'
import { Download, CheckCircle2, FileSpreadsheet, BookOpen } from 'lucide-react'
import type { Role, ClassItem, User, AttendanceSession, AttendanceLog } from '../../types'
import { classService, sessionService, attendanceService } from '../../services/api'
import { adminUserService } from '../../services/adminUsers'
import { useToast } from '../../components/common/Toast'

interface ReportViewProps {
  role: Role
}

export function ReportView({ role }: ReportViewProps) {
  const isAdmin = role === 'admin'
  const { showToast } = useToast()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('Học kỳ FA26')

  useEffect(() => {
    const loadRealReportData = async () => {
      try {
        const [clsRes, userRes, sesRes, logRes] = await Promise.all([
          classService.getClasses().catch(() => []),
          adminUserService.getUsers().catch(() => []),
          sessionService.getSessions().catch(() => []),
          attendanceService.getLogs().catch(() => []),
        ])
        setClasses(clsRes)
        setUsers(userRes)
        setSessions(sesRes)
        setLogs(logRes)
        if (clsRes.length > 0) {
          setSelectedClassId(clsRes[0].classId)
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu báo cáo:', err)
      }
    }
    loadRealReportData()
  }, [])

  const students = users.filter((u) => u.role === 'student')

  // Dynamic reports list
  const reportsList = isAdmin
    ? [
        {
          id: 1,
          title: 'Báo cáo vận hành toàn hệ thống EduFace AI',
          detail: `Toàn trường · ${sessions.length} phiên điểm danh đã ghi nhận`,
          date: 'Thời gian thực',
        },
        {
          id: 2,
          title: 'Báo cáo quản lý người dùng & phân quyền RBAC',
          detail: `${users.length} tài khoản trong hệ thống (${students.length} sinh viên)`,
          date: 'Cập nhật hôm nay',
        },
        {
          id: 3,
          title: 'Báo cáo các lớp học phần đang hoạt động',
          detail: `${classes.length} lớp học phần được phân bổ giảng viên`,
          date: 'Học kỳ FA26',
        },
      ]
    : classes.map((cls, idx) => ({
        id: idx + 1,
        title: `Báo cáo chuyên cần môn ${cls.className}`,
        detail: `${cls.classId} · ${cls.studentCount} sinh viên · ${cls.room || 'Phòng học'}`,
        date: 'Học kỳ FA26',
      }))

  // Export CSV based on real students and real logs
  const handleExportCSV = (reportTitle: string) => {
    const targetClass = classes.find((c) => c.classId === selectedClassId) || classes[0]
    const classIdToExport = targetClass?.classId || 'ALL'

    const csvHeader = 'Mã sinh viên,Họ và tên,Lớp học phần,Số buổi có mặt,Số buổi đi trễ,Số buổi vắng,Tỷ lệ chuyên cần\n'

    let csvRows = ''
    if (students.length === 0) {
      csvRows = 'Chưa có dữ liệu sinh viên trong hệ thống,,,,,0%\n'
    } else {
      csvRows = students
        .map((s) => {
          const studentClassLogs = logs.filter(
            (l) => l.studentId === s.userId && (classIdToExport === 'ALL' || l.classId === classIdToExport)
          )
          const present = studentClassLogs.filter((l) => l.status === 'present').length
          const late = studentClassLogs.filter((l) => l.status === 'late').length
          const absent = studentClassLogs.filter((l) => l.status === 'absent').length
          const total = studentClassLogs.length
          const rate = total > 0 ? `${Math.round((present / total) * 100)}%` : '100%'

          return `${s.userId},"${s.fullName}",${classIdToExport},${present},${late},${absent},${rate}`
        })
        .join('\n')
    }

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Bao_cao_chuyen_can_${classIdToExport}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    showToast(`Đã xuất và tải file CSV: "${reportTitle}"`, 'success')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            THỐNG KÊ & XUẤT DỮ LIỆU
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isAdmin ? 'Báo cáo điểm danh toàn trường' : 'Báo cáo chuyên cần học phần'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin
              ? 'Tổng hợp số liệu vận hành, người dùng và tỷ lệ chuyên cần từ cơ sở dữ liệu.'
              : 'Theo dõi tỷ lệ chuyên cần sinh viên và xuất dữ liệu định dạng CSV/Excel theo quy định.'}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isAdmin && classes.length > 0 && (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs focus:outline-hidden"
            >
              {classes.map((cls) => (
                <option key={cls.classId} value={cls.classId}>
                  {cls.className} ({cls.classId})
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs focus:outline-hidden"
          >
            <option value="Học kỳ FA26">Học kỳ 1 (2026-2027)</option>
            <option value="Tháng 09/2026">Tháng 09/2026</option>
            <option value="Tháng 10/2026">Tháng 10/2026</option>
          </select>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="text-teal-700" size={18} />
            <h3 className="text-sm font-bold text-slate-800">Danh mục báo cáo sẵn sàng kết xuất</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">{reportsList.length} mẫu báo cáo</span>
        </div>

        <div className="divide-y divide-slate-100">
          {reportsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <BookOpen size={28} className="mx-auto text-slate-300 mb-2" />
              Chưa có lớp học phần nào được tạo để xuất báo cáo.
            </div>
          ) : (
            reportsList.map((item) => (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                    <h4 className="text-sm font-bold text-slate-800">{item.title}</h4>
                  </div>
                  <p className="text-xs text-slate-500">{item.detail}</p>
                  <p className="text-[11px] text-slate-400">{item.date}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleExportCSV(item.title)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition"
                  >
                    <Download size={14} /> Xuất CSV (Excel)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Export Format Note */}
      <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-4 flex items-start gap-3 text-xs text-teal-900">
        <CheckCircle2 size={16} className="text-teal-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold">Định dạng xuất chuẩn học vụ:</strong> Dữ liệu xuất ra được mã hóa UTF-8 BOM
          chuẩn tiếng Việt, có thể mở trực tiếp bằng Microsoft Excel hoặc Google Sheets mà không bị lỗi font chữ.
        </div>
      </div>
    </div>
  )
}
