import { useState, useEffect } from 'react'
import {
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Radio,
  Clock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import type { AttendanceSession, AttendanceLog } from '../../types'
import { attendanceService, sessionService, classService, userService } from '../../services/api'
import { AttendanceWebSocketClient } from '../../websocket/attendanceWs'
import { WebcamCapture } from '../../components/attendance/WebcamCapture'
import { useToast } from '../../components/common/Toast'
import { cn } from '../../lib/utils'

interface LiveSessionViewProps {
  session?: AttendanceSession
  onCloseSession: () => void
}

interface RosterStudent {
  name: string
  code: string
  present: boolean
  time: string
  confidence: number
}

export function LiveSessionView({ session, onCloseSession }: LiveSessionViewProps) {
  const { showToast } = useToast()
  const activeSessionId = session?.sessionId || 'SES-IT308-0911'
  const targetClassId = session?.classId || 'IT308'
  const activeClassName = session?.className || 'Lập trình Web nâng cao'
  const activeRoom = session?.room || 'Phòng A-301'

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('vi-VN'))

  const [feedLogs, setFeedLogs] = useState<AttendanceLog[]>([])
  const [reviewQueue, setReviewQueue] = useState<AttendanceLog[]>([])
  const [roster, setRoster] = useState<RosterStudent[]>([])

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('vi-VN'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // TEA_03: Dynamically load students belonging to this class & session
  useEffect(() => {
    const loadData = async () => {
      const [classes, users, logs] = await Promise.all([
        classService.getClasses(),
        userService.getUsers(),
        attendanceService.getLogs(activeSessionId),
      ])

      const foundClass = classes.find((c) => c.classId === targetClassId) || classes[0]
      const studentIds = foundClass?.studentIds || ['SV20240128', 'SV20240129', 'SV20240204', 'SV20240312', 'SV20240405']

      const classRoster: RosterStudent[] = studentIds.map((sid) => {
        const u = users.find((user) => user.userId === sid)
        const log = logs.find((l) => l.studentId === sid)
        return {
          name: u ? u.fullName : sid,
          code: sid,
          present: Boolean(log && (log.status === 'present' || log.status === 'late')),
          time: log ? log.checkInTime : 'Chưa ghi nhận',
          confidence: log ? log.confidenceScore : 0,
        }
      })

      setRoster(classRoster)
      setFeedLogs(logs)
      setReviewQueue(logs.filter((l) => l.reviewStatus === 'pending'))
    }

    loadData()
  }, [activeSessionId, targetClassId])

  // Setup WebSocket Client
  useEffect(() => {
    const client = new AttendanceWebSocketClient(activeSessionId)
    client.connect(false)
    setWsStatus('connected')

    const unsubscribe = client.subscribe((msg) => {
      if (msg.type === 'attendance_detected') {
        const log = msg.payload as AttendanceLog
        setFeedLogs((prev) => [log, ...prev])
        setRoster((prev) =>
          prev.map((s) =>
            s.code === log.studentId ? { ...s, present: true, time: log.checkInTime, confidence: log.confidenceScore } : s
          )
        )
        showToast(`Nhận diện thành công: ${log.studentName} (${log.confidenceScore}%)`, 'success')
      } else if (msg.type === 'review_required') {
        const log = msg.payload as AttendanceLog
        setFeedLogs((prev) => [log, ...prev])
        setReviewQueue((prev) => [log, ...prev])
        showToast(`Cảnh báo độ tin cậy thấp: ${log.studentName} (${log.confidenceScore}%)`, 'info')
      }
    })

    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [activeSessionId])

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
  const handleCloseSession = async () => {
    if (!confirm('Bạn có chắc muốn đóng phiên điểm danh này không? Mọi lượt quét mới sẽ bị dừng.')) return
    await sessionService.closeSession(activeSessionId)
    showToast(`Đã kết thúc phiên điểm danh ${activeSessionId}`, 'info')
    onCloseSession()
  }

  // Simulator Triggers
  const simulateAutoApprove = () => {
    const student = roster.find((s) => !s.present) || roster[0] || { name: 'Vũ Hoàng Nam', code: 'SV20230104' }
    const log = attendanceService.addRealtimeRecognition({
      sessionId: activeSessionId,
      classId: targetClassId,
      studentId: student.code,
      studentName: student.name,
      checkInTime: new Date().toTimeString().slice(0, 8),
      confidenceScore: 92.5,
      status: 'present',
      reviewStatus: 'approved',
      method: 'Khuôn mặt',
    })
    setFeedLogs((prev) => [log, ...prev])
    setRoster((prev) =>
      prev.map((s) => (s.code === student.code ? { ...s, present: true, time: log.checkInTime, confidence: 92.5 } : s))
    )
    showToast(`AI tự động duyệt (92.5% >= 85%): ${student.name}`, 'success')
  }

  const simulateReviewQueue = () => {
    const student = roster.find((s) => !s.present) || roster[roster.length - 1] || { name: 'Phạm Gia Bảo', code: 'SV20240405' }
    const log = attendanceService.addRealtimeRecognition({
      sessionId: activeSessionId,
      classId: targetClassId,
      studentId: student.code,
      studentName: student.name,
      checkInTime: new Date().toTimeString().slice(0, 8),
      confidenceScore: 71.4,
      status: 'present',
      reviewStatus: 'pending',
      method: 'Khuôn mặt',
    })
    setFeedLogs((prev) => [log, ...prev])
    setReviewQueue((prev) => [log, ...prev])
    showToast(`Độ tin cậy 71.4% (60% - 84%): Đã chuyển vào Review Queue!`, 'info')
  }

  const simulateDuplicate = () => {
    const presentStu = roster.find((s) => s.present) || roster[0]
    const name = presentStu ? presentStu.name : 'SV20240128'
    const code = presentStu ? presentStu.code : 'SV20240128'
    showToast(`[FR-10] Chống trùng lặp: Sinh viên ${name} (${code}) đã điểm danh, bỏ qua lượt quét lặp!`, 'info')
  }

  const presentCount = roster.filter((r) => r.present).length
  const totalCount = roster.length
  const percent = Math.round((presentCount / totalCount) * 100)

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
          </div>
          <h2 className="text-lg font-bold text-slate-800 mt-1">
            {activeClassName} · <span className="text-teal-700 font-medium">{activeRoom}</span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
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
              showScanLine={true}
              showOverlays={true}
              label="Camera AI đang quét..."
              sublabel="Đặt khuôn mặt vào giữa khung quét để điểm danh"
              overlayText="Camera HD · Khung quét khuôn mặt"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Webcam kết nối ổn định
            </span>
            <span className={cn('font-medium', wsStatus === 'connected' ? 'text-teal-600' : 'text-amber-600')}>
              WebSocket: {wsStatus === 'connected' ? 'Đang truyền trực tiếp' : 'Đang kết nối...'}
            </span>
          </div>

          {/* Quick Simulation Bar */}
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <Sparkles size={14} className="text-teal-600" /> Mô phỏng quét camera AI:
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={simulateAutoApprove}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
              >
                <UserCheck size={13} /> Quét ≥85% (Auto-Approve)
              </button>
              <button
                onClick={simulateReviewQueue}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition"
              >
                <AlertTriangle size={13} /> Quét 60-84% (Review Queue)
              </button>
              <button
                onClick={simulateDuplicate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition"
              >
                <RefreshCw size={13} /> Test chống trùng lặp (FR-10)
              </button>
            </div>
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
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600 mb-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Có mặt: <b className="text-slate-800">{presentCount}</b>
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
                        stu.present ? 'bg-emerald-500' : 'bg-slate-300'
                      )}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">
                        {stu.name} <span className="text-[11px] font-mono text-slate-400">({stu.code})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {stu.present ? `Đã nhận diện · ${stu.confidence}% lúc ${stu.time}` : 'Chưa ghi nhận'}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-bold shrink-0',
                      stu.present ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {stu.present ? 'CÓ MẶT' : 'VẮNG'}
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
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{log.confidenceScore.toFixed(1)}%</span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          isValid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        )}
                      >
                        {isValid ? 'Hợp lệ' : 'Cần kiểm duyệt'}
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
    </div>
  )
}
