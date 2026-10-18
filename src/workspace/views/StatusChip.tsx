import type { ReactNode } from 'react'
import type { CaseState } from '@/ledger/caseState'
import { caseStatus, STATUS_TONE_LABEL, type CaseStatus, type StatusTone } from '@/recovery/status'

/** A case's status as a tinted chip, coloured by who holds the ball. */
export function StatusChip({ state, status, internal = false, now, size, icon }: { state?: CaseState; status?: CaseStatus; internal?: boolean; now?: number; size?: 'lg'; icon?: ReactNode }) {
  const s = status ?? caseStatus(state, now, internal)
  return (
    <span className="wk-status" data-status-tone={s.tone} data-size={size}>
      {icon}{s.label}
    </span>
  )
}

/** A thin bar split by status family, for "where do these cases stand" at a glance. */
export function ToneBar({ parts, label }: { parts: Array<{ tone: StatusTone; count: number }>; label: string }) {
  if (parts.length === 0) return null
  return (
    <div className="wk-tonebar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.count} ${STATUS_TONE_LABEL[p.tone].toLowerCase()}`).join(', ')}`}>
      {parts.map((p) => <i key={p.tone} data-status-tone={p.tone} style={{ flexGrow: p.count }} title={`${STATUS_TONE_LABEL[p.tone]}: ${p.count}`} />)}
    </div>
  )
}
