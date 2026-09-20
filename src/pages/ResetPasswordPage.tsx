import { useState, type FormEvent } from 'react'
import { AuthLayout, Field } from '@/pages/AuthLayout'
import { useAuth } from '@/lib/auth/AuthContext'

export function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const token = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')[0]
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const errors: Record<string, string> = {}
    if (password.length < 8) errors.password = 'Use at least 8 characters.'
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    const result = await resetPassword(token, password, confirmPassword)
    setSubmitting(false)
    if (!result.ok) {
      setFieldErrors(result.fields ?? {})
      setFormError(result.fields ? null : result.message)
      return
    }
    setDone(true)
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className="wk-auth-card">
          <div>
            <h1>Invalid reset link</h1>
            <p>This link is missing its token. Request a new one.</p>
          </div>
          <a className="wk-btn" data-variant="primary" href="/forgot-password">
            Request a new reset link
          </a>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="wk-auth-card">
          <div>
            <h1>Password updated</h1>
            <p>You&apos;re logged in with your new password.</p>
          </div>
          <a className="wk-btn" data-variant="primary" data-size="lg" href="/audit">
            Go to your dashboard
          </a>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="wk-auth-card">
        <div>
          <h1>Choose a new password</h1>
          <p>Make it at least 8 characters.</p>
        </div>

        <form className="wk-auth-form" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <div className="wk-alert" role="alert">
              <p>{formError}</p>
              <ul className="wk-alert-actions">
                <li>
                  <a className="wk-link" href="/forgot-password">
                    Request a new reset link
                  </a>
                </li>
              </ul>
            </div>
          ) : null}

          <Field id="reset-password" label="New password" error={fieldErrors.password}>
            <input
              id="reset-password"
              className="wk-input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'reset-password-error' : undefined}
            />
          </Field>

          <Field id="reset-confirm" label="Confirm new password" error={fieldErrors.confirmPassword}>
            <input
              id="reset-confirm"
              className="wk-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
              aria-describedby={fieldErrors.confirmPassword ? 'reset-confirm-error' : undefined}
            />
          </Field>

          <button className="wk-btn" data-variant="primary" data-size="lg" type="submit" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
