import { ArrowRight, Database, Sparkles, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AuditLaunchProps {
  onRunSample: () => void
  onUseLedger: () => void
}

/**
 * The moment between the marketing promise and the workspace. It gives the
 * sample audit a purposeful start instead of teleporting directly to results.
 */
export function AuditLaunch({ onRunSample, onUseLedger }: AuditLaunchProps) {
  const [replayKey, setReplayKey] = useState(0)

  // A browser may restore this route from its back/forward cache. Remounting
  // the launch surface on pageshow guarantees the entrance is never "spent".
  useEffect(() => {
    const replay = () => setReplayKey((value) => value + 1)
    window.addEventListener('pageshow', replay)
    return () => window.removeEventListener('pageshow', replay)
  }, [])

  return (
    <section key={replayKey} className="audit-launch" aria-labelledby="audit-launch-title">
      <div className="audit-launch-shell" data-motion-state="confirmed">
        <div className="audit-launch-glass" aria-hidden="true" />
        <header className="audit-launch-heading">
          <span className="audit-launch-eyebrow"><Sparkles aria-hidden="true" /> Included sample ledger</span>
          <h1 id="audit-launch-title">See the evidence connect before you enter the workspace.</h1>
          <p>Reclaim will read 80 payment records, identify the relationships worth checking, and keep every decision with you.</p>
        </header>

        <div className="audit-launch-preview" aria-label="Sample audit preview">
          <div className="audit-launch-preview-top">
            <span><i aria-hidden="true" /> Ready to read</span>
            <small>Local sample</small>
          </div>
          <div className="audit-launch-preview-body">
            <div><Database aria-hidden="true" /><strong>80</strong><span>payment records</span></div>
            <div><strong>12</strong><span>vendors connected</span></div>
            <div><strong>3</strong><span>matching fields per lead</span></div>
          </div>
          <div className="audit-launch-preview-line" aria-hidden="true"><i /><span /></div>
        </div>

        <div className="audit-launch-actions">
          <button type="button" className="audit-btn" data-motion="pressable" data-variant="primary" onClick={onRunSample}>
            Run the sample audit <ArrowRight aria-hidden="true" />
          </button>
          <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" onClick={onUseLedger}>
            <Upload aria-hidden="true" /> Use your own ledger
          </button>
        </div>
      </div>
    </section>
  )
}
