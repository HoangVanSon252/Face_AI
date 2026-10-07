import { useState, useEffect } from 'react'
import {
  BookOpen,
  Plus,
  Users,
  Trash2,
  UserPlus,
  Search,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  School,
} from 'lucide-react'
import type { ClassItem, Role, User } from '../../types'
import { classService, userService } from '../../services/api'
import { Modal } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface ClassManagementProps {
  role: Role
  currentUser: User
}

export function ClassManagement({ role }: ClassManagementProps) {
  const isStudent = role === 'student'
  const isTeacher = role === 'teacher'
  const isAdmin = role === 'admin'
  const { showToast } = useToast()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [allStudents, setAllStudents] = useState<User[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRosterModal, setShowRosterModal] = useState(false)
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  // Form states
  const [newClassId, setNewClassId] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [newRoom, setNewRoom] = useState('')
  const [newSchedule, setNewSchedule] = useState('')
  const [newDepartment, setNewDepartment] = useState('Khoa Công nghệ thông tin')
  const [newMaxStudents, setNewMaxStudents] = useState('45')

  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('')

  const loadData = async () => {
    const list = await classService.getClasses()
    setClasses(list)
    const users = await userService.getUsers()
    setAllStudents(users.filter((u) => u.role === 'student'))
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassId || !newClassName) {
      showToast('Vui lòng nhập đầy đủ mã lớp và tên lớp!', 'error')
      return
    }
    await classService.createClass({
      classId: newClassId.toUpperCase().trim(),
      className: newClassName.trim(),
      teacherId: 2,
      teacherName: 'Nguyễn Thị Lan',
      room: newRoom || 'Phòng A-301',
      schedule: newSchedule || 'Thứ 2 · 08:00 - 10:00',
      department: newDepartment,
      maxStudents: parseInt(newMaxStudents) || 45,
    })
    showToast(`Đã tạo lớp ${newClassName} thành công!`, 'success')
    setShowCreateModal(false)
    setNewClassId('')
    setNewClassName('')
    setNewRoom('')
    setNewSchedule('')
    loadData()
  }

  const handleOpenRoster = (cls: ClassItem) => {
    setSelectedClass(cls)
    setShowRosterModal(true)
  }

  const handleAddStudent = async () => {
    if (!selectedClass || !selectedStudentToAdd) return
    await classService.addStudentToClass(selectedClass.classId, selectedStudentToAdd)
    showToast(`Đã thêm sinh viên ${selectedStudentToAdd} vào lớp!`, 'success')
    setShowAddStudentModal(false)
    setSelectedStudentToAdd('')
    await loadData()
    const updated = classes.find((c) => c.classId === selectedClass.classId)
    if (updated) setSelectedClass(updated)
  }

  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedClass) return
    if (!confirm(`Bạn có chắc muốn xóa sinh viên ${studentId} khỏi lớp ${selectedClass.className}?`)) return
    await classService.removeStudentFromClass(selectedClass.classId, studentId)
    showToast(`Đã xóa sinh viên khỏi lớp.`, 'info')
    await loadData()
    const updated = classes.find((c) => c.classId === selectedClass.classId)
    if (updated) setSelectedClass(updated)
  }

  const filteredClasses = classes.filter(
    (c) =>
      c.className.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.classId.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.room.toLowerCase().includes(searchFilter.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            QUẢN LÝ HỌC PHẦN
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isStudent ? 'Lớp học của tôi' : 'Danh sách lớp học'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isStudent
              ? 'Các học phần bạn đang đăng ký trong học kỳ này.'
              : 'Theo dõi lịch học, sĩ số, phòng học và quản lý danh sách sinh viên ghi danh.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Tìm kiếm lớp học..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 pr-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition"
            />
          </div>

          {(isTeacher || isAdmin) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition shrink-0"
            >
              <Plus size={15} /> Tạo lớp học mới
            </button>
          )}
        </div>
      </div>

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredClasses.map((cls) => {
          const isOngoing = cls.classId === 'IT308'
          const percentFull = Math.round((cls.studentCount / cls.maxStudents) * 100)

          return (
            <div
              key={cls.classId}
              className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-md transition-all p-5 flex flex-col justify-between"
            >
              <div>
                {/* Header row with Icon & Status badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                    <BookOpen size={20} />
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border',
                      isOngoing
                        ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    )}
                  >
                    {isOngoing && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
                    {isOngoing ? 'Đang diễn ra' : 'Sắp tới'}
                  </span>
                </div>

                {/* Title & Info */}
                <h3 className="text-base font-bold text-slate-800 line-clamp-1">{cls.className}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <span className="font-mono font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                    {cls.classId}
                  </span>
                  <span>·</span>
                  <span className="truncate">{cls.teacherName}</span>
                </div>

                {/* Details */}
                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0" />
                    <span>{cls.room}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400 shrink-0" />
                    <span>{cls.schedule}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <School size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{cls.department}</span>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Users size={13} /> Sĩ số
                    </span>
                    <span className="font-bold text-slate-800">
                      {cls.studentCount} / {cls.maxStudents}{' '}
                      <span className="font-normal text-slate-400">({percentFull}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        percentFull >= 90 ? 'bg-amber-500' : 'bg-teal-600'
                      )}
                      style={{ width: `${Math.min(percentFull, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleOpenRoster(cls)}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 hover:border-teal-200 transition-colors"
                >
                  <Users size={14} /> Danh sách sinh viên
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Tạo lớp học mới */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Tạo lớp học mới">
        <form onSubmit={handleCreateClass} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã lớp / Mã học phần *</label>
            <input
              placeholder="VD: IT308, CS101..."
              value={newClassId}
              onChange={(e) => setNewClassId(e.target.value)}
              required
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên học phần *</label>
            <input
              placeholder="VD: Lập trình Web nâng cao"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              required
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng học</label>
              <input
                placeholder="VD: Phòng A-301"
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sĩ số tối đa</label>
              <input
                type="number"
                value={newMaxStudents}
                onChange={(e) => setNewMaxStudents(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Lịch học</label>
            <input
              placeholder="VD: Thứ 4 · 08:00 - 10:00"
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Khoa quản lý</label>
            <select
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
            >
              <option value="Khoa Công nghệ thông tin">Khoa Công nghệ thông tin</option>
              <option value="Khoa Quản trị kinh doanh">Khoa Quản trị kinh doanh</option>
              <option value="Khoa Thiết kế đồ họa">Khoa Thiết kế đồ họa</option>
              <option value="Khoa Ngôn ngữ">Khoa Ngôn ngữ</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition"
            >
              Lưu lớp học
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Danh sách sinh viên trong lớp */}
      <Modal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        title={selectedClass ? `Danh sách sinh viên · ${selectedClass.className} (${selectedClass.classId})` : 'Danh sách sinh viên'}
      >
        {selectedClass && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-slate-500">
                Tổng số: <b className="text-slate-800">{selectedClass.studentIds.length}</b> sinh viên đã ghi danh
              </span>
              {(isTeacher || isAdmin) && (
                <button
                  onClick={() => setShowAddStudentModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition"
                >
                  <UserPlus size={14} /> Thêm sinh viên
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {selectedClass.studentIds.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">Chưa có sinh viên nào trong lớp này.</div>
              ) : (
                selectedClass.studentIds.map((sid) => {
                  const stu = allStudents.find((s) => s.userId === sid)
                  return (
                    <div key={sid} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center">
                          {stu ? stu.fullName.slice(-1) : 'S'}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{stu ? stu.fullName : sid}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <span className="font-mono">{sid}</span>
                            <span>·</span>
                            {stu?.hasFaceRegistered ? (
                              <span className="text-emerald-600 flex items-center gap-0.5">
                                <CheckCircle2 size={11} /> Khuôn mặt OK
                              </span>
                            ) : (
                              <span className="text-amber-600 flex items-center gap-0.5">
                                <AlertCircle size={11} /> Chưa có mặt
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(isTeacher || isAdmin) && (
                        <button
                          onClick={() => handleRemoveStudent(sid)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Xóa khỏi lớp"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Thêm sinh viên vào lớp */}
      <Modal isOpen={showAddStudentModal} onClose={() => setShowAddStudentModal(false)} title="Thêm sinh viên vào lớp">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Chọn sinh viên từ hệ thống</label>
            <select
              value={selectedStudentToAdd}
              onChange={(e) => setSelectedStudentToAdd(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              <option value="">-- Chọn sinh viên --</option>
              {allStudents
                .filter((s) => selectedClass && !selectedClass.studentIds.includes(s.userId))
                .map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.fullName} ({s.userId}) - {s.department}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={() => setShowAddStudentModal(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
            >
              Hủy
            </button>
            <button
              onClick={handleAddStudent}
              disabled={!selectedStudentToAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white shadow-xs transition"
            >
              <Users size={14} /> Thêm vào danh sách
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
