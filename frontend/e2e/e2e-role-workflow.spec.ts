import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

async function login(page: Page, username: string, password: string) {
  await page.goto('/')
  await page.fill('input[placeholder*="username"]', username)
  await page.fill('input[placeholder*="••••••••"]', password)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15000 })
}

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const response = await request.post('/api/v1/auth/login', { form: { username, password } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

test.describe('Admin → lecturer → student workflow', () => {
  test('admin creates the semester on its own page, lecturer opens today from the timetable, student sees it live', async ({ page, browser, request }) => {
    const stamp = Date.now().toString().slice(-6)
    const admin = { Authorization: `Bearer ${await token(request, 'admin', 'Admin@123456')}` }
    const teacher = { Authorization: `Bearer ${await token(request, 'teacher', 'Teacher@123456')}` }
    const ids: { semester?: number; course?: number; section?: number; session?: number } = {}

    try {
      // Admin: the semester has its own menu entry (step 1).
      await login(page, 'admin', 'Admin@123456')
      await expect(page.getByText('Quy trình thiết lập học kỳ')).toBeVisible()
      await page.locator('nav[aria-label="Điều hướng chính"] button:has-text("Học kỳ")').click()
      await expect(page).toHaveURL(/\/admin\/semesters$/)
      await page.getByRole('button', { name: 'Tạo học kỳ' }).first().click()
      await page.fill('input[placeholder="VD: HK1-2026"]', `pw${stamp}`)
      await page.fill('input[placeholder="Học kỳ 1 năm 2026-2027"]', `Học kỳ PW ${stamp}`)
      await page.locator('form select').selectOption('PLANNED')
      await page.locator('form').getByRole('button', { name: 'Tạo học kỳ' }).click()
      await expect(page.getByText(`PW${stamp}`).first()).toBeVisible({ timeout: 10000 })
      const semesters = await (await request.get('/api/v1/academic/semesters', { headers: admin })).json()
      ids.semester = semesters.find((s: { code: string }) => s.code === `PW${stamp}`).id

      // Admin builds the ca học for the lecturer (the ca học UI is covered elsewhere).
      const course = await (await request.post('/api/v1/academic/courses', { headers: admin, data: { course_code: `PW${stamp}`, course_name: `Môn quy trình ${stamp}`, credits: 3 } })).json()
      ids.course = course.id
      const section = await (await request.post('/api/v1/academic/sections', { headers: admin, data: { section_code: `PW-CA${stamp}`, course_id: course.id, semester_id: ids.semester, lecturer_id: 2, room: 'C-105' } })).json()
      ids.section = section.id
      await request.post(`/api/v1/academic/sections/${section.id}/classes/D26QTKD01`, { headers: admin })
      // A session later today (or in a minute when it is almost midnight).
      const now = new Date()
      const start = new Date(now.getTime() + 60 * 60000)
      if (start.getDate() !== now.getDate()) start.setTime(now.getTime() + 60000)
      const end = new Date(start.getTime() + 30 * 60000)
      const created = await (await request.post(`/api/v1/sections/${section.id}/sessions`, { headers: admin, data: { title: `Buổi PW ${stamp}`, scheduled_start_at: start.toISOString(), scheduled_end_at: end.toISOString(), late_after_at: end.toISOString() } })).json()
      ids.session = created.id

      // Student is online on their timetable.
      const studentContext = await browser.newContext()
      const student = await studentContext.newPage()
      await login(student, 'student', 'Student@123456')
      await student.locator('nav[aria-label="Điều hướng chính"] button:has-text("Lịch học")').click()
      await expect(student).toHaveURL(/\/schedule$/)
      await expect(student.getByText(`Buổi PW ${stamp}`).first()).toBeVisible({ timeout: 15000 })

      // Lecturer: "Lịch dạy" → open today's session → live screen.
      await page.getByRole('button', { name: 'Đăng xuất' }).click()
      await login(page, 'teacher', 'Teacher@123456')
      await expect(page.getByText('Quy trình giảng dạy')).toBeVisible()
      await page.locator('nav[aria-label="Điều hướng chính"] button:has-text("Lịch dạy")').click()
      await expect(page).toHaveURL(/\/schedule$/)
      await expect(page.getByText(`Buổi PW ${stamp}`).first()).toBeVisible({ timeout: 15000 })
      await page.getByRole('button', { name: 'Mở điểm danh' }).first().click()
      await expect(page).toHaveURL(new RegExp(`/sessions/${created.id}/live$`), { timeout: 15000 })

      // Student is told immediately and the timetable shows the open session.
      await expect(student.getByText(`Đang mở điểm danh: Buổi PW ${stamp}`).first()).toBeVisible({ timeout: 15000 })
      await expect(student.getByText(`Đang mở điểm danh: Môn quy trình ${stamp}`).first()).toBeVisible({ timeout: 15000 })
      await studentContext.close()
    } finally {
      // Signing out in the UI revokes earlier tokens, so clean up with fresh ones.
      admin.Authorization = `Bearer ${await token(request, 'admin', 'Admin@123456')}`
      teacher.Authorization = `Bearer ${await token(request, 'teacher', 'Teacher@123456')}`
      if (ids.session) await request.post(`/api/v1/sessions/${ids.session}/close`, { headers: teacher })
      if (ids.section) await request.delete(`/api/v1/academic/sections/${ids.section}`, { headers: admin })
      if (ids.course) await request.delete(`/api/v1/academic/courses/${ids.course}`, { headers: admin })
      if (ids.semester) await request.delete(`/api/v1/academic/semesters/${ids.semester}`, { headers: admin })
    }
  })
})
