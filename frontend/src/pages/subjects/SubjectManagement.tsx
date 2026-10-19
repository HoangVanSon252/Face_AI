import { useEffect, useState } from 'react'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ClassItem, Subject } from '../../types'
import { classService, subjectService } from '../../services/api'
import { ConfirmModal } from '../../components/common/ConfirmModal'
import { Modal } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'

export function SubjectManagement() {
  const { showToast } = useToast()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [assignedClasses, setAssignedClasses] = useState<ClassItem[]>([])
  const [allClasses, setAllClasses] = useState<ClassItem[]>([])
  const [classToAdd, setClassToAdd] = useState('')
  const [editing, setEditing] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState<Subject | null>(null)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [credits, setCredits] = useState('3')
  const load = async () => { const [items, classes] = await Promise.all([subjectService.getSubjects(), classService.getClasses()]); setSubjects(items); setAllClasses(classes) }
  useEffect(() => { void load() }, [])
  const openSubject = async (subject: Subject) => { setSelectedSubject(subject); setAssignedClasses(await subjectService.getClasses(subject.id)); setClassToAdd('') }
  const addClass = async () => { if (!selectedSubject || !classToAdd) return; try { await subjectService.addClass(selectedSubject.id, Number(classToAdd)); await openSubject(selectedSubject); showToast('Đã thêm lớp vào môn học.', 'success') } catch (e) { showToast(e instanceof Error ? e.message : 'Không thể thêm lớp.', 'error') } }
  const removeClass = async (classId: number) => { if (!selectedSubject) return; await subjectService.removeClass(selectedSubject.id, classId); await openSubject(selectedSubject); showToast('Đã bỏ lớp khỏi môn học.', 'info') }
  const start = (subject?: Subject) => {
    setEditing(subject || null); setCode(subject?.code || ''); setName(subject?.name || ''); setCredits(String(subject?.credits || 3)); setOpen(true)
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const data = { code, name, credits: Number(credits) }
      if (editing) await subjectService.updateSubject(editing.id, data)
      else await subjectService.createSubject(data)
      showToast(editing ? 'Đã cập nhật môn học.' : 'Đã tạo môn học.', 'success'); setOpen(false); await load()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không thể lưu môn học.', 'error') }
  }
  const remove = async () => {
    if (!deleting) return
    try { await subjectService.deleteSubject(deleting.id); showToast('Đã xóa môn học.', 'info'); setDeleting(null); await load() }
    catch (error) { showToast(error instanceof Error ? error.message : 'Không thể xóa môn học đang được sử dụng.', 'error') }
  }
  return <div className="space-y-6">
    <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-800">Môn học</h2><p className="mt-1 text-xs text-slate-500">Quản lý danh mục môn học độc lập với danh sách sinh viên của lớp.</p></div><button onClick={() => start()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white"><Plus size={15}/> Tạo môn học</button></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Mã môn</th><th className="px-4 py-3">Tên môn học</th><th className="px-4 py-3">Tín chỉ</th><th className="px-4 py-3">Thao tác</th></tr></thead><tbody>{subjects.map(s => <tr key={s.id} className="border-t border-slate-100"><td className="px-4 py-3 font-mono">{s.code}</td><td className="px-4 py-3 font-medium"><BookOpen className="mr-2 inline text-teal-700" size={15}/>{s.name}</td><td className="px-4 py-3">{s.credits}</td><td className="px-4 py-3"><button onClick={() => void openSubject(s)} className="mr-3 text-teal-700">Lớp học</button><button onClick={() => start(s)} className="mr-2 text-teal-700"><Pencil size={15}/></button><button onClick={() => setDeleting(s)} className="text-rose-600"><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
    {selectedSubject && <div className="rounded-xl border border-teal-200 bg-white p-4"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Lớp thuộc môn: {selectedSubject.name}</h3><button onClick={() => setSelectedSubject(null)} className="text-xs text-slate-500">Đóng</button></div><div className="mt-3 flex gap-2"><select value={classToAdd} onChange={e=>setClassToAdd(e.target.value)} className="flex-1 rounded border p-2 text-sm"><option value="">Chọn lớp sinh viên để thêm</option>{allClasses.filter(c=>!assignedClasses.some(a=>a.id===c.id)).map(c=><option key={c.id} value={c.id}>{c.classId} · {c.className}</option>)}</select><button onClick={() => void addClass()} className="rounded bg-teal-700 px-3 text-sm font-semibold text-white">Thêm lớp</button></div><div className="mt-3 space-y-2">{assignedClasses.map(c=><div key={c.id} className="flex items-center justify-between rounded border p-3 text-sm"><span><b>{c.classId}</b> · {c.className} · {c.studentCount} học viên</span><button onClick={() => void removeClass(c.id)} className="text-rose-600">Bỏ lớp</button></div>)}</div></div>}
    <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Sửa môn học' : 'Tạo môn học'}><form onSubmit={save} className="space-y-3 text-sm"><input required value={code} onChange={e=>setCode(e.target.value)} placeholder="Mã môn học" className="w-full rounded border p-2"/><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Tên môn học" className="w-full rounded border p-2"/><input required type="number" min="1" max="20" value={credits} onChange={e=>setCredits(e.target.value)} placeholder="Tín chỉ" className="w-full rounded border p-2"/><button className="rounded bg-teal-700 px-3 py-2 font-semibold text-white">Lưu môn học</button></form></Modal>
    <ConfirmModal isOpen={Boolean(deleting)} title="Xóa môn học" message={`Xóa môn ${deleting?.name || ''}? Chỉ xóa được khi môn chưa được dùng trong lớp/ca học.`} confirmText="Xóa" cancelText="Hủy" variant="danger" onConfirm={() => void remove()} onCancel={() => setDeleting(null)}/>
  </div>
}
