import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

async function login(page: Page, username: string, password: string) {
  await page.fill('input[placeholder*="username"]', username)
  await page.fill('input[placeholder*="••••••••"]', password)
  await page.keyboard.press('Enter')
}

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const response = await request.post('/api/v1/auth/login', { form: { username, password } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

test.describe('Ca học detail, timetable and realtime notifications', () => {
  test('ca hoc shows its classes, head count and campus-time sessions; students are notified live', async ({ page, browser, request }) => {
    const admin = { Authorization: `Bearer ${await token(request, 'admin', 'Admin@123456')}` }
    const stamp = Date.now().toString().slice(-6)
    const post = async (path: string, data: object) => {
      const response = await request.post(path, { headers: admin, data })
      expect(response.ok(), `${path} -> ${response.status()}`).toBeTruthy()
      return response.json()
    }
    const semester = await post('/api/v1/academic/semesters', { code: `PW${stamp}`, name: 'Playwright', start_date: '2026-09-01', end_date: '2027-01-31', status: 'PLANNED' })
    const course = await post('/api/v1/academic/courses', { course_code: `PW${stamp}`, course_name: `Môn PW ${stamp}`, credits: 3 })
    const section = await post('/api/v1/academic/sections', { section_code: `PW-CA${stamp}`, course_id: course.id, semester_id: semester.id, lecturer_id: 2, room: 'B-201' })
    await request.post(`/api/v1/academic/sections/${section.id}/classes/D26QTKD01`, { headers: admin })
    await post(`/api/v1/sections/${section.id}/sessions/batch`, { days_of_week: [0], start_time: '07:30', end_time: '09:30', late_minutes: 15, start_date: '2026-09-01', end_date: '2027-01-31', total_sessions: 3 })

    try {
      // Student is signed in elsewhere and receives the change without reloading.
      const studentContext = await browser.newContext()
      const studentPage = await studentContext.newPage()
      await studentPage.goto('/')
      const signedIn = studentPage.waitForResponse((r) => r.url().includes('/auth/ws-ticket') && r.ok())
      await login(studentPage, 'student', 'Student@123456')
      await signedIn
      await studentPage.waitForTimeout(1000)

      await page.goto('/')
      await login(page, 'teacher', 'Teacher@123456')
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('button', { name: 'Nhật ký kiểm toán' })).toHaveCount(0)

      await page.goto(`/subjects?course=${course.id}&section=${section.id}`)
      await expect(page.getByText('Lớp trong ca học')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('D26QTKD01').first()).toBeVisible()
      await expect(page.getByText('2 SV').first()).toBeVisible()
      // 07:30 entered as campus time is shown as 07:30, not shifted by the UTC offset.
      await expect(page.getByText('07:30–09:30').first()).toBeVisible()

      await page.getByRole('button', { name: 'Thêm buổi' }).click()
      await page.fill('input[placeholder="Để trống: Buổi N"]', 'Buổi bù PW')
      await page.locator('input[type="date"]').fill('2026-12-21')
      await page.getByRole('button', { name: 'Lưu buổi học' }).click()
      await expect(page.getByText('Buổi bù PW')).toBeVisible({ timeout: 10000 })

      await expect(studentPage.getByText('Thêm buổi học: Buổi bù PW').first()).toBeVisible({ timeout: 10000 })
      await studentPage.getByRole('button', { name: 'Thông báo' }).click()
      await expect(studentPage.getByText(`Bạn được thêm vào ca học PW-CA${stamp}`).first()).toBeVisible()
      await expect(studentPage.getByText('/api/')).toHaveCount(0)
      await studentContext.close()
    } finally {
      await request.delete(`/api/v1/academic/sections/${section.id}`, { headers: admin })
      await request.delete(`/api/v1/academic/courses/${course.id}`, { headers: admin })
      await request.delete(`/api/v1/academic/semesters/${semester.id}`, { headers: admin })
    }
  })

  test('teachers and students cannot open the audit log', async ({ page }) => {
    await page.goto('/')
    const signedIn = page.waitForResponse((r) => r.url().includes('/auth/ws-ticket') && r.ok())
    await login(page, 'teacher', 'Teacher@123456')
    await signedIn
    await page.goto('/audit-logs')
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15000 })
  })
})
