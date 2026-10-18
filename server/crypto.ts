import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

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

/**
 * Secrets stored at rest (third-party access tokens) are sealed with
 * AES-256-GCM under a key that lives only in the environment, never in the
 * database. `context` is bound in as associated data — the owning user and
 * connection — so a sealed value copied onto another account's row fails to
 * open instead of granting that account access.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */
export function sealSecret(plaintext: string, key: Buffer, context: string): string {
  if (key.length !== 32) throw new Error('Secret key must be 32 bytes.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

/** Throws if the value was altered, sealed under another key, or sealed for another context. */
export function openSecret(sealed: string, key: Buffer, context: string): string {
  const [version, iv, tag, ciphertext] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || ciphertext === undefined) throw new Error('Unrecognized sealed secret.')
  // A fixed 16-byte tag: GCM would otherwise accept a truncated tag, which is easier to forge.
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: 16 })
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}
