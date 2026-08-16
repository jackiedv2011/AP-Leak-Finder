export interface AuthUser {
  id: string
  name: string
  email: string
  createdAt: number
  isGuest: boolean
}

export interface AuthResult {
  ok: true
  user: AuthUser
}

export interface AuthError {
  ok: false
  message: string
}

export type AuthOutcome = AuthResult | AuthError
