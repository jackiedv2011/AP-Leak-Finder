import { Check, Database, Link2 } from 'lucide-react'

export type SampleAuditPhase = 'reading' | 'matching' | 'ready'

interface AuditProcessingProps {
  phase: SampleAuditPhase
}

const phases: Record<SampleAuditPhase, { eyebrow: string; title: string; detail: string; progress: number }> = {
  reading: {
    eyebrow: 'Preparing sample ledger',
    title: 'Reading 80 records across 12 vendors.',
    detail: 'Building a local evidence trail from the included payment ledger.',
    progress: 34,
  },
  matching: {
    eyebrow: 'Connecting the records',
    title: 'Looking for payments that belong together.',
    detail: 'Comparing vendor, invoice number, and amount across the ledger.',
    progress: 68,
  },
  ready: {
    eyebrow: 'Evidence connected',
    title: 'One recovery-ready finding is in view.',
    detail: 'Sierra Coffee Supply · INV-3305 · $6,800.00',
    progress: 100,
  },
}

/**
 * A brief, honest transition into the included sample. The content itself
 * becomes the Recommended Next object in Overview once the sample is ready.
 */
export function AuditProcessing({ phase }: AuditProcessingProps) {
  const copy = phases[phase]
  const matched = phase === 'ready'

  return (
    <section className="audit-processing" aria-labelledby="audit-processing-title" aria-live="polite">
      <div className="audit-processing-shell" data-phase={phase}>
        <header className="audit-processing-heading">
          <span className="audit-processing-eyebrow"><i aria-hidden="true" />{copy.eyebrow}</span>
          <h1 id="audit-processing-title">{copy.title}</h1>
          <p>{copy.detail}</p>
        </header>

        <div className="audit-processing-ledger" aria-label="Sample audit progress">
          <div className="audit-processing-ledger-top">
            <span><Database aria-hidden="true" /> Sample payment ledger</span>
            <small>80 records</small>
          </div>
          <div className="audit-processing-rows" aria-hidden="true">
            <div data-active={phase !== 'reading'}><span>Sierra Coffee Supply</span><span>INV-3305</span><strong>$6,800.00</strong></div>
            <div data-active={phase !== 'reading'}><span>Sierra Coffee Supply</span><span>INV-3305</span><strong>$6,800.00</strong></div>
            <div className="audit-processing-match" data-visible={matched}>
              <Link2 /><span>Vendor, invoice, and amount match</span><Check />
            </div>
          </div>
          <div className="audit-processing-progress" aria-hidden="true"><i style={{ width: `${copy.progress}%` }} /></div>
        </div>
      </div>
    </section>
  )
}
