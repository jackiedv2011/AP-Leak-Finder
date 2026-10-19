/**
 * What a QuickBooks import knows for certain, beyond the CSV columns: which
 * bill each payment paid, the credits and refunds applied with it, and the
 * vendor's credits, refunds and voided payments as of the pull. Shared by the
 * server (which builds it) and the browser (which keeps it with the import and
 * pre-fills recovery evidence from it). Types only, so both sides can import it.
 *
 * Amounts are whole cents. QuickBooks has no cleared or reconciled status in
 * its API, so nothing here says a payment settled.
 */
export interface QuickBooksTxnRef {
  txnType: 'Bill' | 'BillPayment' | 'Purchase' | 'VendorCredit' | 'Deposit'
  id: string
  /** QuickBooks transaction date, YYYY-MM-DD. */
  txnDate: string | null
  amountMinor: number
}

/** One CSV row's QuickBooks source, keyed in `QuickBooksFacts.payments` by its `transaction_id`. */
export interface QuickBooksPaymentFact {
  payment: QuickBooksTxnRef & { txnType: 'BillPayment' | 'Purchase'; payType: string | null }
  vendorId: string | null
  currency: string
  /** The bill this payment line paid, from BillPayment.Line.LinkedTxn. Null for a direct check or card charge. */
  bill: (QuickBooksTxnRef & { txnType: 'Bill'; docNumber: string | null }) | null
  /** Vendor credits applied in the same bill payment. */
  creditsApplied: QuickBooksTxnRef[]
  /** Vendor refunds (deposits) applied in the same bill payment. */
  refundsApplied: QuickBooksTxnRef[]
}

export interface QuickBooksVendorActivity {
  credits: QuickBooksTxnRef[]
  /** Deposits from the vendor, and card or check credits (Purchase with Credit = true). */
  refunds: QuickBooksTxnRef[]
  /** Bill payments and purchases QuickBooks shows as voided (zero total, "Voided" note). */
  voided: QuickBooksTxnRef[]
}

export interface QuickBooksFacts {
  schemaVersion: 1
  companyName: string
  /** Epoch ms: when these searches ran. */
  pulledAt: number
  payments: Record<string, QuickBooksPaymentFact>
  /** Keyed by QuickBooks vendor id. */
  vendors: Record<string, QuickBooksVendorActivity>
  /** How many of each entity the searches covered. For a change pull: how many were created since the last pull. */
  searched: { vendorCredits: number; deposits: number; purchases: number; billPayments: number }
  /** Which QuickBooks company, and whether this is the whole ledger or only what changed. Absent on imports before re-import support. */
  sync?: QuickBooksSyncInfo
}

export interface QuickBooksSyncInfo {
  realmId: string
  /** `full`: every transaction; anything not here is gone. `changes`: only what changed since `since`. */
  mode: 'full' | 'changes'
  /** Epoch ms of the pull the changes are relative to; null for a full pull. */
  since: number | null
  /** For `changes`: every transaction the change set mentions, as "Type:Id". */
  touched: string[]
  /** For `changes`: transactions deleted in QuickBooks. */
  removed: Array<{ txnType: string; id: string }>
}
