import { lazy, Suspense } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { termsAcceptanceDue } from '@/legal/terms'

const TermsUpdateDialog = lazy(() => import('@/legal/TermsUpdateDialog').then((module) => ({ default: module.TermsUpdateDialog })))

/** Pages someone must be able to read before agreeing to them. */
const READABLE_WITHOUT_ACCEPTING = ['/terms', '/privacy']

/**
 * When the Terms or Privacy Policy change (TERMS_VERSION is bumped), anyone
 * signed in on an older acceptance is asked to accept the new version before
 * carrying on, as both documents promise.
 */
export function TermsUpdateGate() {
  const { user } = useAuth()
  const path = window.location.pathname.replace(/\/+$/, '')
  if (!termsAcceptanceDue(user) || READABLE_WITHOUT_ACCEPTING.includes(path)) return null
  return (
    <Suspense fallback={null}>
      <TermsUpdateDialog />
    </Suspense>
  )
}
