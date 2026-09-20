import type { AuthUser } from '@/lib/auth/types'

/**
 * What still lives in the browser after accounts moved to the server:
 *   - the guest session ("try the sample audit without an account"), which
 *     has no credentials and nothing to protect, and
 *   - the form validators, so the UI can flag a bad field before a round trip.
 * Real accounts, passwords and sessions are in server/auth.ts; nothing about
 * them is stored here any more.
 */
const GUEST_SESSION_KEY = 'reclaim.auth.guest.v1'
/** The old browser-side account store, removed with the move to server accounts. Wiped on sight so no password hash lingers. */
const RETIRED_KEYS = ['reclaim.auth.users.v1', 'reclaim.auth.session.v1', 'reclaim.auth.resetTokens.v1']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

function session(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

function retireLegacyStore(): void {
  if (typeof window === 'undefined') return
  for (const key of RETIRED_KEYS) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface SignUpInput {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  company: string
  acceptedTerms: boolean
}

export function validateSignUp(input: SignUpInput): Record<string, string> {
  const fields: Record<string, string> = {}
  if (input.firstName.trim().length < 1) fields.firstName = 'Enter your first name.'
  if (input.lastName.trim().length < 1) fields.lastName = 'Enter your last name.'
  if (!EMAIL_PATTERN.test(normalizeEmail(input.email))) fields.email = 'Enter a valid email address.'
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    fields.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (input.confirmPassword !== input.password) fields.confirmPassword = 'Passwords do not match.'
  if (input.company.trim().length < 1) fields.company = 'Enter your company name.'
  if (!input.acceptedTerms) fields.acceptedTerms = 'You need to agree to the Terms of Service and Privacy Policy.'
  return fields
}

export interface LogInInput {
  email: string
  password: string
  rememberMe: boolean
}

export function validateLogIn(input: Pick<LogInInput, 'email' | 'password'>): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!EMAIL_PATTERN.test(normalizeEmail(input.email))) fields.email = 'Enter a valid email address.'
  if (input.password.length === 0) fields.password = 'Enter your password.'
  return fields
}

function guestUser(id: string): AuthUser {
  return {
    id,
    firstName: 'Guest',
    lastName: '',
    name: 'Guest',
    email: '',
    company: '',
    createdAt: Date.now(),
    isGuest: true,
    termsAcceptedAt: null,
    termsVersion: null,
  }
}

/** A guest session lasts for the tab. It never touches the server. */
export function continueAsGuest(): AuthUser {
  retireLegacyStore()
  const id = `guest_${Date.now().toString(36)}`
  session()?.setItem(GUEST_SESSION_KEY, id)
  return guestUser(id)
}

export function logOut(): void {
  session()?.removeItem(GUEST_SESSION_KEY)
}

/** The current guest session, if any. Server sessions are asked for via the API, not read here. */
export function getSession(): AuthUser | null {
  retireLegacyStore()
  const id = session()?.getItem(GUEST_SESSION_KEY)
  return id ? guestUser(id) : null
}
