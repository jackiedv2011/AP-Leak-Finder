import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { APRecord } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'

interface RecordsViewProps {
  records: APRecord[]
  /** Record ids that appear in at least one open finding. */
  flaggedRecordIds: Set<string>
  onOpenImport: () => void
}

/**
 * Records — the imported ledger itself, as it was read.
 *
 * Every finding claims to link back to "the exact source rows", so those rows
 * have to be somewhere the reader can actually look at them.
 */
export function RecordsView({ records, flaggedRecordIds, onOpenImport }: RecordsViewProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return records
    return records.filter(
      (record) =>
        record.vendor.toLowerCase().includes(term) ||
        (record.invoiceNumber ?? '').toLowerCase().includes(term) ||
        (record.category ?? '').toLowerCase().includes(term)
    )
  }, [query, records])

  const total = useMemo(() => filtered.reduce((sum, record) => sum + record.amountPaid, 0), [filtered])

  return (
    <div className="rc-view">
      <header className="rc-page-head">
        <div>
          <span className="rc-eyebrow">Records</span>
          <h1>
            Every payment <em>we read.</em>
          </h1>
          <p>This is your file exactly as Reclaim parsed it. Flagged rows appear in at least one open issue.</p>
        </div>
        <div className="rc-headline-figure">
          <span>Total shown</span>
          <strong>{formatCurrency(total)}</strong>
          <small>
            {filtered.length} of {records.length} payments
          </small>
        </div>
      </header>

      <div className="rc-records-toolbar">
        <label className="rc-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            className="rc-input"
            placeholder="Search vendor, invoice, or category…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search records"
          />
        </label>
        <button type="button" className="rc-btn" data-variant="outline" onClick={onOpenImport}>
          <Plus aria-hidden="true" />
          Add records
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rc-empty">
          <h2>No matching payments</h2>
          <p>Nothing in this ledger matches "{query}".</p>
        </div>
      ) : (
        <div className="rc-table-wrap">
          <table className="rc-table">
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Vendor</th>
                <th scope="col">Invoice</th>
                <th scope="col">Paid</th>
                <th scope="col" className="rc-table-num">
                  Amount
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const flagged = flaggedRecordIds.has(record.id)
                return (
                  <tr key={record.id} data-flagged={flagged}>
                    <td className="rc-table-muted">{record.rowIndex + 1}</td>
                    <td>{record.vendor}</td>
                    <td className="rc-table-muted">{record.invoiceNumber ?? '—'}</td>
                    <td className="rc-table-muted">{formatDate(record.paymentDate)}</td>
                    <td className="rc-table-num">{formatCurrency(record.amountPaid)}</td>
                    <td>
                      {flagged ? (
                        <span className="rc-chip" data-tone="locked">
                          Flagged
                        </span>
                      ) : (
                        <span className="rc-table-muted">Clean</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
