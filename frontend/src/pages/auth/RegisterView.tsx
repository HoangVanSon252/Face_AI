import { useState } from 'react'
import { CalendarCheck, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2, ChevronLeft } from 'lucide-react'
import { authService } from '../../services/api'
import { cn } from '../../lib/utils'

interface RegisterViewProps {
  onGoLogin: () => void
  onRegistered: () => void
}

interface FormState {
  fullName: string
  email: string
  userId: string
  password: string
  confirmPassword: string
  role: 'student' | 'teacher'
  department: string
}

const DEPARTMENTS = [
  'Công nghệ thông tin',
  'Kỹ thuật phần mềm',
  'An toàn thông tin',
  'Khoa học máy tính',
  'Hệ thống thông tin',
  'Điện tử viễn thông',
  'Kinh tế số',
]

function getPasswordStrength(pw: string): { level: number; label: string; color: string } {
  if (!pw) return { level: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length >= 12) score++

  if (score <= 1) return { level: 1, label: 'Rất yếu', color: 'bg-[#c96d58]' }
  if (score === 2) return { level: 2, label: 'Yếu', color: 'bg-[#cc8b30]' }
  if (score === 3) return { level: 3, label: 'Trung bình', color: 'bg-[#527db8]' }
  if (score === 4) return { level: 4, label: 'Mạnh', color: 'bg-[#148f83]' }
  return { level: 5, label: 'Rất mạnh', color: 'bg-[#148f83]' }
}

export function RegisterView({ onGoLogin, onRegistered }: RegisterViewProps) {
  const [form, setForm] = useState<FormState>({
    fullName: '',
    email: '',
    userId: '',
    password: '',
    confirmPassword: '',
    role: 'student',
    department: 'Công nghệ thông tin',
  })
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<FormState>>({})

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
    setError('')
  }

  const validate = (): boolean => {
    const errs: Partial<FormState> = {}
    if (!form.fullName.trim()) errs.fullName = 'Vui lòng nhập họ tên'
    else if (form.fullName.trim().length < 3) errs.fullName = 'Họ tên phải có ít nhất 3 ký tự'

    if (!form.email.trim()) errs.email = 'Vui lòng nhập email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email không hợp lệ'

    if (!form.userId.trim()) errs.userId = `Vui lòng nhập ${form.role === 'student' ? 'MSSV' : 'Mã GV'}`
    else if (form.userId.trim().length < 4) errs.userId = 'Mã phải có ít nhất 4 ký tự'

    if (!form.password) errs.password = 'Vui lòng nhập mật khẩu'
    else if (form.password.length < 6) errs.password = 'Mật khẩu phải ít nhất 6 ký tự'

    if (!form.confirmPassword) errs.confirmPassword = 'Vui lòng xác nhận mật khẩu'
    else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Mật khẩu xác nhận không khớp'

    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setError('')
    try {
      await authService.register({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        userId: form.userId.trim().toUpperCase(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: form.role,
        department: form.department,
      })
      setSuccess(true)
      setTimeout(() => {
        onRegistered()
      }, 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const pwStrength = getPasswordStrength(form.password)

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f5f8f8] via-[#edf6f5] to-[#e8f4f2] flex items-center justify-center p-4">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 bg-[#e0f5f1] rounded-full grid place-items-center mx-auto mb-4">
            <CheckCircle2 size={34} className="text-[#148f83]" />
          </div>
          <h2 className="text-xl font-bold text-[#172b35] mb-1">Đăng ký thành công!</h2>
          <p className="text-sm text-[#6e7d82]">Đang chuyển hướng đến trang đăng nhập…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f8f8] via-[#edf6f5] to-[#e8f4f2] flex items-center justify-center p-4">
      {/* BG orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#148f83]/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#148f83]/6 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Back link */}
        <button
          onClick={onGoLogin}
          className="flex items-center gap-1.5 text-xs text-[#6e7d82] hover:text-[#148f83] mb-4 transition-colors font-medium"
        >
          <ChevronLeft size={15} />
          Quay lại đăng nhập
        </button>

        {/* Logo */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#148f83] rounded-2xl shadow-[0_8px_24px_rgba(20,143,131,0.3)] mb-3">
            <CalendarCheck size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-extrabold text-[#172b35]">Tạo tài khoản mới</h1>
          <p className="text-xs text-[#6e7d82] mt-1">Hệ thống điểm danh AI · Đại học FPT</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#e4ebeb] shadow-[0_4px_24px_rgba(23,43,53,0.08)] p-6">
          {/* Role selector */}
          <div className="flex gap-2 mb-5">
            {(['student', 'teacher'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => update('role', r)}
                className={cn(
                  'flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                  form.role === r
                    ? 'bg-[#148f83] text-white border-[#148f83] shadow-sm'
                    : 'bg-[#f5f8f8] text-[#6e7d82] border-[#e4ebeb] hover:border-[#148f83]/40'
                )}
              >
                {r === 'student' ? '🎓 Sinh viên' : '👨‍🏫 Giảng viên'}
              </button>
            ))}
          </div>

          {/* Global error */}
          {error && (
            <div className="mb-4 flex items-start gap-2.5 bg-[#fbe8e2] border border-[#f4b5a5] text-[#9b3d2c] rounded-xl px-3.5 py-3 text-xs font-medium animate-fade-in">
              <AlertTriangle size={14} className="flex-none mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Họ tên */}
            <Field label="Họ và tên" error={fieldErrors.fullName}>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
                placeholder="Nguyễn Văn An"
                className={inputCls(fieldErrors.fullName)}
              />
            </Field>

            {/* Email */}
            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="nguyenvana@fpt.edu.vn"
                className={inputCls(fieldErrors.email)}
              />
            </Field>

            {/* MSSV / Mã GV */}
            <Field
              label={form.role === 'student' ? 'MSSV (Mã số sinh viên)' : 'Mã giảng viên'}
              error={fieldErrors.userId}
            >
              <input
                type="text"
                value={form.userId}
                onChange={(e) => update('userId', e.target.value)}
                placeholder={form.role === 'student' ? 'SV20240128' : 'GV2021042'}
                className={inputCls(fieldErrors.userId)}
              />
            </Field>

            {/* Khoa */}
            <Field label="Khoa / Bộ môn">
              <select
                value={form.department}
                onChange={(e) => update('department', e.target.value)}
                className={inputCls()}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>

            {/* Password */}
            <Field label="Mật khẩu" error={fieldErrors.password}>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className={cn(inputCls(fieldErrors.password), 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b999d]"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Strength bar */}
              {form.password && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors',
                          i <= pwStrength.level ? pwStrength.color : 'bg-[#e4ebeb]'
                        )}
                      />
                    ))}
                  </div>
                  <span className={cn('text-[10px] font-semibold', pwStrength.level >= 4 ? 'text-[#148f83]' : pwStrength.level >= 3 ? 'text-[#527db8]' : 'text-[#c96d58]')}>
                    {pwStrength.label}
                  </span>
                </div>
              )}
            </Field>

            {/* Confirm password */}
            <Field label="Xác nhận mật khẩu" error={fieldErrors.confirmPassword}>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className={cn(inputCls(fieldErrors.confirmPassword), 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b999d]"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                {form.confirmPassword && form.password === form.confirmPassword && (
                  <CheckCircle2 size={15} className="absolute right-9 top-1/2 -translate-y-1/2 text-[#148f83]" />
                )}
              </div>
            </Field>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'mt-1 w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all',
                'bg-[#148f83] text-white shadow-[0_4px_14px_rgba(20,143,131,0.3)]',
                'hover:bg-[#0f7a70] hover:shadow-[0_6px_20px_rgba(20,143,131,0.4)]',
                'disabled:opacity-60 disabled:pointer-events-none'
              )}
            >
              {loading ? <Loader2 size={18} className="animate-spin-slow" /> : null}
              {loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
            </button>
          </form>

          <p className="text-center text-xs text-[#8b999d] mt-5">
            Đã có tài khoản?{' '}
            <button onClick={onGoLogin} className="text-[#148f83] font-bold hover:underline">
              Đăng nhập
            </button>
          </p>
        </div>

        <p className="text-center text-[10px] text-[#a8b5b8] mt-4">
          Thông tin cá nhân được bảo mật theo chính sách quyền riêng tư
        </p>
      </div>
    </div>
  )
}

// Reusable field wrapper
function Field({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#4a5d65] mb-1.5">{label}</label>
      {children}
      {error && (
        <p className="text-[10.5px] text-[#c96d58] mt-1 font-medium animate-fade-in">{error}</p>
      )}
    </div>
  )
}

function inputCls(error?: string) {
  return cn(
    'w-full h-10 px-3.5 rounded-xl border text-sm bg-[#fafcfc] outline-none transition-all',
    'placeholder:text-[#b0bec2]',
    error
      ? 'border-[#c96d58]/60 focus:border-[#c96d58] focus:ring-2 focus:ring-[#c96d58]/15'
      : 'border-[#e4ebeb] focus:border-[#148f83] focus:ring-2 focus:ring-[#148f83]/15'
  )
}
