import { useState, useEffect } from 'react'
import {
  Users,
  Search,
  UserPlus,
  Lock,
  Unlock,
  Shield,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { Role, User } from '../../types'
import { userService } from '../../services/api'
import { Modal } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

export function UserManagementView() {
  const { showToast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editRoleUser, setEditRoleUser] = useState<User | null>(null)
  const [newSelectedRole, setNewSelectedRole] = useState<Role>('student')

  // Edit user info state (ADM_01)
  const [editInfoUser, setEditInfoUser] = useState<User | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editDepartment, setEditDepartment] = useState('')

  // Form states for creating new user
  const [formUserId, setFormUserId] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formFullName, setFormFullName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<Role>('student')
  const [formDepartment, setFormDepartment] = useState('Khoa Công nghệ thông tin')

  const loadUsers = async () => {
    const list = await userService.getUsers()
    setUsers(list)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = users.filter((u) => {
    const matchQuery =
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.userId.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchQuery && matchRole
  })

  const handleToggleStatus = async (user: User) => {
    const newStatus = await userService.toggleUserStatus(user.userId)
    showToast(
      `Đã ${newStatus ? 'mở khóa' : 'khóa'} tài khoản ${user.fullName} (${user.userId})!`,
      newStatus ? 'success' : 'error'
    )
    loadUsers()
  }

  const handleUpdateRole = async () => {
    if (!editRoleUser) return
    await userService.updateUserRole(editRoleUser.userId, newSelectedRole)
    showToast(`Đã đổi vai trò của ${editRoleUser.fullName} thành ${newSelectedRole}!`, 'success')
    setEditRoleUser(null)
    loadUsers()
  }

  const handleOpenEditInfo = (u: User) => {
    setEditInfoUser(u)
    setEditFullName(u.fullName)
    setEditEmail(u.email)
    setEditDepartment(u.department || '')
  }

  const handleSaveEditInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editInfoUser) return
    if (!editFullName.trim() || !editEmail.trim()) {
      showToast('Họ tên và email không được để trống!', 'error')
      return
    }
    await userService.updateUser(editInfoUser.userId, {
      fullName: editFullName.trim(),
      email: editEmail.trim(),
      department: editDepartment.trim(),
    })
    showToast(`Đã cập nhật thông tin cho tài khoản ${editInfoUser.userId}!`, 'success')
    setEditInfoUser(null)
    loadUsers()
  }

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${u.fullName}" (${u.userId})?`)) return
    await userService.deleteUser(u.userId)
    showToast(`Đã xóa tài khoản ${u.userId} thành công!`, 'info')
    loadUsers()
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formUserId || !formFullName || !formEmail) {
      showToast('Vui lòng điền đủ mã định danh, họ tên và email!', 'error')
      return
    }
    await userService.createUser({
      userId: formUserId.toUpperCase().trim(),
      username: formUsername.trim() || formUserId.toLowerCase().trim(),
      fullName: formFullName.trim(),
      email: formEmail.trim(),
      role: formRole,
      department: formDepartment,
      isActive: true,
      hasFaceRegistered: false,
      avatar: formFullName
        .split(' ')
        .slice(-2)
        .map((p) => p[0])
        .join('')
        .toUpperCase(),
    })
    showToast(`Đã tạo tài khoản người dùng ${formFullName}!`, 'success')
    setShowCreateModal(false)
    setFormUserId('')
    setFormUsername('')
    setFormFullName('')
    setFormEmail('')
    loadUsers()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            QUẢN TRỊ NGƯỜI DÙNG & PHÂN QUYỀN (RBAC)
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">Quản lý người dùng toàn hệ thống</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tạo tài khoản, cấu hình vai trò sinh viên / giảng viên / quản trị viên và khóa/mở khóa truy cập.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition shrink-0"
        >
          <UserPlus size={15} /> Thêm người dùng mới
        </button>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Role Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Tìm theo mã định danh, họ tên, email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'student', label: 'Sinh viên' },
                { id: 'teacher', label: 'Giảng viên' },
                { id: 'admin', label: 'Quản trị viên' },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                onClick={() => setRoleFilter(r.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap',
                  roleFilter === r.id
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Người dùng & Mã số</th>
                <th className="py-3 px-4">Vai trò (RBAC)</th>
                <th className="py-3 px-4">Trạng thái sinh trắc</th>
                <th className="py-3 px-4">Tài khoản</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Không tìm thấy tài khoản người dùng nào.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const roleBadge =
                    u.role === 'admin'
                      ? { label: 'Quản trị viên', cls: 'bg-purple-50 text-purple-700 border-purple-200' }
                      : u.role === 'teacher'
                      ? { label: 'Giảng viên', cls: 'bg-teal-50 text-teal-700 border-teal-200' }
                      : { label: 'Sinh viên', cls: 'bg-blue-50 text-blue-700 border-blue-200' }

                  return (
                    <tr key={u.userId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                            {u.avatar || u.fullName.slice(-1)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{u.fullName}</div>
                            <div className="text-[11px] text-slate-400">
                              <span className="font-mono text-slate-600">{u.userId}</span> · {u.email}
                            </div>
                            {u.department && (
                              <div className="text-[10px] text-slate-400 mt-0.5">{u.department}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                            roleBadge.cls
                          )}
                        >
                          {roleBadge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.hasFaceRegistered ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                            <CheckCircle2 size={13} /> Đã có khuôn mặt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                            <AlertCircle size={13} /> Chưa đăng ký
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                            u.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          )}
                        >
                          {u.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleOpenEditInfo(u)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Sửa thông tin người dùng"
                          >
                            <Pencil size={12} /> Sửa
                          </button>

                          <button
                            onClick={() => {
                              setEditRoleUser(u)
                              setNewSelectedRole(u.role)
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Thay đổi vai trò RBAC"
                          >
                            <Edit2 size={12} /> Đổi vai trò
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition',
                              u.isActive
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            )}
                            title={u.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                          >
                            {u.isActive ? (
                              <>
                                <Lock size={12} /> Khóa
                              </>
                            ) : (
                              <>
                                <Unlock size={12} /> Mở khóa
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="inline-flex items-center gap-1 p-1 text-xs font-semibold rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition"
                            title="Xóa tài khoản"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Thêm người dùng mới (ADM_01) */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Thêm tài khoản người dùng">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mã định danh (MSSV / Mã GV / Mã QTV) *</label>
            <input
              placeholder="VD: SV20240999, GV2024001..."
              value={formUserId}
              onChange={(e) => setFormUserId(e.target.value)}
              required
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên *</label>
            <input
              placeholder="VD: Hoàng Văn Sơn"
              value={formFullName}
              onChange={(e) => setFormFullName(e.target.value)}
              required
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên lạc *</label>
            <input
              type="email"
              placeholder="VD: son.hv@fpt.edu.vn"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              required
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Vai trò hệ thống (RBAC) *</label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as Role)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              <option value="student">Sinh viên (Student)</option>
              <option value="teacher">Giảng viên (Teacher)</option>
              <option value="admin">Quản trị viên (Admin)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Khoa / Đơn vị</label>
            <input
              value={formDepartment}
              onChange={(e) => setFormDepartment(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition"
            >
              <Users size={14} /> Tạo người dùng
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Chỉnh sửa thông tin người dùng (ADM_01/02 Update) */}
      <Modal
        isOpen={!!editInfoUser}
        onClose={() => setEditInfoUser(null)}
        title={editInfoUser ? `Chỉnh sửa thông tin · ${editInfoUser.userId}` : 'Chỉnh sửa thông tin'}
      >
        {editInfoUser && (
          <form onSubmit={handleSaveEditInfo} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mã định danh (Không thể đổi)</label>
              <input
                value={editInfoUser.userId}
                disabled
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Họ và tên *</label>
              <input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email liên lạc *</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Khoa / Đơn vị</label>
              <input
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditInfoUser(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-xs transition"
              >
                Lưu thay đổi
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Chỉnh sửa vai trò RBAC (ADM_02) */}
      <Modal
        isOpen={!!editRoleUser}
        onClose={() => setEditRoleUser(null)}
        title={editRoleUser ? `Phân quyền vai trò · ${editRoleUser.fullName}` : 'Phân quyền vai trò'}
      >
        {editRoleUser && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Chọn vai trò quyền hạn mới cho tài khoản <b className="text-slate-800">{editRoleUser.userId}</b>:
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vai trò (Role)</label>
              <select
                value={newSelectedRole}
                onChange={(e) => setNewSelectedRole(e.target.value as Role)}
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              >
                <option value="student">Sinh viên (Student)</option>
                <option value="teacher">Giảng viên (Teacher)</option>
                <option value="admin">Quản trị viên (Admin)</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditRoleUser(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleUpdateRole}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition"
              >
                <Shield size={14} /> Xác nhận đổi quyền
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

