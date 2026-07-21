import { lazy, Suspense } from 'react'

const LandingPage = lazy(() =>
  import('@/components/landing/LandingPage').then((module) => ({ default: module.LandingPage }))
)
const AuditApp = lazy(() =>
  import('@/AuditApp').then((module) => ({ default: module.AuditApp }))
)
const NotFoundPage = lazy(() =>
  import('@/components/NotFoundPage').then((module) => ({ default: module.NotFoundPage }))
)

function RouteFallback() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#090b0c] text-[#eef1ec]" aria-busy="true">
      <p className="text-sm text-[#9ca59f]">Loading…</p>
    </main>
  )
}

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const page = pathname === '/'
    ? <LandingPage />
    : pathname === '/audit'
      ? <AuditApp />
      : <NotFoundPage />

  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>
}

export default App
