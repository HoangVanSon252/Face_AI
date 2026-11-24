import { leftoverCounts, purgeTestData } from './support/db'

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === '1') {
    console.log('[e2e] E2E_KEEP_DATA=1: test data kept for inspection (purged at the next run).')
    return
  }
  purgeTestData()
  const left = leftoverCounts()
  const dirty = Object.entries(left).filter(([, n]) => n > 0)
  console.log(dirty.length ? `[e2e] WARNING leftovers after purge: ${JSON.stringify(left)}` : '[e2e] Test data purged, database clean.')
}
