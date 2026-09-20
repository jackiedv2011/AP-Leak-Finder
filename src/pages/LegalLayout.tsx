import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Mark } from '@/workspace/WorkspaceShell'
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/legal/terms'
import '@/workspace/workspace.css'

interface LegalLayoutProps {
  title: string
  summary: string
  children: ReactNode
}

export function LegalLayout({ title, summary, children }: LegalLayoutProps) {
  return (
    <div className="wk wk-doc-page">
      <header className="wk-auth-header">
        <a href="/" aria-label="Reclaim home">
          <Mark />
          Reclaim
        </a>
        <span className="wk-auth-alt">
          <a href="/login">Log in</a>
        </span>
      </header>

      <article className="wk-doc">
        <div className="wk-banner" role="note">
          <AlertTriangle aria-hidden="true" />
          <span>
            <b>Draft for internal review.</b> This document has not been reviewed by a lawyer and is not yet the final
            version. Highlighted items are placeholders to confirm before publication.
          </span>
        </div>

        <div>
          <span className="wk-label">Reclaim</span>
          <h1 style={{ marginTop: 8 }}>{title}</h1>
          <p style={{ marginTop: 12 }}>{summary}</p>
          <div className="wk-doc-meta" style={{ marginTop: 14 }}>
            <span>Version {TERMS_VERSION}</span>
            <span>Effective {TERMS_EFFECTIVE_DATE}</span>
          </div>
        </div>

        {children}
      </article>

      <footer className="wk-auth-legal">
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <span>Reclaim © 2026</span>
      </footer>
    </div>
  )
}

/** A value that still needs confirming before the document is final. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="wk-placeholder">{children}</mark>
}
