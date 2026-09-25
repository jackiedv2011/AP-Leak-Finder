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

/** Sent on every response. No CSP yet: the marketing pages still rely on inline scripts and styles. */
const HARDENING_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
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
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
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

export async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let cached: Promise<unknown> | null = null
  return {
    method: req.method ?? 'GET',
    url,
    headers: req.headers,
    cookies: parseCookies(req.headers.cookie),
    ip: req.socket.remoteAddress ?? 'unknown',
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

/** Tiny fixed-window rate limiter for the credential endpoints. In-memory: one process, one map. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()
  private readonly limit: number
  private readonly windowMs: number
  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }
  check(key: string): boolean {
    const now = Date.now()
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    entry.count += 1
    return entry.count <= this.limit
  }
}
