import sampleLedgerCsv from './sample-ledger-source.csv?raw'
import { parseCsv } from '@/lib/csv'
import { EVIDENCE_CHECKS, type RecoveryEvidence } from '@/recovery/eligibility'
import type { Finding } from '@/types'

export { sampleLedgerCsv }

export function getSampleLedger() {
  return parseCsv(sampleLedgerCsv)
}

const RECOVERY_SAMPLE_INVOICE = 'SAMPLE-4280'

export function getRecoverySampleLedger() {
  return parseCsv([
    'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,currency',
    'Example Supply Co.,SAMPLE-4280,2025-05-01,2025-05-04,4280.00,4280.00,USD',
    'Example Supply Co.,SAMPLE-4280,2025-05-01,2025-05-09,4280.00,4280.00,USD',
  ].join('\n'))
}

/** Fictional source packet. Save evidence in the case to confirm the exercise. */
export function getRecoverySampleEvidence(finding: Finding): RecoveryEvidence | undefined {
  if (finding.type !== 'exact_duplicate' || !finding.relatedRecords.every((record) => record.invoiceNumber === RECOVERY_SAMPLE_INVOICE)) return undefined
  const stamp = { confirmedBy: '', confirmedAt: 0 }
  return {
    entity: { ...stamp, entityId: 'Sample Café', reference: 'Sample company profile' },
    supplier: {
      ...stamp, supplierId: 'SAMPLE-SUPPLIER-1', reference: 'Sample supplier master',
      contact: { email: 'billing@example-supply.test', source: 'supplier_record', reference: 'Sample supplier master' },
    },
    obligation: { ...stamp, obligationId: RECOVERY_SAMPLE_INVOICE, reference: 'Sample bill SAMPLE-4280', amountMinor: 428000, currency: 'USD' },
    payments: finding.relatedRecords.map((record, index) => ({
      ...stamp, recordId: record.id, paymentId: `SAMPLE-PAY-${index + 1}`, reference: `Sample bank statement line ${index + 1}`,
      amountMinor: Math.round(record.amountPaid * 100), currency: 'USD', settled: true, obligationId: RECOVERY_SAMPLE_INVOICE,
    })),
    priorReturns: [{ ...stamp, method: 'refund', amountMinor: 100000, reference: 'Sample bank deposit SAMPLE-REFUND-1000' }],
    checks: Object.fromEntries(EVIDENCE_CHECKS.map(([key]) => [key, { ...stamp, reference: 'Sample bill, payment and adjustment records', confirmed: true }])),
    contradictions: [],
    notes: 'Fictional exercise records',
  }
}
