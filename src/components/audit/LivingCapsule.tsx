import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { RouteMode } from '@/audit/useAuditRoute'
import { MOTION_SPRING, MOTION_TRANSITION } from '@/motion/system'

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
      transition={reduceMotion ? { duration: 0 } : MOTION_SPRING.compact}
      data-kind={props.kind}
    >
      <AnimatePresence mode="popLayout" initial={false}>
      {props.kind === 'ledger' ? (
        <motion.div
          className="audit-capsule-modes"
          data-tutorial="mode-tabs"
          key="ledger"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(-8px, 0, 0)' }}
          animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(-6px, 0, 0)' }}
          transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.state}
        >
          {MODES.map((item) => {
            const count = item.value === 'findings' ? props.findingsCount : item.value === 'recovery' ? props.recoveryCount : 0
            const active = props.mode === item.value
            return (
              <button
                type="button"
                className="audit-capsule-mode"
                data-motion="pressable"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => props.onModeChange(item.value)}
                key={item.value}
              >
                {active && (
                  <motion.span
                    className="audit-capsule-active"
                    layoutId="audit-capsule-active"
                    transition={reduceMotion ? { duration: 0 } : MOTION_SPRING.compact}
                  />
                )}
                <span className="audit-capsule-label">{item.label}</span>
                {count > 0 && <span className="audit-capsule-count">{count}</span>}
              </button>
            )
          })}
        </motion.div>
      ) : (
        <motion.div
          className="audit-capsule-case"
          key="case"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(8px, 0, 0)' }}
          animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(6px, 0, 0)' }}
          transition={reduceMotion ? { duration: 0.12 } : MOTION_TRANSITION.state}
        >
          <button
            type="button"
            className="audit-capsule-back"
            data-motion="pressable"
            data-motion-arrow="true"
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
            <button type="button" className="audit-capsule-action" data-motion="pressable" data-motion-ray="true" data-motion-arrow="true" onClick={props.onAction}>
              {props.actionLabel}
              <ArrowRight aria-hidden="true" />
            </button>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </motion.nav>
  )
}
