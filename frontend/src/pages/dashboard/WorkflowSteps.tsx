import { useCallback, useEffect, useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import type { Role, User, View } from '../../types'
import { httpClient } from '../../services/httpClient'
import { adminUserService } from '../../services/adminUsers'
import { cn } from '../../lib/utils'

interface Step {
  label: string
  detail: string
  done: boolean
  view: View
  action: string
}

interface Props {
  role: Role
  currentUser: User
  onNavigate: (view: View) => void
}

const TITLES: Record<Role, { title: string; hint: string }> = {
  admin: { title: 'Quy trình thiết lập học kỳ', hint: 'Làm lần lượt; xong bước 5 giảng viên đã có thể mở điểm danh.' },
  teacher: { title: 'Quy trình giảng dạy', hint: 'Từ ca học được phân công đến khi chốt kết quả điểm danh.' },
  student: { title: 'Quy trình điểm danh của bạn', hint: 'Đăng ký khuôn mặt một lần, sau đó chỉ cần đứng trước camera lớp.' },
}

const get = <T,>(path: string) => httpClient.get<T>(path).catch(() => [] as unknown as T)

async function loadSteps(role: Role, user: User): Promise<Step[]> {
  if (role === 'admin') {
    const [semesters, users, classes, courses, sections, sessions] = await Promise.all([
      get<{ status: string }[]>('/api/v1/academic/semesters'),
      adminUserService.getUsers().catch(() => [] as User[]),
      get<unknown[]>('/api/v1/academic/student-classes'),
      get<unknown[]>('/api/v1/academic/courses'),
      get<{ id: number }[]>('/api/v1/academic/sections'),
      get<unknown[]>('/api/v1/sessions'),
    ])
    const lecturers = users.filter((u) => u.role === 'teacher').length
    const students = users.filter((u) => u.role === 'student').length
    return [
      { label: 'Học kỳ hiện tại', detail: semesters.some((s) => s.status === 'ACTIVE') ? 'Đã có học kỳ đang diễn ra' : `${semesters.length} học kỳ, chưa chọn học kỳ hiện tại`, done: semesters.some((s) => s.status === 'ACTIVE'), view: 'Học kỳ', action: 'Tạo học kỳ' },
      { label: 'Tài khoản', detail: `${lecturers} giảng viên · ${students} sinh viên`, done: lecturers > 0 && students > 0, view: 'Người dùng', action: 'Thêm tài khoản' },
      { label: 'Lớp hành chính', detail: `${classes.length} lớp sinh viên`, done: classes.length > 0, view: 'Lớp học', action: 'Tạo lớp' },
      { label: 'Môn học & ca học', detail: `${courses.length} môn · ${sections.length} ca học`, done: sections.length > 0, view: 'Môn học', action: 'Mở ca học' },
      { label: 'Thêm lớp & lập lịch', detail: `${sessions.length} buổi học đã lập`, done: sessions.length > 0, view: 'Môn học', action: 'Lập lịch' },
    ]
  }
  if (role === 'teacher') {
    const [sections, sessions, records, appeals] = await Promise.all([
      get<unknown[]>('/api/v1/academic/sections'),
      get<{ status: string; scheduled_start_at: string }[]>('/api/v1/sessions'),
      get<{ review_status: string }[]>('/api/v1/attendance'),
      get<{ status: string }[]>('/api/v1/appeals'),
    ])
    const today = new Date().toDateString()
    const todayCount = sessions.filter((s) => s.status === 'SCHEDULED' && new Date(s.scheduled_start_at).toDateString() === today).length
    const ran = sessions.filter((s) => s.status === 'OPEN' || s.status === 'CLOSED').length
    const pending = records.filter((r) => r.review_status === 'PENDING').length
    const open = appeals.filter((a) => a.status === 'PENDING').length
    return [
      { label: 'Ca học được phân công', detail: `${sections.length} ca học`, done: sections.length > 0, view: 'Môn học', action: 'Xem ca học' },
      { label: 'Lịch buổi học', detail: `${sessions.length} buổi đã lập`, done: sessions.length > 0, view: 'Môn học', action: 'Lập lịch' },
      { label: 'Mở điểm danh', detail: todayCount ? `Hôm nay còn ${todayCount} buổi chưa mở` : `${ran} buổi đã điểm danh`, done: todayCount === 0 && ran > 0, view: 'Lịch học', action: 'Lịch dạy' },
      { label: 'Duyệt kết quả', detail: pending ? `${pending} lượt chờ duyệt` : 'Không có lượt chờ duyệt', done: pending === 0, view: 'Điểm danh', action: 'Duyệt ngay' },
      { label: 'Khiếu nại', detail: open ? `${open} khiếu nại chờ xử lý` : 'Không có khiếu nại mới', done: open === 0, view: 'Khiếu nại', action: 'Xử lý' },
    ]
  }
  const [sessions, records, appeals] = await Promise.all([
    get<{ status: string }[]>('/api/v1/sessions'),
    get<unknown[]>('/api/v1/students/me/attendance'),
    get<{ status: string }[]>('/api/v1/appeals/me'),
  ])
  const live = sessions.some((s) => s.status === 'OPEN')
  return [
    { label: 'Đăng ký khuôn mặt', detail: user.hasFaceRegistered ? 'Đã có hồ sơ khuôn mặt' : 'Bắt buộc trước buổi học đầu tiên', done: Boolean(user.hasFaceRegistered), view: 'Đăng ký khuôn mặt', action: 'Đăng ký' },
    { label: 'Xem lịch học', detail: `${sessions.length} buổi trong các ca học của bạn`, done: sessions.length > 0, view: 'Lịch học', action: 'Lịch học' },
    { label: 'Điểm danh trước camera', detail: live ? 'Đang có buổi mở điểm danh' : `${records.length} lượt đã ghi nhận`, done: records.length > 0 && !live, view: 'Lịch học', action: live ? 'Xem buổi đang mở' : 'Lịch học' },
    { label: 'Kiểm tra & khiếu nại', detail: appeals.some((a) => a.status === 'PENDING') ? 'Có khiếu nại đang chờ' : 'Xem lại kết quả từng buổi', done: records.length > 0 && !appeals.some((a) => a.status === 'PENDING'), view: 'Lịch sử điểm danh', action: 'Lịch sử' },
  ]
}

export function WorkflowSteps({ role, currentUser, onNavigate }: Props) {
  const [steps, setSteps] = useState<Step[] | null>(null)

  const load = useCallback(async () => setSteps(await loadSteps(role, currentUser)), [role, currentUser])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener('data:changed', onChange)
    return () => window.removeEventListener('data:changed', onChange)
  }, [load])

  if (!steps) return <div className="skeleton h-[148px]" />

  const doneCount = steps.filter((s) => s.done).length
  const next = steps.findIndex((s) => !s.done)
  const { title, hint } = TITLES[role]

  return (
    <section className="animate-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        </div>
        <span className="text-xs font-bold text-teal-700">{doneCount}/{steps.length} bước</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-700 transition-[width] duration-700 ease-out" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className={cn('stagger mt-4 grid gap-2.5', steps.length === 5 ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-4')}>
        {steps.map((step, index) => {
          const isNext = index === next
          return (
            <li key={step.label}>
              <button
                onClick={() => onNavigate(step.view)}
                className={cn(
                  'lift group flex h-full w-full flex-col rounded-xl border p-3 text-left',
                  step.done ? 'border-teal-100 bg-teal-50/50' : isNext ? 'border-teal-400 bg-white ring-2 ring-teal-100' : 'border-slate-200 bg-white'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                    step.done ? 'bg-teal-600 text-white' : isNext ? 'bg-teal-700 text-white animate-pulse-ring' : 'bg-slate-100 text-slate-500'
                  )}>
                    {step.done ? <Check size={13} className="animate-pop-in" /> : index + 1}
                  </span>
                  <span className="text-[13px] font-bold text-slate-800">{step.label}</span>
                </div>
                <p className="mt-1.5 flex-1 text-[11.5px] leading-snug text-slate-500">{step.detail}</p>
                <span className={cn('mt-2 inline-flex items-center gap-1 text-[11px] font-semibold transition-all group-hover:gap-1.5', step.done ? 'text-slate-400' : 'text-teal-700')}>
                  {step.done ? 'Xem lại' : step.action} <ArrowRight size={12} />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
