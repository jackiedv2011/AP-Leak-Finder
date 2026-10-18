import type { ReactNode } from 'react'
import { BadgeDollarSign, LayoutDashboard, Rows3, Send, Settings, Sparkles } from 'lucide-react'
import { ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import type { Plan } from '@/billing/entitlement'
import { formatCurrency } from '@/lib/format'
import './audit-shell.css'
import './app-world.css'
import './workspace.css'

export type WorkspaceMode = 'overview' | 'findings' | 'recovery' | 'records' | 'settings'

interface NavItem {
  mode: WorkspaceMode
  label: string
  icon: typeof LayoutDashboard
}

/**
 * Named for what the business gets, not for what the system stores. "Findings"
 * and "Recovery" described Reclaim's internals; "Money found" and "Claims"
 * describe the reason someone opened the app.
 */
const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Your money',
    items: [
      { mode: 'overview', label: 'Dashboard', icon: LayoutDashboard },
      { mode: 'findings', label: 'Money found', icon: BadgeDollarSign },
      { mode: 'recovery', label: 'Claims', icon: Send },
    ],
  },
  {
    label: 'Your ledger',
    items: [
      { mode: 'records', label: 'Records', icon: Rows3 },
      { mode: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

interface AuditShellProps {
  children: ReactNode
  /** Minimal chrome (identity only) during entry and the analysis sequence. */
  variant?: 'full' | 'minimal'
  homeHref?: string
  mode?: WorkspaceMode
  onModeChange?: (mode: WorkspaceMode) => void
  findingsCount?: number
  recoveryCount?: number
  recordCount?: number
  topBar?: ReactNode
  topBarRight?: ReactNode
  plan?: Plan
  lockedCount?: number
  lockedValue?: number
  onUpgrade?: () => void
}

export function AuditShell({
  children,
  variant = 'full',
  homeHref = '/',
  mode,
  onModeChange,
  findingsCount = 0,
  recoveryCount = 0,
  recordCount = 0,
  topBar,
  topBarRight,
  plan = 'free',
  lockedCount = 0,
  lockedValue = 0,
  onUpgrade,
}: AuditShellProps) {
  const counts: Partial<Record<WorkspaceMode, number>> = {
    findings: findingsCount,
    recovery: recoveryCount,
    records: recordCount,
  }

  return (
    <div className="reclaim-audit" data-shell={variant}>
      <a className="rc-skip" href="#audit-main">
        Skip to main content
      </a>

      <div className="rc-shell" data-variant={variant}>
        {variant === 'full' && (
          <nav className="rc-rail" aria-label="Workspace">
            <a className="rc-rail-brand" href={homeHref} aria-label="Reclaim home">
              <ReclaimMark size={24} interactive />
              <ReclaimWordmark interactive />
            </a>

            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <span className="rc-rail-label">{section.label}</span>
                <div className="rc-rail-group">
                  {section.items.map(({ mode: item, label, icon: Icon }) => (
                    <button
                      key={item}
                      type="button"
                      className="rc-rail-item"
                      aria-current={mode === item ? 'page' : undefined}
                      onClick={() => onModeChange?.(item)}
                    >
                      <Icon aria-hidden="true" />
                      {label}
                      {(counts[item] ?? 0) > 0 && <span className="rc-rail-count">{counts[item]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="rc-rail-spacer" />

            <div className="rc-rail-foot">
              <div className="rc-plan-card" data-plan={plan}>
                {plan === 'pro' ? (
                  <>
                    <div className="rc-plan-card-top">
                      <strong>Full access</strong>
                      <span className="rc-chip" data-tone="free">
                        Active
                      </span>
                    </div>
                    <p>Every finding in this ledger is unlocked.</p>
                  </>
                ) : (
                  <>
                    <div className="rc-plan-card-top">
                      <strong>Free preview</strong>
                      <span className="rc-chip" data-tone="locked">
                        {lockedCount} locked
                      </span>
                    </div>
                    <p>
                      {lockedValue > 0
                        ? `${formatCurrency(lockedValue)} of findings are still hidden.`
                        : 'Unlock every finding Reclaim surfaces.'}
                    </p>
                    <button type="button" className="rc-btn" data-variant="mint" data-size="sm" onClick={onUpgrade}>
                      <Sparkles aria-hidden="true" />
                      Unlock all
                    </button>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}

        <div className="rc-main">
          {variant === 'full' && (topBar || topBarRight) && (
            <header className="rc-topbar">
              {topBar}
              {topBarRight && <div className="rc-topbar-right">{topBarRight}</div>}
            </header>
          )}
          <main className="rc-content" id="audit-main">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
