import { useState, type FormEvent } from 'react'
import { AuthLayout, Field } from '@/pages/AuthLayout'
import { nextAfterAuth } from '@/pages/authRedirect'
import { useAuth } from '@/lib/auth/AuthContext'
import { validateSignUp } from '@/lib/auth/localAuthService'
import { DevInbox } from '@/pages/DevInbox'
import { GoogleButton } from '@/pages/GoogleButton'

export function SignupPage() {
  const { signUp } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [company, setCompany] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)

  const input = { firstName, lastName, email, password, confirmPassword, company, acceptedTerms }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const errors = validateSignUp(input)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    const result = await signUp(input)
    setSubmitting(false)
    if (!result.ok) {
      setFieldErrors(result.fields ?? {})
      setFormError(result.fields ? null : result.message)
      return
    }
    if (result.requiresVerification) {
      setPendingEmail(result.email)
      return
    }
    window.location.href = nextAfterAuth()
  }

  if (pendingEmail) {
    return (
      <AuthLayout>
        <div className="wk-auth-card">
          <div>
            <h1>Check your email</h1>
            <p>
              We sent a confirmation link to <b>{pendingEmail}</b>. Open it to finish creating your account. If that address already had an
              account, we&apos;ve emailed it a reminder instead.
            </p>
          </div>
          <DevInbox email={pendingEmail} subjectMatches={/Confirm your email|already have/} />
          <p className="wk-auth-foot">
            Wrong address? <a href="/signup">Start again</a> · Already confirmed? <a href="/login">Log in</a>
          </p>
        </div>
      </AuthLayout>
    )
  }

  const invalid = (name: string) => (fieldErrors[name] ? 'true' : undefined)
  const describedBy = (id: string, name: string) => (fieldErrors[name] ? `${id}-error` : undefined)

  return (
    <AuthLayout
      alternate={
        <>
          Already have an account? <a href="/login">Log in</a>
        </>
      }
    >
      <div className="wk-auth-card" data-wide="true">
        <div>
          <h1>Create your account</h1>
          <p>Keep every audit behind a log-in and pick up where you left off.</p>
        </div>

        <GoogleButton label="Continue with Google" />

        <form className="wk-auth-form" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <div className="wk-alert" role="alert">
              <p>{formError}</p>
            </div>
          ) : null}

          <div className="wk-form-grid">
            <Field id="signup-first" label="First name" error={fieldErrors.firstName}>
              <input
                id="signup-first"
                className="wk-input"
                type="text"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                aria-invalid={invalid('firstName')}
                aria-describedby={describedBy('signup-first', 'firstName')}
              />
            </Field>
            <Field id="signup-last" label="Last name" error={fieldErrors.lastName}>
              <input
                id="signup-last"
                className="wk-input"
                type="text"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                aria-invalid={invalid('lastName')}
                aria-describedby={describedBy('signup-last', 'lastName')}
              />
            </Field>
          </div>

          <Field id="signup-email" label="Work email" error={fieldErrors.email}>
            <input
              id="signup-email"
              className="wk-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              aria-invalid={invalid('email')}
              aria-describedby={describedBy('signup-email', 'email')}
            />
          </Field>

          <Field id="signup-company" label="Company name" error={fieldErrors.company}>
            <input
              id="signup-company"
              className="wk-input"
              type="text"
              autoComplete="organization"
              required
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              aria-invalid={invalid('company')}
              aria-describedby={describedBy('signup-company', 'company')}
            />
          </Field>

          <div className="wk-form-grid">
            <Field id="signup-password" label="Password" error={fieldErrors.password} hint="At least 8 characters.">
              <input
                id="signup-password"
                className="wk-input"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={invalid('password')}
                aria-describedby={fieldErrors.password ? 'signup-password-error' : 'signup-password-hint'}
              />
            </Field>
            <Field id="signup-confirm" label="Confirm password" error={fieldErrors.confirmPassword}>
              <input
                id="signup-confirm"
                className="wk-input"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={invalid('confirmPassword')}
                aria-describedby={describedBy('signup-confirm', 'confirmPassword')}
              />
            </Field>
          </div>

          <div className="wk-field">
            <label className="wk-check">
              <input
                type="checkbox"
                name="acceptedTerms"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                aria-invalid={invalid('acceptedTerms')}
                aria-describedby={describedBy('signup-terms', 'acceptedTerms')}
                required
              />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            {fieldErrors.acceptedTerms ? (
              <span className="wk-field-error" id="signup-terms-error" role="alert">
                {fieldErrors.acceptedTerms}
              </span>
            ) : null}
          </div>

          <button className="wk-btn" data-variant="primary" data-size="lg" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="wk-auth-foot">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </AuthLayout>
  )
}
