import path from 'node:path'

/**
 * Everything the suite creates is named with these prefixes so the purge in
 * global setup/teardown can find it and nothing else: users `e2e_*`, academic
 * codes `ZE2E*`. Never reuse them for real data.
 */
export const USER_PREFIX = 'e2e_'
export const CODE_PREFIX = 'ZE2E'

export const BASE_URL = process.env.BASE_URL || 'http://localhost'
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
export const WORLD_FILE = path.resolve(__dirname, '..', '..', 'e2e-report', 'world.json')

/** Existing admin account used only to create the throw-away e2e admin. */
export const BOOTSTRAP_ADMIN = {
  username: process.env.E2E_ADMIN_USER || 'admin',
  password: process.env.E2E_ADMIN_PASSWORD || 'Admin@123456',
}

export const PASSWORD = 'E2e@Pass123456'

export type RoleKey = 'admin' | 'gv' | 'gv2' | 'sv1' | 'sv2' | 'sv3'

export const ACCOUNTS: Record<RoleKey, { username: string; fullName: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT'; code?: string; klass?: string }> = {
  admin: { username: 'e2e_admin', fullName: 'E2E Quản Trị', role: 'ADMIN' },
  gv: { username: 'e2e_gv', fullName: 'E2E Giảng Viên Một', role: 'LECTURER', code: 'ZE2EGV01' },
  gv2: { username: 'e2e_gv2', fullName: 'E2E Giảng Viên Hai', role: 'LECTURER', code: 'ZE2EGV02' },
  sv1: { username: 'e2e_sv1', fullName: 'E2E Sinh Viên Một', role: 'STUDENT', code: 'ZE2ESV01', klass: 'ZE2E-K01' },
  sv2: { username: 'e2e_sv2', fullName: 'E2E Sinh Viên Hai', role: 'STUDENT', code: 'ZE2ESV02', klass: 'ZE2E-K01' },
  sv3: { username: 'e2e_sv3', fullName: 'E2E Sinh Viên Ba', role: 'STUDENT', code: 'ZE2ESV03', klass: 'ZE2E-K02' },
}

/** The suite writes data; refuse to run against anything but a local stack. */
export function assertLocalTarget(): void {
  const host = new URL(BASE_URL).hostname
  if (!['localhost', '127.0.0.1', 'frontend'].includes(host) && process.env.E2E_ALLOW_REMOTE !== '1') {
    throw new Error(`E2E suite only runs against a local stack (BASE_URL=${BASE_URL}). Set E2E_ALLOW_REMOTE=1 to override.`)
  }
}
