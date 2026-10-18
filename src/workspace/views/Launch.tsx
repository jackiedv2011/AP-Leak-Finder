import { useMemo } from 'react'
import { AlertCircle, ArrowRight, Moon, Sun, Upload } from 'lucide-react'
import { getSampleLedger } from '@/data/sampleLedger'
import { Reel } from '@/onboarding/Reel'
import { Mark } from '../WorkspaceShell'
import { usePreferences } from '../preferences'
import { resolveTheme } from '../theme'
import '../workspace.css'
import '../reclaim.css'
import '@/onboarding/onboarding.css'

interface LaunchProps {
  onRunSample: () => void
  onUseOwn: () => void
  /** Set while the checks are running, so the same screen reports progress. */
  running?: boolean
  note?: string
}

const STEPS: Array<{ title: string; detail: string }> = [
  { title: 'Upload', detail: 'A CSV export of payments.' },
  { title: 'Review findings', detail: 'Each one shows the records behind it.' },
  { title: 'Recover', detail: 'Confirm what’s real, track the money back.' },
]

/**
 * The first screen for a workspace with no audit in it yet, and the screen
 * onboarding hands over to. It wears onboarding's frame (onboarding.css): the
 * same top bar, the condensed title and the 3D, so finishing setup and starting
 * an audit read as one walk. The choice itself is the picture: two cards, each
 * with its own loop, like the choices in onboarding.
 */
export function Launch({ onRunSample, onUseOwn, running = false, note }: LaunchProps) {
  const { theme, setTheme } = usePreferences()
  const resolved = resolveTheme(theme) === 'light' ? 'light' : 'dark'
  // Described from the file itself, so the card can't drift from what the sample holds.
  const sample = useMemo(() => {
    const { records } = getSampleLedger()
    return { payments: records.length, vendors: new Set(records.map((r) => r.vendor)).size }
  }, [])

  return (
    <div className="wk ob ob-launch" data-running={running || undefined}>
      <header className="ob-top">
        <a href="/" className="ob-brand">
          <Mark />
          <b>Reclaim</b>
        </a>
        <span />
        <div className="ob-top-actions">
          <button
            type="button"
            className="wk-icon-btn"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {resolved === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="ob-main">
        <section className="ob-step" aria-labelledby="launch-title">
          <header className="ob-head">
            <span className="ob-kicker">Start your first audit</span>
            <h1 id="launch-title" className="ob-title">
              Upload a payment ledger.
            </h1>
          </header>
          <p className="ob-lede">
            Reclaim finds the money that should still be yours. Seven checks look for duplicate payments, overpayments, missed discounts, changed bank
            details and other clear mistakes. Nothing is sent to a vendor unless you send it.
          </p>

          <div className="ob-paths">
            <button
              type="button"
              className="ob-path"
              onClick={onUseOwn}
              disabled={running}
              aria-labelledby="launch-own-go"
              aria-describedby="launch-own-body"
            >
              <span className="ob-path-art">
                <Reel name="card_upload" theme={resolved} className="ob-path-reel" />
              </span>
              <span className="ob-path-text">
                <strong>Your payments</strong>
                <small id="launch-own-body">A CSV export from your accounting system or a spreadsheet. It’s read and checked right here in your browser.</small>
              </span>
              <span id="launch-own-go" className="wk-btn ob-path-go" data-variant="primary" data-size="lg">
                <Upload aria-hidden="true" />
                Upload a ledger
              </span>
            </button>

            <button
              type="button"
              className="ob-path"
              onClick={onRunSample}
              disabled={running}
              aria-labelledby="launch-sample-go"
              aria-describedby="launch-sample-body"
            >
              <span className="ob-path-art">
                <Reel name="card_sample" theme={resolved} className="ob-path-reel" />
              </span>
              <span className="ob-path-text">
                <strong>Our sample</strong>
                <small id="launch-sample-body">
                  {sample.payments} payments to {sample.vendors} vendors from a made-up café, with mistakes planted in them. Nothing of yours needed.
                </small>
              </span>
              <span id="launch-sample-go" className="wk-btn ob-path-go" data-variant="outline" data-size="lg">
                Run the sample
                <ArrowRight aria-hidden="true" />
              </span>
            </button>
          </div>

          {/* Always in the tree, so screen readers hear the change when it starts. */}
          <div className="wk-launch-status ob-launch-status" role="status" aria-live="polite">
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
            <div className="wk-callout ob-launch-note" data-tone="danger" role="alert">
              <AlertCircle aria-hidden="true" />
              <p>{note}</p>
            </div>
          ) : null}

          <ol className="ob-sequence" aria-label="How an audit works">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="ob-third-n">0{index + 1}</span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}
