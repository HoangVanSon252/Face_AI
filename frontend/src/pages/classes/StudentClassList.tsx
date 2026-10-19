import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Users, UserPlus, UserMinus, Pencil, Trash2, Plus, X } from 'lucide-react'
import type { Role, User } from '../../types'
import { userService } from '../../services/api'
import { httpClient } from '../../services/httpClient'
import { Modal } from '../../components/common/Modal'
import { ConfirmModal } from '../../components/common/ConfirmModal'
import { useToast } from '../../components/common/Toast'

interface Props {
  role: Role
}

interface RegisteredClass {
  id: number
  code: string
  name?: string
  department?: string
}

export function StudentClassList({ role }: Props) {
  const { showToast } = useToast()
  const [students, setStudents] = useState<User[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [registered, setRegistered] = useState<RegisteredClass[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [studyType, setStudyType] = useState('Chính quy')
  const [departmentCode, setDepartmentCode] = useState('CNTT')
  const [classToDelete, setClassToDelete] = useState<RegisteredClass | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = async () => {
    try {
      const [users, items] = await Promise.all([
        userService.getUsers(),
        httpClient.get<RegisteredClass[]>('/api/v1/academic/student-classes'),
      ])
      setStudents(users.filter((user) => user.role === 'student'))
      setRegistered(items || [])
    } catch (err) {
      console.error('Failed to load student classes:', err)
      showToast('Không thể tải danh sách lớp học.', 'error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Chỉ hiển thị các lớp học thật đã đăng ký trong cơ sở dữ liệu
  const classes = useMemo(() => {
    const studentMap: Record<string, User[]> = {}
    registered.forEach((item) => {
      studentMap[item.code] = []
    })

    students.forEach((student) => {
      const key = student.administrativeClass?.trim()
      if (key && studentMap[key]) {
        studentMap[key].push(student)
      }
    })

    return registered
      .map((item) => ({
        item,
        code: item.code,
        name: item.name,
        department: item.department || 'Chính quy',
        members: studentMap[item.code] || [],
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [students, registered])

  const selectedStudents = useMemo(() => {
    if (!selectedCode) return []
    return classes.find((c) => c.code === selectedCode)?.members || []
  }, [selectedCode, classes])

  const unassignedStudents = useMemo(() => {
    return students.filter(
      (student) =>
        !student.administrativeClass ||
        !registered.some((item) => item.code === student.administrativeClass)
    )
  }, [students, registered])

  const getNextClassNumber = (dept: string) => {
    const prefix = `D26${dept}`
    const existing = registered
      .filter((item) => item.code.startsWith(prefix))
      .map((item) => {
        const numPart = item.code.slice(prefix.length)
        return parseInt(numPart, 10)
      })
      .filter((n) => !isNaN(n) && n > 0)
    const nextVal = existing.length > 0 ? Math.max(...existing) + 1 : 1
    return String(nextVal).padStart(2, '0')
  }

  const computedClassNumber = useMemo(() => {
    return getNextClassNumber(departmentCode)
  }, [departmentCode, registered])

  const handleOpenAddForm = () => {
    setEditingId(null)
    setStudyType('Chính quy')
    setDepartmentCode('CNTT')
    setName('')
    setShowForm(true)
  }

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const generated = editingId ? code.trim().toUpperCase() : `D26${departmentCode}${computedClassNumber}`

    try {
      await httpClient[editingId ? 'patch' : 'post'](
        `/api/v1/academic/student-classes${editingId ? `/${editingId}` : ''}`,
        { code: generated, name: name.trim(), department: studyType }
      )
      showToast(editingId ? 'Cập nhật thông tin lớp thành công!' : 'Đã tạo lớp mới thành công!', 'success')
      setShowForm(false)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu lớp.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteClass = async () => {
    if (!classToDelete) return
    try {
      await httpClient.delete(`/api/v1/academic/student-classes/${classToDelete.id}`)
      showToast(`Đã xóa lớp ${classToDelete.code} thành công.`, 'info')
      setClassToDelete(null)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xóa lớp.', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-teal-800 uppercase">
              QUẢN LÝ LỚP SINH VIÊN
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-semibold text-slate-500">
              {classes.length} lớp học
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">Danh sách lớp học</h2>
          <p className="mt-1 text-xs text-slate-500">
            Quản lý danh sách lớp học và học viên theo niên chế; lịch học, ca học và điểm danh nằm trong phân hệ Môn học.
          </p>
        </div>

        {role !== 'student' && (
          <button
            onClick={handleOpenAddForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 active:scale-95 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:shadow transition-all shrink-0"
          >
            <Plus size={16} />
            <span>Thêm lớp mới</span>
          </button>
        )}
      </div>

      {/* Empty State */}
      {classes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-100 mb-4">
            <BookOpen size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Chưa có lớp học nào</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            Hiện chưa có lớp học nào trong hệ thống. Hãy thêm lớp mới để bắt đầu phân lớp cho sinh viên.
          </p>
          {role !== 'student' && (
            <button
              onClick={handleOpenAddForm}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all"
            >
              <Plus size={15} />
              <span>Thêm lớp ngay</span>
            </button>
          )}
        </div>
      )}

      {/* Class Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((cls) => {
          const isFullTime = (cls.department || '').includes('Chính quy')
          const isRemote = (cls.department || '').includes('từ xa')

          return (
            <div
              key={cls.code}
              className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:border-teal-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                {/* Header: Icon & Department Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 border border-teal-100 text-teal-700 shrink-0 group-hover:scale-105 transition-transform">
                    <BookOpen size={20} />
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      isFullTime
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                        : isRemote
                        ? 'bg-blue-50 text-blue-700 border-blue-200/60'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
                    }`}
                  >
                    {cls.department}
                  </span>
                </div>

                {/* Class Code & Name */}
                <h3 className="mt-4 text-lg font-bold text-slate-900 tracking-tight group-hover:text-teal-900 transition-colors">
                  {cls.code}
                </h3>
                <p className="mt-1 text-xs text-slate-500 font-medium line-clamp-1">
                  {cls.name || 'Lớp sinh viên niên chế'}
                </p>
              </div>

              {/* Footer: Student Count & Action Buttons */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                  <Users size={14} className="text-teal-600 shrink-0" />
                  <span>
                    <strong className="font-bold text-slate-800">{cls.members.length}</strong> sinh viên
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedCode(cls.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 active:scale-95 text-white shadow-xs hover:shadow transition-all"
                    title="Xem danh sách sinh viên"
                  >
                    <Users size={13} className="text-teal-200" />
                    <span>Sinh viên</span>
                  </button>

                  {role !== 'student' && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(cls.item.id)
                          setCode(cls.code)
                          setName(cls.item.name || '')
                          setStudyType(cls.item.department || 'Chính quy')
                          setShowForm(true)
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-700 hover:text-teal-700 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 transition-all"
                        title="Sửa thông tin lớp"
                      >
                        <Pencil size={13} className="text-slate-500 group-hover:text-teal-700" />
                        <span>Sửa</span>
                      </button>

                      <button
                        onClick={() => setClassToDelete(cls.item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/70 hover:border-rose-300 transition-all"
                        title="Xóa lớp học"
                      >
                        <Trash2 size={13} className="text-rose-500" />
                        <span>Xóa</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Form Thêm / Sửa lớp */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Sửa thông tin lớp học' : 'Thêm lớp học mới'}
      >
        <form onSubmit={handleSaveClass} className="space-y-4 text-sm">
          {editingId ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mã lớp</label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-mono focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="Mã lớp, ví dụ D26CNTT01"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mã lớp tạo tự động</label>
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 font-mono font-bold text-teal-800 flex items-center justify-between">
                  <span>
                    D26{departmentCode}
                    {computedClassNumber}
                  </span>
                  <span className="text-[11px] font-normal text-teal-700 bg-white/90 px-2.5 py-0.5 rounded-full border border-teal-200">
                    Tự động tăng dần · Khóa 26
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Mã lớp được hệ thống tự động sinh tăng dần không trùng lặp theo ngành đã chọn.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ngành đào tạo</label>
                <select
                  value={departmentCode}
                  onChange={(e) => setDepartmentCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="CNTT">CNTT - Công nghệ thông tin</option>
                  <option value="QTKD">QTKD - Quản trị kinh doanh</option>
                  <option value="KT">KT - Kế toán</option>
                  <option value="NN">NN - Ngôn ngữ</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Hệ đào tạo</label>
            <select
              value={studyType}
              onChange={(e) => setStudyType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option>Chính quy</option>
              <option>Hệ từ xa</option>
              <option>Liên thông</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên lớp mô tả (tùy chọn)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Lớp CNTT K26 Đợt 1"
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
            >
              {isLoading ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Danh sách sinh viên thuộc lớp */}
      {selectedCode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700 border border-teal-100">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Sinh viên lớp {selectedCode}</h3>
                  <p className="text-xs text-slate-500">Danh sách sinh viên thuộc lớp niên chế này</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCode(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Student List */}
            <div className="overflow-y-auto flex-1 py-3 divide-y divide-slate-100 pr-1">
              {selectedStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Chưa có sinh viên nào trong lớp này.
                </div>
              ) : (
                selectedStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between py-2.5 px-1 hover:bg-slate-50/60 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                        {student.avatar || student.fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{student.fullName}</div>
                        <div className="font-mono text-xs text-slate-400">{student.userId}</div>
                      </div>
                    </div>

                    {role !== 'student' && (
                      <button
                        onClick={async () => {
                          const target = registered.find((item) => item.code === selectedCode)
                          if (!target) return
                          await httpClient.delete(
                            `/api/v1/academic/student-classes/${target.id}/students/${student.id}`
                          )
                          showToast(`Đã xóa ${student.fullName} khỏi lớp.`, 'info')
                          await load()
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200/80 bg-rose-50/60 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                        title="Xóa khỏi lớp"
                      >
                        <UserMinus size={13} />
                        <span>Xóa khỏi lớp</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Section: Thêm sinh viên chưa phân lớp */}
            {role !== 'student' && (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200/60 p-4 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <b className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
                    <UserPlus size={14} className="text-teal-600" />
                    Thêm sinh viên chưa phân lớp
                  </b>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {unassignedStudents.length} sinh viên
                  </span>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {unassignedStudents.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">
                      Tất cả sinh viên hiện đã được phân lớp.
                    </p>
                  ) : (
                    unassignedStudents.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between rounded-lg bg-white border border-slate-200/70 p-2 text-sm shadow-xs"
                      >
                        <div className="truncate mr-2">
                          <span className="font-medium text-slate-800 text-xs">{student.fullName}</span>{' '}
                          <small className="font-mono text-slate-400 text-[11px]">{student.userId}</small>
                        </div>
                        <button
                          onClick={async () => {
                            const target = registered.find((item) => item.code === selectedCode)
                            if (!target) return
                            await httpClient.post(
                              `/api/v1/academic/student-classes/${target.id}/students/${student.id}`
                            )
                            showToast(`Đã thêm ${student.fullName} vào lớp ${selectedCode}.`, 'success')
                            await load()
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-700 hover:bg-teal-800 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors shrink-0"
                        >
                          <Plus size={12} />
                          <span>Thêm</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ConfirmModal: Xóa lớp học */}
      <ConfirmModal
        isOpen={Boolean(classToDelete)}
        title="Xác nhận xóa lớp học"
        message={`Bạn có chắc chắn muốn xóa lớp ${classToDelete?.code}? Tất cả sinh viên trong lớp sẽ được chuyển về trạng thái chưa phân lớp.`}
        confirmText="Xóa lớp"
        cancelText="Hủy"
        variant="danger"
        onConfirm={handleDeleteClass}
        onCancel={() => setClassToDelete(null)}
      />

      {role === 'student' && (
        <p className="text-xs text-slate-500 italic">
          * Danh sách các lớp học chính quy trong hệ thống.
        </p>
      )}
    </div>
  )
}
