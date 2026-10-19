import { useState, useEffect, useRef } from 'react'
import {
  X,
  Check,
  Radio,
  Clock,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import type { AttendanceSession, AttendanceLog } from '../../types'
import { attendanceService, sessionService, classService, userService, faceService } from '../../services/api'
import { AttendanceWebSocketClient } from '../../websocket/attendanceWs'
import { WebcamCapture } from '../../components/attendance/WebcamCapture'
import { ConfirmModal } from '../../components/common/ConfirmModal'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'
import { ApiError } from '../../services/httpClient'

interface LiveSessionViewProps {
  session?: AttendanceSession
  onCloseSession: () => void
  canOperate: boolean
}

interface RosterStudent {
  name: string
  code: string
  present: boolean
  isLate: boolean
  lateMinutes?: number
  time: string
  confidence: number
}

export function LiveSessionView({ session, onCloseSession, canOperate }: LiveSessionViewProps) {
  const { showToast } = useToast()
  const activeSessionId = session?.sessionId ?? ''
  const numericSessionId = session?.id
  const targetClassId = session?.classId ?? ''
  const activeClassName = session?.className ?? ''
  const activeRoom = session?.room ?? ''
  const sessionTitle = session?.title || activeSessionId

  const [showCloseModal, setShowCloseModal] = useState(false)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('vi-VN'))

  const [feedLogs, setFeedLogs] = useState<AttendanceLog[]>([])
  const [reviewQueue, setReviewQueue] = useState<AttendanceLog[]>([])
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [scanStatus, setScanStatus] = useState('Waiting for a face in the scan frame.')
  const recognitionInFlightRef = useRef(false)
  const lastMatchedAtRef = useRef(0)
  const lastUnenrolledToastRef = useRef(0)
  const lastAlreadyCheckedToastRef = useRef(0)

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('vi-VN'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // TEA_03: Dynamically load students belonging to this class & session
  useEffect(() => {
    if (!canOperate || !numericSessionId || !targetClassId) {
      setRoster([])
      setFeedLogs([])
      setReviewQueue([])
      return
    }

    const loadData = async () => {
      const [classes, users, logs] = await Promise.all([
        classService.getClasses(),
        userService.getUsers(),
        attendanceService.getLogs(String(numericSessionId)),
      ])

      const foundClass = classes.find((c) => c.classId === targetClassId)
      const studentIds = foundClass?.studentIds ?? []

      const classRoster: RosterStudent[] = studentIds.map((sid) => {
        const u = users.find((user) => user.userId === sid)
        const log = logs.find((l) => l.studentId === sid)
        const isPresent = Boolean(log && (log.status === 'present' || log.status === 'late'))
        const isLate = Boolean(log && log.status === 'late')
        return {
          name: u ? u.fullName : sid,
          code: sid,
          present: isPresent,
          isLate,
          lateMinutes: log?.lateMinutes,
          time: log ? log.checkInTime : 'Chưa ghi nhận',
          confidence: log ? log.confidenceScore : 0,
        }
      })

      setRoster(classRoster)
      setFeedLogs(logs)
      setReviewQueue(logs.filter((l) => l.reviewStatus === 'pending'))
    }

    void loadData()
  }, [canOperate, numericSessionId, targetClassId])

  // Setup WebSocket Client
  useEffect(() => {
    if (!canOperate || !numericSessionId || numericSessionId <= 0) {
      setWsStatus('offline')
      return
    }
    const client = new AttendanceWebSocketClient(numericSessionId)
    client.connect()
    setWsStatus('connecting')

    const unsubscribe = client.subscribe(async (msg) => {
      if (msg.type === 'attendance_detected') {
        const logs = await attendanceService.getLogs(String(numericSessionId))
        setFeedLogs(logs)
        setReviewQueue(logs.filter((log) => log.reviewStatus === 'pending'))
        setRoster((previous) => previous.map((student) => {
          const log = logs.find((item) => item.studentId === student.code)
          if (!log) return student
          const isPresent = log.status === 'present' || log.status === 'late'
          const isLate = log.status === 'late'
          return {
            ...student,
            present: isPresent,
            isLate,
            lateMinutes: log.lateMinutes,
            time: log.checkInTime,
            confidence: log.confidenceScore,
          }
        }))
        showToast('Đã ghi nhận một lượt nhận diện mới.', 'success')
      } else if (msg.type === 'session_status') {
        setWsStatus('connected')
      } else if (msg.type === 'error') {
        setWsStatus('offline')
      }
    })

    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [canOperate, numericSessionId, showToast])

  // Approve in review queue
  const handleApprove = async (id: number) => {
    await attendanceService.approveLog(id)
    setReviewQueue((prev) => prev.filter((item) => item.id !== id))
    setFeedLogs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, reviewStatus: 'approved' } : item))
    )
    showToast('Đã phê duyệt điểm danh chính thức!', 'success')
  }

  // Reject in review queue
  const handleReject = async (id: number) => {
    await attendanceService.rejectLog(id)
    setReviewQueue((prev) => prev.filter((item) => item.id !== id))
    setFeedLogs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, reviewStatus: 'rejected', status: 'absent' } : item))
    )
    showToast('Đã từ chối kết quả nhận diện.', 'error')
  }

  // Close session
  const handleCloseSession = () => {
    setShowCloseModal(true)
  }

  const executeCloseSession = async () => {
    setShowCloseModal(false)
    if (!numericSessionId) return
    await sessionService.closeSession(String(numericSessionId))
    showToast(`Đã kết thúc phiên điểm danh ${activeSessionId}`, 'info')
    onCloseSession()
  }

  // Sends only a real JPEG frame captured by MediaDevices to the recognition API.
  const handleRecognition = async (imageBase64: string) => {
    if (!canOperate || !numericSessionId || numericSessionId <= 0 || recognitionInFlightRef.current) return
    if (Date.now() - lastMatchedAtRef.current < 3500) return
    recognitionInFlightRef.current = true
    try {
      const result = await faceService.recognize(numericSessionId, imageBase64)
      if (!result.matched) {
        setScanStatus(result.reason || 'No enrolled face profile matched this frame.')
      }
      if (result.matched) {
        setScanStatus('Face recognized and attendance saved.')
        lastMatchedAtRef.current = Date.now()
        const logs = await attendanceService.getLogs(String(numericSessionId))
        setFeedLogs(logs)
        setReviewQueue(logs.filter((log) => log.reviewStatus === 'pending'))
        setRoster((previous) => previous.map((student) => {
          const log = logs.find((item) => item.studentId === student.code)
          if (!log) return student
          const isPresent = log.status === 'present' || log.status === 'late'
          const isLate = log.status === 'late'
          return {
            ...student,
            present: isPresent,
            isLate,
            lateMinutes: log.lateMinutes,
            time: log.checkInTime,
            confidence: log.confidenceScore,
          }
        }))
        showToast('Đã nhận diện và ghi nhận điểm danh.', 'success')
      } else if (result.reason === 'Matched student is not enrolled') {
        if (Date.now() - lastUnenrolledToastRef.current > 4000) {
          lastUnenrolledToastRef.current = Date.now()
          showToast('Nhận diện khuôn mặt thành công nhưng sinh viên chưa có tên trong danh sách lớp này.', 'error')
        }
      } else if (result.reason === 'Student has already checked in') {
        if (Date.now() - lastAlreadyCheckedToastRef.current > 4000) {
          lastAlreadyCheckedToastRef.current = Date.now()
          showToast('Sinh viên này đã điểm danh trong phiên.', 'info')
        }
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
        return
      }
      showToast(error instanceof Error ? error.message : 'Không thể nhận diện khuôn mặt.', 'error')
    } finally {
      recognitionInFlightRef.current = false
    }
  }

  const onTimeCount = roster.filter((r) => r.present && !r.isLate).length
  const lateCount = roster.filter((r) => r.present && r.isLate).length
  const presentCount = onTimeCount + lateCount
  const totalCount = roster.length
  const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

  const isCurrentlyLate = (() => {
    if (session?.lateAfterAt) {
      return new Date().getTime() > new Date(session.lateAfterAt).getTime()
    }
    if (session?.lateAfter) {
      const [lh, lm] = session.lateAfter.split(':').map(Number)
      const now = new Date()
      const lateDate = new Date()
      lateDate.setHours(lh, lm, 0, 0)
      return now.getTime() > lateDate.getTime()
    }
    return false
  })()

  if (!canOperate) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Only staff can operate an attendance session. Students can register their face and view attendance history.
      </div>
    )
  }

  if (!session || !numericSessionId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Không có phiên điểm danh đang mở. Hãy mở một phiên từ lớp học trước khi bật camera.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Session Topbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
              <Radio size={12} /> TRỰC TIẾP
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500">{activeSessionId}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
              {sessionTitle}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mt-1">
            {activeClassName} · <span className="text-teal-700 font-medium">{activeRoom}</span>
          </h2>
          <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1">
              <Clock size={13} className="text-slate-400" />
              Khung giờ: <b>{session.startTime} - {session.endTime}</b>
            </span>
            <span>·</span>
            <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 font-mono text-[11px]">
              Mốc tính muộn: {session.lateAfter}
            </span>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {/* Realtime status banner */}
          {isCurrentlyLate ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600" />
              <span>Đã quá mốc tính muộn ({session.lateAfter}) - Check-in sẽ tính ĐI TRỄ</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Đang đúng hạn (trước {session.lateAfter}) - Check-in tính ĐÚNG GIỜ</span>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Clock size={14} className="text-teal-600" />
            <span className="font-mono font-medium">{currentTime}</span>
          </div>
          <button
            onClick={handleCloseSession}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition"
          >
            <X size={15} /> Đóng phiên điểm danh
          </button>
        </div>
      </div>

      {/* Main Row: Camera Feed & Live Attendance Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Webcam Panel (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <div className="relative rounded-xl overflow-hidden">
            <WebcamCapture
              isScanning={true}
              onCaptureFrame={handleRecognition}
              autoCapture={true}
              captureIntervalMs={1600}
              showScanLine={true}
              showOverlays={true}
              showControls={false}
              label="Camera AI đang quét..."
              sublabel="Đặt khuôn mặt vào giữa khung quét để điểm danh"
              overlayText="Camera HD · Khung quét khuôn mặt"
            />
          </div>

          <p className="mt-3 px-1 text-xs text-slate-500" aria-live="polite">{scanStatus}</p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Webcam kết nối ổn định
            </span>
            <span className={cn('font-medium', wsStatus === 'connected' ? 'text-teal-600' : 'text-amber-600')}>
              WebSocket: {wsStatus === 'connected' ? 'Đang truyền trực tiếp' : 'Đang kết nối...'}
            </span>
          </div>

        </div>

        {/* Live Attendance Stats & Roster (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Sĩ số trực tiếp</h3>
                <p className="text-xs text-slate-500">
                  {presentCount} / {totalCount} sinh viên đã có mặt
                </p>
              </div>
              <span className="text-2xl font-black text-teal-700">{percent}%</span>
            </div>

            {/* Progress Bar */}
            <div className="my-3 w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-teal-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Legend */}
            <div className="flex items-center flex-wrap gap-3 text-xs font-medium text-slate-600 mb-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Đúng giờ: <b className="text-emerald-700 font-bold">{onTimeCount}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Đi trễ: <b className="text-amber-700 font-bold">{lateCount}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                Vắng mặt: <b className="text-slate-800">{totalCount - presentCount}</b>
              </span>
            </div>

            {/* Mini Roster */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {roster.map((stu) => (
                <div
                  key={stu.code}
                  className="p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 flex items-center justify-between transition text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        stu.present
                          ? stu.isLate
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                          : 'bg-slate-300'
                      )}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">
                        {stu.name} <span className="text-[11px] font-mono text-slate-400">({stu.code})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {stu.present
                          ? stu.isLate
                            ? `Đi trễ ${stu.lateMinutes ? `(+${stu.lateMinutes}p)` : ''} · ${stu.confidence}% lúc ${stu.time}`
                            : `Đúng giờ · ${stu.confidence}% lúc ${stu.time}`
                          : 'Chưa ghi nhận'}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-bold shrink-0',
                      stu.present
                        ? stu.isLate
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {stu.present ? (stu.isLate ? 'ĐI TRỄ' : 'ĐÚNG GIỜ') : 'VẮNG'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Realtime Event Feed & Low-Confidence Review Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Realtime Event Feed */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">Feed nhận diện Realtime</h3>
              <p className="text-xs text-slate-500">Sự kiện từ WebSocket AI Pipeline</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-ping" />
              LIVE
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {feedLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Đang chờ khuôn mặt đầu tiên xuất hiện trước camera...
              </div>
            ) : (
              feedLogs.map((log) => {
                const isValid = log.reviewStatus === 'approved'
                return (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 flex items-center justify-between gap-3 text-xs transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] font-medium text-slate-400">{log.checkInTime}</span>
                      <div>
                        <div className="font-semibold text-slate-800">{log.studentName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{log.studentId}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-700">{log.confidenceScore.toFixed(1)}%</span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          log.status === 'late'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        )}
                      >
                        {log.status === 'late' ? `Đi trễ ${log.lateMinutes ? `(+${log.lateMinutes}p)` : ''}` : 'Đúng giờ'}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          isValid ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'
                        )}
                      >
                        {isValid ? 'Tự duyệt' : 'Cần kiểm duyệt'}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Hot Alert / Review Queue */}
        <div className="bg-white rounded-xl border border-amber-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-amber-100 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldAlert size={16} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Hàng chờ kiểm duyệt AI</h3>
                <p className="text-xs text-slate-500">Độ tin cậy 60% – 84% (Quy tắc FR-08)</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              {reviewQueue.length} chờ duyệt
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {reviewQueue.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Không có bản ghi nghi ngờ nào cần kiểm duyệt.
              </div>
            ) : (
              reviewQueue.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{item.studentName}</div>
                    <div className="text-[11px] text-amber-800 mt-0.5">
                      {item.confidenceScore.toFixed(1)}% · {item.checkInTime} · {item.studentId}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1"
                    >
                      <Check size={12} /> Duyệt
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1"
                    >
                      <X size={12} /> Từ chối
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showCloseModal}
        title="Xác nhận kết thúc phiên điểm danh"
        message={`Bạn có chắc chắn muốn đóng phiên điểm danh ${activeSessionId} (${activeClassName}) không? Mọi lượt quét khuôn mặt và ghi nhận mới sẽ bị dừng.`}
        confirmText="Đóng phiên"
        cancelText="Tiếp tục phiên"
        variant="danger"
        onConfirm={executeCloseSession}
        onCancel={() => setShowCloseModal(false)}
      />
    </div>
  )
}
