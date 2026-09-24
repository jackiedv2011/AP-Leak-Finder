import { AlertCircle, ArrowRight, Moon, Sun, Upload } from 'lucide-react'
import { Mark } from '../WorkspaceShell'
import { usePreferences } from '../preferences'
import { resolveTheme } from '../theme'
import '../workspace.css'
import '../reclaim.css'

interface LaunchProps {
  onRunSample: () => void
  onUseOwn: () => void
  /** Set while the checks are running, so the same screen reports progress. */
  running?: boolean
  note?: string
}

const STEPS: Array<{ title: string; detail: string }> = [
  { title: 'Upload', detail: 'A CSV export of payments from your accounting system.' },
  { title: 'Review findings', detail: 'Each one shows the records and evidence behind it.' },
  { title: 'Recover', detail: "Confirm what's real and track the money back." },
]

/**
 * The first screen for a workspace with no audit in it yet. It is drawn as the
 * dashboard's own first page (reclaim.css, "launch" section): the same canvas,
 * top bar, cards and buttons, so starting an audit never feels like a detour.
 */
export function Launch({ onRunSample, onUseOwn, running = false, note }: LaunchProps) {
  const { theme, setTheme } = usePreferences()
  const resolvedTheme = resolveTheme(theme)

  return (
    <div className="wk wk-launch" data-running={running || undefined}>
      <header className="wk-launch-top">
        <a href="/" className="wk-brandrow wk-launch-brand">
          <Mark />
          <b>Reclaim</b>
        </a>
        <button
          type="button"
          className="wk-icon-btn"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </header>

      <main className="wk-launch-main">
        <div className="wk-launch-card">
          <header className="wk-launch-head">
            <span className="wk-chip" data-tone="accent">Start your first audit</span>
            <h1>Upload a payment ledger. Reclaim finds the money that should still be yours.</h1>
            <p>
              Seven checks run against your payment records for duplicate payments, overpayments, unused credits and other
              clear mistakes. Every finding opens to the exact rows behind it, and nothing is sent to a vendor unless you send it.
            </p>
          </header>

          <ol className="wk-launch-steps" aria-label="How an audit works">
            {STEPS.map((step, index) => (
              <li key={step.title} data-first={index === 0 || undefined}>
                <span className="wk-label">Step {index + 1}</span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </li>
            ))}
          </ol>

          <div className="wk-launch-actions">
            <button type="button" className="wk-btn" data-variant="primary" data-size="lg" onClick={onUseOwn} disabled={running}>
              <Upload aria-hidden="true" />
              Upload a ledger
            </button>
            <button type="button" className="wk-btn" data-variant="outline" data-size="lg" onClick={onRunSample} disabled={running}>
              Run the sample
              <ArrowRight aria-hidden="true" />
            </button>
          </div>

          {/* Always in the tree, so screen readers hear the change when it starts. */}
          <div className="wk-launch-status" role="status" aria-live="polite">
            {running ? (
              <>
                <span className="wk-launch-spinner" aria-hidden="true" />
                <span className="wk-launch-status-copy">
                  <strong>Reading the ledger…</strong>
                  <small>Running the checks against every payment record.</small>
                </span>
                <i className="wk-launch-progress" aria-hidden="true" />
              </>
            ) : null}
          </div>

          {note ? (
            <div className="wk-callout" data-tone="danger" role="alert">
              <AlertCircle aria-hidden="true" />
              <p>{note}</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
