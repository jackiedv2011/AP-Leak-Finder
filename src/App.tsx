import { lazy, Suspense, type ReactElement } from 'react'

const SiteLanding = lazy(() =>
  import('@/components/site/SiteLanding').then((module) => ({ default: module.SiteLanding }))
)

const AuditApp = lazy(() =>
  import('@/AuditApp').then((module) => ({ default: module.AuditApp }))
)
const NotFoundPage = lazy(() =>
  import('@/components/NotFoundPage').then((module) => ({ default: module.NotFoundPage }))
)

function RouteFallback({ light = false }: { light?: boolean }) {
  return (
    <main className={`grid min-h-[100dvh] place-items-center ${light ? 'bg-[#f2f0e9] text-[#171a17]' : 'bg-[#090b0c] text-[#eef1ec]'}`} aria-busy="true">
      <p className={`text-sm ${light ? 'text-[#657068]' : 'text-[#9ca59f]'}`}>Loading Reclaim…</p>
    </main>
  )
}

const ROUTES: Record<string, () => ReactElement> = {
  '/': () => <SiteLanding />,
  '/audit': () => <AuditApp />,
}

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const page = (ROUTES[pathname] ?? (() => <NotFoundPage />))()

  return <Suspense fallback={<RouteFallback light={pathname === '/'} />}>{page}</Suspense>
}

export default App
