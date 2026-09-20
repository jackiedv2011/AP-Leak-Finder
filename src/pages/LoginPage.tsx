import { useState, type FormEvent } from 'react'
import { AuthLayout, Field } from '@/pages/AuthLayout'
import { nextAfterAuth } from '@/pages/authRedirect'
import { useAuth } from '@/lib/auth/AuthContext'
import { validateLogIn } from '@/lib/auth/localAuthService'
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
    window.location.href = nextAfterAuth()
  }

  function handleGuest() {
    continueAsGuest()
    window.location.href = nextAfterAuth()
  }

  return (
    <AuthLayout
      alternate={
        <>
          New to Reclaim? <a href="/signup">Create an account</a>
        </>
      }
    >
      <div className="wk-auth-card">
        <div>
          <h1>Log in</h1>
          <p>Pick up your audits where you left off.</p>
        </div>

        <form className="wk-auth-form" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <div className="wk-alert" role="alert">
              <p>{formError}</p>
              {unverified && !resent ? (
                <button
                  type="button"
                  className="wk-btn"
                  data-variant="outline"
                  data-size="sm"
                  style={{ marginTop: 10 }}
                  onClick={async () => {
                    await resendVerification(unverified)
                    setResent(true)
                  }}
                >
                  Send the confirmation link again
                </button>
              ) : null}
              {resent ? <p style={{ marginTop: 8 }}>A new link is on its way.</p> : null}
            </div>
          ) : null}
          {unverified ? <DevInbox email={unverified} subjectMatches={/Confirm your email/} /> : null}

          <Field id="login-email" label="Email" error={fieldErrors.email}>
            <input
              id="login-email"
              className="wk-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            />
          </Field>

          <Field
            id="login-password"
            label="Password"
            error={fieldErrors.password}
            aside={<a href="/forgot-password">Forgot password?</a>}
          >
            <input
              id="login-password"
              className="wk-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            />
          </Field>

          <label className="wk-check">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span>Keep me logged in on this device</span>
          </label>

          <button className="wk-btn" data-variant="primary" data-size="lg" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <div className="wk-divider">or</div>

        <GoogleButton label="Continue with Google" />

        <button className="wk-btn" data-variant="outline" type="button" onClick={handleGuest}>
          Try the sample audit without an account
        </button>

        <p className="wk-auth-foot">
          Don&apos;t have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </AuthLayout>
  )
}
