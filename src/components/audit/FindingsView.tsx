import type { FindingsQueueGroup } from '@/ledger/views'
import { formatCurrency } from '@/lib/format'
import { motion, useReducedMotion } from 'motion/react'
import { MOTION_SPRING } from '@/motion/system'

interface FindingsViewProps {
  queue: FindingsQueueGroup[]
  onOpenCase: (findingId: string) => void
}

const GROUP_SUBTEXT: Record<FindingsQueueGroup['group'], string> = {
  ready_to_verify: 'Strong evidence · one decision could move this forward',
  needs_context: 'A pattern exists, but evidence or a decision is still missing',
  worth_noting: 'Prevention, not a past loss',
}

/** Findings lens — every case still awaiting a decision, grouped by readiness. */
export function FindingsView({ queue, onOpenCase }: FindingsViewProps) {
  const totalCases = queue.reduce((sum, group) => sum + group.cases.length, 0)
  const reduceMotion = useReducedMotion()

  if (totalCases === 0) {
    return (
      <div className="audit-queue-workspace">
        <header className="audit-queue-header">
          <span>Work queue</span>
          <h1>Findings</h1>
          <p>Every open case, ordered by the decision it needs next.</p>
        </header>
        <div className="audit-empty-state">
          <h2>Nothing waiting on a decision</h2>
          <p>Every case in this ledger has already been decided, or none have been found yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="audit-queue-workspace">
      <header className="audit-queue-header">
        <span>Work queue</span>
        <h1>Findings</h1>
        <p>{totalCases} open cases, grouped by what a person needs to decide next.</p>
      </header>
      <div className="audit-lanes">
        {queue.map((group) => (
          <section className="audit-lane" data-class={group.group} key={group.group} aria-labelledby={`lane-${group.group}`}>
            <div className="audit-lane-heading">
              <h2 id={`lane-${group.group}`}>{group.label}</h2>
              <span>{GROUP_SUBTEXT[group.group]}</span>
            </div>
            {group.cases.length === 0 ? (
              <p className="audit-lane-empty">No cases in "{group.label.toLowerCase()}" right now.</p>
            ) : (
              <div className="audit-lane-cards">
                {group.cases.map(({ finding, isNew }, caseIndex) => (
                  <motion.button
                    type="button"
                    className="audit-finding-card"
                    data-motion="pressable"
                    data-motion-ray="true"
                    layoutId={`finding-${finding.id}`}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 8px, 0)' }}
                    animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
                    transition={reduceMotion ? { duration: 0.12 } : { ...MOTION_SPRING.shared, delay: Math.min(caseIndex * 0.035, 0.14) }}
                    key={finding.id}
                    onClick={() => onOpenCase(finding.id)}
                  >
                    <div className="audit-finding-card-top">
                      <span>{finding.vendor}</span>
                      {isNew && <span className="audit-finding-card-status">New</span>}
                    </div>
                    <strong>{finding.title}</strong>
                    <span className="audit-finding-card-amount">{formatCurrency(finding.dollarImpact)}</span>
                  </motion.button>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
