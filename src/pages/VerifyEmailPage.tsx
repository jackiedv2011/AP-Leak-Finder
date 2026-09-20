import { useEffect, useState } from 'react'
import { AuthLayout } from '@/pages/AuthLayout'
import { nextAfterAuth } from '@/pages/authRedirect'
import { useAuth } from '@/lib/auth/AuthContext'
import type { AuthOutcome } from '@/lib/auth/types'

/**
 * One request per token, shared across effect runs. React runs effects twice
 * in development (StrictMode), and a verification token is single-use — the
 * second run must reuse the first request rather than burn the token.
 */
const inflight = new Map<string, Promise<AuthOutcome>>()

/** `/verify-email?token=…` — the link from the confirmation email. */
export function VerifyEmailPage() {
  const { verifyEmail, resendVerification } = useAuth()
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [state, setState] = useState<{ kind: 'working' } | { kind: 'done' } | { kind: 'failed'; message: string }>({ kind: 'working' })
  const [email, setEmail] = useState('')
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (!token) {
      setState({ kind: 'failed', message: 'This link is missing its token.' })
      return
    }
    let cancelled = false
    let request = inflight.get(token)
    if (!request) {
      request = verifyEmail(token)
      inflight.set(token, request)
    }
    void request.then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState({ kind: 'done' })
        window.location.replace(nextAfterAuth())
      } else {
        setState({ kind: 'failed', message: result.message })
      }
    })
    return () => {
      cancelled = true
    }
  }, [token, verifyEmail])

  return (
    <AuthLayout>
      <div className="wk-auth-card">
        {state.kind === 'working' ? (
          <div>
            <h1>Confirming your email…</h1>
            <p>One moment.</p>
          </div>
        ) : state.kind === 'done' ? (
          <div>
            <h1>Email confirmed</h1>
            <p>Taking you to your dashboard.</p>
          </div>
        ) : (
          <>
            <div>
              <h1>That link didn&apos;t work</h1>
              <p>{state.message}</p>
            </div>
            {resent ? (
              <div className="wk-success">If that address has an unconfirmed account, a new link is on its way.</div>
            ) : (
              <form
                className="wk-auth-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  await resendVerification(email)
                  setResent(true)
                }}
                noValidate
              >
                <div className="wk-field">
                  <label htmlFor="verify-email">Email</label>
                  <input id="verify-email" className="wk-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button className="wk-btn" data-variant="primary" type="submit">
                  Send a new link
                </button>
              </form>
            )}
            <p className="wk-auth-foot">
              <a href="/login">Back to log in</a>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
