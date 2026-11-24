import { request } from '@playwright/test'
import { BASE_URL, assertLocalTarget } from './support/env'
import { purgeTestData } from './support/db'
import { buildWorld } from './support/world'

export default async function globalSetup() {
  assertLocalTarget()

  // The stack must be up before anything else.
  const ctx = await request.newContext({ baseURL: BASE_URL })
  let healthy = false
  for (let attempt = 0; attempt < 30 && !healthy; attempt++) {
    healthy = await ctx.get('/health').then((r) => r.ok()).catch(() => false)
    if (!healthy) await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  await ctx.dispose()
  if (!healthy) throw new Error(`Backend is not healthy at ${BASE_URL}/health. Start it with: docker compose up -d`)

  // Leftovers from an interrupted run, then a fresh baseline.
  purgeTestData()
  await buildWorld()
}
