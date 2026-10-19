import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Smile,
  Target,
  ScanFace,
  Check,
  Loader2,
  Fingerprint,
  Calendar,
  Layers,
  Cpu,
} from 'lucide-react'
import type { Role, User } from '../../types'
import { faceService } from '../../services/api'
import { WebcamCapture, type WebcamCaptureHandle } from '../../components/attendance/WebcamCapture'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface FaceRegistrationViewProps {
  role: Role
  currentUser: User
  onRegistrationComplete?: () => void
}

interface StepGuidance {
  direction: 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'SMILE'
  title: string
  subtitle: string
  instruction: string
}

const REGISTRATION_STEPS: StepGuidance[] = [
  {
    direction: 'CENTER',
    title: 'NHÌN THẲNG VÀO TÂM CAMERA',
    subtitle: 'Mẫu 1/5: Góc chính diện chuẩn',
    instruction: 'Giữ khuôn mặt ổn định ở chính giữa khung bầu dục',
  },
  {
    direction: 'LEFT',
    title: 'XOAY NHẸ ĐẦU SANG TRÁI',
    subtitle: 'Mẫu 2/5: Góc nghiêng trái 15°',
    instruction: 'Nghiêng nhẹ mặt sang phía bên TRÁI theo hướng mũi tên',
  },
  {
    direction: 'RIGHT',
    title: 'XOAY NHẸ ĐẦU SANG PHẢI',
    subtitle: 'Mẫu 3/5: Góc nghiêng phải 15°',
    instruction: 'Nghiêng nhẹ mặt sang phía bên PHẢI theo hướng mũi tên',
  },
  {
    direction: 'UP',
    title: 'NGƯỚC CẰM LÊN NHẸ',
    subtitle: 'Mẫu 4/5: Góc ngửa cằm 10°',
    instruction: 'Nâng cằm lên một góc nhỏ theo hướng mũi tên',
  },
  {
    direction: 'SMILE',
    title: 'NHÌN THẲNG & GIỮ NỤ CƯỜI TỰ NHIÊN',
    subtitle: 'Mẫu 5/5: Biểu cảm tự nhiên',
    instruction: 'Giữ nụ cười nhẹ để hoàn tất thu thập sinh trắc học',
  },
]

interface ProfileInfo {
  id: number
  student_id: number
  status: string
  sample_count: number
  model_name: string
  model_version: string
  embedding_dimension: number
  consent_at: string
  activated_at?: string
}

function playCaptureChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch {
    // Browser audio policy
  }
}

function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const playNote = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    playNote(523.25, 0, 0.12) // C5
    playNote(659.25, 0.1, 0.12) // E5
    playNote(783.99, 0.2, 0.25) // G5
  } catch {
    // Browser audio policy
  }
}

export function FaceRegistrationView({
  role,
  currentUser,
  onRegistrationComplete,
}: FaceRegistrationViewProps) {
  const isStudent = role === 'student'
  const { showToast } = useToast()
  const webcamRef = useRef<WebcamCaptureHandle>(null)

  // Profile data from Database
  const [profileData, setProfileData] = useState<ProfileInfo | null>(null)
  const [registered, setRegistered] = useState(Boolean(currentUser.hasFaceRegistered))
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Registration Flow State
  const [samples, setSamples] = useState<string[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [flashScreen, setFlashScreen] = useState(false)

  // Server-verified guidance state. A sample is only captured once the
  // detected face reaches the requested position.
  const [faceInPosition, setFaceInPosition] = useState(false)
  const [isCapturingNow, setIsCapturingNow] = useState(false)
  const baselineRef = useRef<{ yaw: number; pitch: number } | null>(null)
  const firstTurnSignRef = useRef<number | null>(null)
  const captureLockRef = useRef(false)

  // 1. Fetch real face profile from database on mount
  const loadRealProfile = useCallback(async () => {
    setLoadingProfile(true)
    try {
      const profile = await faceService.getFaceProfile(currentUser.id)
      if (profile && profile.status === 'ACTIVE') {
        setProfileData(profile)
        setRegistered(true)
      } else {
        setProfileData(null)
        setRegistered(false)
      }
    } catch {
      setProfileData(null)
      setRegistered(false)
    } finally {
      setLoadingProfile(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    void loadRealProfile()
  }, [loadRealProfile])

  // Finalize Registration (Send 5 samples to backend)
  const finalizeRegistration = async (capturedSamples: string[]) => {
    setIsSubmitting(true)
    try {
      await faceService.registerFaceSamples(currentUser.id, capturedSamples)
      playSuccessChime()
      setRegistered(true)
      showToast('Đăng ký sinh trắc học thành công! Đặc trưng khuôn mặt đã được lưu trữ an toàn.', 'success')
      await loadRealProfile()
      onRegistrationComplete?.()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Lỗi trích xuất đặc trưng khuôn mặt'
      showToast(`Đăng ký thất bại: ${errMsg}`, 'error')
      // Reset for retry
      setSamples([])
      setCurrentStepIndex(0)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Called only after the AI service has verified the current guidance step.
  const captureVerifiedSnapshot = useCallback(() => {
    if (isCapturingNow || isSubmitting) return
    const frame = webcamRef.current?.captureSnapshot()
    if (!frame) return

    playCaptureChime()
    // Trigger quick screen flash
    setFlashScreen(true)
    setTimeout(() => setFlashScreen(false), 140)

    setSamples((prev) => {
      const updated = [...prev, frame]
      if (updated.length >= 5) {
        void finalizeRegistration(updated)
      } else {
        setCurrentStepIndex(updated.length)
      }
      return updated
    })
  }, [isCapturingNow, isSubmitting])

  // The AI detector validates a real frame before capture. This deliberately
  // replaces browser-only face/luminance heuristics and captures immediately.
  useEffect(() => {
    if (registered || isSubmitting || samples.length >= 5) {
      setFaceInPosition(false)
      return
    }
    let cancelled = false
    const checkPosition = async () => {
      if (captureLockRef.current || !webcamRef.current?.isCameraActive()) return
      const video = webcamRef.current.getVideoElement()
      const frame = webcamRef.current.captureSnapshot()
      if (!video || !frame || video.videoWidth === 0 || video.videoHeight === 0) return
      const result = await faceService.detectFrame(frame)
      const face = result.face_count === 1 ? result.faces[0] : undefined
      if (!face || face.confidence < 0.7 || face.bbox.length !== 4 || cancelled) {
        if (!cancelled) setFaceInPosition(false)
        return
      }
      const [left, top, right, bottom] = face.bbox
      const center = { x: (left + right) / 2, y: (top + bottom) / 2 }
      const width = video.videoWidth
      const height = video.videoHeight
      const step = REGISTRATION_STEPS[currentStepIndex]
      const centered = Math.abs(center.x - width / 2) <= width * 0.16 && Math.abs(center.y - height / 2) <= height * 0.18
      const landmarks = face.landmarks
      if (landmarks.length !== 5 || landmarks.some((point) => point.length !== 2)) {
        setFaceInPosition(false)
        return
      }
      const [leftEye, rightEye, nose, leftMouth, rightMouth] = landmarks
      const eyeMidX = (leftEye[0] + rightEye[0]) / 2
      const eyeMidY = (leftEye[1] + rightEye[1]) / 2
      const eyeDistance = Math.abs(rightEye[0] - leftEye[0])
      const mouthMidY = (leftMouth[1] + rightMouth[1]) / 2
      const faceHeight = Math.max(mouthMidY - eyeMidY, 1)
      // Nose-to-eye offset is a robust yaw proxy for InsightFace's five
      // landmarks. It changes when the person turns, even while centered.
      const yaw = (nose[0] - eyeMidX) / Math.max(eyeDistance, 1)
      const pitch = (nose[1] - eyeMidY) / faceHeight
      const baseline = baselineRef.current
      const yawDelta = baseline ? yaw - baseline.yaw : 0
      const pitchDelta = baseline ? pitch - baseline.pitch : 0
      const yawTurned = Math.abs(yawDelta) >= 0.055
      const matches = step.direction === 'CENTER' || step.direction === 'SMILE'
        ? centered && (!baseline || Math.abs(yawDelta) < 0.055)
        : step.direction === 'LEFT'
          ? yawTurned
          : step.direction === 'RIGHT'
            ? Boolean(firstTurnSignRef.current && yawDelta * firstTurnSignRef.current <= -0.055)
            : Boolean(baseline && Math.abs(pitchDelta) >= 0.045)
      if (cancelled) return
      setFaceInPosition(matches)
      if (!matches || captureLockRef.current) return
      captureLockRef.current = true
      setIsCapturingNow(true)
      if (step.direction === 'CENTER' && !baselineRef.current) {
        baselineRef.current = { yaw, pitch }
      }
      if (step.direction === 'LEFT') firstTurnSignRef.current = Math.sign(yawDelta) || 1
      captureVerifiedSnapshot()
      window.setTimeout(() => {
        captureLockRef.current = false
        setIsCapturingNow(false)
      }, 700)
    }
    const interval = window.setInterval(() => { void checkPosition() }, 850)
    void checkPosition()
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [registered, isSubmitting, samples.length, currentStepIndex, captureVerifiedSnapshot])

  const handleReset = () => {
    setSamples([])
    setCurrentStepIndex(0)
    setRegistered(false)
    setFaceInPosition(false)
    baselineRef.current = null
    firstTurnSignRef.current = null
  }

  const currentStep = REGISTRATION_STEPS[currentStepIndex] || REGISTRATION_STEPS[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100 flex items-center gap-1.5 w-fit">
            <Fingerprint size={13} className="text-teal-600" /> SINH TRẮC HỌC KHUÔN MẶT
          </span>
          <h2 className="text-xl font-bold text-slate-800 mt-2">
            {isStudent ? 'Đăng ký khuôn mặt cá nhân' : 'Quản lý dữ liệu sinh trắc học'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isStudent
              ? 'Quy trình hoàn toàn tự động (Hands-free) - Bạn chỉ cần nhìn theo các mũi tên chỉ dẫn trên camera.'
              : 'Theo dõi và giám sát trạng thái đăng ký sinh trắc học của sinh viên trong cơ sở dữ liệu.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isStudent && (
            <button className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
              <Users size={14} /> Danh sách sinh viên
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Camera Viewport with On-Screen Visual Direction Arrows (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col items-center">
          <div className="w-full relative">
            <WebcamCapture
              ref={webcamRef}
              isScanning={isSubmitting}
              showOverlays={true}
              hideDefaultOval={true}
              showControls={false}
              label={registered ? 'Hồ sơ khuôn mặt đã đăng ký' : 'Camera sinh trắc học'}
              sublabel={registered ? 'Dữ liệu đã sẵn sàng điểm danh' : 'Đưa mặt vào giữa khung hình'}
            >
              {/* Flash white overlay on capture */}
              {flashScreen && (
                <div className="absolute inset-0 bg-white z-50 transition-opacity duration-150 opacity-90 pointer-events-none" />
              )}

              {/* Submitting state overlay */}
              {isSubmitting && (
                <div className="absolute inset-0 z-40 bg-slate-900/85 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-teal-500/20 border-2 border-teal-400 flex items-center justify-center animate-spin">
                    <Loader2 size={28} className="text-teal-300" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Đang mã hóa sinh trắc học AI...</h4>
                    <p className="text-xs text-slate-300 mt-1 max-w-xs">
                      Trích xuất véc-tơ đặc trưng ArcFace 512-D và xác thực liveness từ 5 mẫu ảnh.
                    </p>
                  </div>
                </div>
              )}

              {/* Registered state overlay */}
              {registered && (
                <div className="absolute inset-0 z-40 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2 text-center p-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 mb-1">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-emerald-300">Khuôn mặt đã được xác thực!</h4>
                  <p className="text-xs text-slate-200 max-w-sm">
                    Hồ sơ sinh trắc học của bạn đã sẵn sàng cho tất cả các buổi học phần điểm danh.
                  </p>
                </div>
              )}

              {/* LIVE GUIDANCE OVERLAY WITH ON-SCREEN DIRECTION ARROWS */}
              {!registered && !isSubmitting && (
                <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4">
                  {/* Top: Current Action Banner */}
                  <div className="w-full flex justify-center">
                    <div className="bg-slate-900/85 border border-teal-500/50 backdrop-blur-md rounded-full px-4 py-1.5 text-center shadow-lg animate-pulse">
                      <span className="text-[11px] font-bold tracking-wider text-teal-300 uppercase">
                        {currentStep.title}
                      </span>
                    </div>
                  </div>

                  {/* Center: Smart Oval Scanner + Animated Direction Arrows */}
                  <div className="relative flex-1 flex items-center justify-center">
                    {/* Oval Guide with dynamic state */}
                    <div
                      className={cn(
                        'relative transition-all duration-300 flex items-center justify-center',
                        faceInPosition
                          ? 'border-2 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.7)]'
                          : 'border-2 border-dashed border-teal-300/60 shadow-[0_0_15px_rgba(20,143,131,0.3)]'
                      )}
                      style={{
                        width: '56%',
                        aspectRatio: '3/4',
                        borderRadius: '50%',
                        boxShadow: faceInPosition
                          ? '0 0 0 9999px rgba(0,0,0,0.4), 0 0 35px rgba(16,185,129,0.7)'
                          : '0 0 0 9999px rgba(0,0,0,0.5)',
                      }}
                    >
                      {/* Reserved center overlay area */}
                      {false && (
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-5xl font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] animate-ping">
                            {''}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mt-2 bg-slate-900/80 px-2 py-0.5 rounded-md">
                            Giữ nguyên góc mặt
                          </span>
                        </div>
                      )}

                      {/* Not in position guidance */}
                      {!faceInPosition && (
                        <div className="flex flex-col items-center justify-center text-center px-4">
                          <ScanFace size={32} className="text-teal-300/80 animate-pulse mb-1" />
                          <span className="text-[11px] font-semibold text-slate-200 drop-shadow">
                            Đưa khuôn mặt vào khung
                          </span>
                        </div>
                      )}

                      {/* CENTER STEP RETICLE */}
                      {currentStep.direction === 'CENTER' && faceInPosition && (
                        <div className="flex flex-col items-center justify-center">
                          <Target size={36} className="text-emerald-400 animate-spin" />
                          <span className="text-[10px] font-bold text-emerald-300 mt-1 uppercase">
                            Đã căn giữa
                          </span>
                        </div>
                      )}
                    </div>

                    {/* DIRECT ON-SCREEN ARROW: LEFT */}
                    {currentStep.direction === 'LEFT' && (
                      <div className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 flex items-center gap-1 animate-pulse">
                        <div className="w-14 h-14 rounded-full bg-teal-500/90 border-2 border-white shadow-[0_0_20px_rgba(20,143,131,0.8)] flex items-center justify-center text-white transform -translate-x-1 transition-transform">
                          <ArrowLeft size={36} strokeWidth={3} className="animate-bounce" />
                        </div>
                        <span className="text-xs font-black text-teal-300 bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm hidden sm:inline">
                          NGHIÊNG TRÁI
                        </span>
                      </div>
                    )}

                    {/* DIRECT ON-SCREEN ARROW: RIGHT */}
                    {currentStep.direction === 'RIGHT' && (
                      <div className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 flex items-center gap-1 animate-pulse">
                        <span className="text-xs font-black text-teal-300 bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm hidden sm:inline">
                          NGHIÊNG PHẢI
                        </span>
                        <div className="w-14 h-14 rounded-full bg-teal-500/90 border-2 border-white shadow-[0_0_20px_rgba(20,143,131,0.8)] flex items-center justify-center text-white transform translate-x-1 transition-transform">
                          <ArrowRight size={36} strokeWidth={3} className="animate-bounce" />
                        </div>
                      </div>
                    )}

                    {/* DIRECT ON-SCREEN ARROW: UP */}
                    {currentStep.direction === 'UP' && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-pulse">
                        <div className="w-14 h-14 rounded-full bg-teal-500/90 border-2 border-white shadow-[0_0_20px_rgba(20,143,131,0.8)] flex items-center justify-center text-white transform -translate-y-1 transition-transform">
                          <ArrowUp size={36} strokeWidth={3} className="animate-bounce" />
                        </div>
                        <span className="text-[11px] font-black text-teal-300 bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-sm">
                          NGƯỚC CẰM LÊN
                        </span>
                      </div>
                    )}

                    {/* DIRECT ON-SCREEN SMILE INDICATOR */}
                    {currentStep.direction === 'SMILE' && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-pulse">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/90 border-2 border-white shadow-[0_0_20px_rgba(16,185,129,0.8)] flex items-center justify-center text-white">
                          <Smile size={30} strokeWidth={2.5} />
                        </div>
                        <span className="text-[11px] font-black text-emerald-300 bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-sm">
                          MỈM CƯỜI NHẸ
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom: Interactive Subtitle & Step Indicator Bar */}
                  <div className="w-full flex flex-col items-center gap-2">
                    <div className="bg-slate-900/90 border border-slate-700/80 backdrop-blur-md rounded-xl px-4 py-2 text-center max-w-sm">
                      <p className="text-xs font-medium text-slate-100 leading-snug">
                        {currentStep.instruction}
                      </p>
                    </div>

                    {/* Direct Step Dots */}
                    <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-700/60 backdrop-blur-md">
                      {REGISTRATION_STEPS.map((_, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            'w-2 h-2 rounded-full transition-all duration-300',
                            idx < samples.length
                              ? 'bg-emerald-400 w-3'
                              : idx === currentStepIndex
                              ? 'bg-teal-400 ring-2 ring-teal-400/50 scale-125'
                              : 'bg-slate-600'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </WebcamCapture>
          </div>

          {/* Bottom Controls / Progress */}
          {isStudent && (
            <div className="mt-5 w-full max-w-md space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Tiến độ thu thập sinh trắc học</span>
                <span className="font-bold text-teal-700">{samples.length} / 5 mẫu</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-teal-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(samples.length / 5) * 100}%` }}
                />
              </div>

              {/* Sample Slots */}
              <div className="grid grid-cols-5 gap-2 pt-1">
                {[0, 1, 2, 3, 4].map((idx) => {
                  const hasSample = idx < samples.length
                  const isCurrent = idx === currentStepIndex && !registered
                  const stepObj = REGISTRATION_STEPS[idx]
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'aspect-square rounded-xl border flex flex-col items-center justify-center text-center p-1 transition-all',
                        hasSample
                          ? 'bg-teal-50 border-teal-300 text-teal-700 shadow-xs'
                          : isCurrent
                          ? 'bg-white border-teal-500 ring-2 ring-teal-500/20 text-teal-600 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-400 text-[11px]'
                      )}
                    >
                      {hasSample ? (
                        <Check size={20} className="text-teal-600" />
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] font-bold">Mẫu {idx + 1}</span>
                          <span className="text-[9px] text-slate-400 line-clamp-1">{stepObj.direction}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                {registered ? (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 transition"
                  >
                    <RotateCcw size={14} /> Chụp lại khuôn mặt mới
                  </button>
                ) : (
                  <p className="py-2 text-center text-xs font-medium text-slate-500">
                    AI sẽ tự lưu từng mẫu ngay khi bạn làm đúng hướng dẫn trên camera.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Verified Biometric Details & System Info (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {registered ? 'Hồ sơ sinh trắc học đã lưu' : 'Hướng dẫn xác thực rảnh tay'}
                </h3>
                <p className="text-xs text-slate-500">
                  {registered ? 'Dữ liệu được mã hóa và xác thực từ CSDL' : 'Chỉ cần quan sát mũi tên trên màn hình camera'}
                </p>
              </div>
            </div>

            {/* If registered: Show Real Profile Details Card from DB */}
            {registered && profileData ? (
              <div className="mt-4 space-y-3">
                <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-100 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Fingerprint size={14} className="text-teal-600" /> Mã hồ sơ sinh trắc:
                    </span>
                    <span className="font-bold text-teal-800">PROFILE-#{profileData.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Layers size={14} className="text-teal-600" /> Trạng thái:
                    </span>
                    <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {profileData.status} (Sẵn sàng)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Cpu size={14} className="text-teal-600" /> Mô hình nhận diện:
                    </span>
                    <span className="font-bold text-slate-800">{profileData.model_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Layers size={14} className="text-teal-600" /> Chiều vector đặc trưng:
                    </span>
                    <span className="font-bold text-slate-800">{profileData.embedding_dimension}-D ArcFace</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Calendar size={14} className="text-teal-600" /> Số mẫu lưu trữ:
                    </span>
                    <span className="font-bold text-teal-800">{profileData.sample_count} mẫu đa góc</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Calendar size={14} className="text-teal-600" /> Kích hoạt lúc:
                    </span>
                    <span className="font-medium text-slate-600">
                      {profileData.activated_at ? new Date(profileData.activated_at).toLocaleString('vi-VN') : 'Đã kích hoạt'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 text-xs text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-teal-600" /> Tự động điểm danh thông minh:
                  </p>
                  Khi giảng viên mở phiên điểm danh lớp học, bạn chỉ cần xuất hiện trước camera điểm danh để được nhận diện tức thì trong &lt; 0.5 giây.
                </div>
              </div>
            ) : (
              /* If not registered: Hands-Free Steps Guide */
              <div className="mt-4 space-y-2.5">
                {[
                  {
                    step: '1',
                    title: 'Nhìn thẳng vào tâm camera',
                    desc: 'Khuôn mặt nằm trong khung bầu dục, hệ thống tự động khóa vị trí.',
                  },
                  {
                    step: '2',
                    title: 'Nghiêng nhẹ theo mũi tên chỉ dẫn',
                    desc: 'Mũi tên neon trên camera sẽ báo xoay trái, xoay phải, ngước cằm.',
                  },
                  {
                    step: '3',
                    title: 'Không cần bấm bất kỳ nút nào',
                    desc: 'AI xác nhận vị trí và tự lưu mẫu ngay khi góc mặt chính xác.',
                  },
                  {
                    step: '4',
                    title: 'Mã hóa tự động lên hệ thống AI',
                    desc: 'Sau đủ 5 mẫu ảnh, dữ liệu sẽ tự động gửi và tạo hồ sơ ArcFace.',
                  },
                ].map((item) => (
                  <div key={item.step} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {item.step}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block leading-tight">{item.title}</span>
                      <span className="text-[11px] text-slate-500 leading-snug mt-0.5 block">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            {loadingProfile ? (
              <Loader2 size={20} className="text-teal-600 animate-spin shrink-0 mt-0.5" />
            ) : registered ? (
              <CheckCircle2 size={20} className="text-teal-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">
                {loadingProfile
                  ? 'Đang kiểm tra hồ sơ từ cơ sở dữ liệu...'
                  : registered
                  ? 'Hồ sơ đã kích hoạt thành công (Active)'
                  : 'Chưa hoàn tất đăng ký sinh trắc học'}
              </div>
              <p className="text-[11px] mt-0.5 opacity-80 leading-relaxed">
                {loadingProfile
                  ? 'Vui lòng đợi giây lát...'
                  : registered
                  ? 'Khuôn mặt đã được lưu trữ trong cơ sở dữ liệu MySQL và vector InsightFace 512-D.'
                  : 'Hãy làm theo hướng dẫn các mũi tên trực tiếp trên màn hình camera để hoàn tất 5 góc mặt.'}
              </p>
            </div>
            {registered && <Sparkles size={16} className="text-teal-600 shrink-0" />}
          </div>
        </div>
      </div>
    </div>
  )
}
