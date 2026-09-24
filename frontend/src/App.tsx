import { useState, useEffect } from 'react'
import { Play } from 'lucide-react'
import type { Role, View, User, AttendanceLog, AttendanceSession, ClassItem } from './types'
import { authService, attendanceService, sessionService, classService } from './services/api'
import { ToastProvider, useToast } from './components/common/Toast'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { Modal } from './components/common/Modal'

// Pages
import { TeacherDashboard } from './pages/dashboard/TeacherDashboard'
import { StudentDashboard } from './pages/dashboard/StudentDashboard'
import { AdminDashboard } from './pages/dashboard/AdminDashboard'
import { ClassManagement } from './pages/classes/ClassManagement'
import { LiveSessionView } from './pages/attendance/LiveSessionView'
import { FaceRegistrationView } from './pages/attendance/FaceRegistrationView'
import { AttendanceHistoryView } from './pages/history/AttendanceHistoryView'
import { ComplaintView } from './pages/complaints/ComplaintView'
import { ReportView } from './pages/reports/ReportView'
import { UserManagementView } from './pages/admin/UserManagementView'
import { AuditLogView } from './pages/admin/AuditLogView'
import { LoginView } from './pages/auth/LoginView'
import { RegisterView } from './pages/auth/RegisterView'

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
  const [currentUser, setCurrentUser] = useState<User | null>(authService.getCurrentUser('teacher'))
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login')
  const [activeView, setActiveView] = useState<View>('Tổng quan')
  const [sessionOpen, setSessionOpen] = useState(true)
  const [activeSession, setActiveSession] = useState<AttendanceSession | undefined>(() => sessionService.getActiveSession())
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false)
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>([])
  const [selectedClassIdToOpen, setSelectedClassIdToOpen] = useState('IT308')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [pendingLogs, setPendingLogs] = useState<AttendanceLog[]>([])

  // Fetch pending review logs and classes
  const refreshLogs = async () => {
    const logs = await attendanceService.getLogs()
    setPendingLogs(logs.filter((l) => l.reviewStatus === 'pending'))
  }

  useEffect(() => {
    refreshLogs()
    classService.getClasses().then((cls) => {
      setAvailableClasses(cls)
      if (cls.length > 0) setSelectedClassIdToOpen(cls[0].classId)
    })
  }, [])

  // Sync role changes
  const handleRoleChange = (newRole: Role) => {
    setRole(newRole)
    const user = authService.getCurrentUser(newRole)
    setCurrentUser(user)
    setActiveView('Tổng quan')
    showToast(`Đã chuyển sang vai trò ${newRole.toUpperCase()} (${user.fullName})`, 'info')
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setAuthScreen('login')
    showToast('Đã đăng xuất khỏi hệ thống', 'info')
  }

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user)
    setRole(user.role)
    setActiveView('Tổng quan')
  }

  // If not logged in, show login or register screen
  if (!currentUser) {
    if (authScreen === 'register') {
      return (
        <RegisterView
          onGoLogin={() => setAuthScreen('login')}
          onRegistered={() => setAuthScreen('login')}
        />
      )
    }
    return (
      <LoginView
        onLogin={handleLoginSuccess}
        onGoRegister={() => setAuthScreen('register')}
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
        startTime: '08:00',
        endTime: '10:00',
        lateAfter: '08:15',
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

  const pageTitle =
    activeView === 'Tổng quan'
      ? role === 'student'
        ? `Chào ${currentUser.fullName.split(' ').slice(-1)[0]}, hôm nay thế nào?`
        : role === 'admin'
        ? 'Tổng quan quản trị hệ thống'
        : `Chào buổi sáng, cô ${currentUser.fullName.split(' ').slice(-1)[0]}`
      : activeView

  return (
    <div className="min-h-screen bg-[#f5f8f8] text-[#172b35] font-sans antialiased lg:pl-[220px]">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => setActiveView(v)}
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
          onRoleChange={handleRoleChange}
          onOpenMobileMenu={() => setMobileMenu(true)}
        />

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Main Page Heading */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-teal-700 uppercase">
                THỨ TƯ · 11 THÁNG 09, 2026
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
              currentUser={currentUser}
              onGoToFaceRegistration={() => setActiveView('Đăng ký khuôn mặt')}
              onGoToComplaints={() => setActiveView('Khiếu nại')}
            />
          )}

          {activeView === 'Tổng quan' && role === 'admin' && (
            <AdminDashboard
              onGoToUsers={() => setActiveView('Người dùng')}
              onGoToAuditLogs={() => setActiveView('Nhật ký kiểm toán')}
            />
          )}

          {activeView === 'Lớp học' && (
            <ClassManagement role={role} currentUser={currentUser} />
          )}

          {activeView === 'Chi tiết phiên điểm danh' && (
            <LiveSessionView
              session={activeSession}
              onCloseSession={() => {
                setSessionOpen(false)
                setActiveSession(undefined)
                setActiveView('Tổng quan')
              }}
            />
          )}

          {(activeView === 'Điểm danh' || activeView === 'Lịch sử điểm danh') && (
            <AttendanceHistoryView role={role} currentUser={currentUser} />
          )}

          {activeView === 'Đăng ký khuôn mặt' && (
            <FaceRegistrationView
              role={role}
              currentUser={currentUser}
              onRegistrationComplete={() => {
                setCurrentUser({ ...currentUser, hasFaceRegistered: true })
              }}
            />
          )}

          {activeView === 'Khiếu nại' && (
            <ComplaintView role={role} currentUser={currentUser} />
          )}

          {activeView === 'Báo cáo' && (
            <ReportView role={role} />
          )}

          {activeView === 'Người dùng' && (
            <UserManagementView />
          )}

          {activeView === 'Nhật ký kiểm toán' && (
            <AuditLogView />
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