import { lazy, Suspense, type ReactElement } from 'react'
import { AuthProvider } from '@/lib/auth/AuthContext'

const LandingPage = lazy(() =>
  import('@/components/landing/LandingPage').then((module) => ({ default: module.LandingPage }))
)
const AuditApp = lazy(() =>
  import('@/AuditApp').then((module) => ({ default: module.AuditApp }))
)
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const NotFoundPage = lazy(() =>
  import('@/components/NotFoundPage').then((module) => ({ default: module.NotFoundPage }))
)

function RouteFallback() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#0a1220] text-[#eef1ec]" aria-busy="true">
      <p className="text-sm text-[#9ca59f]">Loading…</p>
    </main>
  )
}

const ROUTES: Record<string, () => ReactElement> = {
  '/': () => <LandingPage />,
  '/audit': () => <AuditApp />,
  '/login': () => <LoginPage />,
  '/signup': () => <SignupPage />,
  '/forgot-password': () => <ForgotPasswordPage />,
  '/reset-password': () => <ResetPasswordPage />,
  '/history': () => <HistoryPage />,
  '/settings': () => <SettingsPage />,
  '/profile': () => <ProfilePage />,
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
