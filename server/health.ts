import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

/**
 * `GET /healthz` for the host's load balancer or container health check. It
 * says whether the process is up and the SQLite file answers a query, and
 * nothing else: no version, no counts, no configuration.
 *
 * It sits in front of the app's own request handler rather than inside its
 * router, so it answers even if a route further in is misbehaving.
 */
export function installHealthCheck(server: Server, db: DatabaseSync): void {
  const handlers = server.listeners('request') as Array<(req: IncomingMessage, res: ServerResponse) => void>
  server.removeAllListeners('request')
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
      const ok = databaseReachable(db)
      const body = JSON.stringify({ ok, database: ok ? 'ok' : 'unreachable' })
      res.writeHead(ok ? 200 : 503, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }
    for (const handler of handlers) handler.call(server, req, res)
  })
}

/** Reads the schema page, so this touches the file rather than only the open handle. */
export function databaseReachable(db: DatabaseSync): boolean {
  try {
    db.prepare('SELECT COUNT(*) AS n FROM sqlite_master').get()
    return true
  } catch {
    return false
  }
}
