import { useState, type FormEvent } from 'react'
import { AuthLayout } from '@/pages/AuthLayout'
import { useAuth } from '@/lib/auth/AuthContext'

export function SignupPage() {
  const { signUp, continueAsGuest } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await signUp({ name, email, password, confirmPassword })
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
        <h1>Create your account</h1>
        <p className="auth-card-subtitle">Save every audit and pick up where you left off.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <div className="auth-field">
            <label htmlFor="signup-name">Name</label>
            <input
              id="signup-name"
              className="auth-input"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
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
            <label htmlFor="signup-confirm">Confirm password</label>
            <input
              id="signup-confirm"
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
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <button className="auth-guest-button" type="button" onClick={handleGuest}>
          Continue as guest
        </button>

        <p className="auth-footer-note">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </AuthLayout>
  )
}
