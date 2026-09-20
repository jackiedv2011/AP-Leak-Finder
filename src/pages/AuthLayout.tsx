import type { ReactNode } from 'react'
import { Mark } from '@/workspace/WorkspaceShell'
import { ScreenshotDrift } from '@/components/art/ScreenshotDrift'
import '@/workspace/workspace.css'

interface AuthLayoutProps {
  children: ReactNode
  /** The alternative action shown top-right, e.g. "Already have an account? Log in". */
  alternate?: ReactNode
}

export function AuthLayout({ children, alternate }: AuthLayoutProps) {
  return (
    <div className="wk wk-auth">
      <ScreenshotDrift />
      <header className="wk-auth-header">
        <a href="/" aria-label="Reclaim home">
          <Mark />
          Reclaim
        </a>
        {alternate ? <span className="wk-auth-alt">{alternate}</span> : null}
      </header>
      <main className="wk-auth-main">{children}</main>
      <footer className="wk-auth-legal">
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <span>Reclaim © 2026</span>
      </footer>
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
  /** Rendered beside the label, e.g. a "Forgot password?" link. */
  aside?: ReactNode
}

export function Field({ id, label, error, hint, aside, children }: FieldProps) {
  return (
    <div className="wk-field">
      {aside ? (
        <div className="wk-field-row">
          <label htmlFor={id}>{label}</label>
          {aside}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {children}
      {error ? (
        <span className="wk-field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="wk-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
