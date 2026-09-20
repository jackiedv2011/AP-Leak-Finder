export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  /** `firstName lastName`, kept for display and for older callers. */
  name: string
  email: string
  company: string
  createdAt: number
  isGuest: boolean
  /** When the account holder accepted the Terms of Service and Privacy Policy. */
  termsAcceptedAt: number | null
  /** Which version of the documents that acceptance covered. */
  termsVersion: string | null
  /** Server accounts only: whether the address has been confirmed, and how the person signs in. */
  emailVerified?: boolean
  methods?: Array<'password' | 'google'>
  /** Server accounts only. Guests and legacy sessions are treated as Free. */
  plan?: 'free' | 'pro'
  onboardingSeenAt?: number | null
}

export interface AuthResult {
  ok: true
  user: AuthUser
}

/** Field-level messages keyed by input name, plus an optional form-level one. */
export interface AuthError {
  ok: false
  message: string
  fields?: Record<string, string>
  /** Machine-readable reason from the server, e.g. `email_unverified`. */
  code?: string
}

export type AuthOutcome = AuthResult | AuthError
