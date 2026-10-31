import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, Clock, MapPin, Pencil, Plus, Trash2, User as UserIcon, Users } from 'lucide-react'
import type { AttendanceSession, ClassItem, Role, Subject, User } from '../../types'
import { classService, sectionService, sessionService, subjectService, userService, type SectionOverview } from '../../services/api'
import { httpClient } from '../../services/httpClient'
import { Modal } from '../../components/common/Modal'
import { ConfirmModal } from '../../components/common/ConfirmModal'
import { useToast } from '../../components/common/Toast'

interface Props { role: Role; currentUser: User; onStartAttendance?: (classId: string, session?: AttendanceSession) => void; onOpenClassRoster?: (classItem: ClassItem) => void }
interface Semester { id: number; code: string; name: string; start_date: string; end_date: string; status: 'PLANNED'|'ACTIVE'|'CLOSED' }
interface AdminClass { id: number; code: string; name?: string; department?: string }
type OverviewSession = SectionOverview['sessions'][number]

const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
// Inputs are campus wall-clock time; the API stores UTC.
const toIso = (day: string, time: string) => new Date(`${day}T${time}:00`).toISOString()
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
// Backend weekday numbers: 0 = Monday ... 6 = Sunday.
const SCHEDULE_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const STATUS: Record<OverviewSession['status'], { label: string; cls: string }> = {
  SCHEDULED: { label: 'Sắp diễn ra', cls: 'bg-sky-50 text-sky-700' },
  OPEN: { label: 'Đang điểm danh', cls: 'bg-emerald-50 text-emerald-700' },
  CLOSED: { label: 'Đã kết thúc', cls: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-rose-50 text-rose-600' },
}
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export function ClassManagement({ role, currentUser }: Props) {
  const { showToast } = useToast(); const canEdit = role !== 'student'; const isAdmin = role === 'admin'
  const [params, setParams] = useSearchParams()
  const courseId = Number(params.get('course')) || null
  const sectionId = Number(params.get('section')) || null
  const [subjects, setSubjects] = useState<Subject[]>([]); const [sections, setSections] = useState<ClassItem[]>([]); const [users, setUsers] = useState<User[]>([])
  const [adminClasses, setAdminClasses] = useState<AdminClass[]>([]); const [semesters, setSemesters] = useState<Semester[]>([])
  const [showSubject, setShowSubject] = useState(false); const [editingSubject, setEditingSubject] = useState<Subject | null>(null); const [subjectCode, setSubjectCode] = useState(''); const [subjectName, setSubjectName] = useState(''); const [credits, setCredits] = useState('3')
  const [showSectionForm, setShowSectionForm] = useState(false); const [sectionCode, setSectionCode] = useState(''); const [room, setRoom] = useState(''); const [semesterId, setSemesterId] = useState<number | ''>(''); const [lecturerId, setLecturerId] = useState<number | ''>('')
  const [showSemesters, setShowSemesters] = useState(false); const [editingSemester, setEditingSemester] = useState<Semester | null>(null); const [semCode, setSemCode] = useState(''); const [semName, setSemName] = useState(''); const [semStart, setSemStart] = useState(''); const [semEnd, setSemEnd] = useState(''); const [semStatus, setSemStatus] = useState<Semester['status']>('PLANNED')
  const [toDelete, setToDelete] = useState<{kind:'subject'|'section'|'semester'; id:number; label:string} | null>(null)

  const load = useCallback(async () => {
    const [a,b,c,d,e] = await Promise.all([subjectService.getSubjects(), classService.getClasses(), userService.getUsers(), httpClient.get<AdminClass[]>('/api/v1/academic/student-classes').catch(()=>[]), httpClient.get<Semester[]>('/api/v1/academic/semesters').catch(()=>[])])
    setSubjects(a); setSections(b); setUsers(c); setAdminClasses(d); setSemesters(e)
  }, [])
  useEffect(() => {
    void load()
    // Reload in place (no remount) so the open subject / ca học stays selected.
    const onChanged = () => { void load() }
    window.addEventListener('data:changed', onChanged)
    return () => window.removeEventListener('data:changed', onChanged)
  }, [load])

  const active = subjects.find(x => x.id === courseId) || null
  const teachers = useMemo(() => users.filter(x => x.role === 'teacher'), [users])
  const students = useMemo(() => users.filter(x => x.role === 'student'), [users])
  const courseSections = useMemo(() => active ? sections.filter(x => x.courseId === active.id || x.courseCode === active.code) : [], [active, sections])
  const classCodesOf = (s: ClassItem) => Array.from(new Set(students.filter(x => s.studentIds.includes(x.userId)).map(x => x.administrativeClass).filter(Boolean))) as string[]
  const go = (next: { course?: number | null; section?: number | null }) => {
    const p = new URLSearchParams()
    if (next.course) p.set('course', String(next.course))
    if (next.section) p.set('section', String(next.section))
    setParams(p)
  }
  const error = (e: unknown, fallback: string) => showToast(errorText(e, fallback), 'error')

  const openSubject = (item?: Subject) => { setEditingSubject(item || null); setSubjectCode(item?.code || ''); setSubjectName(item?.name || ''); setCredits(String(item?.credits || 3)); setShowSubject(true) }
  const saveSubject = async (e: React.FormEvent) => { e.preventDefault(); try { const data={code:subjectCode,name:subjectName,credits:Number(credits)}; if(editingSubject) await subjectService.updateSubject(editingSubject.id,data); else await subjectService.createSubject(data); setShowSubject(false); await load(); showToast('Đã lưu môn học.','success') } catch(e){ error(e,'Không thể lưu môn học') } }
  const openCreateSection = () => {
    setSectionCode(`${active?.code || 'MON'}-CA${pad(courseSections.length + 1)}`); setRoom('')
    setSemesterId((semesters.find(x => x.status === 'ACTIVE') || semesters.find(x => x.status !== 'CLOSED'))?.id || '')
    setLecturerId(isAdmin ? '' : currentUser.id); setShowSectionForm(true)
  }
  const createSection = async (e: React.FormEvent) => {
    e.preventDefault(); if(!active || !semesterId || !lecturerId) return showToast('Hãy chọn học kỳ và giảng viên phụ trách.','info')
    try { const created = await classService.createSection({sectionCode:sectionCode.trim().toUpperCase(), courseId:active.id, semesterId:Number(semesterId), lecturerId:Number(lecturerId), room}); setShowSectionForm(false); await load(); showToast('Đã tạo ca học. Hãy thêm lớp và lập lịch.','success'); go({course:active.id, section:created.id}) } catch(e){ error(e,'Không thể tạo ca học') }
  }
  const openSemester = (item?:Semester) => { setEditingSemester(item||null); setSemCode(item?.code||''); setSemName(item?.name||''); setSemStart(item?.start_date||''); setSemEnd(item?.end_date||''); setSemStatus(item?.status||'PLANNED'); setShowSemesters(true) }
  const saveSemester = async (e:React.FormEvent) => { e.preventDefault(); try { const data={code:semCode.toUpperCase(),name:semName,start_date:semStart,end_date:semEnd,status:semStatus}; if(editingSemester) await httpClient.patch(`/api/v1/academic/semesters/${editingSemester.id}`,data); else await httpClient.post('/api/v1/academic/semesters',data); setEditingSemester(null); setSemCode(''); setSemName(''); setSemStart(''); setSemEnd(''); setSemStatus('PLANNED'); await load(); showToast('Đã lưu học kỳ.','success') } catch(e){ error(e,'Không thể lưu học kỳ') } }
  const remove = async () => { if(!toDelete) return; try { if(toDelete.kind==='subject') await subjectService.deleteSubject(toDelete.id); if(toDelete.kind==='section') await classService.deleteClass(toDelete.id); if(toDelete.kind==='semester') await httpClient.delete(`/api/v1/academic/semesters/${toDelete.id}`); if(toDelete.kind==='subject' && courseId===toDelete.id) go({}); if(toDelete.kind==='section') go({course:courseId}); setToDelete(null); await load(); showToast('Đã xóa.','success') } catch(e){ error(e,'Không thể xóa') } }

  const confirm = <ConfirmModal isOpen={!!toDelete} title="Xác nhận xóa" message={`Xóa ${toDelete?.label}? Thao tác này không thể hoàn tác.`} confirmText="Xóa" onCancel={()=>setToDelete(null)} onConfirm={remove}/>

  if (active && sectionId) return <>
    <SectionDetail sectionId={sectionId} isAdmin={isAdmin} canEdit={canEdit} teachers={teachers} adminClasses={adminClasses}
      onBack={() => go({course: active.id})} onDelete={(label) => setToDelete({kind:'section', id:sectionId, label})} onChanged={load}/>
    {confirm}
  </>

  if(!active) return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">QUẢN LÝ MÔN HỌC</span><h2 className="mt-3 text-2xl font-bold">Danh sách môn học</h2><p className="mt-1 text-sm text-slate-500">Mỗi môn có nhiều ca học. Mỗi ca gồm một hoặc nhiều lớp sinh viên và có lịch buổi học riêng.</p></div><div className="flex gap-2">{isAdmin&&<button onClick={()=>openSemester()} className="rounded-xl border px-4 py-2 text-sm font-semibold"><CalendarDays size={16} className="mr-1 inline"/>Học kỳ</button>}{canEdit&&<button onClick={()=>openSubject()} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} className="mr-1 inline"/>Tạo môn học</button>}</div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{subjects.map(s=>{ const count = sections.filter(x=>x.courseId===s.id||x.courseCode===s.code).length; return <div key={s.id} className="rounded-2xl border bg-white p-6 shadow-sm"><button onClick={()=>go({course:s.id})} className="block w-full text-left"><BookOpen className="text-teal-700"/><div className="mt-6 flex items-center justify-between gap-2"><h3 className="text-lg font-bold">{s.name}</h3><span className="rounded bg-slate-100 px-2 py-1 text-xs">{s.credits} tín chỉ</span></div><p className="mt-2 font-mono text-sm text-slate-500">{s.code}</p><div className="mt-5 flex items-center justify-between border-t pt-4 text-sm font-semibold text-teal-700"><span>{count} ca học</span><span>Xem ca học →</span></div></button>{isAdmin&&<div className="mt-3 flex justify-end gap-3 text-xs"><button onClick={()=>openSubject(s)} className="text-teal-700"><Pencil size={13} className="mr-1 inline"/>Sửa</button><button onClick={()=>setToDelete({kind:'subject',id:s.id,label:s.name})} className="text-rose-600"><Trash2 size={13} className="mr-1 inline"/>Xóa</button></div>}</div>})}</div>{!subjects.length&&<p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Chưa có môn học nào.</p>}
  <SemesterModal open={showSemesters} onClose={()=>setShowSemesters(false)} semesters={semesters} editing={editingSemester} onEdit={openSemester} onDelete={x=>setToDelete({kind:'semester',id:x.id,label:x.name})} code={semCode} name={semName} start={semStart} end={semEnd} status={semStatus} setCode={setSemCode} setName={setSemName} setStart={setSemStart} setEnd={setSemEnd} setStatus={setSemStatus} onSave={saveSemester}/><Modal isOpen={showSubject} onClose={()=>setShowSubject(false)} title={editingSubject?'Sửa môn học':'Tạo môn học'}><form onSubmit={saveSubject} className="space-y-3"><label className="block text-sm">Mã môn<input required value={subjectCode} onChange={e=>setSubjectCode(e.target.value.toUpperCase())} className={field}/></label><label className="block text-sm">Tên môn<input required value={subjectName} onChange={e=>setSubjectName(e.target.value)} className={field}/></label><label className="block text-sm">Số tín chỉ<input min="1" max="20" required type="number" value={credits} onChange={e=>setCredits(e.target.value)} className={field}/></label><button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Lưu môn học</button></form></Modal>{confirm}</div>

  return <div className="space-y-5">
    <button onClick={()=>go({})} className="text-sm font-semibold text-teal-700">← Quay lại môn học</button>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="font-mono text-sm text-teal-700">{active.code}</span><h2 className="text-2xl font-bold">{active.name}</h2><p className="text-sm text-slate-500">Chọn một ca học để xem các lớp, số sinh viên và lịch buổi học.</p></div>{canEdit&&<button onClick={openCreateSection} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} className="mr-1 inline"/>Thêm ca học</button>}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{courseSections.map(s=>{ const codes = classCodesOf(s); return <button key={s.id} onClick={()=>go({course:active.id, section:s.id})} className="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-teal-400 hover:shadow-md">
      <div className="flex items-center justify-between gap-2"><span className="font-mono font-bold">{s.classId}</span><span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{s.studentCount} SV</span></div>
      <p className="mt-3 flex items-center gap-2 text-sm text-slate-600"><UserIcon size={15}/>{s.teacherName}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><MapPin size={15}/>{s.room || 'Chưa có phòng'}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{codes.length ? codes.map(c=><span key={c} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">{c}</span>) : <span className="text-xs text-slate-400">Chưa có lớp nào</span>}</div>
      <div className="mt-4 border-t pt-3 text-sm font-semibold text-teal-700">Xem chi tiết ca học →</div>
    </button>})}</div>
    {!courseSections.length&&<p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Môn học chưa có ca học. Hãy tạo ca học, sau đó thêm lớp sinh viên và lập lịch.</p>}
    <Modal isOpen={showSectionForm} onClose={()=>setShowSectionForm(false)} title="Tạo ca học"><form onSubmit={createSection} className="space-y-3">
      <label className="block text-sm">Mã ca học<input required value={sectionCode} onChange={e=>setSectionCode(e.target.value.toUpperCase())} className={field}/></label>
      <label className="block text-sm">Học kỳ<select required value={semesterId} onChange={e=>setSemesterId(Number(e.target.value))} className={field}><option value="">Chọn học kỳ</option>{semesters.filter(x=>x.status!=='CLOSED').map(x=><option key={x.id} value={x.id}>{x.code} · {x.name} ({x.start_date} → {x.end_date})</option>)}</select></label>
      {isAdmin&&<label className="block text-sm">Giảng viên phụ trách<select required value={lecturerId} onChange={e=>setLecturerId(Number(e.target.value))} className={field}><option value="">Chọn giảng viên</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.fullName} ({t.userId})</option>)}</select></label>}
      <label className="block text-sm">Phòng học<input value={room} onChange={e=>setRoom(e.target.value)} placeholder="VD: A-301" className={field}/></label>
      {!semesters.length&&<p className="text-sm text-amber-700">Chưa có học kỳ nào. {isAdmin?'Hãy tạo học kỳ trước (nút "Học kỳ").':'Liên hệ quản trị viên để tạo học kỳ.'}</p>}
      <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Tạo ca học</button>
    </form></Modal>
    {confirm}
  </div>
}

function SectionDetail({ sectionId, isAdmin, canEdit, teachers, adminClasses, onBack, onDelete, onChanged }: {
  sectionId: number; isAdmin: boolean; canEdit: boolean; teachers: User[]; adminClasses: AdminClass[]
  onBack: () => void; onDelete: (label: string) => void; onChanged: () => Promise<void>
}) {
  const { showToast } = useToast()
  const [data, setData] = useState<SectionOverview | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adminCode, setAdminCode] = useState('')
  const [showEdit, setShowEdit] = useState(false); const [code, setCode] = useState(''); const [room, setRoom] = useState(''); const [lecturerId, setLecturerId] = useState<number | ''>('')
  const [showPlan, setShowPlan] = useState(false); const [days, setDays] = useState<number[]>([0]); const [start, setStart] = useState('07:30'); const [end, setEnd] = useState('09:30'); const [total, setTotal] = useState(''); const [planLate, setPlanLate] = useState('15')
  const [sessionForm, setSessionForm] = useState<{ editing: OverviewSession | null } | null>(null)
  const [title, setTitle] = useState(''); const [day, setDay] = useState(''); const [sStart, setSStart] = useState('07:30'); const [sEnd, setSEnd] = useState('09:30'); const [late, setLate] = useState('15')
  const [toDelete, setToDelete] = useState<OverviewSession | null>(null)
  const error = (e: unknown, fallback: string) => showToast(errorText(e, fallback), 'error')

  const reload = useCallback(async () => {
    try { setData(await sectionService.getOverview(sectionId)); setNotFound(false) } catch { setNotFound(true) }
  }, [sectionId])
  useEffect(() => {
    void reload()
    const onChanged = () => { void reload() }
    window.addEventListener('data:changed', onChanged)
    return () => window.removeEventListener('data:changed', onChanged)
  }, [reload])

  if (notFound) return <div className="space-y-4"><button onClick={onBack} className="text-sm font-semibold text-teal-700">← Quay lại danh sách ca học</button><p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Không tìm thấy ca học hoặc bạn không phụ trách ca này.</p></div>
  if (!data) return <p className="p-8 text-center text-sm text-slate-500">Đang tải ca học…</p>

  const takenCodes = new Set(data.classes.map(c => c.code))
  const upcoming = data.sessions.filter(s => s.status === 'SCHEDULED' && new Date(s.scheduled_start_at) > new Date()).length
  const done = data.sessions.filter(s => s.status === 'CLOSED').length

  const openEdit = () => { setCode(data.section_code); setRoom(data.room || ''); setLecturerId(data.lecturer.id); setShowEdit(true) }
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await sectionService.update(sectionId, { sectionCode: code, room, lecturerId: isAdmin && lecturerId ? Number(lecturerId) : undefined }); setShowEdit(false); await Promise.all([reload(), onChanged()]); showToast('Đã lưu ca học.', 'success') } catch (e) { error(e, 'Không thể lưu ca học') }
  }
  const addClass = async () => {
    if (!adminCode) return
    try { const r = await classService.addClassToSection(sectionId, adminCode); setAdminCode(''); await Promise.all([reload(), onChanged()]); showToast(r.added_count ? `Đã thêm ${r.added_count} sinh viên lớp ${adminCode}.` : 'Toàn bộ sinh viên lớp này đã ở trong ca.', r.added_count ? 'success' : 'info') } catch (e) { error(e, 'Không thể thêm lớp') }
  }
  const removeClass = async (classCode: string) => {
    try { await classService.removeClassFromSection(sectionId, classCode); await Promise.all([reload(), onChanged()]); showToast(`Đã bỏ lớp ${classCode} khỏi ca học.`, 'success') } catch (e) { error(e, 'Không thể bỏ lớp') }
  }
  const generate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!days.length) return showToast('Chọn ít nhất một thứ trong tuần.', 'info')
    if (end <= start) return showToast('Giờ kết thúc phải sau giờ bắt đầu.', 'info')
    try {
      const created = await sessionService.generateSemesterSessions(sectionId, { daysOfWeek: days, startTime: start, endTime: end, lateMinutes: Number(planLate) || 0, startDate: data.semester.start_date, endDate: data.semester.end_date, totalSessions: Number(total) || undefined })
      setShowPlan(false); await reload(); showToast(`Đã lập ${created.length} buổi học. Các buổi đã diễn ra được giữ nguyên.`, 'success')
    } catch (e) { error(e, 'Không thể lập lịch') }
  }
  const openSessionForm = (item?: OverviewSession) => {
    const s = item ? new Date(item.scheduled_start_at) : null
    setTitle(item?.title || ''); setDay(s ? dayKey(s) : dayKey(new Date()))
    setSStart(s ? hhmm(s) : '07:30'); setSEnd(item ? hhmm(new Date(item.scheduled_end_at)) : '09:30')
    setLate(item ? String(Math.round((new Date(item.late_after_at).getTime() - new Date(item.scheduled_start_at).getTime()) / 60000)) : '15')
    setSessionForm({ editing: item || null })
  }
  const saveSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!day || sEnd <= sStart) return showToast('Giờ kết thúc phải sau giờ bắt đầu.', 'info')
    const startIso = toIso(day, sStart); const endIso = toIso(day, sEnd)
    const lateMs = Math.min(new Date(startIso).getTime() + (Number(late) || 0) * 60000, new Date(endIso).getTime())
    const payload = { title: title.trim() || undefined, scheduledStartAt: startIso, scheduledEndAt: endIso, lateAfterAt: new Date(lateMs).toISOString() }
    try {
      if (sessionForm?.editing) await sessionService.updateSession(sessionForm.editing.id, payload)
      else await sessionService.createSectionSession(sectionId, payload)
      setSessionForm(null); await reload(); showToast('Đã lưu buổi học.', 'success')
    } catch (e) { error(e, 'Không thể lưu buổi học') }
  }
  const deleteSession = async () => {
    if (!toDelete) return
    try { await sessionService.deleteSession(toDelete.id); setToDelete(null); await reload(); showToast('Đã xóa buổi học.', 'success') } catch (e) { error(e, 'Không thể xóa buổi học') }
  }

  return <div className="space-y-5">
    <button onClick={onBack} className="text-sm font-semibold text-teal-700">← Quay lại danh sách ca học</button>
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <span className="font-mono text-sm text-teal-700">{data.course.code} · {data.semester.code}</span>
        <h2 className="text-2xl font-bold">Ca {data.section_code}</h2>
        <p className="text-sm text-slate-600">{data.course.name}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-1.5"><UserIcon size={15}/>{data.lecturer.full_name || 'Chưa phân công'}</span>
          <span className="flex items-center gap-1.5"><MapPin size={15}/>{data.room || 'Chưa có phòng'}</span>
          <span className="flex items-center gap-1.5"><Users size={15}/>{data.classes.filter(c=>c.code).length} lớp · {data.student_count} sinh viên</span>
          <span className="flex items-center gap-1.5"><CalendarDays size={15}/>{data.sessions.length} buổi ({done} đã học, {upcoming} sắp tới)</span>
        </div>
      </div>
      {canEdit && <div className="flex gap-2"><button onClick={openEdit} className="rounded-lg border px-3 py-2 text-sm font-semibold text-teal-700"><Pencil size={14} className="mr-1 inline"/>Sửa ca</button><button onClick={() => onDelete(`ca học ${data.section_code}`)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600"><Trash2 size={14} className="mr-1 inline"/>Xóa ca</button></div>}
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold">Lớp trong ca học</h3>
        {canEdit && <div className="mt-3 flex gap-2"><select value={adminCode} onChange={e=>setAdminCode(e.target.value)} className="min-w-0 flex-1 rounded-lg border p-2 text-sm"><option value="">Chọn lớp sinh viên để thêm</option>{adminClasses.filter(x=>!takenCodes.has(x.code)).map(x=><option key={x.id} value={x.code}>{x.code}{x.name ? ` · ${x.name}` : ''}</option>)}</select><button onClick={addClass} disabled={!adminCode} className="rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15} className="inline"/> Thêm</button></div>}
        <div className="mt-4 space-y-2">
          {data.classes.map(c => <div key={c.code || '_'} className="rounded-xl border">
            <div className="flex items-center justify-between gap-2 p-3">
              <button onClick={() => setExpanded(expanded === c.code ? null : c.code)} className="flex min-w-0 items-center gap-2 text-left">
                {expanded === c.code ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                <span className="font-bold">{c.code || 'Sinh viên chưa xếp lớp'}</span>
                {c.name && <span className="truncate text-sm text-slate-500">{c.name}</span>}
              </button>
              <div className="flex shrink-0 items-center gap-3"><span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{c.student_count} SV</span>{canEdit && c.code && <button onClick={() => removeClass(c.code)} className="text-xs text-rose-600">Bỏ lớp</button>}</div>
            </div>
            {expanded === c.code && <ul className="divide-y border-t text-sm">{c.students.map(s => <li key={s.id} className="flex justify-between px-4 py-2"><span>{s.full_name}</span><span className="font-mono text-slate-500">{s.student_code}</span></li>)}</ul>}
          </div>)}
          {!data.classes.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Chưa có lớp nào trong ca học.</p>}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Buổi học</h3>
          {canEdit && <div className="flex gap-2"><button onClick={() => setShowPlan(true)} className="rounded-lg border px-3 py-2 text-sm font-semibold"><CalendarDays size={14} className="mr-1 inline"/>Lập lịch cả kỳ</button><button onClick={() => openSessionForm()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"><Plus size={14} className="mr-1 inline"/>Thêm buổi</button></div>}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">#</th><th>Buổi</th><th>Ngày</th><th>Giờ</th><th>Trạng thái</th><th className="text-right">Thao tác</th></tr></thead>
            <tbody className="divide-y">{data.sessions.map(s => { const st = new Date(s.scheduled_start_at); const en = new Date(s.scheduled_end_at); return <tr key={s.id}>
              <td className="py-2.5 text-slate-500">{s.session_no}</td>
              <td className="font-semibold">{s.title || `Buổi ${s.session_no}`}</td>
              <td>{WEEKDAY_LABELS[st.getDay()]}, {st.toLocaleDateString('vi-VN')}</td>
              <td className="whitespace-nowrap"><Clock size={13} className="mr-1 inline text-slate-400"/>{hhmm(st)}–{hhmm(en)}</td>
              <td><span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>{s.record_count > 0 && <span className="ml-1 text-xs text-slate-500">{s.record_count} lượt</span>}</td>
              <td className="text-right whitespace-nowrap">{canEdit && s.status === 'SCHEDULED' && <button onClick={() => openSessionForm(s)} className="text-teal-700">Sửa</button>}{canEdit && (s.status === 'SCHEDULED' || s.status === 'CANCELLED') && s.record_count === 0 && <button onClick={() => setToDelete(s)} className="ml-3 text-rose-600">Xóa</button>}</td>
            </tr>})}</tbody>
          </table>
          {!data.sessions.length && <p className="mt-3 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Chưa có buổi học. Dùng "Lập lịch cả kỳ" để tạo lịch hằng tuần hoặc "Thêm buổi" cho từng buổi.</p>}
        </div>
      </section>
    </div>

    <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={`Sửa ca ${data.section_code}`}><form onSubmit={saveEdit} className="space-y-3">
      <label className="block text-sm">Mã ca học<input required value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className={field}/></label>
      <label className="block text-sm">Phòng học<input value={room} onChange={e=>setRoom(e.target.value)} className={field}/></label>
      {isAdmin && <label className="block text-sm">Giảng viên phụ trách<select value={lecturerId} onChange={e=>setLecturerId(Number(e.target.value))} className={field}>{teachers.map(t=><option key={t.id} value={t.id}>{t.fullName} ({t.userId})</option>)}</select></label>}
      <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Lưu thay đổi</button>
    </form></Modal>

    <Modal isOpen={showPlan} onClose={() => setShowPlan(false)} title={`Lập lịch cả kỳ · ${data.semester.code}`} maxWidth="560px"><form onSubmit={generate} className="space-y-4">
      <p className="text-sm text-slate-600">Học kỳ {data.semester.start_date} → {data.semester.end_date}. Các buổi chưa diễn ra sẽ được thay bằng lịch mới. Buổi đã học hoặc đã có điểm danh được giữ nguyên, ngày đã qua được bỏ qua.</p>
      <div><span className="text-sm">Học vào các thứ</span><div className="mt-1 flex flex-wrap gap-2">{SCHEDULE_DAYS.map((d,i)=><button type="button" key={d} onClick={()=>setDays(days.includes(i)?days.filter(x=>x!==i):[...days,i])} className={`rounded-lg px-3 py-2 text-sm font-semibold ${days.includes(i)?'bg-teal-700 text-white':'bg-slate-100'}`}>{d}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Giờ bắt đầu<input type="time" required value={start} onChange={e=>setStart(e.target.value)} className={field}/></label><label className="block text-sm">Giờ kết thúc<input type="time" required value={end} onChange={e=>setEnd(e.target.value)} className={field}/></label>
      <label className="block text-sm">Tính muộn sau (phút)<input type="number" min="0" max="120" value={planLate} onChange={e=>setPlanLate(e.target.value)} className={field}/></label><label className="block text-sm">Số buổi tối đa<input type="number" min="1" max="50" placeholder="Hết học kỳ" value={total} onChange={e=>setTotal(e.target.value)} className={field}/></label></div>
      <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Lập lịch</button>
    </form></Modal>

    <Modal isOpen={!!sessionForm} onClose={() => setSessionForm(null)} title={sessionForm?.editing ? `Sửa ${sessionForm.editing.title || `buổi ${sessionForm.editing.session_no}`}` : 'Thêm buổi học'}><form onSubmit={saveSession} className="space-y-3">
      <label className="block text-sm">Tên buổi<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Để trống: Buổi N" className={field}/></label>
      <label className="block text-sm">Ngày học<input type="date" required value={day} onChange={e=>setDay(e.target.value)} className={field}/></label>
      <div className="grid grid-cols-3 gap-3"><label className="block text-sm">Bắt đầu<input type="time" required value={sStart} onChange={e=>setSStart(e.target.value)} className={field}/></label><label className="block text-sm">Kết thúc<input type="time" required value={sEnd} onChange={e=>setSEnd(e.target.value)} className={field}/></label><label className="block text-sm">Muộn sau (phút)<input type="number" min="0" max="120" value={late} onChange={e=>setLate(e.target.value)} className={field}/></label></div>
      <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Lưu buổi học</button>
    </form></Modal>

    <ConfirmModal isOpen={!!toDelete} title="Xóa buổi học" message={`Xóa ${toDelete?.title || `buổi ${toDelete?.session_no}`}? Sinh viên trong ca sẽ nhận thông báo hủy buổi.`} confirmText="Xóa" onCancel={() => setToDelete(null)} onConfirm={deleteSession}/>
  </div>
}

function SemesterModal(props: { open:boolean; onClose:()=>void; semesters:Semester[]; editing:Semester|null; onEdit:(x:Semester)=>void; onDelete:(x:Semester)=>void; code:string; name:string; start:string; end:string; status:Semester['status']; setCode:(x:string)=>void; setName:(x:string)=>void; setStart:(x:string)=>void; setEnd:(x:string)=>void; setStatus:(x:Semester['status'])=>void; onSave:(e:React.FormEvent)=>void }) {
  const { open,onClose,semesters,editing,onEdit,onDelete,code,name,start,end,status,setCode,setName,setStart,setEnd,setStatus,onSave }=props
  return <Modal isOpen={open} onClose={onClose} title={editing?'Sửa học kỳ':'Quản lý học kỳ'} maxWidth="720px"><form onSubmit={onSave} className="grid gap-3 md:grid-cols-2"><label className="text-sm">Mã học kỳ<input required value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className={field}/></label><label className="text-sm">Tên học kỳ<input required value={name} onChange={e=>setName(e.target.value)} className={field}/></label><label className="text-sm">Ngày bắt đầu<input required type="date" value={start} onChange={e=>setStart(e.target.value)} className={field}/></label><label className="text-sm">Ngày kết thúc<input required type="date" value={end} onChange={e=>setEnd(e.target.value)} className={field}/></label><label className="text-sm">Trạng thái<select value={status} onChange={e=>setStatus(e.target.value as Semester['status'])} className={field}><option value="PLANNED">Dự kiến</option><option value="ACTIVE">Đang hoạt động</option><option value="CLOSED">Đã đóng</option></select></label><div className="self-end"><button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">{editing?'Lưu thay đổi':'Tạo học kỳ'}</button></div></form><div className="mt-6 divide-y">{semesters.map(x=><div key={x.id} className="flex items-center justify-between py-3 text-sm"><div><b>{x.code} · {x.name}</b><p className="text-slate-500">{x.start_date} – {x.end_date} · {x.status}</p></div><div className="flex gap-3"><button onClick={()=>onEdit(x)} className="text-teal-700">Sửa</button><button onClick={()=>onDelete(x)} className="text-rose-600">Xóa</button></div></div>)}</div></Modal>
}
