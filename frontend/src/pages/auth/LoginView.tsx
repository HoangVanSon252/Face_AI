import { useState } from 'react'
import { CalendarCheck, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react'
import { authService } from '../../services/api'
import type { User, Role } from '../../types'
import { cn } from '../../lib/utils'

interface LoginViewProps {
  onLogin: (user: User) => void
  onGoRegister: () => void
}

const DEMO_ACCOUNTS = [
  { role: 'student' as Role, label: 'Sinh viên', username: 'sv.nguyenvanA', color: 'bg-[#fbe8e2] text-[#c96d58] border-[#f4c5b5]' },
  { role: 'teacher' as Role, label: 'Giảng viên', username: 'gv.tranthibinh', color: 'bg-[#e0f5f1] text-[#138d81] border-[#b2e0d8]' },
  { role: 'admin' as Role,   label: 'Quản trị viên', username: 'admin.sys', color: 'bg-[#fff2dc] text-[#cc8b30] border-[#f5d98a]' },
]

// Rate limiting: max 5 attempts per 60s
const RATE_LIMIT_KEY = 'attendly_login_attempts'
const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 60_000

interface RateData { count: number; lockedUntil?: number }

function getRateData(): RateData {
  try {
    const d = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '{}')
    return { count: d.count ?? 0, lockedUntil: d.lockedUntil }
  } catch {
    return { count: 0 }
  }
}
function setRateData(d: RateData) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(d))
}
function resetRateData() { localStorage.removeItem(RATE_LIMIT_KEY) }

export function LoginView({ onLogin, onGoRegister }: LoginViewProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRole] = useState<Role | undefined>(undefined)

  const getRemainingLockSeconds = (): number => {
    const rd = getRateData()
    if (rd.lockedUntil && Date.now() < rd.lockedUntil) {
      return Math.ceil((rd.lockedUntil - Date.now()) / 1000)
    }
    return 0
  }

  const [lockSec, setLockSec] = useState(getRemainingLockSeconds)

  // Countdown timer when locked
  const startCountdown = (secs: number) => {
    setLockSec(secs)
    const interval = setInterval(() => {
      setLockSec((prev) => {
        if (prev <= 1) { clearInterval(interval); resetRateData(); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (lockSec > 0) {
      setError(`Tài khoản tạm khóa. Vui lòng thử lại sau ${lockSec} giây.`)
      return
    }

    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin đăng nhập.')
      return
    }

    const rd = getRateData()
    if (rd.lockedUntil && Date.now() < rd.lockedUntil) {
      const secs = Math.ceil((rd.lockedUntil - Date.now()) / 1000)
      startCountdown(secs)
      setError(`Tài khoản tạm khóa do đăng nhập sai quá nhiều lần. Thử lại sau ${secs} giây.`)
      return
    }

    setLoading(true)
    try {
      const user = await authService.login(username, password, selectedRole)
      resetRateData()
      onLogin(user)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Đăng nhập thất bại'
      // Rate limit tracking
      const count = (rd.count || 0) + 1
      if (count >= MAX_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCK_DURATION_MS
        setRateData({ count, lockedUntil })
        startCountdown(Math.ceil(LOCK_DURATION_MS / 1000))
        setError(`Sai mật khẩu ${MAX_ATTEMPTS} lần liên tiếp. Tài khoản bị tạm khóa 60 giây.`)
      } else {
        setRateData({ count })
        setError(`${errMsg} (${count}/${MAX_ATTEMPTS} lần thử)`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (role: Role) => {
    setLoading(true)
    setError('')
    try {
      const user = await authService.login('', '', role)
      resetRateData()
      onLogin(user)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f8f8] via-[#edf6f5] to-[#e8f4f2] flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#148f83]/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#148f83]/6 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo + Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#148f83] rounded-2xl shadow-[0_8px_24px_rgba(20,143,131,0.3)] mb-4">
            <CalendarCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#172b35] tracking-tight">Attendly</h1>
          <p className="text-sm text-[#6e7d82] mt-1">Hệ thống điểm danh thông minh bằng khuôn mặt</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#e4ebeb] shadow-[0_4px_24px_rgba(23,43,53,0.08)] p-6">
          <h2 className="text-[15px] font-bold text-[#172b35] mb-4">Đăng nhập vào hệ thống</h2>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2.5 bg-[#fbe8e2] border border-[#f4b5a5] text-[#9b3d2c] rounded-xl px-3.5 py-3 text-xs font-medium animate-fade-in">
              <AlertTriangle size={15} className="flex-none mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-[#4a5d65] mb-1.5">
                Tên đăng nhập / Email / MSSV
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập username, email hoặc MSSV…"
                autoFocus
                autoComplete="username"
                className={cn(
                  'w-full h-10 px-3.5 rounded-xl border text-sm bg-[#fafcfc] outline-none transition-all',
                  'placeholder:text-[#b0bec2]',
                  'border-[#e4ebeb] focus:border-[#148f83] focus:ring-2 focus:ring-[#148f83]/15',
                  error && !loading ? 'border-[#c96d58]/60' : ''
                )}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-[#4a5d65] mb-1.5">Mật khẩu</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn(
                    'w-full h-10 px-3.5 pr-10 rounded-xl border text-sm bg-[#fafcfc] outline-none transition-all',
                    'placeholder:text-[#b0bec2]',
                    'border-[#e4ebeb] focus:border-[#148f83] focus:ring-2 focus:ring-[#148f83]/15',
                    error && !loading ? 'border-[#c96d58]/60' : ''
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b999d] hover:text-[#172b35]"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Forgot link */}
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                className="text-[11px] text-[#148f83] hover:underline font-medium"
                onClick={() => alert('Tính năng quên mật khẩu chưa triển khai trong bản demo.')}
              >
                Quên mật khẩu?
              </button>
            </div>

            {/* Lock countdown */}
            {lockSec > 0 && (
              <div className="bg-[#fff2dc] border border-[#f5d98a] text-[#886214] rounded-xl px-3.5 py-2.5 text-xs text-center font-medium">
                ⏳ Tài khoản tạm khóa — thử lại sau <strong>{lockSec}s</strong>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || lockSec > 0}
              className={cn(
                'w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all',
                'bg-[#148f83] text-white shadow-[0_4px_14px_rgba(20,143,131,0.3)]',
                'hover:bg-[#0f7a70] hover:shadow-[0_6px_20px_rgba(20,143,131,0.4)]',
                'disabled:opacity-60 disabled:pointer-events-none'
              )}
            >
              {loading ? <Loader2 size={18} className="animate-spin-slow" /> : null}
              {loading ? 'Đang xác thực…' : 'Đăng nhập'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#e4ebeb]" />
            <span className="text-[10px] text-[#a8b5b8] font-medium uppercase tracking-wider">Demo nhanh</span>
            <div className="flex-1 h-px bg-[#e4ebeb]" />
          </div>

          {/* Demo accounts */}
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map(({ role, label, color }) => (
              <button
                key={role}
                onClick={() => handleDemoLogin(role)}
                disabled={loading}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-[10.5px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60',
                  color
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-current/10 grid place-items-center text-lg">
                  {role === 'student' ? '🎓' : role === 'teacher' ? '👨‍🏫' : '🛡️'}
                </div>
                {label}
              </button>
            ))}
          </div>

          {/* Register link */}
          <p className="text-center text-xs text-[#8b999d] mt-5">
            Chưa có tài khoản?{' '}
            <button
              onClick={onGoRegister}
              className="text-[#148f83] font-bold hover:underline"
            >
              Đăng ký ngay
            </button>
          </p>
        </div>

        <p className="text-center text-[10px] text-[#a8b5b8] mt-4">
          Dữ liệu khuôn mặt được bảo mật theo tiêu chuẩn ISO/IEC 27001
        </p>
      </div>
    </div>
  )
}
