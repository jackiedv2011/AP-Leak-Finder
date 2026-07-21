import type { APRecord } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'

export type EvidenceFieldKey = 'vendor' | 'invoice' | 'amount' | 'date' | 'bankAccount'

interface EvidenceComparisonProps {
  records: APRecord[]
  highlightedField: EvidenceFieldKey | null
}

interface FieldRow {
  key: EvidenceFieldKey
  label: string
  values: string[]
  differs: boolean
}

function buildFields(records: APRecord[]): FieldRow[] {
  const vendorValues = records.map((r) => r.vendor)
  const invoiceValues = records.map((r) => r.invoiceNumber ?? '—')
  const amountValues = records.map((r) => formatCurrency(r.amountPaid))
  const dateValues = records.map((r) => formatDate(r.paymentDate))
  const bankValues = records.map((r) => r.bankAccountLast4 ?? '—')

  const differs = (values: string[]) => new Set(values).size > 1

  const rows: FieldRow[] = [
    { key: 'vendor', label: 'Vendor', values: vendorValues, differs: differs(vendorValues) },
    { key: 'invoice', label: 'Invoice', values: invoiceValues, differs: differs(invoiceValues) },
    { key: 'amount', label: 'Amount paid', values: amountValues, differs: differs(amountValues) },
    { key: 'date', label: 'Payment date', values: dateValues, differs: differs(dateValues) },
  ]

  if (bankValues.some((v) => v !== '—')) {
    rows.push({ key: 'bankAccount', label: 'Bank account', values: bankValues, differs: differs(bankValues) })
  }

  return rows
}

export function EvidenceComparison({ records, highlightedField }: EvidenceComparisonProps) {
  if (records.length === 0) return null

  const single = records.length === 1
  const columns = single ? records : records.slice(0, 2)
  const fields = buildFields(columns)

  return (
    <div>
      <div className="audit-evidence-grid" data-single={single} role="group" aria-label="Evidence comparison">
        {!single && (
          <>
            <div className="audit-evidence-col-label">Payment A</div>
            <div className="audit-evidence-col-label">Payment B</div>
          </>
        )}
        {single && <div className="audit-evidence-col-label">Payment record</div>}

        {fields.map((field) => (
          <div className="audit-evidence-field" key={field.key}>
            {field.values.map((value, index) => (
              <div
                className="audit-evidence-cell"
                data-diff={field.differs}
                data-linked={highlightedField === field.key}
                data-payment={single ? 'Record' : index === 0 ? 'Payment A' : 'Payment B'}
                key={index}
              >
                <span className="audit-evidence-term">{field.label}</span>
                <span className="audit-evidence-value">{value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
