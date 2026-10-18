import { useState, type FormEvent } from 'react'
import { AuthLayout } from '@/pages/AuthLayout'
import { useAuth } from '@/lib/auth/AuthContext'

export function LoginPage() {
  const { logIn, continueAsGuest } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await logIn({ email, password })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    window.location.href = '/audit'
  }

  function handleGuest() {
    continueAsGuest()
    window.location.href = '/audit'
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="auth-card-subtitle">Welcome back. Pick up your audit where you left off.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <div className="auth-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label htmlFor="login-password">Password</label>
              <a href="/forgot-password">Forgot password?</a>
            </div>
            <input
              id="login-password"
              className="auth-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <button className="auth-guest-button" type="button" onClick={handleGuest}>
          Continue as guest
        </button>

        <p className="auth-footer-note">
          Don&apos;t have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </AuthLayout>
  )
}
