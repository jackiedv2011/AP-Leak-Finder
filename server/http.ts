import type { IncomingMessage, ServerResponse } from 'node:http'

export interface Request {
  method: string
  url: URL
  headers: IncomingMessage['headers']
  cookies: Record<string, string>
  ip: string
  json<T = unknown>(): Promise<T>
}

export interface Response {
  status: number
  headers: Record<string, string | string[]>
  /** Buffer for static files: images and fonts must go out byte-for-byte, not through a UTF-8 round trip. */
  body: string | Buffer | null
}

/**
 * The Content Security Policy the pages are meant to live under. The marketing
 * pages and index.html still use inline scripts, so script-src keeps
 * 'unsafe-inline'; the rest pins every source to what the pages actually load
 * (Google Fonts, the landing site's cdnjs/jsDelivr libraries, Stripe).
 * Sent report-only until it has been checked in a browser on every page: the
 * browser console then names anything it would have blocked.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.stripe.com https://m.stripe.network",
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

/** Sent on every response. The enforced CSP holds only directives no page relies on breaking. */
const HARDENING_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
}

export const json = (status: number, data: unknown, headers: Record<string, string | string[]> = {}): Response => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(data),
})
export const redirect = (location: string, headers: Record<string, string | string[]> = {}): Response => ({
  status: 302,
  headers: { Location: location, ...headers },
  body: null,
})
export const empty = (status: number, headers: Record<string, string | string[]> = {}): Response => ({ status, headers, body: null })

export class HttpError extends Error {
  readonly status: number
  readonly code?: string
  readonly fields?: Record<string, string>
  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      // Someone else's malformed cookie on this domain must not break every request.
    }
  }
  return out
}

export function serializeCookie(name: string, value: string, options: { maxAge?: number; secure: boolean; httpOnly?: boolean; path?: string; sameSite?: 'Lax' | 'Strict' }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`, `SameSite=${options.sameSite ?? 'Lax'}`]
  if (options.httpOnly !== false) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  return parts.join('; ')
}

const MAX_BODY = 25 * 1024 * 1024 // a ledger with tens of thousands of rows serializes well under this

/**
 * The client's address. Behind a proxy or load balancer the socket address is
 * the proxy's, so with `trustProxy` hops configured the address comes from
 * X-Forwarded-For, counted from the right: each trusted proxy appends the
 * address it saw, and anything further left is whatever the client claimed.
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>, trustProxy: number): string {
  const socketIp = req.socket.remoteAddress ?? 'unknown'
  if (trustProxy < 1) return socketIp
  const header = req.headers['x-forwarded-for']
  const hops = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const candidate = hops[hops.length - trustProxy]
  return candidate && /^[\da-fA-F.:]{2,45}$/.test(candidate) ? candidate : socketIp
}

export async function toRequest(req: IncomingMessage, options: { trustProxy?: number } = {}): Promise<Request> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let cached: Promise<unknown> | null = null
  return {
    method: req.method ?? 'GET',
    url,
    headers: req.headers,
    cookies: parseCookies(req.headers.cookie),
    ip: clientIp(req, options.trustProxy ?? 0),
    json<T>() {
      cached ??= new Promise<unknown>((resolve, reject) => {
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BODY) {
            reject(new HttpError(413, 'Request too large'))
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        req.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (!text) return resolve({})
          try {
            resolve(JSON.parse(text))
          } catch {
            reject(new HttpError(400, 'Body must be JSON'))
          }
        })
        req.on('error', reject)
      })
      return cached as Promise<T>
    },
  }
}

export function writeResponse(res: ServerResponse, response: Response, options: { noStore?: boolean; hsts?: boolean } = {}): void {
  for (const [name, value] of Object.entries(HARDENING_HEADERS)) res.setHeader(name, value)
  // Account and financial data must not sit in a shared or browser cache.
  if (options.noStore) res.setHeader('Cache-Control', 'no-store')
  if (options.hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value)
  res.statusCode = response.status
  res.end(response.body ?? undefined)
}

/**
 * A state-changing request a browser sent from another site. Session cookies
 * are SameSite=Lax, which already keeps them off cross-site POSTs; this is the
 * second lock, and it also covers a sibling subdomain (same-site, so Lax lets
 * the cookie through). Requests without these headers (curl, server-to-server
 * webhooks) are not browser-driven CSRF and pass.
 */
export function isCrossSiteWrite(req: Pick<Request, 'method' | 'headers'>, appOrigin: string, production: boolean): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return true
  // Development may serve the app from another local port than APP_ORIGIN names, so only production pins the origin.
  if (!production) return false
  const origin = req.headers.origin
  if (!origin) return false
  return origin === 'null' || origin !== new URL(appOrigin).origin
}

/** Tiny fixed-window rate limiter for the credential endpoints. In-memory: one process, one map. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()
  private readonly limit: number
  private readonly windowMs: number
  private nextSweep = 0
  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }
  check(key: string): boolean {
    const now = Date.now()
    // Expired windows are dropped once per window, so keys from many addresses can't grow the map forever.
    if (now >= this.nextSweep) {
      for (const [k, e] of this.hits) if (e.resetAt < now) this.hits.delete(k)
      this.nextSweep = now + this.windowMs
    }
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    entry.count += 1
    return entry.count <= this.limit
  }
}
