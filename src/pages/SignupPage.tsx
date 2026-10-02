import { useState, type FormEvent } from 'react'
import { nextAfterAuth } from '@/pages/authRedirect'
import { useAuth } from '@/lib/auth/AuthContext'
import { validateSignUp } from '@/lib/auth/localAuthService'
import { AuthSplit, leavePage, SplitField } from '@/pages/AuthSplit'
import { DevInbox } from '@/pages/DevInbox'
import { GoogleButton } from '@/pages/GoogleButton'

export function SignupPage() {
  const { signUp, providers } = useAuth()
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
    leavePage(nextAfterAuth())
  }

  if (pendingEmail) {
    return (
      <AuthSplit
        title={['Check', 'your email']}
        titleSize="long"
        lede={
          <>
            We sent a confirmation link to <b className="rc-strong">{pendingEmail}</b>. Open it to finish creating your account. If that address
            already had an account, we&apos;ve emailed it a reminder instead.
          </>
        }
        alternate={
          <>
            Already confirmed? <a href="/login">Log in</a>
          </>
        }
      >
        <DevInbox email={pendingEmail} subjectMatches={/Confirm your email|already have/} />
        <a className="rc-btn" data-theme="dark" href="/signup">
          Wrong address? Start again
        </a>
      </AuthSplit>
    )
  }

  const invalid = (name: string) => (fieldErrors[name] ? 'true' : undefined)
  const describedBy = (id: string, name: string) => (fieldErrors[name] ? `${id}-error` : undefined)

  return (
    <AuthSplit
      title={['Sign up']}
      lede="Create your account. Keep every audit behind a log-in and pick up where you left off."
      alternate={
        <>
          Already have an account? <a href="/login">Log in</a>
        </>
      }
    >
      <form className="rc-login-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="rc-alert" role="alert">
            <p>{formError}</p>
          </div>
        ) : null}

        <div className="rc-pair">
          <SplitField id="signup-first" label="First name" error={fieldErrors.firstName}>
            <input
              id="signup-first"
              className="rc-input"
              type="text"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-invalid={invalid('firstName')}
              aria-describedby={describedBy('signup-first', 'firstName')}
            />
          </SplitField>
          <SplitField id="signup-last" label="Last name" error={fieldErrors.lastName}>
            <input
              id="signup-last"
              className="rc-input"
              type="text"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              aria-invalid={invalid('lastName')}
              aria-describedby={describedBy('signup-last', 'lastName')}
            />
          </SplitField>
        </div>

        <div className="rc-pair">
          <SplitField id="signup-email" label="Work email" error={fieldErrors.email}>
            <input
              id="signup-email"
              className="rc-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              aria-invalid={invalid('email')}
              aria-describedby={describedBy('signup-email', 'email')}
            />
          </SplitField>
          <SplitField id="signup-company" label="Company name" error={fieldErrors.company}>
            <input
              id="signup-company"
              className="rc-input"
              type="text"
              autoComplete="organization"
              required
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              aria-invalid={invalid('company')}
              aria-describedby={describedBy('signup-company', 'company')}
            />
          </SplitField>
        </div>

        <div className="rc-pair">
          <SplitField id="signup-password" label="Password" error={fieldErrors.password} hint="At least 8 characters.">
            <input
              id="signup-password"
              className="rc-input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={invalid('password')}
              aria-describedby={fieldErrors.password ? 'signup-password-error' : 'signup-password-hint'}
            />
          </SplitField>
          <SplitField id="signup-confirm" label="Confirm password" error={fieldErrors.confirmPassword}>
            <input
              id="signup-confirm"
              className="rc-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={invalid('confirmPassword')}
              aria-describedby={describedBy('signup-confirm', 'confirmPassword')}
            />
          </SplitField>
        </div>

        <div className="rc-field">
          <label className="rc-check">
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
            <span className="rc-field-error" id="signup-terms-error" role="alert">
              {fieldErrors.acceptedTerms}
            </span>
          ) : null}
        </div>

        <button className="rc-btn" data-theme="green" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      {providers?.google ? <div className="rc-divider">or</div> : null}
      <GoogleButton label="Continue with Google" />
    </AuthSplit>
  )
}
