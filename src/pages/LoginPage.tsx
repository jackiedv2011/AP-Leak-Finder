import { useState, type FormEvent } from 'react'
import { nextAfterAuth } from '@/pages/authRedirect'
import { useAuth } from '@/lib/auth/AuthContext'
import { validateLogIn } from '@/lib/auth/localAuthService'
import { AuthSplit, leavePage, SplitField } from '@/pages/AuthSplit'
import { DevInbox } from '@/pages/DevInbox'
import { GoogleButton } from '@/pages/GoogleButton'

/** What a Google round-trip that did not end in a session means to the person reading it. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled. You can try again or log in with your email.',
  google_failed: "Google sign-in didn't complete. Try again, or log in with your email.",
  google_state: 'That sign-in attempt expired. Start again.',
  google_email_unverified: "Google reports that email address as unverified, so we can't use it to sign you in.",
  google_unavailable: 'Google sign-in is not set up on this server.',
}

export function LoginPage() {
  const { logIn, continueAsGuest, resendVerification } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    return code ? GOOGLE_ERRORS[code] ?? null : null
  })
  const [submitting, setSubmitting] = useState(false)
  const [unverified, setUnverified] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const errors = validateLogIn({ email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    const result = await logIn({ email, password, rememberMe })
    setSubmitting(false)
    if (!result.ok) {
      setFieldErrors(result.fields ?? {})
      setFormError(result.fields ? null : result.message)
      setUnverified(result.code === 'email_unverified' ? email.trim().toLowerCase() : null)
      return
    }
    leavePage(nextAfterAuth())
  }

  function handleGuest() {
    continueAsGuest()
    leavePage(nextAfterAuth())
  }

  return (
    <AuthSplit
      title={['Log in']}
      lede="Pick up your audits where you left off."
      alternate={
        <>
          New to Reclaim?{' '}
          <a href="/signup">Create an account</a>
        </>
      }
    >
      <form className="rc-login-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="rc-alert" role="alert">
            <p>{formError}</p>
            {unverified && !resent ? (
              <button
                type="button"
                className="rc-btn"
                data-theme="dark"
                onClick={async () => {
                  await resendVerification(unverified)
                  setResent(true)
                }}
              >
                Send the confirmation link again
              </button>
            ) : null}
            {resent ? <p>A new link is on its way.</p> : null}
          </div>
        ) : null}
        {unverified ? <DevInbox email={unverified} subjectMatches={/Confirm your email/} /> : null}

        <SplitField id="login-email" label="Email" error={fieldErrors.email}>
          <input
            id="login-email"
            className="rc-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            aria-invalid={fieldErrors.email ? 'true' : undefined}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
          />
        </SplitField>

        <SplitField id="login-password" label="Password" error={fieldErrors.password}>
          <input
            id="login-password"
            className="rc-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            aria-invalid={fieldErrors.password ? 'true' : undefined}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
          />
        </SplitField>

        <div className="rc-login-row">
          <label className="rc-check">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span>Keep me logged in</span>
          </label>
          <a className="rc-link" href="/forgot-password">
            Forgot password?
          </a>
        </div>

        <button className="rc-btn" data-theme="green" type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <div className="rc-divider">or</div>

      <GoogleButton label="Continue with Google" />

      <button className="rc-btn" data-theme="dark" type="button" onClick={handleGuest}>
        Try the sample audit without an account
      </button>
    </AuthSplit>
  )
}
