import type { CaseState } from '@/ledger/caseState'

export type RecoveryLedgerKind = 'reviewed' | 'approved' | 'requested' | 'acknowledged' | 'vendor_agreed' | 'promised' | 'credit_issued' | 'refund_reported' | 'returned' | 'reversed' | 'unreturned_closed' | 'balance_reopened' | 'reconciled' | 'reconciliation_corrected'
export interface RecoveryLedgerEntry {
  kind: RecoveryLedgerKind
  at: number
  amount: number | null
  reference: string | null
}

const SAME_TIME_ORDER: Record<RecoveryLedgerKind, number> = {
  reviewed: 0, approved: 1, requested: 2, acknowledged: 3, vendor_agreed: 4,
  promised: 5, credit_issued: 6, refund_reported: 7, returned: 8,
  unreturned_closed: 9, balance_reopened: 10, reversed: 11,
  reconciled: 12, reconciliation_corrected: 13,
}

/** A case-level financial event projection. Each amount keeps its own meaning. */
export function recoveryLedger(state: CaseState): RecoveryLedgerEntry[] {
  const entries: RecoveryLedgerEntry[] = []
  const push = (kind: RecoveryLedgerKind, at: number | null | undefined, amount: number | null, reference: string | null = null) => {
    if (at) entries.push({ kind, at, amount, reference })
  }
  if (state.decision === 'confirmed') push('reviewed', state.decidedAt, null, state.reason ?? null)
  push('approved', state.approvedAt, state.requestedAmount ?? null, state.knownBeforeReclaim ? 'Issue known before Reclaim' : 'Customer approved')
  push('requested', state.recoveryRequestedAt, state.requestedAmount ?? null, state.recoveryRecipientEmail ?? null)
  const settlements = state.recoverySettlements ?? (state.recoveryVerification ? [state.recoveryVerification] : [])
  for (const update of state.vendorUpdates ?? []) {
    const kind = update.status === 'acknowledged' ? 'acknowledged' : update.status === 'accepted' || update.status === 'partial_acceptance' ? 'vendor_agreed' : update.status === 'promised' ? 'promised' : update.status === 'credit_issued' ? 'credit_issued' : update.status === 'already_refunded' ? 'refund_reported' : null
    const priorReturnedCents = settlements.filter((settlement) => settlement.settledAt <= update.at).reduce((sum, settlement) => sum + Math.round(settlement.amount * 100), 0)
    const acceptedBalance = update.status === 'accepted' && state.requestedAmount != null ? Math.max(0, Math.round(state.requestedAmount * 100) - priorReturnedCents) / 100 : null
    if (kind) push(kind, update.at, update.amount ?? acceptedBalance, update.note)
  }
  const historyReturns = (state.history ?? []).filter((event) =>
    event.action === 'recovery:settlement_recorded' || (event.action === 'outcome:recovered' && (event.amount ?? 0) > 0)
  )
  for (const event of state.history ?? []) {
    if (historyReturns.includes(event)) push('returned', event.at, event.amount ?? null, event.note ?? null)
    if (event.action === 'outcome:reopened' && (event.amount ?? 0) < 0) push('reversed', event.at, event.amount ?? null, 'Prior recorded return reversed')
  }
  for (const settlement of settlements) {
    const inHistory = historyReturns.some((event) =>
      event.at === settlement.settledAt && event.amount === settlement.amount && event.note === settlement.reference
    )
    if (!inHistory) push('returned', settlement.settledAt, settlement.amount, settlement.reference)
  }
  if (!settlements.length && !historyReturns.length && state.recoveryStage === 'recovered' && (state.recoveredAmount ?? 0) > 0) {
    push('returned', state.recoveryResolvedAt, state.recoveredAmount ?? 0, state.recoveryOutcomeNote ?? null)
  }
  const closureEvents = (state.history ?? []).filter((event) => event.action === 'recovery:remainder_closed' || event.action === 'outcome:not_recovered' || event.action === 'recovery:remainder_reopened' || (event.action === 'outcome:reopened' && event.from.recoveryStage === 'not_recovered'))
  if (closureEvents.length) {
    let lastClosedAmount: number | null = null
    for (const event of closureEvents) {
      const reopened = event.action === 'recovery:remainder_reopened' || event.action === 'outcome:reopened'
      if (!reopened) lastClosedAmount = event.amount ?? null
      const amount = reopened ? (event.amount && event.amount > 0 ? event.amount : lastClosedAmount) : event.amount ?? null
      push(reopened ? 'balance_reopened' : 'unreturned_closed', event.at, reopened && amount != null ? -amount : amount, event.note ?? null)
      if (reopened) lastClosedAmount = null
    }
  } else if (state.recoveryStage === 'not_recovered' || (state.recoveryStage === 'recovered' && (state.recoveredAmount ?? 0) > 0 && (state.requestedAmount ?? 0) > (state.recoveredAmount ?? 0))) {
    push('unreturned_closed', state.recoveryResolvedAt, state.requestedAmount == null ? null : Math.max(0, Math.round(state.requestedAmount * 100) - Math.round((state.recoveredAmount ?? 0) * 100)) / 100, state.recoveryOutcomeNote ?? null)
  }
  const reconciliationEvents = (state.history ?? []).filter((event) => event.action === 'accounting:reconciled' || event.action === 'accounting:corrected')
  if (reconciliationEvents.length) {
    for (const event of reconciliationEvents) push(event.action === 'accounting:corrected' ? 'reconciliation_corrected' : 'reconciled', event.at, event.amount ?? null, event.note ?? null)
  } else {
    push('reconciled', state.reconciledAt, state.recoveredAmount ?? null, state.reconciliationNote ?? null)
  }
  return entries.sort((a, b) => a.at - b.at || SAME_TIME_ORDER[a.kind] - SAME_TIME_ORDER[b.kind])
}

export const RECOVERY_LEDGER_LABEL: Record<RecoveryLedgerKind, string> = {
  reviewed: 'Customer reviewed', approved: 'Outreach approved', requested: 'Requested',
  acknowledged: 'Vendor acknowledged', vendor_agreed: 'Vendor agreed', promised: 'Vendor promised', credit_issued: 'Credit issued, unapplied', refund_reported: 'Refund reported, unverified',
  returned: 'Returned value', reversed: 'Return reversed', unreturned_closed: 'Balance closed unreturned', balance_reopened: 'Balance reopened', reconciled: 'Accounting reconciled', reconciliation_corrected: 'Reconciliation updated',
}
