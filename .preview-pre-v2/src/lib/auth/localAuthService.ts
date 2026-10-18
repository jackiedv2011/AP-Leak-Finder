import type { AuthOutcome, AuthUser } from '@/lib/auth/types'

/**
 * Local, browser-only auth. There is no server: accounts, password hashes,
 * and sessions all live in this browser's localStorage. It is written
 * behind the same shape a real backend (Supabase, etc.) would expose —
 * signUp/logIn/logOut/requestPasswordReset/resetPassword/getSession — so
 * swapping in a real backend later means replacing this file, not the UI
 * that calls it.
 */

interface StoredUser {
  id: string
  name: string
  email: string
  salt: string
  passwordHash: string
  createdAt: number
}

interface ResetToken {
  token: string
  email: string
  expiresAt: number
}

interface Session {
  userId: string
  isGuest: boolean
  guestName?: string
}

const USERS_KEY = 'reclaim.auth.users.v1'
const SESSION_KEY = 'reclaim.auth.session.v1'
const RESET_TOKENS_KEY = 'reclaim.auth.resetTokens.v1'

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — the session still works for this tab.
  }
}

function getUsers(): StoredUser[] {
  return readJson<StoredUser[]>(USERS_KEY, [])
}

function saveUsers(users: StoredUser[]): void {
  writeJson(USERS_KEY, users)
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${password}`))
  return bytesToHex(digest)
}

function toAuthUser(stored: StoredUser): AuthUser {
  return { id: stored.id, name: stored.name, email: stored.email, createdAt: stored.createdAt, isGuest: false }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface SignUpInput {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export async function signUp(input: SignUpInput): Promise<AuthOutcome> {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)

  if (name.length < 2) return { ok: false, message: 'Enter your name.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Enter a valid email address.' }
  if (input.password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' }
  if (input.password !== input.confirmPassword) return { ok: false, message: 'Passwords do not match.' }

  const users = getUsers()
  if (users.some((u) => u.email === email)) {
    return { ok: false, message: 'An account with that email already exists.' }
  }

  const salt = randomId('salt')
  const passwordHash = await hashPassword(input.password, salt)
  const user: StoredUser = { id: randomId('user'), name, email, salt, passwordHash, createdAt: Date.now() }
  saveUsers([...users, user])
  writeJson(SESSION_KEY, { userId: user.id, isGuest: false } satisfies Session)

  return { ok: true, user: toAuthUser(user) }
}

export interface LogInInput {
  email: string
  password: string
}

export async function logIn(input: LogInInput): Promise<AuthOutcome> {
  const email = normalizeEmail(input.email)
  const users = getUsers()
  const found = users.find((u) => u.email === email)
  if (!found) return { ok: false, message: 'No account found for that email.' }

  const attemptHash = await hashPassword(input.password, found.salt)
  if (attemptHash !== found.passwordHash) return { ok: false, message: 'Incorrect password.' }

  writeJson(SESSION_KEY, { userId: found.id, isGuest: false } satisfies Session)
  return { ok: true, user: toAuthUser(found) }
}

export function continueAsGuest(): AuthUser {
  const guestId = randomId('guest')
  const session: Session = { userId: guestId, isGuest: true, guestName: 'Guest' }
  writeJson(SESSION_KEY, session)
  return { id: guestId, name: 'Guest', email: '', createdAt: Date.now(), isGuest: true }
}

export function logOut(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(SESSION_KEY)
}

export function getSession(): AuthUser | null {
  const session = readJson<Session | null>(SESSION_KEY, null)
  if (!session) return null

  if (session.isGuest) {
    return { id: session.userId, name: session.guestName ?? 'Guest', email: '', createdAt: Date.now(), isGuest: true }
  }

  const users = getUsers()
  const found = users.find((u) => u.id === session.userId)
  return found ? toAuthUser(found) : null
}

/**
 * There is no email server here, so this returns the reset token directly
 * instead of sending it anywhere — the UI shows it as a "reset link" the
 * user can click in this same session. A real backend would email it and
 * this function would just return whether the request was accepted.
 */
export function requestPasswordReset(email: string): { token: string | null } {
  const normalized = normalizeEmail(email)
  const users = getUsers()
  const found = users.find((u) => u.email === normalized)
  if (!found) return { token: null }

  const tokens = readJson<ResetToken[]>(RESET_TOKENS_KEY, [])
  const token = randomId('reset')
  const next: ResetToken = { token, email: normalized, expiresAt: Date.now() + 30 * 60 * 1000 }
  writeJson(RESET_TOKENS_KEY, [...tokens.filter((t) => t.email !== normalized), next])
  return { token }
}

export async function resetPassword(token: string, newPassword: string): Promise<AuthOutcome> {
  if (newPassword.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' }

  const tokens = readJson<ResetToken[]>(RESET_TOKENS_KEY, [])
  const entry = tokens.find((t) => t.token === token)
  if (!entry || entry.expiresAt < Date.now()) {
    return { ok: false, message: 'That reset link has expired. Request a new one.' }
  }

  const users = getUsers()
  const index = users.findIndex((u) => u.email === entry.email)
  if (index === -1) return { ok: false, message: 'That account no longer exists.' }

  const salt = randomId('salt')
  const passwordHash = await hashPassword(newPassword, salt)
  const updated: StoredUser = { ...users[index], salt, passwordHash }
  const nextUsers = [...users]
  nextUsers[index] = updated
  saveUsers(nextUsers)
  writeJson(RESET_TOKENS_KEY, tokens.filter((t) => t.token !== token))
  writeJson(SESSION_KEY, { userId: updated.id, isGuest: false } satisfies Session)

  return { ok: true, user: toAuthUser(updated) }
}
