import { test as base, expect, type Page } from '@playwright/test'
import { Api } from './api'
import { ACCOUNTS, PASSWORD, type RoleKey } from './env'
import { loadWorld, type World } from './world'

interface Fixtures {
  world: World
  /** API client signed in as an e2e account (cached per worker). */
  as: (role: RoleKey) => Promise<Api>
  /** Sign in through the login screen and land on the dashboard. */
  loginAs: (page: Page, role: RoleKey) => Promise<void>
}

const cache = new Map<RoleKey, Api>()

export const test = base.extend<Fixtures>({
  world: async ({}, use) => use(loadWorld()),
  as: async ({}, use) => {
    await use(async (role) => {
      const cached = cache.get(role)
      if (cached && (await cached.get('/api/v1/auth/me')).status === 200) return cached
      const api = await Api.login(ACCOUNTS[role].username, PASSWORD)
      cache.set(role, api)
      return api
    })
  },
  loginAs: async ({}, use) => {
    await use(async (page, role) => {
      await page.goto('/')
      await page.fill('input[placeholder*="username"]', ACCOUNTS[role].username)
      await page.fill('input[placeholder*="••••••••"]', PASSWORD)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15000 })
    })
  },
})

export { expect }

export const nav = (page: Page, label: string) =>
  page.locator('nav[aria-label="Điều hướng chính"] button', { hasText: label })

/** Short unique suffix so repeated runs never collide. */
export const stamp = () => Date.now().toString(36).slice(-5).toUpperCase()
