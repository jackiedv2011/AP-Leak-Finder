import type { RecoveryQueueGroup } from '@/ledger/views'
import { formatCurrency } from '@/lib/format'
import { motion, useReducedMotion } from 'motion/react'
import { MOTION_SPRING } from '@/motion/system'

interface RecoveryViewProps {
  queue: RecoveryQueueGroup[]
  onOpenCase: (findingId: string) => void
}

const STAGE_SUBTEXT: Record<RecoveryQueueGroup['stage'], string> = {
  confirmed: 'Evidence confirmed and ready for a recovery request',
  requested: 'Request recorded and awaiting a money outcome',
  recovered: 'Refund, credit, or offset verified',
  not_recovered: 'Closed without money returned',
}

/** Recovery lens: every confirmed case grouped by its explicit money outcome. */
export function RecoveryView({ queue, onOpenCase }: RecoveryViewProps) {
  const totalCases = queue.reduce((sum, group) => sum + group.cases.length, 0)
  const reduceMotion = useReducedMotion()

  if (totalCases === 0) {
    return (
      <div className="audit-queue-workspace">
        <header className="audit-queue-header">
          <span>Recovery pipeline</span>
          <h1>Recovery</h1>
          <p>Confirmed cases stay attached to their evidence until money is recovered or the case is closed.</p>
        </header>
        <div className="audit-empty-state">
          <h2>No cases in recovery yet</h2>
          <p>Confirming a finding in Findings moves it here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="audit-queue-workspace">
      <header className="audit-queue-header">
        <span>Recovery pipeline</span>
        <h1>Recovery</h1>
        <p>{totalCases} case{totalCases === 1 ? '' : 's'} moving from confirmed evidence to a recorded money outcome.</p>
      </header>
      <div className="audit-lanes">
        {queue.map((group) => (
          <section className="audit-lane" data-class={group.stage} key={group.stage} aria-labelledby={`recovery-${group.stage}`}>
            <div className="audit-lane-heading">
              <h2 id={`recovery-${group.stage}`}>{group.label}</h2>
              <span>{STAGE_SUBTEXT[group.stage]}</span>
            </div>
            {group.cases.length === 0 ? (
              <p className="audit-lane-empty">No cases in "{group.label.toLowerCase()}" right now.</p>
            ) : (
              <div className="audit-lane-cards">
                {group.cases.map(({ finding }, caseIndex) => (
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
                    <span>{finding.vendor}</span>
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
