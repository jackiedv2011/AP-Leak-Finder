import { useState, type FormEvent } from 'react'
import { AuthLayout } from '@/pages/AuthLayout'
import { useAuth } from '@/lib/auth/AuthContext'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const { token } = requestPasswordReset(email)
    setSubmitted(true)
    setResetLink(token ? `/reset-password?token=${token}` : null)
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Reset your password</h1>
        <p className="auth-card-subtitle">Enter the email on your account and we&apos;ll get you a reset link.</p>

        {submitted ? (
          <>
            <p className="auth-success" style={{ marginTop: '1.5rem' }}>
              If an account exists for that email, a reset link has been created.
            </p>
            {resetLink ? (
              <div className="auth-token-box">
                This prototype has no email server, so here&apos;s the link directly:
                <br />
                <a href={resetLink}>{resetLink}</a>
              </div>
            ) : null}
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <button className="auth-submit" type="submit">Send reset link</button>
          </form>
        )}

        <p className="auth-footer-note">
          Remembered it? <a href="/login">Back to log in</a>
        </p>
      </div>
    </AuthLayout>
  )
}
