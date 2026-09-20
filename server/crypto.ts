import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))))
}

// scrypt parameters: N=2^15 is the OWASP-recommended floor for interactive logins.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 }

/** `scrypt$N$r$p$salt$hash` — self-describing so parameters can be raised later without a migration. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Always do the work, even when there is no hash, so a missing account costs the same time as a wrong password.
  const [, N, r, p, saltB64, hashB64] = (stored ?? `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$AAAAAAAAAAAAAAAAAAAAAA$AA`).split('$')
  const salt = Buffer.from(saltB64, 'base64url')
  const expected = Buffer.from(hashB64, 'base64url')
  const actual = await scrypt(password.normalize('NFKC'), salt, expected.length || SCRYPT.keylen, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 })
  if (!stored || actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/** A random opaque secret for the client; only its hash is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString('base64url')}`
}
