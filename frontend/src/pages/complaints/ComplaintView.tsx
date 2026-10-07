import { useState, useEffect } from 'react'
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
} from 'lucide-react'
import type { ComplaintRequest, Role, User } from '../../types'
import { complaintService, attendanceService } from '../../services/api'
import { Modal } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface ComplaintViewProps {
  role: Role
  currentUser: User
}

interface StudentSessionOption {
  sessionId: string
  className: string
  classId: string
  status: string
  checkInTime: string
}

export function ComplaintView({ role, currentUser }: ComplaintViewProps) {
  const isStudent = role === 'student'
  const { showToast } = useToast()

  const [complaints, setComplaints] = useState<ComplaintRequest[]>([])
  const [validSessions, setValidSessions] = useState<StudentSessionOption[]>([])
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<ComplaintRequest | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  // Student submit form
  const [selectedCourse, setSelectedCourse] = useState('Lập trình Web nâng cao')
  const [selectedSessionId, setSelectedSessionId] = useState('SES-IT308-0911')
  const [reasonText, setReasonText] = useState('')

  // Teacher review form
  const [teacherNote, setTeacherNote] = useState('')

  const loadData = async () => {
    if (isStudent) {
      const list = await complaintService.getStudentComplaints(currentUser.userId)
      setComplaints(list)

      // STU_04: Load valid attended/assigned sessions for this student
      const allLogs = await attendanceService.getLogs()
      const studentLogs = allLogs.filter((l) => l.studentId === currentUser.userId)
      const formattedSessions: StudentSessionOption[] = studentLogs.map((l) => ({
        sessionId: l.sessionId,
        className:
          l.classId === 'IT308'
            ? 'Lập trình Web nâng cao'
            : l.classId === 'IT204'
            ? 'Cơ sở dữ liệu nâng cao'
            : 'Kỹ năng nghề nghiệp',
        classId: l.classId,
        status: l.status,
        checkInTime: l.checkInTime,
      }))

      // Fallback default mock sessions if logs are empty
      if (formattedSessions.length === 0) {
        formattedSessions.push(
          {
            sessionId: 'SES-IT308-0911',
            className: 'Lập trình Web nâng cao',
            classId: 'IT308',
            status: 'present',
            checkInTime: '08:02:15',
          },
          {
            sessionId: 'SES-IT204-0909',
            className: 'Cơ sở dữ liệu nâng cao',
            classId: 'IT204',
            status: 'absent',
            checkInTime: 'Chưa ghi nhận',
          }
        )
      }

      setValidSessions(formattedSessions)
      if (formattedSessions.length > 0) {
        setSelectedSessionId(formattedSessions[0].sessionId)
        setSelectedCourse(formattedSessions[0].className)
      }
    } else {
      const list = await complaintService.getComplaints()
      setComplaints(list)
    }
  }

  useEffect(() => {
    loadData()
  }, [isStudent, currentUser.userId])

  // Check if current selected session already has a pending complaint (STU_04)
  const isDuplicatePending = complaints.some(
    (c) =>
      c.sessionId === selectedSessionId &&
      (c.status === 'pending' || c.requestStatus === 'pending')
  )

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reasonText.trim()) {
      showToast('Vui lòng nhập lý do khiếu nại cụ thể!', 'error')
      return
    }

    // STU_04: Kiểm tra session hợp lệ
    const isValidSession = validSessions.some((s) => s.sessionId === selectedSessionId)
    if (!isValidSession) {
      showToast('Phiên học không hợp lệ hoặc bạn không tham gia phiên học này!', 'error')
      return
    }

    if (isDuplicatePending) {
      showToast('Bạn đã có đơn khiếu nại đang chờ xử lý cho buổi học này!', 'error')
      return
    }

    try {
      await complaintService.createComplaint({
        sessionId: selectedSessionId,
        className: selectedCourse,
        studentId: currentUser.userId,
        studentName: currentUser.fullName,
        reason: reasonText,
      })
      showToast('Đơn khiếu nại đã được gửi tới Giảng viên phụ trách!', 'success')
      setShowSubmitModal(false)
      setReasonText('')
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gửi khiếu nại thất bại'
      showToast(msg, 'error')
    }
  }

  const handleApprove = async () => {
    if (!reviewTarget) return
    await complaintService.approveComplaint(reviewTarget.id, teacherNote || 'Đã kiểm tra minh chứng và phê duyệt.')
    showToast(`Đã chấp thuận khiếu nại cho sinh viên ${reviewTarget.studentName}!`, 'success')
    setReviewTarget(null)
    setTeacherNote('')
    loadData()
  }

  const handleReject = async () => {
    if (!reviewTarget) return
    await complaintService.rejectComplaint(reviewTarget.id, teacherNote || 'Không đủ căn cứ minh chứng hợp lệ.')
    showToast(`Đã từ chối khiếu nại của sinh viên ${reviewTarget.studentName}.`, 'error')
    setReviewTarget(null)
    setTeacherNote('')
    loadData()
  }

  const filteredComplaints = complaints.filter((c) => {
    const currentStatus = c.status || c.requestStatus || 'pending'
    if (statusFilter === 'all') return true
    return currentStatus === statusFilter
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            KHIẾU NẠI ĐIỂM DANH (FR-12)
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isStudent ? 'Đơn khiếu nại của tôi' : 'Xử lý khiếu nại điểm danh'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isStudent
              ? 'Gửi yêu cầu đính chính khi có sự cố nhận diện khuôn mặt hoặc lý do khách quan.'
              : 'Kiểm tra giải trình của sinh viên và quyết định cập nhật trạng thái chuyên cần.'}
          </p>
        </div>

        {isStudent && (
          <button
            onClick={() => setShowSubmitModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition shrink-0"
          >
            <Plus size={15} /> Gửi đơn khiếu nại mới
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(
          [
            { id: 'all', label: 'Tất cả đơn' },
            { id: 'pending', label: 'Chờ xử lý' },
            { id: 'approved', label: 'Đã duyệt' },
            { id: 'rejected', label: 'Đã từ chối' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition',
              statusFilter === tab.id
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Complaints List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredComplaints.length === 0 ? (
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-400">
            Không có đơn khiếu nại nào theo bộ lọc này.
          </div>
        ) : (
          filteredComplaints.map((c) => {
            const currentStatus = c.status || c.requestStatus || 'pending'
            const isPending = currentStatus === 'pending'
            const isApproved = currentStatus === 'approved'
            const isRejected = currentStatus === 'rejected'
            const feedbackNote = c.responseNote || c.teacherNote

            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {c.sessionId}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                        isPending && 'bg-amber-50 text-amber-700 border-amber-200',
                        isApproved && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        isRejected && 'bg-rose-50 text-rose-700 border-rose-200'
                      )}
                    >
                      {isPending && <Clock size={11} />}
                      {isApproved && <CheckCircle2 size={11} />}
                      {isRejected && <XCircle size={11} />}
                      {isPending ? 'Chờ duyệt' : isApproved ? 'Đã chấp thuận' : 'Từ chối'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-800">{c.className}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Sinh viên: <b className="text-slate-700">{c.studentName}</b> ({c.studentId})
                  </div>

                  <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed">
                    <div className="font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                      <FileText size={13} className="text-teal-600" /> Lý do khiếu nại:
                    </div>
                    {c.reason}
                  </div>

                  {feedbackNote && (
                    <div className="mt-2 p-2.5 rounded-lg bg-teal-50/70 border border-teal-100 text-xs text-teal-900">
                      <span className="font-semibold block text-[11px] text-teal-700">Phản hồi từ GV:</span>
                      {feedbackNote}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Gửi lúc: {c.createdAt}</span>
                  {!isStudent && isPending && (
                    <button
                      onClick={() => setReviewTarget(c)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition"
                    >
                      Xử lý đơn
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal: Gửi đơn khiếu nại mới (STU_04 - Chỉ cho phép session hợp lệ) */}
      <Modal isOpen={showSubmitModal} onClose={() => setShowSubmitModal(false)} title="Tạo đơn khiếu nại điểm danh">
        <form onSubmit={handleSubmitComplaint} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chọn phiên học cần khiếu nại (STU_04) *
            </label>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                const sId = e.target.value
                setSelectedSessionId(sId)
                const found = validSessions.find((v) => v.sessionId === sId)
                if (found) setSelectedCourse(found.className)
              }}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              {validSessions.length === 0 ? (
                <option value="">Chưa có dữ liệu buổi học nào</option>
              ) : (
                validSessions.map((v) => (
                  <option key={v.sessionId} value={v.sessionId}>
                    {v.sessionId} · {v.className} ({v.status === 'present' ? 'Có mặt' : v.status === 'late' ? 'Đi trễ' : 'Vắng mặt'} - {v.checkInTime})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Học phần:</span>
              <strong className="text-slate-800">{selectedCourse}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mã phiên:</span>
              <span className="font-mono text-teal-700 font-semibold">{selectedSessionId}</span>
            </div>
          </div>

          {isDuplicatePending && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>
                Phiên học này đã có đơn khiếu nại đang chờ duyệt. Bạn không thể gửi thêm đơn mới cho cùng một phiên.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Lý do & giải trình chi tiết *</label>
            <textarea
              rows={4}
              placeholder="VD: Em có mặt tại lớp lúc 08:00 nhưng camera bị chói sáng nên không nhận diện được..."
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              required
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isDuplicatePending || !selectedSessionId}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs transition"
            >
              Gửi đơn khiếu nại
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Duyệt / Từ chối của Giảng viên */}
      <Modal
        isOpen={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title={reviewTarget ? `Xử lý đơn khiếu nại · ${reviewTarget.studentName}` : 'Xử lý khiếu nại'}
      >
        {reviewTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="font-semibold text-slate-800">{reviewTarget.className}</div>
              <div className="text-slate-500 text-[11px] mt-0.5">
                Sinh viên: {reviewTarget.studentName} ({reviewTarget.studentId}) · Phiên: {reviewTarget.sessionId}
              </div>
              <p className="mt-2 text-slate-700 italic">"{reviewTarget.reason}"</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú phản hồi của Giảng viên</label>
              <textarea
                rows={3}
                placeholder="Nhập lý do duyệt hoặc từ chối..."
                value={teacherNote}
                onChange={(e) => setTeacherNote(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition"
              >
                Từ chối đơn
              </button>
              <button
                type="button"
                onClick={handleApprove}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition"
              >
                Chấp thuận & Cập nhật
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
