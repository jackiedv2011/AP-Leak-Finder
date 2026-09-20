import { createApp, type App } from '../../server/app.ts'
import { loadConfig } from '../../server/config.ts'
import { openDatabase } from '../../server/db.ts'
import { DevMailer } from '../../server/mailer.ts'
import { setFetch as setAuthFetch } from '@/lib/auth/apiAuthService'
import { projectSync } from '@/ledger/projectSync'

/**
 * A real Reclaim server for front-end tests, plus a `fetch` that behaves like
 * a browser tab: relative `/api` URLs resolve against it and cookies persist.
 * Swapping the jar is how a test switches "browsers" (or users).
 */
export interface LiveServer {
  app: App
  base: string
  jar: Map<string, string>
  /** Direct API access with the current jar (for seeding and assertions). */
  api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ status: number; body: T }>
  inbox(email: string): Promise<Array<{ subject: string; link: string | null }>>
  tokenFrom(link: string | null): string
  newBrowser(): void
  close(): Promise<void>
}

export async function startLiveServer(): Promise<LiveServer> {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', APP_ORIGIN: 'http://localhost:0' })
  const db = openDatabase(':memory:')
  const app = createApp({ config, db, mailer: new DevMailer(db), google: null, drafts: null })
  const port = await app.listen(0)
  const base = `http://127.0.0.1:${port}`
  let jar = new Map<string, string>()

  const tabFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' && input.startsWith('/') ? base + input : input
    const headers = new Headers(init?.headers)
    if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await fetch(url, { ...init, headers, redirect: 'manual' })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const [name, value] = pair.split('=')
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(name)
      else jar.set(name, value)
    }
    return res
  }
  setAuthFetch(tabFetch)
  projectSync.useFetch(tabFetch)

  return {
    app,
    base,
    get jar() {
      return jar
    },
    async api(path, init = {}) {
      const headers = new Headers(init.headers)
      if (init.json !== undefined) headers.set('Content-Type', 'application/json')
      const res = await tabFetch(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
      const text = await res.text()
      return { status: res.status, body: text ? JSON.parse(text) : null }
    },
    async inbox(email) {
      const res = await fetch(`${base}/api/dev/mailbox?to=${encodeURIComponent(email)}`)
      return ((await res.json()) as { messages: Array<{ subject: string; link: string | null }> }).messages
    },
    tokenFrom: (link) => new URL(link!).searchParams.get('token')!,
    newBrowser() {
      jar = new Map()
    },
    async close() {
      await app.close()
      db.close()
    },
  }
}
