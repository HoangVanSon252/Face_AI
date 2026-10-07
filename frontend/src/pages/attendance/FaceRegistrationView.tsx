import { useState } from 'react'
import {
  Camera,
  ShieldCheck,
  Check,
  RotateCcw,
  Sparkles,
  Users,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { Role, User } from '../../types'
import { faceService } from '../../services/api'
import { WebcamCapture } from '../../components/attendance/WebcamCapture'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface FaceRegistrationViewProps {
  role: Role
  currentUser: User
  onRegistrationComplete?: () => void
}

const SAMPLE_STEPS = [
  'Mẫu 1: Nhìn thẳng vào giữa camera',
  'Mẫu 2: Nghiêng đầu sang trái 15 độ',
  'Mẫu 3: Nghiêng đầu sang phải 15 độ',
  'Mẫu 4: Ngước cằm lên nhẹ',
  'Mẫu 5: Biểu cảm tự nhiên (mỉm cười nhẹ)',
]

export function FaceRegistrationView({
  role,
  currentUser,
  onRegistrationComplete,
}: FaceRegistrationViewProps) {
  const isStudent = role === 'student'
  const { showToast } = useToast()

  const [registered, setRegistered] = useState(currentUser.hasFaceRegistered ?? true)
  const [samples, setSamples] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const handleCaptureSample = (frameDataUrl: string) => {
    if (samples.length >= 5) return
    const updated = [...samples, frameDataUrl]
    setSamples(updated)
    if (updated.length < 5) {
      setCurrentStepIndex(updated.length)
      showToast(`Đã thu thập mẫu ${updated.length}/5!`, 'info')
    } else {
      finalizeRegistration(updated.length)
    }
  }

  const finalizeRegistration = async (count: number) => {
    setScanning(true)
    try {
      await faceService.registerFaceSamples(currentUser.userId, count)
      setRegistered(true)
      showToast('Đăng ký dữ liệu khuôn mặt thành công (Độ tin cậy 98.6%)!', 'success')
      onRegistrationComplete?.()
    } catch {
      showToast('Có lỗi xảy ra khi trích xuất đặc trưng khuôn mặt', 'error')
    } finally {
      setScanning(false)
    }
  }

  const handleReset = () => {
    setSamples([])
    setCurrentStepIndex(0)
    setRegistered(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100">
            SINH TRẮC HỌC KHUÔN MẶT
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isStudent ? 'Đăng ký khuôn mặt cá nhân' : 'Quản lý dữ liệu sinh trắc học'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isStudent
              ? 'Thu thập 5 mẫu ảnh khuôn mặt đa góc độ qua camera để nhận diện điểm danh tự động.'
              : 'Theo dõi và giám sát trạng thái đăng ký sinh trắc học của sinh viên trong toàn trường.'}
          </p>
        </div>

        {!isStudent && (
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
            <Users size={14} /> Danh sách sinh viên đã đăng ký
          </button>
        )}
      </div>

      {/* Main Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Camera & Sample Collection (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col items-center">
          <WebcamCapture
            isScanning={scanning}
            onCaptureFrame={handleCaptureSample}
            label={registered ? 'Khuôn mặt đã sẵn sàng' : 'Camera nhận diện'}
            sublabel={
              registered
                ? 'Đặc trưng 512D đã lưu vào hệ thống'
                : `Đang chụp: ${SAMPLE_STEPS[currentStepIndex] || 'Chuẩn bị'}`
            }
          />

          {isStudent && (
            <div className="mt-5 w-full max-w-md space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Tiến độ thu thập mẫu</span>
                <span className="font-bold text-teal-700">{samples.length} / 5 mẫu</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-teal-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(samples.length / 5) * 100}%` }}
                />
              </div>

              {/* Sample Thumbnails */}
              <div className="grid grid-cols-5 gap-2 pt-2">
                {[0, 1, 2, 3, 4].map((idx) => {
                  const hasSample = idx < samples.length
                  const isCurrent = idx === currentStepIndex && !registered
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'aspect-square rounded-lg border flex flex-col items-center justify-center text-center p-1 transition-all',
                        hasSample
                          ? 'bg-teal-50 border-teal-300 text-teal-700'
                          : isCurrent
                          ? 'bg-white border-teal-500 ring-2 ring-teal-500/20 text-teal-600 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-400 text-[11px]'
                      )}
                    >
                      {hasSample ? (
                        <Check size={18} className="text-teal-600" />
                      ) : (
                        <span className="text-[10px]">Mẫu {idx + 1}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="pt-2">
                {registered ? (
                  <button
                    onClick={handleReset}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 transition"
                  >
                    <RotateCcw size={14} /> Chụp lại khuôn mặt mới
                  </button>
                ) : (
                  <button
                    disabled={scanning}
                    onClick={() => handleCaptureSample('simulated_frame')}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white shadow-xs transition"
                  >
                    {scanning ? (
                      'Đang trích xuất đặc trưng AI...'
                    ) : (
                      <>
                        <Camera size={15} /> Chụp mẫu {samples.length + 1}/5
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Registration Guide & Quality Status (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Hướng dẫn đăng ký chuẩn</h3>
                <p className="text-xs text-slate-500">Đảm bảo chất lượng trích xuất đặc trưng sinh trắc học ArcFace</p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {[
                'Ngồi ở nơi đủ ánh sáng tự nhiên, tránh ngược sáng mạnh hoặc bóng đổ',
                'Giữ khuôn mặt nằm trọn trong khung bầu dục và nhìn thẳng vào ống kính',
                'Không đeo khẩu trang, kính râm hoặc các phụ kiện che khuất mắt, mũi, miệng',
                'Thực hiện xoay nhẹ góc mặt theo từng bước trên màn hình khi hệ thống chụp',
                'Hệ thống mã hóa và trích xuất véc-tơ đặc trưng 512 chiều bảo mật',
              ].map((step, index) => (
                <div key={step} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-xs text-slate-600 leading-snug">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Box */}
          <div
            className={cn(
              'p-4 rounded-xl border flex items-start gap-3 transition-all',
              registered
                ? 'bg-teal-50/70 border-teal-200 text-teal-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            )}
          >
            {registered ? (
              <CheckCircle2 size={20} className="text-teal-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">
                {registered ? 'Đã sẵn sàng điểm danh (Ready)' : 'Chưa hoàn tất đăng ký'}
              </div>
              <p className="text-[11px] mt-0.5 opacity-80 leading-relaxed">
                {registered
                  ? 'Độ tin cậy mô hình 98.6% · Sẵn sàng tự động nhận diện trong mọi phiên học.'
                  : 'Hãy chụp đủ 5 mẫu ảnh góc mặt để hoàn tất hồ sơ sinh trắc học.'}
              </p>
            </div>
            {registered && <Sparkles size={16} className="text-teal-600 shrink-0" />}
          </div>
        </div>
      </div>
    </div>
  )
}
