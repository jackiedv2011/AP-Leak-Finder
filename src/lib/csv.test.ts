import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'

describe('parseCsv', () => {
  it('accepts supported header aliases and parses valid rows', () => {
    const result = parseCsv('Vendor,Payment Date,Amount Paid\nNorthline,2025-02-28,"$1,240.50"')
    expect(result.skippedCount).toBe(0)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].amountPaid).toBe(1240.5)
  })

  it('skips malformed required values while preserving malformed optional values as null', () => {
    const result = parseCsv([
      'vendor,payment_date,amount_paid,invoice_date',
      'Northline,2025-02-31,500,2025-02-28',
      'Summit,2025-02-28,100abc,2025-02-28',
      'Harbor,2025-02-28,500,2025-02-31',
    ].join('\n'))
    expect(result.skippedCount).toBe(2)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].invoiceDate).toBeNull()
  })
})
