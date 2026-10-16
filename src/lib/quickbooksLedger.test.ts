import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { toLedgerCsv } from '../../server/quickbooks.ts'

const pull = {
  company: { CompanyName: 'Sandbox Co' },
  entities: {
    Bill: [{ Id: '101', DocNumber: 'INV-7781', TxnDate: '2026-08-01', TotalAmt: 1250, SalesTermRef: { name: 'Net 30' } }],
    BillPayment: [
      { Id: '201', TxnDate: '2026-08-20', PayType: 'Check', VendorRef: { name: 'Acme Supply' }, CheckPayment: { BankAccountRef: { name: 'Checking' } }, Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] },
      { Id: '202', TxnDate: '2026-08-23', PayType: 'Check', VendorRef: { name: 'Acme Supply' }, Line: [{ Amount: 1250, LinkedTxn: [{ TxnId: '101', TxnType: 'Bill' }] }] },
    ],
    Purchase: [
      { Id: '401', TxnDate: '2026-09-05', TotalAmt: 80, DocNumber: '1', PaymentType: 'CreditCard', EntityRef: { type: 'Vendor', name: 'Acme Supply' } },
      // A refund from a vendor, not a payment to one.
      { Id: '402', TxnDate: '2026-09-06', TotalAmt: 20, Credit: true, EntityRef: { type: 'Vendor', name: 'Acme Supply' } },
    ],
  },
}

describe('QuickBooks ledger → Reclaim import', () => {
  it('produces rows the normal CSV parser accepts, one per payment', () => {
    const parsed = parseCsv(toLedgerCsv(pull))
    expect(parsed.skippedCount).toBe(0)
    expect(parsed.records.map((r) => [r.vendor, r.invoiceNumber, r.amountPaid, r.externalTransactionId, r.company])).toEqual([
      ['Acme Supply', 'INV-7781', 1250, 'qbo:BillPayment:201', 'Sandbox Co'],
      ['Acme Supply', 'INV-7781', 1250, 'qbo:BillPayment:202', 'Sandbox Co'],
      // A card purchase's DocNumber ("1") is a card reference, not an invoice number.
      ['Acme Supply', null, 80, 'qbo:Purchase:401', 'Sandbox Co'],
    ])
    expect(parsed.records[0].terms).toBe('Net 30')
  })
})
