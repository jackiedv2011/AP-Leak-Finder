import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { RouteMode } from '@/audit/useAuditRoute'

interface LedgerCapsuleProps {
  kind: 'ledger'
  mode: RouteMode
  findingsCount: number
  recoveryCount: number
  onModeChange: (mode: RouteMode) => void
}

interface CaseCapsuleProps {
  kind: 'case'
  backLabel: string
  vendor: string
  positionLabel: string
  actionLabel?: string
  onBack: () => void
  onAction?: () => void
}

type LivingCapsuleProps = LedgerCapsuleProps | CaseCapsuleProps

const MODES: Array<{ value: RouteMode; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'findings', label: 'Findings' },
  { value: 'recovery', label: 'Recovery' },
]

export function LivingCapsule(props: LivingCapsuleProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.nav
      className="audit-capsule"
      aria-label={props.kind === 'ledger' ? 'Ledger views' : 'Case navigation'}
      layout
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.24 }}
      data-kind={props.kind}
    >
      {props.kind === 'ledger' ? (
        <div className="audit-capsule-modes">
          {MODES.map((item) => {
            const count = item.value === 'findings' ? props.findingsCount : item.value === 'recovery' ? props.recoveryCount : 0
            const active = props.mode === item.value
            return (
              <button
                type="button"
                className="audit-capsule-mode"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => props.onModeChange(item.value)}
                key={item.value}
              >
                {active && (
                  <motion.span
                    className="audit-capsule-active"
                    layoutId="audit-capsule-active"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.22 }}
                  />
                )}
                <span className="audit-capsule-label">{item.label}</span>
                {count > 0 && <span className="audit-capsule-count">{count}</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="audit-capsule-case">
          <button
            type="button"
            className="audit-capsule-back"
            onClick={props.onBack}
            aria-label={`Back to ${props.backLabel}`}
          >
            <ArrowLeft aria-hidden="true" />
            <span>{props.backLabel}</span>
          </button>
          <span className="audit-capsule-separator" aria-hidden="true" />
          <span className="audit-capsule-vendor">{props.vendor}</span>
          <span className="audit-capsule-position">{props.positionLabel}</span>
          {props.actionLabel && props.onAction && (
            <button type="button" className="audit-capsule-action" onClick={props.onAction}>
              {props.actionLabel}
              <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </motion.nav>
  )
}
