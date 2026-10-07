import { useState } from 'react'
import { FileBarChart, Download, Filter, CheckCircle2, ArrowRight, FileSpreadsheet } from 'lucide-react'
import type { Role } from '../../types'
import { useToast } from '../../components/common/Toast'

interface ReportViewProps {
  role: Role
}

export function ReportView({ role }: ReportViewProps) {
  const isAdmin = role === 'admin'
  const { showToast } = useToast()

  const [selectedClass, setSelectedClass] = useState('IT308')
  const [selectedPeriod, setSelectedPeriod] = useState('Tháng 09/2026')

  const reportsList = isAdmin
    ? [
        {
          id: 1,
          title: 'Báo cáo vận hành toàn trường Tháng 09/2026',
          detail: 'Toàn hệ thống · 86 phiên học đã đóng an toàn',
          date: 'Hôm nay, 08:30',
        },
        {
          id: 2,
          title: 'Báo cáo sức khỏe dịch vụ nhận diện AI',
          detail: 'Độ chính xác trung bình 97.8% · Độ trễ 112ms',
          date: 'Hôm qua, 16:45',
        },
        {
          id: 3,
          title: 'Nhật ký phiên điểm danh & vi phạm quy chế',
          detail: 'Tổng hợp 12 trường hợp độ tin cậy thấp và khiếu nại',
          date: '09/09/2026',
        },
      ]
    : [
        {
          id: 1,
          title: 'Báo cáo chuyên cần môn Lập trình Web nâng cao',
          detail: 'IT308 · 42 sinh viên · Tỷ lệ có mặt 94.2%',
          date: 'Hôm nay, 08:30',
        },
        {
          id: 2,
          title: 'Chi tiết phiên điểm danh SES-IT308-0911',
          detail: 'Lập trình Web · Phòng A-301 · 35/42 có mặt',
          date: 'Hôm nay, 08:05',
        },
        {
          id: 3,
          title: 'Báo cáo chuyên cần môn Cơ sở dữ liệu nâng cao',
          detail: 'IT204 · 40 sinh viên · Tỷ lệ có mặt 95.0%',
          date: '09/09/2026',
        },
      ]

  // Function to download real CSV with UTF-8 BOM
  const handleExportCSV = (reportTitle: string) => {
    const csvHeader = 'Mã sinh viên,Họ và tên,Lớp,Số buổi có mặt,Số buổi đi trễ,Số buổi vắng,Tỷ lệ chuyên cần\n'
    const csvRows = [
      'SV20240128,Trần Minh Khoa,IT308,27,1,0,96.4%',
      'SV20240129,Nguyễn Minh Anh,IT308,28,0,0,100%',
      'SV20240204,Trần Quốc Huy,IT308,25,2,1,89.3%',
      'SV20240312,Lê Phương Thảo,IT308,26,1,1,92.8%',
      'SV20240405,Phạm Gia Bảo,IT308,24,2,2,85.7%',
      'SV20230104,Vũ Hoàng Nam,IT308,22,1,5,78.5%',
    ].join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Bao_cao_diem_danh_${selectedClass}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    showToast(`Đã xuất và tải file CSV: "${reportTitle}"`, 'success')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            THỐNG KÊ & XUẤT DỮ LIỆU
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isAdmin ? 'Báo cáo điểm danh toàn trường' : 'Báo cáo chuyên cần học phần'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin
              ? 'Tổng hợp số liệu vận hành, độ chính xác AI và tỷ lệ chuyên cần các khoa.'
              : 'Theo dõi tỷ lệ chuyên cần sinh viên và xuất dữ liệu định dạng CSV/Excel theo quy định.'}
          </p>
        </div>

        <button
          onClick={() => handleExportCSV('Báo cáo chuyên cần tổng hợp')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition shrink-0"
        >
          <FileSpreadsheet size={15} /> Xuất dữ liệu CSV (UTF-8)
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Filter size={15} className="text-teal-600" /> Lọc theo:
        </div>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
        >
          <option value="IT308">Lập trình Web nâng cao (IT308)</option>
          <option value="IT204">Cơ sở dữ liệu nâng cao (IT204)</option>
          <option value="SS101">Kỹ năng nghề nghiệp (SS101)</option>
          <option value="IT405">Phân tích dữ liệu lớn (IT405)</option>
        </select>

        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
        >
          <option value="Tháng 09/2026">Tháng 09/2026</option>
          <option value="Tháng 08/2026">Tháng 08/2026</option>
          <option value="Toàn học kỳ Fall 2026">Toàn học kỳ Fall 2026</option>
        </select>

        <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <CheckCircle2 size={14} /> Dữ liệu đã đồng bộ thời gian thực
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {reportsList.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-md transition p-5 flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 mb-3">
                <FileBarChart size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 line-clamp-2">{item.title}</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{item.detail}</p>
              <div className="text-[11px] text-slate-400 mt-3 font-mono">Cập nhật: {item.date}</div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => handleExportCSV(item.title)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 hover:border-teal-200 transition"
              >
                <Download size={14} /> Tải xuống CSV
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
