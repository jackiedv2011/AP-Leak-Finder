import { ArrowRight, Upload } from 'lucide-react'
import '../workspace.css'

interface LaunchProps {
  onRunSample: () => void
  onUseOwn: () => void
  /** Set while the checks are running, so the same screen reports progress. */
  running?: boolean
  note?: string
}

/**
 * The first screen after the marketing site's CTA. It has to read as the same
 * product the visitor just left, so it reuses the site's own black hero
 * treatment and one of its rendered 3D loops rather than introducing a
 * separate app aesthetic.
 */
export function Launch({ onRunSample, onUseOwn, running = false, note }: LaunchProps) {
  return (
    <div className="wk wk-launch">
      <div className="wk-launch-media" aria-hidden="true">
        <video src="/media/find.webm" autoPlay loop muted playsInline preload="auto" />
      </div>

      <div className="wk-launch-copy">
        <span className="wk-label">Sample ledger · 80 payments</span>
        <h1 className="wk-display" style={{ fontSize: 58, marginTop: 14 }}>
          See what the
          <br />
          checks find.
        </h1>
        <p style={{ marginTop: 18, maxWidth: 440, color: 'var(--text-dim)', fontSize: 15 }}>
          Seven checks run against eighty real payment records from twelve vendors. Nothing is uploaded, nothing
          leaves this browser, and every result opens to the rows behind it.
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <button type="button" className="wk-btn" data-variant="primary" onClick={onRunSample} disabled={running}>
            {running ? 'Reading the ledger…' : 'Run the sample'}
            {running ? null : <ArrowRight aria-hidden="true" />}
          </button>
          <button type="button" className="wk-btn" data-variant="outline" onClick={onUseOwn} disabled={running}>
            <Upload aria-hidden="true" />
            Use your own file
          </button>
        </div>

        {note ? (
          <p className="wk-label" style={{ marginTop: 20, color: 'var(--warn)' }}>
            {note}
          </p>
        ) : null}
      </div>
    </div>
  )
}
