import { spawnSync } from 'node:child_process'
import { CODE_PREFIX, REPO_ROOT, USER_PREFIX } from './env'

const u = `${USER_PREFIX.replace('_', '\\_')}%`
const c = `${CODE_PREFIX}%`
const testUsers = `(SELECT id FROM (SELECT id FROM users WHERE username LIKE '${u}') t)`

/**
 * Removes everything the suite created, in foreign-key order. The API cannot
 * do this (deleting a user only locks it; a ca học with attendance cannot be
 * deleted), so it runs SQL in the local MySQL container. Only rows matching
 * the e2e prefixes are touched.
 */
const PURGE_SQL = `
DELETE FROM attendance_appeals WHERE student_id IN ${testUsers};
DELETE FROM attendance_records WHERE student_id IN ${testUsers};
DELETE FROM enrollments WHERE student_id IN ${testUsers};
DELETE FROM class_sections WHERE section_code LIKE '${c}'
  OR lecturer_id IN ${testUsers}
  OR course_id IN (SELECT id FROM (SELECT id FROM courses WHERE course_code LIKE '${c}') t)
  OR semester_id IN (SELECT id FROM (SELECT id FROM semesters WHERE code LIKE '${c}') t);
DELETE FROM attendance_sessions WHERE created_by IN ${testUsers};
DELETE FROM courses WHERE course_code LIKE '${c}';
DELETE FROM semesters WHERE code LIKE '${c}';
DELETE FROM administrative_classes WHERE code LIKE '${c}';
DELETE FROM users WHERE username LIKE '${u}';
SELECT ROW_COUNT();
`

export function purgeTestData(): void {
  if (process.env.E2E_DB_PURGE === 'off') return
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 face_attendance_db'],
    { cwd: REPO_ROOT, input: PURGE_SQL, encoding: 'utf-8' }
  )
  if (result.status !== 0) {
    throw new Error(`E2E purge failed (is the docker stack running?):\n${result.stderr}`)
  }
}

/** Leftover counts after a purge; all zero means the database is clean. */
export function leftoverCounts(): Record<string, number> {
  const sql = `SELECT
    (SELECT COUNT(*) FROM users WHERE username LIKE '${u}') users,
    (SELECT COUNT(*) FROM class_sections WHERE section_code LIKE '${c}') sections,
    (SELECT COUNT(*) FROM courses WHERE course_code LIKE '${c}') courses,
    (SELECT COUNT(*) FROM semesters WHERE code LIKE '${c}') semesters,
    (SELECT COUNT(*) FROM administrative_classes WHERE code LIKE '${c}') classes;`
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N face_attendance_db'],
    { cwd: REPO_ROOT, input: sql, encoding: 'utf-8' }
  )
  const [users, sections, courses, semesters, classes] = (result.stdout || '').trim().split(/\s+/).map(Number)
  return { users, sections, courses, semesters, classes }
}
