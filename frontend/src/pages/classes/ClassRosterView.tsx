import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clock, FileText, ShieldAlert, Trash2, UserPlus, X } from 'lucide-react'
import type { AttendanceLog, ClassItem, Role, User } from '../../types'
import { attendanceService, classService, userService } from '../../services/api'
import { ApiError } from '../../services/httpClient'
import { useToast } from '../../components/common/Toast'
import { ConfirmModal } from '../../components/common/ConfirmModal'

interface Props {
  classItem: ClassItem
  role: Role
  onBack: () => void
}

interface Row {
  student: User | undefined
  studentId: string
  latest?: AttendanceLog
}

export function ClassRosterView({ classItem, role, onBack }: Props) {
  const { showToast } = useToast()
  const [students, setStudents] = useState<User[]>([])
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [editing, setEditing] = useState<Row | null>(null)
  const [note, setNote] = useState('')
  const [studentToRemove, setStudentToRemove] = useState<Row | null>(null)
  const [enrolledIds, setEnrolledIds] = useState(classItem.studentIds)
  const [showAddStudents, setShowAddStudents] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])

  const reload = useCallback(async () => {
    const [classes, users, attendance] = await Promise.all([
      classService.getClasses(),
      userService.getUsers(),
      attendanceService.getLogs(),
    ])
    const freshClass = classes.find((item) => item.id === classItem.id)
    if (freshClass) setEnrolledIds(freshClass.studentIds)
    setStudents(users.filter((user) => user.role === 'student'))
    setLogs(attendance.filter((log) => log.classId === classItem.classId))
  }, [classItem.classId, classItem.id])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    const onRosterChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ section_id?: number }>).detail
      if (detail?.section_id === classItem.id) void reload()
    }
    window.addEventListener('class-roster:changed', onRosterChanged)
    return () => window.removeEventListener('class-roster:changed', onRosterChanged)
  }, [classItem.id, reload])

  const rows = useMemo<Row[]>(() => enrolledIds.map((studentId) => {
    const entries = logs.filter((log) => log.studentId === studentId)
    const latest = [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
    return { studentId, student: students.find((user) => user.userId === studentId), latest }
  }), [enrolledIds, logs, students])

  const candidates = useMemo(
    () => students.filter((student) => !enrolledIds.includes(student.userId)),
    [students, enrolledIds]
  )

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId])
  }

  const addSelectedStudents = async () => {
    if (selectedStudentIds.length === 0) return
    const selected = [...selectedStudentIds]
    const results = await Promise.allSettled(
      selected.map((studentId) => classService.addStudentToClass(classItem.id, studentId))
    )
    const added = results.filter((result) => result.status === 'fulfilled').length
    const duplicateCount = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.code === 'ALREADY_ENROLLED'
    ).length
    const failed = results.length - added - duplicateCount
    if (added > 0) {
      setEnrolledIds((current) => [...current, ...selected.filter((_, index) => results[index].status === 'fulfilled')])
      showToast(`Đã thêm ${added} sinh viên vào lớp.`, 'success')
    }
    if (failed > 0) showToast(`${failed} sinh viên chưa thể thêm.`, 'error')
    if (duplicateCount > 0) showToast(`${duplicateCount} sinh viÃªn Ä‘Ã£ cÃ³ trong lá»›p.`, 'info')
    // Reconcile with the server after an add or a duplicate race from another tab.
    await reload()
    setSelectedStudentIds([])
    if (failed === 0) setShowAddStudents(false)
  }

  const removeStudent = async () => {
    if (!studentToRemove) return
    try {
      await classService.removeStudentFromClass(classItem.id, studentToRemove.studentId)
      showToast('Đã xóa sinh viên khỏi lớp.', 'info')
      setStudentToRemove(null)
      onBack()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể xóa sinh viên.', 'error')
    }
  }

  const review = async (row: Row, approved: boolean) => {
    if (!row.latest) return
    try {
      if (approved) await attendanceService.approveLog(row.latest.id)
      else await attendanceService.rejectLog(row.latest.id)
      showToast(approved ? 'Đã duyệt điểm danh.' : 'Đã từ chối điểm danh.', approved ? 'success' : 'info')
      await reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể cập nhật điểm danh.', 'error')
    }
  }

  const saveNote = async () => {
    if (!editing?.latest) return
    try {
      await attendanceService.updateLogNote(editing.latest.id, editing.latest.status, note)
      setEditing(null)
      await reload()
      showToast('Đã lưu ghi chú.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể lưu ghi chú.', 'error')
    }
  }

  const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : 'Chưa điểm danh'
  const isNearThreshold = (confidence?: number) => confidence !== undefined && confidence >= 70 && confidence < 80

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"><ArrowLeft size={14} /> Quay lại lớp học</button>
          <h2 className="text-xl font-bold text-slate-800">Danh sách sinh viên · {classItem.className}</h2>
          <p className="mt-1 text-xs text-slate-500">{classItem.classId} · {enrolledIds.length} sinh viên ghi danh · Mỗi dòng hiển thị lượt điểm danh gần nhất của đúng lớp này.</p>
        </div>
        {role !== 'student' && <button onClick={() => setShowAddStudents(true)} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"><UserPlus size={15} /> Thêm sinh viên</button>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Sinh viên</th>
                <th className="px-4 py-3 font-semibold">Khuôn mặt</th>
                <th className="px-4 py-3 font-semibold">Lần điểm danh gần nhất</th>
                <th className="px-4 py-3 font-semibold">Kết quả</th>
                <th className="px-4 py-3 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const log = row.latest
                return <tr key={row.studentId}>
                  <td className="px-4 py-3"><div className="font-semibold text-slate-800">{row.student?.fullName || row.studentId}</div><div className="font-mono text-slate-400">{row.studentId}</div></td>
                  <td className="px-4 py-3"><span className={row.student?.hasFaceRegistered ? 'text-emerald-700' : 'text-amber-700'}>{row.student?.hasFaceRegistered ? 'Đã đăng ký' : 'Chưa đăng ký'}</span></td>
                  <td className="px-4 py-3 text-slate-600"><span className="inline-flex items-center gap-1"><Clock size={13} /> {formatDate(log?.createdAt)}</span></td>
                  <td className="px-4 py-3">
                    {!log ? <span className="text-slate-400">Chưa có bản ghi</span> : <div className="space-y-1"><div className={log.status === 'absent' ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>{log.status === 'absent' ? 'Vắng / từ chối' : log.status === 'late' ? 'Có mặt muộn' : 'Có mặt'}</div><div className="text-slate-500">{log.confidenceScore.toFixed(1)}% · {log.reviewStatus === 'pending' ? 'Chờ duyệt' : 'Đã duyệt'}</div>{isNearThreshold(log.confidenceScore) && <div className="inline-flex items-center gap-1 text-amber-700"><ShieldAlert size={13} /> Gần ngưỡng 80%</div>}</div>}
                  </td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">
                    {log?.reviewStatus === 'pending' && <><button onClick={() => void review(row, true)} className="rounded bg-emerald-600 px-2 py-1 text-white"><Check size={13} /></button><button onClick={() => void review(row, false)} className="rounded bg-rose-600 px-2 py-1 text-white"><X size={13} /></button></>}
                    {log && <button onClick={() => { setEditing(row); setNote('') }} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-slate-700"><FileText size={13} /> Ghi chú</button>}
                    {role !== 'student' && <button onClick={() => setStudentToRemove(row)} className="rounded border border-rose-200 p-1 text-rose-600"><Trash2 size={13} /></button>}
                  </div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h3 className="font-bold text-slate-800">Ghi chú điểm danh · {editing.student?.fullName || editing.studentId}</h3><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-3 min-h-28 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="Nhập ghi chú cho bản ghi điểm danh..." /><div className="mt-4 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-sm text-slate-600">Hủy</button><button onClick={() => void saveNote()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Lưu ghi chú</button></div></div></div>}
      {showAddStudents && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Thêm nhiều sinh viên</h3><p className="mt-1 text-xs text-slate-500">Chọn các sinh viên cần ghi danh vào {classItem.className}.</p></div><button onClick={() => setShowAddStudents(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button></div><div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">{candidates.length === 0 ? <p className="p-4 text-center text-xs text-slate-400">Không còn sinh viên nào để thêm.</p> : candidates.map((student) => <label key={student.userId} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={selectedStudentIds.includes(student.userId)} onChange={() => toggleStudent(student.userId)} className="h-4 w-4 accent-teal-700" /><span className="flex-1"><span className="block text-sm font-semibold text-slate-800">{student.fullName}</span><span className="font-mono text-xs text-slate-400">{student.userId}</span></span><span className={student.hasFaceRegistered ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>{student.hasFaceRegistered ? 'Đã đăng ký mặt' : 'Chưa đăng ký mặt'}</span></label>)}</div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-500">Đã chọn: {selectedStudentIds.length}</span><div className="flex gap-2"><button onClick={() => setShowAddStudents(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600">Hủy</button><button disabled={selectedStudentIds.length === 0} onClick={() => void addSelectedStudents()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Thêm đã chọn</button></div></div></div></div>}
      <ConfirmModal
        isOpen={Boolean(studentToRemove)}
        title="Xác nhận xóa sinh viên khỏi lớp"
        message={`Bạn có chắc muốn xóa ${studentToRemove?.student?.fullName || studentToRemove?.studentId || ''} khỏi lớp ${classItem.className}? Lịch sử điểm danh vẫn được lưu.`}
        confirmText="Xóa sinh viên"
        cancelText="Hủy"
        variant="danger"
        onConfirm={() => void removeStudent()}
        onCancel={() => setStudentToRemove(null)}
      />
    </div>
  )
}
