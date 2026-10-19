import { useState, useEffect } from 'react'
import { Play } from 'lucide-react'
import type { Role, View, User, AttendanceLog, AttendanceSession, ClassItem } from './types'
import { authService, attendanceService, sessionService, classService, faceService } from './services/api'
import { ToastProvider, useToast } from './components/common/Toast'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { Modal } from './components/common/Modal'

// Pages
import { TeacherDashboard } from './pages/dashboard/TeacherDashboard'
import { StudentDashboard } from './pages/dashboard/StudentDashboard'
import { AdminDashboard } from './pages/dashboard/AdminDashboard'
import { ClassManagement } from './pages/classes/ClassManagement'
import { StudentClassList } from './pages/classes/StudentClassList'
import { ClassRosterView } from './pages/classes/ClassRosterView'
import { LiveSessionView } from './pages/attendance/LiveSessionView'
import { FaceRegistrationView } from './pages/attendance/FaceRegistrationView'
import { AttendanceHistoryView } from './pages/history/AttendanceHistoryView'
import { ComplaintView } from './pages/complaints/ComplaintView'
import { ReportView } from './pages/reports/ReportView'
import { UserManagementView } from './pages/admin/UserManagementView'
import { AuditLogView } from './pages/admin/AuditLogView'
import { LoginView } from './pages/auth/LoginView'
import { userWsClient } from './websocket/userWs'

export default function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  )
}

function MainApp() {
  const { showToast } = useToast()

  const [role, setRole] = useState<Role>('teacher')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [activeView, setActiveView] = useState<View>('Tổng quan')
  const [sessionOpen, setSessionOpen] = useState(false)
  const [activeSession, setActiveSession] = useState<AttendanceSession | undefined>(undefined)
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false)
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>([])
  const [selectedClassIdToOpen, setSelectedClassIdToOpen] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [pendingLogs, setPendingLogs] = useState<AttendanceLog[]>([])
  const [selectedRosterClass, setSelectedRosterClass] = useState<ClassItem | null>(null)
  const [dataVersion, setDataVersion] = useState(0)

  const [quickStartTime, setQuickStartTime] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [quickEndTime, setQuickEndTime] = useState(() => {
    const d = new Date()
    return `${String((d.getHours() + 2) % 24).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [quickLateAfter, setQuickLateAfter] = useState(() => {
    const d = new Date()
    const m = d.getMinutes() + 15
    const h = (d.getHours() + Math.floor(m / 60)) % 24
    return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  })

  // Fetch pending review logs, check auth and load classes
  const refreshLogs = async () => {
    const logs = await attendanceService.getLogs()
    setPendingLogs(logs.filter((l) => l.reviewStatus === 'pending'))
  }

  useEffect(() => {
    const restoreSession = async () => {
      const user = await authService.getMe()
      if (user) {
        let finalUser = user
        if (user.role === 'student') {
          const profile = await faceService.getFaceProfile(user.id)
          finalUser = { ...user, hasFaceRegistered: Boolean(profile && profile.status === 'ACTIVE') }
        }
        setCurrentUser(finalUser)
        setRole(finalUser.role)
        refreshLogs()
        const [classes, sessions] = await Promise.all([
          classService.getClasses(),
          sessionService.getSessions(),
        ])
        setAvailableClasses(classes)
        if (classes.length > 0) setSelectedClassIdToOpen(classes[0].classId)
        const openSession = sessions.find((session) => session.status === 'active')
        setActiveSession(openSession)
        setSessionOpen(Boolean(openSession))
      }
      setIsRestoringSession(false)
    }
    void restoreSession()
  }, [])

  // All successful CRUD mutations emit data:changed from the HTTP client.
  // Re-mounting the active data view is intentional: each page owns its query
  // lifecycle, so it re-reads the persisted API state rather than retaining a
  // second, manually synchronised client-side copy.
  useEffect(() => {
    const refreshAfterMutation = () => {
      setDataVersion((version) => version + 1)
      void refreshLogs()
      void (async () => {
        const [classes, sessions] = await Promise.all([
          classService.getClasses(),
          sessionService.getSessions(),
        ])
        setAvailableClasses(classes)
        if (classes.length > 0) setSelectedClassIdToOpen(classes[0].classId)
        const openSession = sessions.find((item) => item.status === 'active')
        setActiveSession(openSession)
        setSessionOpen(Boolean(openSession))
      })()
    }

    window.addEventListener('data:changed', refreshAfterMutation)
    return () => window.removeEventListener('data:changed', refreshAfterMutation)
  }, [])

  const handleLogout = async () => {
    userWsClient.disconnect()
    await authService.logout()
    setCurrentUser(null)
    showToast('Đã đăng xuất khỏi hệ thống', 'info')
  }

  // Realtime user lifecycle & account status listener
  useEffect(() => {
    if (currentUser) {
      userWsClient.connect()
    } else {
      userWsClient.disconnect()
    }

    const onForceLogout = (e: any) => {
      const message = e.detail?.message || 'Phiên làm việc đã kết thúc hoặc tài khoản không còn hiệu lực.'
      userWsClient.disconnect()
      setCurrentUser(null)
      showToast(message, 'error')
    }

    const onRoleChanged = (e: any) => {
      const newRole = e.detail?.role?.toLowerCase()
      if (newRole && (newRole === 'student' || newRole === 'teacher' || newRole === 'admin')) {
        setRole(newRole)
        setCurrentUser((prev) => (prev ? { ...prev, role: newRole } : null))
        showToast(`Vai trò tài khoản đã được cập nhật thành: ${newRole}`, 'info')
      }
    }

    window.addEventListener('auth:force-logout', onForceLogout)
    window.addEventListener('auth:role-changed', onRoleChanged)

    return () => {
      window.removeEventListener('auth:force-logout', onForceLogout)
      window.removeEventListener('auth:role-changed', onRoleChanged)
      userWsClient.disconnect()
    }
  }, [currentUser, showToast])

  const handleLoginSuccess = async (user: User) => {
    let finalUser = user
    if (user.role === 'student') {
      const profile = await faceService.getFaceProfile(user.id)
      finalUser = { ...user, hasFaceRegistered: Boolean(profile && profile.status === 'ACTIVE') }
    }
    setCurrentUser(finalUser)
    setRole(finalUser.role)
    const [classes, sessions] = await Promise.all([
      classService.getClasses(),
      sessionService.getSessions(),
    ])
    setAvailableClasses(classes)
    if (classes.length > 0) setSelectedClassIdToOpen(classes[0].classId)
    const openSession = sessions.find((session) => session.status === 'active')
    setActiveSession(openSession)
    setSessionOpen(Boolean(openSession))
    setActiveView('Tổng quan')
  }

  if (isRestoringSession) {
    return <div className="min-h-screen grid place-items-center text-slate-600">Loading session…</div>
  }

  // If not logged in, show login or register screen
  if (!currentUser) {
    return (
      <LoginView
        onLogin={handleLoginSuccess}
      />
    )
  }

  const handleStartSession = async () => {
    const targetClass = availableClasses.find((c) => c.classId === selectedClassIdToOpen)
    if (!targetClass) return

    if (sessionService.hasActiveSessionForClass(targetClass.classId)) {
      showToast(`Lớp ${targetClass.className} (${targetClass.classId}) đang có phiên mở! Không thể tạo trùng (TEA_02).`, 'error')
      return
    }

    try {
      const newSession = await sessionService.createSession({
        classId: targetClass.classId,
        className: targetClass.className,
        room: targetClass.room,
        startTime: quickStartTime,
        endTime: quickEndTime,
        lateAfter: quickLateAfter,
        teacherId: currentUser.id,
        teacherName: currentUser.fullName,
      })
      setActiveSession(newSession)
      setSessionOpen(true)
      setShowCreateSessionModal(false)
      setActiveView('Chi tiết phiên điểm danh')
      showToast(`Đã mở phiên điểm danh ${newSession.sessionId} cho lớp ${targetClass.className}!`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể mở phiên điểm danh'
      showToast(msg, 'error')
    }
  }

  // Dynamic date & greeting
  const now = new Date()
  const dayNames = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY']
  const monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
  const dateDisplay = `${dayNames[now.getDay()]} · ${String(now.getDate()).padStart(2, '0')} THÁNG ${monthNames[now.getMonth()]}, ${now.getFullYear()}`
  const hour = now.getHours()
  const greeting = hour < 12 ? 'buổi sáng' : hour < 18 ? 'buổi chiều' : 'buổi tối'
  const lastName = currentUser.fullName.split(' ').slice(-1)[0]

  const pageTitle =
    activeView === 'Tổng quan'
      ? role === 'student'
        ? `Chào ${lastName}, hôm nay thế nào?`
        : role === 'admin'
        ? 'Tổng quan quản trị hệ thống'
        : `Chào ${greeting}, thầy/cô ${lastName}`
      : activeView

  return (
    <div className="min-h-screen bg-[#f5f8f8] text-[#172b35] font-sans antialiased lg:pl-[220px]">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => {
          if (role === 'teacher' && v === 'Điểm danh' && sessionOpen && activeSession) {
            setActiveView('Chi tiết phiên điểm danh')
            return
          }
          setActiveView(v)
        }}
        role={role}
        currentUser={currentUser}
        mobileOpen={mobileMenu}
        onCloseMobile={() => setMobileMenu(false)}
        onLogout={handleLogout}
      />

      {/* Main Area */}
      <main className="flex flex-col min-h-screen min-w-0">
        <Topbar
          activeView={activeView}
          role={role}
          currentUser={currentUser}
          onOpenMobileMenu={() => setMobileMenu(true)}
        />

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Main Page Heading */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-teal-700 uppercase">
                {dateDisplay}
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{pageTitle}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {role === 'student'
                  ? 'Theo dõi lịch học, chuyên cần và dữ liệu nhận diện khuôn mặt của bạn.'
                  : role === 'admin'
                  ? 'Theo dõi toàn bộ hoạt động vận hành, người dùng và sức khỏe hệ thống Face AI.'
                  : 'Đây là tình hình diễn biến các lớp học và phiên điểm danh hôm nay.'}
              </p>
            </div>

            {role === 'teacher' && activeView !== 'Chi tiết phiên điểm danh' && (
              <button
                onClick={() => {
                  if (sessionOpen && activeSession) {
                    setActiveView('Chi tiết phiên điểm danh')
                  } else {
                    setShowCreateSessionModal(true)
                  }
                }}
                className={
                  sessionOpen && activeSession
                    ? 'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition shrink-0'
                    : 'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition shrink-0'
                }
              >
                {sessionOpen && activeSession ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Xem phiên đang mở ({activeSession.classId})
                  </>
                ) : (
                  <>
                    <Play size={15} className="fill-current" /> Mở phiên điểm danh mới
                  </>
                )}
              </button>
            )}
          </div>

          {/* View Routing */}
          {activeView === 'Tổng quan' && role === 'teacher' && (
            <TeacherDashboard
              key={`teacher-dashboard-${dataVersion}`}
              currentUser={currentUser}
              pendingLogs={pendingLogs}
              onApproveLog={async (id) => {
                await attendanceService.approveLog(id)
                refreshLogs()
              }}
              onRejectLog={async (id) => {
                await attendanceService.rejectLog(id)
                refreshLogs()
              }}
              onOpenLiveSession={() => {
                if (sessionOpen && activeSession) {
                  setActiveView('Chi tiết phiên điểm danh')
                } else {
                  setShowCreateSessionModal(true)
                }
              }}
              onGoToAttendance={() => setActiveView('Lịch sử điểm danh')}
            />
          )}

          {activeView === 'Tổng quan' && role === 'student' && (
            <StudentDashboard
              key={`student-dashboard-${dataVersion}`}
              currentUser={currentUser}
              onGoToFaceRegistration={() => setActiveView('Đăng ký khuôn mặt')}
              onGoToComplaints={() => setActiveView('Khiếu nại')}
            />
          )}

          {activeView === 'Tổng quan' && role === 'admin' && (
            <AdminDashboard
              key={`admin-dashboard-${dataVersion}`}
              onGoToUsers={() => setActiveView('Người dùng')}
              onGoToAuditLogs={() => setActiveView('Nhật ký kiểm toán')}
            />
          )}

          {activeView === 'Môn học' && (
            <ClassManagement
              key={`classes-${dataVersion}`}
              role={role}
              currentUser={currentUser}
              onStartAttendance={(classId, session) => {
                if (session) {
                  setActiveSession(session)
                  setSessionOpen(true)
                  setActiveView('Chi tiết phiên điểm danh')
                  return
                }
                if (sessionOpen && activeSession && activeSession.classId === classId) {
                  setActiveView('Chi tiết phiên điểm danh')
                } else {
                  setSelectedClassIdToOpen(classId)
                  setShowCreateSessionModal(true)
                }
              }}
              onOpenClassRoster={(classItem) => {
                setSelectedRosterClass(classItem)
                setActiveView('Danh sách sinh viên lớp')
              }}
            />
          )}

          {activeView === 'Lớp học' && (
            <StudentClassList
              key={`student-classes-${dataVersion}`}
              role={role}
            />
          )}

          {activeView === 'Danh sách sinh viên lớp' && selectedRosterClass && (
            <ClassRosterView
              key={`class-roster-${selectedRosterClass.id}-${dataVersion}`}
              classItem={selectedRosterClass}
              role={role}
              onBack={() => setActiveView('Lớp học')}
            />
          )}

          {activeView === 'Chi tiết phiên điểm danh' && (
            <LiveSessionView
              key={`live-session-${dataVersion}`}
              session={activeSession}
              canOperate={role !== 'student'}
              onCloseSession={() => {
                setSessionOpen(false)
                setActiveSession(undefined)
                setActiveView('Tổng quan')
              }}
            />
          )}

          {(activeView === 'Điểm danh' || activeView === 'Lịch sử điểm danh') && (
            <AttendanceHistoryView
              key={`history-${dataVersion}`}
              role={role}
              currentUser={currentUser}
              onOpenLiveSession={() => {
                if (sessionOpen && activeSession) {
                  setActiveView('Chi tiết phiên điểm danh')
                } else {
                  setShowCreateSessionModal(true)
                }
              }}
              hasActiveSession={Boolean(sessionOpen && activeSession)}
              activeSessionInfo={activeSession ? `${activeSession.className} (${activeSession.classId} · ${activeSession.room})` : undefined}
            />
          )}

          {activeView === 'Đăng ký khuôn mặt' && (
            <FaceRegistrationView
              key={`face-registration-${dataVersion}`}
              role={role}
              currentUser={currentUser}
              onRegistrationComplete={() => {
                setCurrentUser({ ...currentUser, hasFaceRegistered: true })
              }}
            />
          )}

          {activeView === 'Khiếu nại' && (
            <ComplaintView key={`complaints-${dataVersion}`} role={role} currentUser={currentUser} />
          )}

          {activeView === 'Báo cáo' && (
            <ReportView key={`reports-${dataVersion}`} role={role} />
          )}

          {activeView === 'Người dùng' && (
            <UserManagementView key={`users-${dataVersion}`} currentUser={currentUser} onUserUpdated={(u) => setCurrentUser(u)} />
          )}

          {activeView === 'Nhật ký kiểm toán' && (
            <AuditLogView key={`audit-${dataVersion}`} />
          )}
        </div>
      </main>

      {/* Modal: Khởi tạo phiên điểm danh mới (TEA_02) */}
      <Modal
        isOpen={showCreateSessionModal}
        onClose={() => setShowCreateSessionModal(false)}
        title="Mở phiên điểm danh thời gian thực"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Chọn học phần / lớp học (Quy tắc TEA_02)
            </label>
            <select
              value={selectedClassIdToOpen}
              onChange={(e) => setSelectedClassIdToOpen(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              {availableClasses.map((cls) => {
                const isClsActive = sessionService.hasActiveSessionForClass(cls.classId)
                return (
                  <option key={cls.classId} value={cls.classId}>
                    {cls.classId} · {cls.className} {isClsActive ? '(⚠️ Đang mở phiên)' : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {(() => {
            const chosen = availableClasses.find((c) => c.classId === selectedClassIdToOpen)
            const isAlreadyActive = chosen ? sessionService.hasActiveSessionForClass(chosen.classId) : false

            return (
              <>
                {chosen && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Phòng học:</span>
                      <strong className="text-slate-800">{chosen.room}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Thời gian học:</span>
                      <span className="text-slate-700">{chosen.schedule}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sĩ số sinh viên:</span>
                      <span className="text-slate-700">{chosen.studentCount} sinh viên</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Giờ bắt đầu</label>
                    <input
                      type="time"
                      value={quickStartTime}
                      onChange={(e) => setQuickStartTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Giờ kết thúc</label>
                    <input
                      type="time"
                      value={quickEndTime}
                      onChange={(e) => setQuickEndTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mốc tính muộn (Sau mốc này sẽ tính ĐI TRỄ)
                  </label>
                  <input
                    type="time"
                    value={quickLateAfter}
                    onChange={(e) => setQuickLateAfter(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-xs"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    * So sánh thời gian thực: Điểm danh sau mốc này sẽ lưu trạng thái Đi trễ.
                  </p>
                </div>

                {isAlreadyActive ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                    <strong>Chống trùng lặp (TEA_02):</strong> Lớp {chosen?.className} ({chosen?.classId}) đang có một phiên điểm danh đang mở. Vui lòng đóng phiên cũ trước khi mở phiên mới.
                  </div>
                ) : (
                  <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg">
                    Lớp sẵn sàng mở phiên điểm danh AI mới. Camera nhận diện khuôn mặt sẽ được kích hoạt.
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateSessionModal(false)}
                    className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleStartSession}
                    disabled={isAlreadyActive}
                    className="px-4 py-2 font-semibold bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-xs transition"
                  >
                    Bắt đầu phiên điểm danh
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      </Modal>
    </div>
  )
}
