import { useState, type FormEvent } from 'react'
import { AuthLayout, Field } from '@/pages/AuthLayout'
import { useAuth } from '@/lib/auth/AuthContext'
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
    <AuthLayout
      alternate={
        <>
          Remembered it? <a href="/login">Log in</a>
        </>
      }
    >
      <div className="wk-auth-card">
        <div>
          <h1>Reset your password</h1>
          <p>Enter the email on your account and we&apos;ll get you a reset link.</p>
        </div>

        {submitted ? (
          <>
            <div className="wk-success">If an account exists for that email, a reset link is on its way. It works once, for one hour.</div>
            <DevInbox email={email.trim().toLowerCase()} subjectMatches={/Reset your Reclaim password/} />
          </>
        ) : (
          <form className="wk-auth-form" onSubmit={handleSubmit} noValidate>
            <Field id="forgot-email" label="Email" error={error ?? undefined}>
              <input
                id="forgot-email"
                className="wk-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'forgot-email-error' : undefined}
              />
            </Field>

            <button className="wk-btn" data-variant="primary" data-size="lg" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="wk-auth-foot">
          <a href="/login">Back to log in</a>
        </p>
      </div>
    </AuthLayout>
  )
}
