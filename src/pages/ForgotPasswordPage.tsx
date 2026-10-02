import { useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { AuthSplit, SplitField } from '@/pages/AuthSplit'
import { DevInbox } from '@/pages/DevInbox'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setSubmitting(true)
    await requestPasswordReset(email.trim())
    setSubmitting(false)
    setSubmitted(true)
  }

  return (
    <AuthSplit
      title={['Reset', 'password']}
      titleSize="long"
      lede="Enter the email on your account and we'll get you a reset link."
      alternate={
        <>
          Remembered it? <a href="/login">Log in</a>
        </>
      }
    >
      {submitted ? (
        <>
          <div className="rc-note" role="status">
            If an account exists for that email, a reset link is on its way. It works once, for one hour.
          </div>
          <DevInbox email={email.trim().toLowerCase()} subjectMatches={/Reset your Reclaim password/} />
        </>
      ) : (
        <form className="rc-login-form" onSubmit={handleSubmit} noValidate>
          <SplitField id="forgot-email" label="Email" error={error ?? undefined}>
            <input
              id="forgot-email"
              className="rc-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'forgot-email-error' : undefined}
            />
          </SplitField>

          <button className="rc-btn" data-theme="green" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <a className="rc-btn" data-theme="dark" href="/login">
        Back to log in
      </a>
    </AuthSplit>
  )
}
