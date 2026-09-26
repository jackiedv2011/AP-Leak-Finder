import { useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { AuthSplit, SplitField } from '@/pages/AuthSplit'

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
      <AuthSplit title={['Invalid', 'reset link']} titleSize="long" lede="This link is missing its token. Request a new one.">
        <a className="rc-btn" data-theme="green" href="/forgot-password">
          Request a new reset link
        </a>
      </AuthSplit>
    )
  }

  if (done) {
    return (
      <AuthSplit title={['Password', 'updated']} titleSize="long" lede="You're logged in with your new password.">
        <a className="rc-btn" data-theme="green" href="/audit">
          Go to your dashboard
        </a>
      </AuthSplit>
    )
  }

  return (
    <AuthSplit title={['New', 'password']} titleSize="long" lede="Choose a new password. Make it at least 8 characters.">
      <form className="rc-login-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="rc-alert" role="alert">
            <p>{formError}</p>
            <p>
              <a className="rc-link" href="/forgot-password">
                Request a new reset link
              </a>
            </p>
          </div>
        ) : null}

        <SplitField id="reset-password" label="New password" error={fieldErrors.password}>
          <input
            id="reset-password"
            className="rc-input"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? 'true' : undefined}
            aria-describedby={fieldErrors.password ? 'reset-password-error' : undefined}
          />
        </SplitField>

        <SplitField id="reset-confirm" label="Confirm new password" error={fieldErrors.confirmPassword}>
          <input
            id="reset-confirm"
            className="rc-input"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
            aria-describedby={fieldErrors.confirmPassword ? 'reset-confirm-error' : undefined}
          />
        </SplitField>

        <button className="rc-btn" data-theme="green" type="submit" disabled={submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthSplit>
  )
}
