import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, username: string, password: string) {
  await page.fill('input[placeholder*="username"]', username)
  await page.fill('input[placeholder*="••••••••"]', password)
  await page.keyboard.press('Enter')
}

test.describe('Routing, deep links and biometric consent', () => {
  test('F5 keeps the current page and Back/Forward navigate views', async ({ page }) => {
    await page.goto('/')
    await login(page, 'admin', 'Admin@123456')
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.getByRole('button', { name: 'Người dùng' }).first().click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await page.getByRole('button', { name: 'Nhật ký kiểm toán' }).first().click()
    await expect(page).toHaveURL(/\/audit-logs$/)

    await page.reload()
    await expect(page).toHaveURL(/\/audit-logs$/, { timeout: 15000 })

    await page.goBack()
    await expect(page).toHaveURL(/\/admin\/users$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/audit-logs$/)
  })

  test('deep link survives sign-in and forbidden pages redirect by role', async ({ page }) => {
    await page.goto('/attendance/history')
    // The URL already matches before sign-in completes: wait for the signed-in app
    // (it opens the user WebSocket with a ticket) before asserting.
    const signedIn = page.waitForResponse((response) => response.url().includes('/auth/ws-ticket') && response.ok())
    await login(page, 'student', 'Student@123456')
    await signedIn
    await expect(page).toHaveURL(/\/attendance\/history$/)

    // Students may not open user management (full reload: session restore first).
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15000 })
  })

  test('user management paginates on the server', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/users/?')) requests.push(request.url())
    })
    await page.goto('/admin/users')
    await login(page, 'admin', 'Admin@123456')
    await expect(page.getByText(/Trang 1 \/ \d+/)).toBeVisible()
    await expect(page.getByText(/tài khoản$/).first()).toBeVisible()
    expect(requests.some((url) => url.includes('limit=20'))).toBeTruthy()
  })

  test('face registration asks for consent before capturing', async ({ page }) => {
    const detectFrameCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/face/detect-frame')) detectFrameCalls.push(request.url())
    })
    await page.goto('/face-registration')
    await login(page, 'student', 'Student@123456')
    await expect(page).toHaveURL(/\/face-registration$/)

    const consentButton = page.getByRole('button', { name: 'Đồng ý và bắt đầu đăng ký' })
    const eraseButton = page.getByRole('button', { name: /Xóa dữ liệu khuôn mặt/ })
    // A student who already has a profile sees the profile instead of the consent card.
    await expect(consentButton.or(eraseButton)).toBeVisible({ timeout: 15000 })
    if (await consentButton.isVisible()) {
      await expect(consentButton).toBeDisabled()
      await page.getByLabel(/Tôi đã đọc và đồng ý/).check()
      await expect(consentButton).toBeEnabled()
      await page.waitForTimeout(1500)
      // Nothing was uploaded for pose checks before consent.
      expect(detectFrameCalls).toEqual([])
    } else {
      await expect(eraseButton).toBeVisible()
    }
  })
})
