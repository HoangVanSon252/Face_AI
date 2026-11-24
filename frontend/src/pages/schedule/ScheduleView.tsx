import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Play, Radio, Clock3, CheckCircle2 } from 'lucide-react'
import type { AttendanceLog, AttendanceSession, Role, User } from '../../types'
import { attendanceService, sessionService } from '../../services/api'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface Props {
  role: Role
  currentUser: User
  /** Go to the live attendance screen for an open session. */
  onOpenLive: (session: AttendanceSession) => void
}

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

const STATUS_PILL: Record<AttendanceSession['status'], { label: string; cls: string }> = {
  active: { label: 'Đang điểm danh', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'Sắp diễn ra', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  closed: { label: 'Đã học', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  cancelled: { label: 'Đã hủy', cls: 'bg-rose-50 text-rose-600 border-rose-200 line-through' },
}

const RESULT: Record<AttendanceLog['status'], { label: string; cls: string }> = {
  present: { label: 'Có mặt', cls: 'text-emerald-700' },
  late: { label: 'Đi trễ', cls: 'text-amber-700' },
  absent: { label: 'Vắng', cls: 'text-rose-600' },
}

export function ScheduleView({ role, currentUser, onOpenLive }: Props) {
  const { showToast } = useToast()
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [opening, setOpening] = useState<number | null>(null)
  const isStudent = role === 'student'
  const canOpen = role === 'teacher'

  const load = useCallback(async () => {
    const [items, mine] = await Promise.all([
      sessionService.getSessions(),
      isStudent ? attendanceService.getStudentLogs(currentUser.userId) : Promise.resolve([]),
    ])
    setSessions(items)
    setLogs(mine)
    setLoading(false)
  }, [isStudent, currentUser.userId])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener('data:changed', onChange)
    return () => window.removeEventListener('data:changed', onChange)
  }, [load])

  const today = new Date()
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const byDay = useMemo(() => days.map((day) => sessions
    .filter((s) => s.scheduledStartAt && sameDay(new Date(s.scheduledStartAt), day))
    .sort((a, b) => (a.scheduledStartAt || '').localeCompare(b.scheduledStartAt || ''))), [days, sessions])
  const weekCount = byDay.reduce((n, list) => n + list.filter((s) => s.status !== 'cancelled').length, 0)
  const live = sessions.filter((s) => s.status === 'active')
  const resultFor = (session: AttendanceSession) => logs.find((l) => l.sessionId === `SES-${session.id}`)

  const open = async (session: AttendanceSession) => {
    setOpening(session.id)
    try {
      const opened = await sessionService.openSession(session.id)
      showToast(`Đã mở điểm danh ${session.title} · ${session.classId}`, 'success')
      onOpenLive({ ...session, ...opened, className: session.className, classId: session.classId, room: session.room, totalEnrolled: session.totalEnrolled })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể mở điểm danh.', 'error')
    } finally {
      setOpening(null)
    }
  }

  const isThisWeek = sameDay(weekStart, startOfWeek(today))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{role === 'teacher' ? 'Lịch dạy' : role === 'admin' ? 'Lịch học toàn trường' : 'Lịch học của tôi'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {role === 'teacher'
              ? 'Đến giờ học, bấm "Mở điểm danh" ở buổi hôm nay rồi bật camera lớp.'
              : role === 'admin'
              ? 'Tất cả buổi học do giảng viên và phòng đào tạo lập.'
              : 'Khi giảng viên mở điểm danh, hãy đứng trước camera của lớp. Kết quả hiện ngay ở đây.'}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Tuần trước"><ChevronLeft size={16} /></button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', isThisWeek ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100')}>Tuần này</button>
          <span className="px-2 text-xs font-semibold text-slate-600">{dm(days[0])} – {dm(days[6])}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Tuần sau"><ChevronRight size={16} /></button>
        </div>
      </div>

      {live.map((s) => (
        <div key={s.id} className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4">
          <div className="flex items-center gap-3">
            <span className="live-dot h-3 w-3 rounded-full bg-emerald-500" />
            <div>
              <p className="text-sm font-bold text-slate-800">Đang mở điểm danh: {s.className} · {s.classId}</p>
              <p className="text-xs text-slate-500">{s.title} · {s.startTime}–{s.endTime} · phòng {s.room}</p>
            </div>
          </div>
          {isStudent ? (
            resultFor(s)
              ? <span className={cn('inline-flex items-center gap-1 text-sm font-bold', RESULT[resultFor(s)!.status].cls)}><CheckCircle2 size={16} /> Đã ghi nhận: {RESULT[resultFor(s)!.status].label}</span>
              : <span className="text-sm font-semibold text-emerald-700">Hãy đứng trước camera của lớp</span>
          ) : role === 'teacher' ? (
            <button onClick={() => onOpenLive(s)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Radio size={15} /> Vào phiên</button>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">{weekCount} buổi trong tuần</span>
        <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">{sessions.filter((s) => s.status === 'scheduled').length} buổi sắp tới cả kỳ</span>
      </div>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-7">{days.map((d) => <div key={d.toISOString()} className="skeleton h-40" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarDays size={36} className="mx-auto text-teal-600" />
          <p className="mt-3 font-semibold text-slate-800">Chưa có buổi học nào</p>
          <p className="mt-1 text-sm text-slate-500">
            {isStudent ? 'Bạn chưa được xếp vào ca học nào, hoặc ca học chưa có lịch.' : 'Vào "Ca học" để lập lịch cả kỳ hoặc thêm buổi.'}
          </p>
        </div>
      ) : (
        <div key={weekStart.toISOString()} className="stagger grid gap-3 lg:grid-cols-7">
          {days.map((day, index) => {
            const isToday = sameDay(day, today)
            const items = byDay[index]
            return (
              <div key={day.toISOString()} className={cn('min-h-[120px] rounded-2xl border bg-white p-2.5', isToday ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200')}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className={cn('text-xs font-bold', isToday ? 'text-teal-700' : 'text-slate-500')}>{WEEKDAYS[index]}</span>
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', isToday ? 'bg-teal-700 text-white' : 'text-slate-400')}>{dm(day)}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-slate-300 lg:py-6">Trống</p>}
                  {items.map((s) => {
                    const result = isStudent ? resultFor(s) : undefined
                    const canOpenNow = canOpen && s.status === 'scheduled' && isToday
                    return (
                      <div key={s.id} className={cn('lift rounded-xl border p-2.5 text-xs', s.status === 'active' ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60')}>
                        <p className="flex items-center gap-1 font-mono font-bold text-slate-800"><Clock3 size={11} />{s.startTime}–{s.endTime}</p>
                        <p className="mt-1 line-clamp-2 font-semibold text-slate-800">{s.className}</p>
                        <p className="mt-0.5 text-slate-500">{s.classId} · {s.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-slate-400"><MapPin size={10} />{s.room}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                          <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', STATUS_PILL[s.status].cls)}>{STATUS_PILL[s.status].label}</span>
                          {result && <span className={cn('text-[11px] font-bold', RESULT[result.status].cls)}>{RESULT[result.status].label}</span>}
                          {isStudent && !result && s.status === 'closed' && <span className="text-[11px] font-bold text-rose-600">Vắng</span>}
                        </div>
                        {canOpenNow && (
                          <button disabled={opening === s.id} onClick={() => open(s)} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-teal-700 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                            <Play size={11} className="fill-current" /> {opening === s.id ? 'Đang mở…' : 'Mở điểm danh'}
                          </button>
                        )}
                        {canOpen && s.status === 'active' && (
                          <button onClick={() => onOpenLive(s)} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"><Radio size={11} /> Vào phiên</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
