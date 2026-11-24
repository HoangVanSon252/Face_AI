import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, Plus, Pencil, Trash2, CheckCircle2, ArrowRight, Star } from 'lucide-react'
import { httpClient } from '../../services/httpClient'
import { Modal } from '../../components/common/Modal'
import { ConfirmModal } from '../../components/common/ConfirmModal'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

type SemesterStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED'

interface Semester {
  id: number
  code: string
  name: string
  start_date: string
  end_date: string
  status: SemesterStatus
}

interface SectionRow {
  id: number
  semester_id: number
}

const STATUS: Record<SemesterStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Đang diễn ra', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PLANNED: { label: 'Sắp tới', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  CLOSED: { label: 'Đã kết thúc', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

const field = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm'

function formatDate(value: string): string {
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function progress(semester: Semester): number {
  const start = new Date(`${semester.start_date}T00:00:00`).getTime()
  const end = new Date(`${semester.end_date}T23:59:59`).getTime()
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

interface Props {
  onGoToSubjects: () => void
}

export function SemesterView({ onGoToSubjects }: Props) {
  const { showToast } = useToast()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [sectionCount, setSectionCount] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Semester | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', start_date: '', end_date: '', status: 'PLANNED' as SemesterStatus })
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Semester | null>(null)

  const load = useCallback(async () => {
    try {
      const [items, sections] = await Promise.all([
        httpClient.get<Semester[]>('/api/v1/academic/semesters'),
        httpClient.get<SectionRow[]>('/api/v1/academic/sections').catch(() => []),
      ])
      setSemesters(items)
      const counts: Record<number, number> = {}
      sections.forEach((s) => { counts[s.semester_id] = (counts[s.semester_id] || 0) + 1 })
      setSectionCount(counts)
    } catch {
      showToast('Không thể tải danh sách học kỳ.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener('data:changed', onChange)
    return () => window.removeEventListener('data:changed', onChange)
  }, [load])

  const openForm = (item?: Semester) => {
    setEditing(item || null)
    if (item) {
      setForm({ code: item.code, name: item.name, start_date: item.start_date, end_date: item.end_date, status: item.status })
    } else {
      const year = new Date().getFullYear()
      setForm({ code: '', name: '', start_date: `${year}-09-01`, end_date: `${year + 1}-01-15`, status: semesters.some((s) => s.status === 'ACTIVE') ? 'PLANNED' : 'ACTIVE' })
    }
    setShowForm(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (form.end_date < form.start_date) {
      showToast('Ngày kết thúc phải sau ngày bắt đầu.', 'error')
      return
    }
    setSaving(true)
    try {
      const data = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim() }
      if (editing) await httpClient.patch(`/api/v1/academic/semesters/${editing.id}`, data)
      else await httpClient.post('/api/v1/academic/semesters', data)
      setShowForm(false)
      showToast(editing ? 'Đã cập nhật học kỳ.' : `Đã tạo học kỳ ${data.code}.`, 'success')
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể lưu học kỳ.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const setActive = async (item: Semester) => {
    try {
      await httpClient.patch(`/api/v1/academic/semesters/${item.id}`, { status: 'ACTIVE' })
      showToast(`${item.code} là học kỳ hiện tại.`, 'success')
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể đổi trạng thái.', 'error')
    }
  }

  const remove = async () => {
    if (!toDelete) return
    try {
      await httpClient.delete(`/api/v1/academic/semesters/${toDelete.id}`)
      showToast(`Đã xóa học kỳ ${toDelete.code}.`, 'success')
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xóa học kỳ.', 'error')
    } finally {
      setToDelete(null)
    }
  }

  const active = semesters.find((s) => s.status === 'ACTIVE')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded-md bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700">BƯỚC 1 · THIẾT LẬP ĐÀO TẠO</span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">Học kỳ</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi ca học thuộc một học kỳ. Lịch cả kỳ được sinh trong khoảng ngày của học kỳ.
          </p>
        </div>
        <button
          onClick={() => openForm()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
        >
          <Plus size={16} /> Tạo học kỳ
        </button>
      </div>

      {active && (
        <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-white"><CheckCircle2 size={20} /></div>
            <div>
              <p className="text-sm font-bold text-slate-800">Học kỳ hiện tại: {active.code} · {active.name}</p>
              <p className="text-xs text-slate-500">{sectionCount[active.id] || 0} ca học · bước tiếp theo là tạo môn học và ca học</p>
            </div>
          </div>
          <button onClick={onGoToSubjects} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:gap-2 transition-all">
            Tới Môn học & ca học <ArrowRight size={15} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-44" />)}
        </div>
      ) : semesters.length === 0 ? (
        <div className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarRange size={36} className="mx-auto text-teal-600" />
          <p className="mt-3 font-semibold text-slate-800">Chưa có học kỳ nào</p>
          <p className="mt-1 text-sm text-slate-500">Tạo học kỳ đầu tiên để bắt đầu mở môn học và ca học.</p>
          <button onClick={() => openForm()} className="mt-4 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Tạo học kỳ</button>
        </div>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {semesters.map((item) => {
            const pct = progress(item)
            return (
              <div key={item.id} className={cn('lift rounded-2xl border bg-white p-5 shadow-sm', item.status === 'ACTIVE' ? 'border-teal-300' : 'border-slate-200')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-bold text-teal-700">{item.code}</p>
                    <h3 className="mt-1 text-base font-bold text-slate-900">{item.name}</h3>
                  </div>
                  <span className={cn('rounded-lg border px-2 py-0.5 text-[11px] font-bold', STATUS[item.status].cls)}>{STATUS[item.status].label}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{formatDate(item.start_date)} → {formatDate(item.end_date)}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Đã qua {pct}% thời gian · {sectionCount[item.id] || 0} ca học</p>
                <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-3 text-xs font-semibold">
                  {item.status !== 'ACTIVE' && item.status !== 'CLOSED' && (
                    <button onClick={() => setActive(item)} className="mr-auto inline-flex items-center gap-1 text-teal-700 hover:text-teal-900"><Star size={13} /> Đặt làm hiện tại</button>
                  )}
                  <button onClick={() => openForm(item)} className="inline-flex items-center gap-1 text-slate-600 hover:text-teal-700"><Pencil size={13} /> Sửa</button>
                  <button onClick={() => setToDelete(item)} className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800"><Trash2 size={13} /> Xóa</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? `Sửa học kỳ ${editing.code}` : 'Tạo học kỳ'} maxWidth="560px">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Mã học kỳ
            <input required value={form.code} placeholder="VD: HK1-2026" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={field} />
          </label>
          <label className="text-sm font-medium text-slate-700">Tên học kỳ
            <input required value={form.name} placeholder="Học kỳ 1 năm 2026-2027" onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
          </label>
          <label className="text-sm font-medium text-slate-700">Ngày bắt đầu
            <input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={field} />
          </label>
          <label className="text-sm font-medium text-slate-700">Ngày kết thúc
            <input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={field} />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Trạng thái
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SemesterStatus })} className={field}>
              <option value="ACTIVE">Đang diễn ra (học kỳ hiện tại)</option>
              <option value="PLANNED">Sắp tới</option>
              <option value="CLOSED">Đã kết thúc</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-400">Chỉ có một học kỳ hiện tại. Chọn "Đang diễn ra" sẽ chuyển học kỳ cũ về "Sắp tới".</span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 sm:col-span-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</button>
            <button disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
              {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo học kỳ'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(toDelete)}
        title="Xóa học kỳ"
        message={`Xóa học kỳ ${toDelete?.code}? Học kỳ đang có ca học sẽ không xóa được.`}
        confirmText="Xóa"
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
