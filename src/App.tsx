import { lazy, Suspense, useEffect, type ReactElement } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext'
import { loginUrlFor, redirectTo } from '@/pages/authRedirect'

const SiteLanding = lazy(() =>
  import('@/components/site/SiteLanding').then((module) => ({ default: module.SiteLanding }))
)
const AuditApp = lazy(() => import('@/AuditApp').then((module) => ({ default: module.AuditApp })))
const NotFoundPage = lazy(() =>
  import('@/components/NotFoundPage').then((module) => ({ default: module.NotFoundPage }))
)
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const SignupPage = lazy(() => import('@/pages/SignupPage').then((module) => ({ default: module.SignupPage })))
const ForgotPasswordPage = lazy(() =>
  import('@/pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage }))
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage }))
)
const VerifyEmailPage = lazy(() =>
  import('@/pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage }))
)
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })))
const TermsPage = lazy(() => import('@/pages/TermsPage').then((module) => ({ default: module.TermsPage })))

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    redirectTo(to)
  }, [to])
  return <RouteFallback />
}

/** The workspace needs a session. Anyone without one is sent to log in and brought back afterwards. */
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, status } = useAuth()
  if (status === 'loading') return <RouteFallback />
  if (!user) return <Redirect to={loginUrlFor(`${window.location.pathname}${window.location.search}`)} />
  return children
}

/** Someone already logged in has no reason to see the log-in or sign-up forms. */
function RedirectIfAuthed({ children }: { children: ReactElement }) {
  const { user, status } = useAuth()
  if (status === 'loading') return <RouteFallback />
  if (user && !user.isGuest) return <Redirect to="/audit" />
  return children
}

function ScannerRoute() {
  if (window.location.pathname !== '/audit' || window.location.search !== '?entry=upload') {
    window.history.replaceState({}, '', '/audit?entry=upload')
  }
  return <AuditApp />
}

function RouteFallback() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f7f4ee] text-[#171716]" aria-busy="true">
      <p className="text-sm text-[#7c786f]">Loading Reclaim…</p>
    </main>
  )
}

const ROUTES: Record<string, () => ReactElement> = {
  '/': () => <SiteLanding />,
  '/audit': () => (
    <RequireAuth>
      <AuditApp />
    </RequireAuth>
  ),
  '/scanner': () => (
    <RequireAuth>
      <ScannerRoute />
    </RequireAuth>
  ),
  '/login': () => (
    <RedirectIfAuthed>
      <LoginPage />
    </RedirectIfAuthed>
  ),
  '/signup': () => (
    <RedirectIfAuthed>
      <SignupPage />
    </RedirectIfAuthed>
  ),
  '/verify-email': () => <VerifyEmailPage />,
  '/forgot-password': () => <ForgotPasswordPage />,
  '/reset-password': () => <ResetPasswordPage />,
  '/privacy': () => <PrivacyPage />,
  '/terms': () => <TermsPage />,
}

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const page = (ROUTES[pathname] ?? (() => <NotFoundPage />))()

  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>{page}</Suspense>
    </AuthProvider>
  )
}

export default App
