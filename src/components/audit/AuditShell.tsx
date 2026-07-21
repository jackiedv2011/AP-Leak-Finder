import type { ReactNode } from 'react'
import { ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import './audit-shell.css'

interface AuditShellProps {
  children: ReactNode
  /** Minimal chrome (identity only) during the analysis sequence. */
  variant?: 'full' | 'minimal'
  topBarRight?: ReactNode
  homeHref?: string
}

export function AuditShell({ children, variant = 'full', topBarRight, homeHref = '/' }: AuditShellProps) {
  return (
    <div className="reclaim-audit">
      <a className="audit-skip-link" href="#audit-main">
        Skip to main content
      </a>
      <header className="audit-topbar">
        <a className="audit-brand" href={homeHref} aria-label="Reclaim home">
          <ReclaimMark size={26} interactive />
          <ReclaimWordmark interactive />
        </a>
        {variant === 'full' && topBarRight && <div className="audit-topbar-right">{topBarRight}</div>}
      </header>
      <main className="audit-main" id="audit-main">
        {children}
      </main>
    </div>
  )
}
