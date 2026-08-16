import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import * as authService from '@/lib/auth/localAuthService'
import type { AuthOutcome, AuthUser } from '@/lib/auth/types'

interface AuthContextValue {
  user: AuthUser | null
  isGuest: boolean
  signUp: (input: authService.SignUpInput) => Promise<AuthOutcome>
  logIn: (input: authService.LogInInput) => Promise<AuthOutcome>
  continueAsGuest: () => void
  logOut: () => void
  requestPasswordReset: (email: string) => { token: string | null }
  resetPassword: (token: string, newPassword: string) => Promise<AuthOutcome>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getSession())

  const signUp = useCallback(async (input: authService.SignUpInput) => {
    const result = await authService.signUp(input)
    if (result.ok) setUser(result.user)
    return result
  }, [])

  const logIn = useCallback(async (input: authService.LogInInput) => {
    const result = await authService.logIn(input)
    if (result.ok) setUser(result.user)
    return result
  }, [])

  const continueAsGuest = useCallback(() => {
    setUser(authService.continueAsGuest())
  }, [])

  const logOut = useCallback(() => {
    authService.logOut()
    setUser(null)
  }, [])

  const requestPasswordReset = useCallback((email: string) => authService.requestPasswordReset(email), [])

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    const result = await authService.resetPassword(token, newPassword)
    if (result.ok) setUser(result.user)
    return result
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isGuest: user?.isGuest ?? false, signUp, logIn, continueAsGuest, logOut, requestPasswordReset, resetPassword }),
    [user, signUp, logIn, continueAsGuest, logOut, requestPasswordReset, resetPassword]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
