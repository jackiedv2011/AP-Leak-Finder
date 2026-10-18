import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '@/lib/auth/apiAuthService'
import * as guest from '@/lib/auth/localAuthService'
import type { AuthError, AuthOutcome, AuthUser } from '@/lib/auth/types'
import { TERMS_VERSION } from '@/legal/terms'
import { clearStorageScope, setStorageScope } from '@/lib/storageScope'
import { fromStorable, replaceLocalProjects } from '@/ledger/projects'
import { projectSync } from '@/ledger/projectSync'
import { entitlementsFor, type Entitlements, type Plan } from '@/lib/plans'
import { readProfile, type OnboardingProfile } from '../../../server/onboarding.ts'

// A guest lives for the tab, so its onboarding does too.
const GUEST_SEEN_KEY = 'reclaim.tour.seen'
const GUEST_PROFILE_KEY = 'reclaim.onboarding.v1'

function withGuestOnboarding(user: AuthUser): AuthUser {
  try {
    const seen = window.sessionStorage.getItem(GUEST_SEEN_KEY) === '1'
    const profile = readProfile(window.sessionStorage.getItem(GUEST_PROFILE_KEY))
    return seen ? { ...user, onboardingSeenAt: user.onboardingSeenAt ?? Date.now(), onboardingProfile: profile } : user
  } catch {
    return user
  }
}

export type AuthStatus = 'loading' | 'ready'

interface AuthContextValue {
  user: AuthUser | null
  /** `loading` until the server has said whether there is a session. Gates wait on it. */
  status: AuthStatus
  isGuest: boolean
  providers: api.Providers | null
  /** The server's statement of what this account may do. Guests get Free limits locally. */
  entitlements: Entitlements | null
  refreshEntitlements: () => Promise<Entitlements | null>
  markOnboardingSeen: () => Promise<void>
  /** Stores onboarding's answers (on the account, or in the tab for a guest) and marks it done. */
  saveOnboarding: (profile: OnboardingProfile) => Promise<void>
  /** Development only: flip the account's plan. */
  setDevPlan: (plan: Plan) => Promise<void>
  signUp: (input: Omit<Parameters<typeof api.signUp>[0], 'termsVersion'>) => Promise<api.SignUpResult>
  verifyEmail: (token: string) => Promise<AuthOutcome>
  resendVerification: (email: string) => Promise<void>
  logIn: (input: { email: string; password: string; rememberMe: boolean }) => Promise<api.LogInResult>
  continueAsGuest: () => void
  logOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  resetPassword: (token: string, newPassword: string, confirmPassword: string) => Promise<AuthOutcome>
  /** Downloads everything the account holds, after any unsaved changes reach the server. */
  exportAccountData: () => Promise<void>
  /** Deletes the account on the server, then everything cached for it in this browser. */
  deleteAccount: (confirmEmail: string) => Promise<{ ok: true } | AuthError>
  /** Accepts the current Terms and Privacy Policy (shown when they changed since the account accepted). */
  acceptTerms: () => Promise<AuthOutcome>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Point the local cache at this account and fill it from the server. Runs
 * before `user` is published so the workspace never renders another
 * account's (or an empty) cache.
 */
async function enterAccount(user: AuthUser): Promise<void> {
  setStorageScope(user.id)
  try {
    const projects = await projectSync.pull()
    replaceLocalProjects(projects.map(fromStorable))
  } catch (err) {
    console.warn('Reclaim: could not load audits from the server —', err instanceof Error ? err.message : err)
  }
  void projectSync.flush()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [providers, setProviders] = useState<api.Providers | null>(null)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const mounted = useRef(true)

  const refreshEntitlements = useCallback(async () => {
    const next = await api.fetchEntitlements()
    if (mounted.current && next) setEntitlements(next)
    return next
  }, [])

  useEffect(() => {
    mounted.current = true
    void api.fetchProviders().then((p) => mounted.current && setProviders(p))
    ;(async () => {
      const guestUser = guest.getSession()
      if (guestUser?.isGuest) {
        setStorageScope('guest')
        if (mounted.current) {
          setEntitlements(entitlementsFor('free', 0))
          setUser(withGuestOnboarding(guestUser))
        }
      } else {
        const serverUser = await api.getSession()
        if (serverUser) {
          await enterAccount(serverUser)
          const ent = await api.fetchEntitlements()
          if (mounted.current) setEntitlements(ent)
        }
        if (mounted.current) setUser(serverUser)
      }
      if (mounted.current) setStatus('ready')
    })()
    return () => {
      mounted.current = false
    }
  }, [])

  const adopt = useCallback(async (next: AuthUser) => {
    guest.logOut()
    await enterAccount(next)
    const ent = await api.fetchEntitlements()
    setEntitlements(ent)
    setUser(next)
  }, [])

  const markOnboardingSeen = useCallback(async () => {
    if (user?.isGuest) {
      window.sessionStorage.setItem(GUEST_SEEN_KEY, '1')
      setUser({ ...user, onboardingSeenAt: Date.now() })
      return
    }
    const next = await api.markOnboardingSeen()
    if (next) setUser(next)
  }, [user])

  const saveOnboarding = useCallback(
    async (profile: OnboardingProfile) => {
      if (!user) return
      if (user.isGuest) {
        try {
          window.sessionStorage.setItem(GUEST_SEEN_KEY, '1')
          window.sessionStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile))
        } catch {
          /* storage refused: the answers still hold for this render */
        }
        setUser({ ...user, onboardingSeenAt: Date.now(), onboardingProfile: profile })
        return
      }
      const next = await api.saveOnboarding(profile)
      // If the save failed, onboarding still ends: nobody is held on step 8 by a network error.
      setUser(next ?? { ...user, onboardingSeenAt: Date.now(), onboardingProfile: profile })
    },
    [user]
  )

  const setDevPlan = useCallback(
    async (plan: Plan) => {
      const next = await api.setDevPlan(plan)
      if (next) {
        setUser(next)
        await refreshEntitlements()
      }
    },
    [refreshEntitlements]
  )

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (input) => {
      const result = await api.signUp({ ...input, termsVersion: TERMS_VERSION })
      if (result.ok && !result.requiresVerification) await adopt(result.user)
      return result
    },
    [adopt]
  )

  const verifyEmail = useCallback<AuthContextValue['verifyEmail']>(
    async (token) => {
      const result = await api.verifyEmail(token)
      if (result.ok) await adopt(result.user)
      return result
    },
    [adopt]
  )

  const logIn = useCallback<AuthContextValue['logIn']>(
    async (input) => {
      const result = await api.logIn(input)
      if (result.ok) await adopt(result.user)
      return result
    },
    [adopt]
  )

  const continueAsGuest = useCallback(() => {
    setStorageScope('guest')
    setEntitlements(entitlementsFor('free', 0))
    const g = guest.continueAsGuest()
    setUser(withGuestOnboarding(g))
  }, [])

  const logOut = useCallback(async () => {
    const leaving = user
    if (leaving && !leaving.isGuest) {
      await projectSync.flush()
      await api.logOut()
      // The account's cache goes with the session; the server keeps the data.
      clearStorageScope(leaving.id)
    } else if (leaving?.isGuest) {
      clearStorageScope('guest')
    }
    guest.logOut()
    projectSync.reset()
    setStorageScope(null)
    setEntitlements(null)
    setUser(null)
  }, [user])

  const resetPassword = useCallback<AuthContextValue['resetPassword']>(
    async (token, password, confirmPassword) => {
      const result = await api.resetPassword(token, password, confirmPassword)
      if (result.ok) await adopt(result.user)
      return result
    },
    [adopt]
  )

  const exportAccountData = useCallback(async () => {
    await projectSync.flush()
    window.location.assign(api.ACCOUNT_EXPORT_URL)
  }, [])

  const deleteAccount = useCallback<AuthContextValue['deleteAccount']>(
    async (confirmEmail) => {
      const leaving = user
      if (!leaving || leaving.isGuest) return { ok: false, message: 'Only a signed-in account can be deleted.' }
      // Pending saves are dropped, not flushed: nothing should be written back after this.
      projectSync.reset()
      const result = await api.deleteAccount(confirmEmail)
      if (!result.ok) return result
      clearStorageScope(leaving.id)
      guest.logOut()
      setStorageScope(null)
      setEntitlements(null)
      setUser(null)
      return result
    },
    [user]
  )

  const acceptTerms = useCallback<AuthContextValue['acceptTerms']>(async () => {
    const result = await api.acceptTerms(TERMS_VERSION)
    if (result.ok) setUser(result.user)
    return result
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isGuest: user?.isGuest ?? false,
      providers,
      entitlements,
      refreshEntitlements,
      markOnboardingSeen,
      saveOnboarding,
      setDevPlan,
      signUp,
      verifyEmail,
      resendVerification: api.resendVerification,
      logIn,
      continueAsGuest,
      logOut,
      requestPasswordReset: api.requestPasswordReset,
      resetPassword,
      exportAccountData,
      deleteAccount,
      acceptTerms,
    }),
    [user, status, providers, entitlements, refreshEntitlements, markOnboardingSeen, saveOnboarding, setDevPlan, signUp, verifyEmail, logIn, continueAsGuest, logOut, resetPassword, exportAccountData, deleteAccount, acceptTerms]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** For surfaces that also render outside the provider (tests, isolated mounts). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext)
}

/**
 * What the current session may do. Inside the app there is always a
 * provider; outside one (isolated component tests) nothing is gated, so the
 * workspace renders in full.
 */
export function useEntitlements(): Entitlements {
  const ctx = useContext(AuthContext)
  if (!ctx) return entitlementsFor('growth', 0)
  return ctx.entitlements ?? entitlementsFor('free', 0)
}
