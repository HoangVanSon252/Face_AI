import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { canOpen, labelFor, parsePath, pathFor } from './lib/routes'
import { Play, Radio, CalendarCheck, Clock3, MapPin, Plus } from 'lucide-react'
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
import { SemesterView } from './pages/admin/SemesterView'
import { ScheduleView } from './pages/schedule/ScheduleView'
import { WorkflowSteps } from './pages/dashboard/WorkflowSteps'
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
  // The URL decides the current page (F5, Back/Forward and deep links work).
  const location = useLocation()
  const navigate = useNavigate()
  const route = parsePath(location.pathname)
  const activeView: View = route.view
  const setActiveView = useCallback((view: View) => navigate(pathFor(view)), [navigate])
  const [sessionOpen, setSessionOpen] = useState(false)
  const [activeSession, setActiveSession] = useState<AttendanceSession | undefined>(undefined)
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false)
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>([])
  const [allSessions, setAllSessions] = useState<AttendanceSession[]>([])
  const [showAdHoc, setShowAdHoc] = useState(false)
  const [openingId, setOpeningId] = useState<number | null>(null)
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

  // Canonical URLs: once the session/class behind a page is known, put its id
  // in the address so the page can be reloaded or shared.
  useEffect(() => {
    if (route.view === 'Chi tiết phiên điểm danh' && !route.sessionId && activeSession?.id) {
      navigate(pathFor(route.view, { sessionId: activeSession.id }), { replace: true })
    } else if (route.view === 'Danh sách sinh viên lớp' && !route.rosterClassId && selectedRosterClass) {
      navigate(pathFor(route.view, { rosterClassId: selectedRosterClass.classId }), { replace: true })
    }
  }, [route.view, route.sessionId, route.rosterClassId, activeSession?.id, selectedRosterClass, navigate])

  // Deep link / reload: restore the session or class named in the URL.
  useEffect(() => {
    if (!currentUser || !route.sessionId || activeSession?.id === route.sessionId) return
    let cancelled = false
    void sessionService.getSessions().then((sessions) => {
      const target = sessions.find((item) => item.id === route.sessionId)
      if (cancelled) return
      if (target) setActiveSession(target)
      else navigate(pathFor('Tổng quan'), { replace: true })
    })
    return () => { cancelled = true }
  }, [currentUser, route.sessionId, activeSession?.id, navigate])

  useEffect(() => {
    if (!route.rosterClassId || selectedRosterClass?.classId === route.rosterClassId || availableClasses.length === 0) return
    const target = availableClasses.find((item) => item.classId === route.rosterClassId)
    if (target) setSelectedRosterClass(target)
    else navigate(pathFor('Lớp học'), { replace: true })
  }, [route.rosterClassId, selectedRosterClass?.classId, availableClasses, navigate])

  // Role guard at the routing layer: unknown or forbidden pages go to the dashboard.
  useEffect(() => {
    if (!currentUser) return
    if (location.pathname === '/' || !canOpen(currentUser.role, route.view)) {
      navigate(pathFor('Tổng quan'), { replace: true })
    }
  }, [currentUser, location.pathname, route.view, navigate])

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
        setAllSessions(sessions)
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
        setAllSessions(sessions)
        if (classes.length > 0) setSelectedClassIdToOpen((current) => current || classes[0].classId)
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
    setAllSessions(sessions)
    if (classes.length > 0) setSelectedClassIdToOpen(classes[0].classId)
    const openSession = sessions.find((session) => session.status === 'active')
    setActiveSession(openSession)
    setSessionOpen(Boolean(openSession))
    // Stay on a deep-linked page after signing in; '/' is sent to the dashboard by the role guard.
  }

  if (isRestoringSession) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f5f8f8]">
        <div className="animate-fade-in flex flex-col items-center gap-3 text-sm text-slate-500">
          <div className="animate-pulse-ring w-12 h-12 rounded-2xl bg-gradient-to-br from-[#16a394] to-[#0f7a70] grid place-items-center text-white">
            <CalendarCheck size={22} />
          </div>
          Đang tải phiên làm việc…
        </div>
      </div>
    )
  }

  // If not logged in, show login or register screen
  if (!currentUser) {
    return (
      <LoginView
        onLogin={handleLoginSuccess}
      />
    )
  }

  const goLive = (session: AttendanceSession) => {
    setActiveSession(session)
    setSessionOpen(true)
    setShowCreateSessionModal(false)
    navigate(pathFor('Chi tiết phiên điểm danh', { sessionId: session.id }))
  }

  const openScheduled = async (session: AttendanceSession) => {
    setOpeningId(session.id)
    try {
      const opened = await sessionService.openSession(session.id)
      showToast(`Đã mở điểm danh ${session.title} · ${session.classId}`, 'success')
      goLive({ ...session, ...opened, className: session.className, classId: session.classId, room: session.room, totalEnrolled: session.totalEnrolled })
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Không thể mở điểm danh', 'error')
    } finally {
      setOpeningId(null)
    }
  }

  const openSessionPicker = () => {
    if (sessionOpen && activeSession) {
      setActiveView('Chi tiết phiên điểm danh')
      return
    }
    setShowAdHoc(false)
    setShowCreateSessionModal(true)
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
      : labelFor(role, activeView)

  const todayKey = now.toDateString()
  const todaySessions = allSessions
    .filter((s) => s.scheduledStartAt && new Date(s.scheduledStartAt).toDateString() === todayKey && s.status === 'scheduled')
    .sort((a, b) => (a.scheduledStartAt || '').localeCompare(b.scheduledStartAt || ''))
  // These pages carry their own heading.
  const ownHeading = ['Học kỳ', 'Lịch học', 'Môn học', 'Lớp học', 'Chi tiết phiên điểm danh'].includes(activeView)

  return (
    <div className="min-h-screen bg-[#f5f8f8] bg-[radial-gradient(ellipse_at_top_right,rgba(20,143,131,0.07),transparent_55%)] text-[#172b35] font-sans antialiased lg:pl-[232px]">
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
        badges={role === 'teacher' ? { 'Điểm danh': pendingLogs.length } : {}}
        liveView={sessionOpen && activeSession ? (role === 'student' ? 'Lịch học' : role === 'teacher' ? 'Điểm danh' : undefined) : undefined}
      />

      {/* Main Area */}
      <main className="flex flex-col min-h-screen min-w-0">
        <Topbar
          activeView={activeView}
          role={role}
          currentUser={currentUser}
          onOpenMobileMenu={() => setMobileMenu(true)}
        />

        <div key={location.pathname} className="animate-page-in p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Main Page Heading */}
          <div className={ownHeading && !(role === 'teacher' && sessionOpen && activeSession && activeView !== 'Chi tiết phiên điểm danh')
            ? 'hidden'
            : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60'}>
            <div>
              <p className="text-[11px] font-bold tracking-wider text-teal-700 uppercase">
                {dateDisplay}
              </p>
              <h1 className={ownHeading ? 'hidden' : 'text-2xl font-bold tracking-tight text-slate-900 mt-1'}>{pageTitle}</h1>
              <p className={ownHeading ? 'hidden' : 'text-xs text-slate-500 mt-0.5'}>
                {role === 'student'
                  ? 'Theo dõi lịch học, chuyên cần và dữ liệu nhận diện khuôn mặt của bạn.'
                  : role === 'admin'
                  ? 'Thiết lập học kỳ, môn học, ca học và theo dõi vận hành điểm danh.'
                  : todaySessions.length > 0
                  ? `Hôm nay có ${todaySessions.length} buổi chưa mở điểm danh.`
                  : 'Đây là tình hình các ca học và phiên điểm danh của bạn.'}
              </p>
            </div>

            {role === 'teacher' && activeView !== 'Chi tiết phiên điểm danh' && (
              <button
                onClick={openSessionPicker}
                className={
                  sessionOpen && activeSession
                    ? 'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_6px_18px_rgba(16,185,129,0.3)] shrink-0'
                    : 'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-teal-700 hover:bg-teal-800 text-white shadow-[0_6px_18px_rgba(20,143,131,0.28)] shrink-0'
                }
              >
                {sessionOpen && activeSession ? (
                  <>
                    <span className="live-dot w-2 h-2 rounded-full bg-white" />
                    Xem phiên đang mở ({activeSession.classId})
                  </>
                ) : (
                  <>
                    <Play size={15} className="fill-current" /> Mở điểm danh
                    {todaySessions.length > 0 && <span className="animate-pop-in rounded-full bg-white/25 px-1.5 text-[10px]">{todaySessions.length}</span>}
                  </>
                )}
              </button>
            )}
          </div>

          {/* View Routing */}
          {activeView === 'Tổng quan' && (
            <WorkflowSteps role={role} currentUser={currentUser} onNavigate={setActiveView} />
          )}

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
              onOpenLiveSession={openSessionPicker}
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

          {activeView === 'Học kỳ' && (
            <SemesterView onGoToSubjects={() => setActiveView('Môn học')} />
          )}

          {activeView === 'Lịch học' && (
            <ScheduleView role={role} currentUser={currentUser} onOpenLive={goLive} />
          )}

          {activeView === 'Môn học' && (
            <ClassManagement
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
              key={`live-session-${activeSession?.id ?? 'none'}`}
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
              onOpenLiveSession={openSessionPicker}
              hasActiveSession={Boolean(sessionOpen && activeSession)}
              activeSessionInfo={activeSession ? `${activeSession.className} (${activeSession.classId} · ${activeSession.room})` : undefined}
            />
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

      {/* Modal: open today's scheduled session, or an extra one */}
      <Modal
        isOpen={showCreateSessionModal}
        onClose={() => setShowCreateSessionModal(false)}
        title="Mở điểm danh"
        maxWidth="560px"
      >
        <div className="space-y-4 text-xs">
          <div>
            <p className="font-bold text-slate-800 text-[13px]">Buổi học hôm nay</p>
            <p className="text-slate-500 mt-0.5">Chọn buổi trong lịch để mở điểm danh. Sinh viên của ca học được báo ngay.</p>
          </div>
          {todaySessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-slate-500">
              Hôm nay không có buổi nào trong lịch.
            </div>
          ) : (
            <div className="stagger space-y-2">
              {todaySessions.map((s) => (
                <div key={s.id} className="lift flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{s.className}</p>
                    <p className="text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span className="font-mono font-semibold text-teal-700">{s.classId}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 size={11} />{s.startTime}–{s.endTime}</span>
                      <span className="inline-flex items-center gap-1"><MapPin size={11} />{s.room}</span>
                      <span>{s.title}</span>
                    </p>
                  </div>
                  <button
                    disabled={openingId === s.id}
                    onClick={() => openScheduled(s)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    <Radio size={13} /> {openingId === s.id ? 'Đang mở…' : 'Mở'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowAdHoc((v) => !v)}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-teal-700"
            >
              <Plus size={14} className={showAdHoc ? 'rotate-45 transition-transform' : 'transition-transform'} />
              Buổi phát sinh (học bù, không có trong lịch)
            </button>
          </div>

          {showAdHoc && (
            <div className="animate-fade-in space-y-3 rounded-xl bg-slate-50 border border-slate-200/80 p-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ca học</label>
                <select
                  value={selectedClassIdToOpen}
                  onChange={(e) => setSelectedClassIdToOpen(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  {availableClasses.map((cls) => (
                    <option key={cls.classId} value={cls.classId}>
                      {cls.classId} · {cls.className} ({cls.studentCount} SV)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-[11px] font-semibold text-slate-600">Bắt đầu
                  <input type="time" value={quickStartTime} onChange={(e) => setQuickStartTime(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-mono" />
                </label>
                <label className="block text-[11px] font-semibold text-slate-600">Kết thúc
                  <input type="time" value={quickEndTime} onChange={(e) => setQuickEndTime(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-mono" />
                </label>
                <label className="block text-[11px] font-semibold text-slate-600">Tính trễ sau
                  <input type="time" value={quickLateAfter} onChange={(e) => setQuickLateAfter(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-mono" />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={!availableClasses.length}
                  className="px-4 py-2 font-semibold bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg"
                >
                  Tạo và mở buổi phát sinh
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
