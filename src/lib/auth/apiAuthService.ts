import type { AuthError, AuthOutcome, AuthUser } from '@/lib/auth/types'
import type { Entitlements, Plan } from '@/lib/plans'

/**
 * The browser side of the account system. Every call goes to the Reclaim
 * server, which owns the users table, the password hashes and the sessions.
 * The session itself is an HttpOnly cookie the browser carries automatically;
 * nothing about it is readable from JavaScript.
 */
export interface Providers {
  google: boolean
  ai: boolean
  emailDelivery: 'dev' | 'resend'
  requireEmailVerification: boolean
  devMailbox: boolean
}

export interface ServerUser {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  company: string
  createdAt: number
  emailVerified: boolean
  termsAcceptedAt: number | null
  termsVersion: string | null
  methods: Array<'password' | 'google'>
  plan: Plan
  onboardingSeenAt: number | null
}

export type SignUpResult = { ok: true; requiresVerification: true; email: string } | { ok: true; requiresVerification: false; user: AuthUser } | AuthError
export type LogInResult = AuthOutcome | (AuthError & { code: 'email_unverified' })

let fetchImpl: typeof fetch = (...args) => fetch(...args)
/** Tests point this at a live server; the app uses same-origin `/api`. */
export function setFetch(impl: typeof fetch): void {
  fetchImpl = impl
}

export function toAuthUser(user: ServerUser): AuthUser {
  return { ...user, isGuest: false }
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: T }> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  const res = await fetchImpl(path, { ...init, headers, credentials: 'same-origin', body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { status: res.status, body: body as T }
}

type Failure = { message?: string; code?: string; fields?: Record<string, string> }
const failure = (body: Failure | null, fallback: string): AuthError => ({ ok: false, message: body?.message ?? fallback, fields: body?.fields, code: body?.code } as AuthError)

export async function fetchProviders(): Promise<Providers> {
  try {
    const { status, body } = await call<Providers>('/api/auth/providers')
    if (status === 200) return body
  } catch {
    // server unreachable — fall through
  }
  return { google: false, ai: false, emailDelivery: 'dev', requireEmailVerification: true, devMailbox: false }
}

export async function getSession(): Promise<AuthUser | null> {
  try {
    const { status, body } = await call<{ user: ServerUser }>('/api/auth/me')
    return status === 200 ? toAuthUser(body.user) : null
  } catch {
    return null
  }
}

export async function signUp(input: {
  firstName: string
  lastName: string
  email: string
  company: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
  termsVersion: string
}): Promise<SignUpResult> {
  const { status, body } = await call<{ requiresVerification: boolean; email?: string; user?: ServerUser } & Failure>('/api/auth/signup', { method: 'POST', json: input })
  if (status !== 201) return failure(body, 'Could not create the account.')
  if (body.requiresVerification) return { ok: true, requiresVerification: true, email: body.email ?? input.email }
  return { ok: true, requiresVerification: false, user: toAuthUser(body.user!) }
}

export async function verifyEmail(token: string): Promise<AuthOutcome> {
  const { status, body } = await call<{ user: ServerUser } & Failure>('/api/auth/verify-email', { method: 'POST', json: { token } })
  if (status !== 200) return failure(body, 'This link is not valid.')
  return { ok: true, user: toAuthUser(body.user) }
}

export async function resendVerification(email: string): Promise<void> {
  await call('/api/auth/resend-verification', { method: 'POST', json: { email } })
}

export async function logIn(input: { email: string; password: string; rememberMe: boolean }): Promise<LogInResult> {
  const { status, body } = await call<{ user: ServerUser } & Failure>('/api/auth/login', { method: 'POST', json: input })
  if (status !== 200) return failure(body, "That email and password don't match.") as LogInResult
  return { ok: true, user: toAuthUser(body.user) }
}

export async function logOut(): Promise<void> {
  try {
    await call('/api/auth/logout', { method: 'POST' })
  } catch {
    // The local session is cleared regardless; the server session expires on its own.
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await call('/api/auth/forgot-password', { method: 'POST', json: { email } })
}

export async function resetPassword(token: string, password: string, confirmPassword: string): Promise<AuthOutcome> {
  const { status, body } = await call<{ user: ServerUser } & Failure>('/api/auth/reset-password', { method: 'POST', json: { token, password, confirmPassword } })
  if (status !== 200) return failure(body, 'Could not reset the password.')
  return { ok: true, user: toAuthUser(body.user) }
}

/** Development only: the emails the server would have sent to this address. */
export async function devMailbox(email: string): Promise<Array<{ subject: string; link: string | null; body: string }>> {
  const { status, body } = await call<{ messages: Array<{ subject: string; link: string | null; body: string }> }>(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)
  return status === 200 ? body.messages : []
}

/** What this account may do right now — the server's answer, never a client-side guess. */
export async function fetchEntitlements(): Promise<Entitlements | null> {
  try {
    const { status, body } = await call<Entitlements>('/api/account/entitlements')
    return status === 200 ? body : null
  } catch {
    return null
  }
}

export async function markOnboardingSeen(): Promise<AuthUser | null> {
  const { status, body } = await call<{ user: ServerUser }>('/api/account/onboarding-seen', { method: 'POST' })
  return status === 200 ? toAuthUser(body.user) : null
}

/** Asks the server to upgrade. Today the server answers "coming soon"; the message is shown as-is. */
export async function requestUpgrade(): Promise<{ ok: boolean; message: string }> {
  const { status, body } = await call<{ message?: string }>('/api/account/upgrade', { method: 'POST' })
  return { ok: status === 200, message: body?.message ?? 'Upgrading is coming soon.' }
}

/** Development only: switch the signed-in account's plan to exercise the paid-plan surface. */
export async function setDevPlan(plan: Plan): Promise<AuthUser | null> {
  const { status, body } = await call<{ user: ServerUser }>('/api/dev/plan', { method: 'POST', json: { plan } })
  return status === 200 ? toAuthUser(body.user) : null
}
