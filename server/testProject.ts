import { EVIDENCE_CHECKS } from '../src/recovery/eligibility.ts'

/**
 * A saved project holding one exact duplicate with explicit synthetic customer
 * attestations and a current approval for `requested`. The AI draft route only
 * drafts from facts like these, stored on the account. Test fixture only.
 */
export function authorizedProject(id: string, input: { vendor: string; invoice: string | null; amount: number; requested: number }) {
  const findingId = `exact_duplicate-${id}`
  const stamp = { reference: 'Synthetic accounting trace', confirmedBy: 'Test customer', confirmedAt: 100 }
  const cents = Math.round(input.amount * 100)
  const records = [5, 12].map((day, i) => ({
    id: `${id}-r${i}`, vendor: input.vendor, invoiceNumber: input.invoice, invoiceDate: '2025-01-01', paymentDate: `2025-01-${String(day).padStart(2, '0')}`,
    invoiceAmount: input.amount, amountPaid: input.amount, terms: null, currency: 'USD', importStatus: 'active',
  }))
  const evidence = {
    payments: records.map((r) => ({ ...stamp, recordId: r.id, paymentId: r.id, amountMinor: cents, currency: 'USD', settled: true, obligationId: findingId })),
    obligation: { ...stamp, obligationId: findingId, amountMinor: cents, currency: 'USD' },
    checks: Object.fromEntries(EVIDENCE_CHECKS.map(([key]) => [key, { ...stamp, confirmed: true }])),
    contradictions: [], notes: 'Synthetic fixture only',
  }
  const finding = {
    id: findingId, type: 'exact_duplicate', title: `Duplicate payment of invoice ${input.invoice ?? 'unknown'}`, explanation: 'The saved payment records show the same invoice paid twice.', severity: 'high', vendor: input.vendor, currency: 'USD', dollarImpact: input.amount, flaggedAmount: input.amount,
    classification: 'recovery_candidate', class: 'recoverable', relatedRecords: records.map((r) => ({ id: r.id })), evidence,
  }
  const project = {
    id, name: id, sourceLabel: `${id}.csv`, mode: 'upload', createdAt: 1, updatedAt: 2,
    environment: { records, imports: [], result: { findings: [finding] }, caseStates: { [findingId]: { approvedAt: 100, requestedAmount: input.requested, requestedResolution: 'refund', recoveryStage: 'confirmed' } } },
  }
  return { project, findingId }
}
