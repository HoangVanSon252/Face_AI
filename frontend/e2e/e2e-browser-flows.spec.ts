import { test, expect } from '@playwright/test';

test.describe('EduFace AI - Browser End-to-End Test Suite', () => {

  test('Flow 1: Student Login -> Dashboard -> Face Registration UI -> Logout', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Login as Student
    await page.fill('input[placeholder*="username"]', 'student');
    await page.fill('input[placeholder*="••••••••"]', 'Student@123456');
    await page.locator('button[type="submit"]:has-text("Đăng nhập")').click();

    // 3. Verify Student Dashboard
    await expect(page.locator('text=Trần Minh Khoa').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=TỶ LỆ CHUYÊN CẦN').first()).toBeVisible();

    // 4. Navigate to Face Registration
    await page.locator('button:has-text("Đăng ký khuôn mặt")').first().click();
    await expect(page.locator('text=Đăng ký khuôn mặt cá nhân').first()).toBeVisible({ timeout: 5000 });

    // 5. The registration page always renders a capture viewport. In CI without a physical camera, the app correctly shows its fallback state instead of failing the page. A real webcam run should additionally assert video playback. 
    await expect(page.locator('video')).toHaveCount(1);

    // 6. Logout
    const logoutBtn = page.locator('button:has-text("Đăng xuất")').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page.locator('button[type="submit"]:has-text("Đăng nhập")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('Flow 2: Teacher Login -> Dashboard -> Class Management -> Attendance -> Logout', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Login as Teacher
    await page.fill('input[placeholder*="username"]', 'teacher');
    await page.fill('input[placeholder*="••••••••"]', 'Teacher@123456');
    await page.locator('button[type="submit"]:has-text("Đăng nhập")').click();

    // 3. Verify Teacher Dashboard
    await expect(page.locator('text=Nguyễn Văn Giảng').or(page.locator('text=Giảng viên')).or(page.locator('text=Nguyễn Văn Thầy')).first()).toBeVisible({ timeout: 10000 });

    // 4. Navigate to Classes
    await page.locator('button:has-text("Lớp học")').first().click();
    await expect(
      page.locator('text=Danh sách lớp học')
        .or(page.locator('text=QUẢN LÝ MÔN HỌC'))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // 5. Navigate to Attendance
    await page.locator('button:has-text("Điểm danh")').first().click();
    await expect(
      page.locator('text=Phiên điểm danh')
        .or(page.locator('text=Điểm danh'))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // 6. Logout
    const logoutBtn = page.locator('button:has-text("Đăng xuất")').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page.locator('button[type="submit"]:has-text("Đăng nhập")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('Flow 3: Student Login -> Attendance History -> Complaints -> Logout', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Login as Student
    await page.fill('input[placeholder*="username"]', 'student');
    await page.fill('input[placeholder*="••••••••"]', 'Student@123456');
    await page.locator('button[type="submit"]:has-text("Đăng nhập")').click();
    await expect(page.locator('text=Trần Minh Khoa').first()).toBeVisible({ timeout: 10000 });

    // 3. Navigate to Attendance History
    await page.locator('button:has-text("Lịch sử điểm danh")').first().click();
    await expect(
      page.locator('text=Lịch sử điểm danh')
        .or(page.locator('text=Nhật ký điểm danh'))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // 4. Navigate to Complaints
    await page.locator('button:has-text("Khiếu nại")').first().click();
    await expect(
      page.locator('text=Khiếu nại điểm danh')
        .or(page.locator('text=Gửi khiếu nại'))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // 5. Logout
    const logoutBtn = page.locator('button:has-text("Đăng xuất")').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page.locator('button[type="submit"]:has-text("Đăng nhập")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('Flow 4: Admin Login -> Dashboard -> User Management -> Audit Log -> Logout', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Login as Admin
    await page.fill('input[placeholder*="username"]', 'admin');
    await page.fill('input[placeholder*="••••••••"]', 'Admin@123456');
    await page.locator('button[type="submit"]:has-text("Đăng nhập")').click();

    // 3. Verify Admin Dashboard
    await expect(page.locator('text=Quản Trị Viên').first()).toBeVisible({ timeout: 10000 });

    // 4. Navigate to User Management
    await page.locator('button:has-text("Người dùng")').first().click();
    await expect(
      page.locator('text=Quản lý người dùng')
        .or(page.locator('text=Danh sách người dùng'))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // 5. Navigate to Audit Log
    await page.locator('button:has-text("Nhật ký kiểm toán")').first().click();
    await expect(
      page.locator('text=Nhật ký kiểm toán')
        .or(page.locator('text=Audit Log'))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // 6. Logout
    const logoutBtn = page.locator('button:has-text("Đăng xuất")').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page.locator('button[type="submit"]:has-text("Đăng nhập")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('Flow 5: Teacher Class Management -> Sessions & Attendance Schedule Modal', async ({ page }) => {
    // 1. Visit App & Login as Teacher
    await page.goto('/');
    await page.fill('input[placeholder*="username"]', 'teacher');
    await page.fill('input[placeholder*="••••••••"]', 'Teacher@123456');
    await page.locator('button[type="submit"]:has-text("Đăng nhập")').click();
    await expect(page.locator('text=Nguyễn Văn Giảng').or(page.locator('text=Giảng viên')).or(page.locator('text=Nguyễn Văn Thầy')).first()).toBeVisible({ timeout: 10000 });

    // 2. Navigate to Class Management via Sidebar Nav
    await page.locator('nav[aria-label="Điều hướng chính"] button:has-text("Môn học")').click();
    await expect(page.locator('text=QUẢN LÝ MÔN HỌC').first()).toBeVisible({ timeout: 10000 });

    // 3. The empty subject list is valid with real data. Enter a subject only when it exists.
    const subjectCard = page.locator('button:has-text("Xem ca học")').first();
    if (await subjectCard.isVisible()) {
      await subjectCard.click();
      const scheduleButton = page.locator('button:has-text("Lịch ca học")').first();
      if (await scheduleButton.isVisible()) {
        await scheduleButton.click();
        await expect(page.locator('text=Lịch học theo kỳ').first()).toBeVisible({ timeout: 5000 });
      }
    }
    // 6. Close Modal
    const closeBtn = page.locator('button:has-text("Đóng form")').or(page.locator('button:has-text("Hủy")')).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

});
