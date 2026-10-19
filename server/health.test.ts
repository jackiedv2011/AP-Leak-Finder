// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from './app.ts'
import { loadConfig } from './config.ts'
import { installHealthCheck } from './health.ts'

const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0' })

let app: App | null = null
afterEach(async () => {
  await app?.close().catch(() => {})
  app = null
})

async function start() {
  app = createApp({ config })
  installHealthCheck(app.server, app.db)
  return `http://127.0.0.1:${await app.listen(0)}`
}

describe('GET /healthz', () => {
  it('reports ok and a reachable database, and nothing else', async () => {
    const base = await start()
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, database: 'ok' })
    expect((await fetch(`${base}/healthz?probe=1`, { method: 'HEAD' })).status).toBe(200)
  })

  it('answers 503 when the database cannot be queried', async () => {
    const base = await start()
    app!.db.close()
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, database: 'unreachable' })
  })

  it('leaves every other request to the app', async () => {
    const base = await start()
    expect((await fetch(`${base}/api/auth/providers`)).status).toBe(200)
    expect((await fetch(`${base}/api/healthz`)).status).toBe(404)
    expect((await fetch(`${base}/healthz`, { method: 'POST' })).status).toBe(404)
  })
})
