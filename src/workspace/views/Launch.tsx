import { ArrowRight, Upload } from 'lucide-react'
import { Mark } from '../WorkspaceShell'
import '../workspace.css'
import '../vercel.css'

interface LaunchProps {
  onRunSample: () => void
  onUseOwn: () => void
  /** Set while the checks are running, so the same screen reports progress. */
  running?: boolean
  note?: string
}

/** The first screen for a workspace with no audit in it yet. */
export function Launch({ onRunSample, onUseOwn, running = false, note }: LaunchProps) {
  return (
    <div className="wk wk-vercel wk-launch">
      <div className="wk-launch-card">
        <a href="/" className="wk-brand" style={{ padding: 0 }}>
          <Mark />
          <b>Reclaim</b>
        </a>

        <div>
          <span className="wk-label">Start your first audit</span>
          <h1 className="wk-display" style={{ fontSize: 30, marginTop: 10, letterSpacing: '-0.03em' }}>
            Upload a payment ledger. Reclaim finds the money that should still be yours.
          </h1>
          <p className="wk-dim" style={{ marginTop: 12, maxWidth: 520, fontSize: 14.5 }}>
            Seven checks run against your payment records for duplicate payments, overpayments, unused credits and other
            clear mistakes. Every finding opens to the exact rows behind it, and nothing is sent to a vendor unless you send it.
          </p>
        </div>

        <div className="wk-launch-steps" aria-label="How an audit works">
          <div>
            <b>1. Upload</b>
            <span>A CSV export of payments from your accounting system.</span>
          </div>
          <div>
            <b>2. Review findings</b>
            <span>Each one shows the records and evidence behind it.</span>
          </div>
          <div>
            <b>3. Recover</b>
            <span>Confirm what's real and track the money back.</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="wk-btn" data-variant="primary" data-size="lg" onClick={onUseOwn} disabled={running}>
            <Upload aria-hidden="true" />
            Upload a ledger
          </button>
          <button type="button" className="wk-btn" data-variant="outline" data-size="lg" onClick={onRunSample} disabled={running}>
            {running ? 'Reading the ledger…' : 'Run the sample'}
            {running ? null : <ArrowRight aria-hidden="true" />}
          </button>
        </div>

        {note ? (
          <div className="wk-alert" role="alert">
            <p>{note}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
