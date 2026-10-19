import { useState } from 'react'
import { CalendarCheck, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react'
import { authService } from '../../services/api'
import type { User } from '../../types'
import { cn } from '../../lib/utils'

interface LoginViewProps {
  onLogin: (user: User) => void
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin đăng nhập.')
      return
    }

    setLoading(true)
    try {
      const user = await authService.login(username, password)
      onLogin(user)
    } catch (err: any) {
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
          <h1 className="text-2xl font-extrabold text-[#172b35] tracking-tight">EduFace AI</h1>
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
                onClick={() =>
                  setError('Vui lòng liên hệ Quản trị viên phòng Đào tạo (admin@faceai.edu.vn) để được cấp lại mật khẩu.')
                }
              >
                Quên mật khẩu?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
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

        </div>

        <p className="text-center text-[10px] text-[#a8b5b8] mt-4">
          Dữ liệu khuôn mặt được bảo mật theo tiêu chuẩn ISO/IEC 27001
        </p>
      </div>
    </div>
  )
}
