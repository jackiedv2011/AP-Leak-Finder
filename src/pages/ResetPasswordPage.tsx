import { useState, type FormEvent } from 'react'
import { AuthLayout } from '@/pages/AuthLayout'
import { useAuth } from '@/lib/auth/AuthContext'

export function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const token = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')[0]
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const result = await resetPassword(token, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setDone(true)
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <h1>Invalid reset link</h1>
          <p className="auth-card-subtitle">This link is missing its token. Request a new one.</p>
          <p className="auth-footer-note"><a href="/forgot-password">Request a new reset link</a></p>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <h1>Password updated</h1>
          <p className="auth-success" style={{ marginTop: '1.25rem' }}>You&apos;re logged in with your new password.</p>
          <a className="auth-submit" style={{ marginTop: '1.5rem', display: 'grid', placeItems: 'center', textDecoration: 'none' }} href="/audit">
            Go to your audit
          </a>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Choose a new password</h1>
        <p className="auth-card-subtitle">Make it at least 8 characters.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <div className="auth-field">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="reset-confirm">Confirm new password</label>
            <input
              id="reset-confirm"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
            />
          </div>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
