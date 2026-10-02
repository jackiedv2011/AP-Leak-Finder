import { useEffect, useState } from 'react'
import { nextAfterAuth } from '@/pages/authRedirect'
import { useAuth } from '@/lib/auth/AuthContext'
import type { AuthOutcome } from '@/lib/auth/types'
import { AuthSplit, SplitField } from '@/pages/AuthSplit'

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

  if (state.kind === 'working') {
    return <AuthSplit title={['Confirming']} lede="Confirming your email. One moment." />
  }

  if (state.kind === 'done') {
    return <AuthSplit title={['Confirmed']} lede="Email confirmed. Taking you to your dashboard." />
  }

  return (
    <AuthSplit
      title={['Link', "didn't work"]}
      titleSize="long"
      lede={state.message}
      alternate={
        <>
          Already confirmed? <a href="/login">Log in</a>
        </>
      }
    >
      {resent ? (
        <div className="rc-note" role="status">
          If that address has an unconfirmed account, a new link is on its way.
        </div>
      ) : (
        <form
          className="rc-login-form"
          onSubmit={async (event) => {
            event.preventDefault()
            await resendVerification(email)
            setResent(true)
          }}
          noValidate
        >
          <SplitField id="verify-email" label="Email">
            <input
              id="verify-email"
              className="rc-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </SplitField>
          <button className="rc-btn" data-theme="green" type="submit">
            Send a new link
          </button>
        </form>
      )}
      <a className="rc-btn" data-theme="dark" href="/login">
        Back to log in
      </a>
    </AuthSplit>
  )
}
