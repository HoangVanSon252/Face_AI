import fs from 'node:fs'
import path from 'node:path'
import { Api, addDays, dateOnly } from './api'
import { ACCOUNTS, BOOTSTRAP_ADMIN, PASSWORD, WORLD_FILE, type RoleKey } from './env'

/** Baseline data every spec can rely on; specs add their own on top. */
export interface World {
  users: Record<RoleKey, number>
  classes: { k01: number; k02: number }
  semester: { id: number; code: string; start: string; end: string }
  course: { id: number; code: string; name: string }
  section: { id: number; code: string }
}

export async function buildWorld(): Promise<World> {
  const root = await Api.login(BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password)
  const users = {} as Record<RoleKey, number>
  users.admin = await createUser(root, 'admin')
  await root.dispose()

  const admin = await Api.login(ACCOUNTS.admin.username, PASSWORD)
  const k01 = must(await admin.post('/api/v1/academic/student-classes', { code: 'ZE2E-K01', name: 'Lớp E2E 01', department: 'Chính quy' }), 201)
  const k02 = must(await admin.post('/api/v1/academic/student-classes', { code: 'ZE2E-K02', name: 'Lớp E2E 02', department: 'Chính quy' }), 201)
  for (const key of ['gv', 'gv2', 'sv1', 'sv2', 'sv3'] as RoleKey[]) users[key] = await createUser(admin, key)

  const today = new Date()
  const start = dateOnly(addDays(today, -14))
  const end = dateOnly(addDays(today, 120))
  const semester = must(await admin.post('/api/v1/academic/semesters', { code: 'ZE2E-HK', name: 'Học kỳ E2E', start_date: start, end_date: end, status: 'PLANNED' }), 201)
  const course = must(await admin.post('/api/v1/academic/courses', { course_code: 'ZE2E101', course_name: 'Kiểm thử tự động', credits: 3 }), 201)
  const section = must(await admin.post('/api/v1/academic/sections', { section_code: 'ZE2E-CA01', course_id: course.id, semester_id: semester.id, lecturer_id: users.gv, room: 'E2E-101' }), 201)
  must(await admin.post(`/api/v1/academic/sections/${section.id}/classes/ZE2E-K01`), 200)
  await admin.dispose()

  const world: World = {
    users,
    classes: { k01: k01.id, k02: k02.id },
    semester: { id: semester.id, code: 'ZE2E-HK', start, end },
    course: { id: course.id, code: 'ZE2E101', name: 'Kiểm thử tự động' },
    section: { id: section.id, code: 'ZE2E-CA01' },
  }
  fs.mkdirSync(path.dirname(WORLD_FILE), { recursive: true })
  fs.writeFileSync(WORLD_FILE, JSON.stringify(world, null, 2))
  return world
}

export function loadWorld(): World {
  return JSON.parse(fs.readFileSync(WORLD_FILE, 'utf-8'))
}

async function createUser(admin: Api, key: RoleKey): Promise<number> {
  const a = ACCOUNTS[key]
  const body: Record<string, unknown> = {
    username: a.username,
    email: `${a.username}@e2e.example.com`,
    password: PASSWORD,
    full_name: a.fullName,
    role: a.role,
  }
  if (a.role === 'STUDENT') body.student = { student_code: a.code, administrative_class: a.klass, major: 'E2E' }
  if (a.role === 'LECTURER') body.lecturer = { lecturer_code: a.code, department: 'E2E' }
  return must(await admin.post('/api/v1/users/', body), 201).id
}

function must(reply: { status: number; body: any }, status: number) {
  if (reply.status !== status) throw new Error(`E2E setup expected ${status}, got ${reply.status}: ${JSON.stringify(reply.body)}`)
  return reply.body
}
