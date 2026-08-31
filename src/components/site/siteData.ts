/**
 * Marketing-surface facts, mirrored from the shipped product so the landing
 * page can never drift into claims the rules engine does not make.
 *
 * Sources of truth:
 *   - the seven rules: `src/types.ts` (FindingType) and `src/audit/ruleChecklist.ts`
 *   - the classifications: `src/lib/labels.ts` (CLASS_LABELS)
 *   - the sample numbers: `src/data/landingSamplePresentation.ts`
 * Nothing here may describe behaviour the prototype does not implement.
 */
import type { FindingClass, FindingType } from '@/types'
import { landingSamplePresentation } from '@/data/landingSamplePresentation'

export interface SiteCheck {
  type: FindingType
  /** Short display name — the same wording the workspace uses. */
  name: string
  /** What the rule actually compares, in plain language. */
  detail: string
  outcome: FindingClass
}

/**
 * The seven checks Reclaim runs on every file. Names match
 * FINDING_TYPE_LABELS; details paraphrase the rule conditions in
 * `buildRuleChecklist` without restating them as guarantees.
 */
export const SITE_CHECKS: SiteCheck[] = [
  {
    type: 'exact_duplicate',
    name: 'Exact duplicate payment',
    detail: 'Two payments carrying the same vendor, invoice reference, and amount.',
    outcome: 'recoverable',
  },
  {
    type: 'overpayment',
    name: 'Overpayment vs. invoice',
    detail: 'A payment that lands above the invoice amount recorded against it.',
    outcome: 'recoverable',
  },
  {
    type: 'unclaimed_discount',
    name: 'Unclaimed early-payment discount',
    detail: 'Paid inside the discount window, at full price, with terms on the invoice.',
    outcome: 'recoverable',
  },
  {
    type: 'near_duplicate',
    name: 'Near-duplicate payment',
    detail: 'Same vendor and amount on a different invoice reference within 45 days.',
    outcome: 'review',
  },
  {
    type: 'bank_account_change',
    name: 'Vendor bank-account change',
    detail: 'A vendor’s deposit account changes between sequential payments.',
    outcome: 'review',
  },
  {
    type: 'amount_outlier',
    name: 'Payment amount outlier',
    detail: 'A payment well above what this vendor is normally paid.',
    outcome: 'review',
  },
  {
    type: 'missed_discount',
    name: 'Missed early-payment discount',
    detail: 'Discount terms were available, but the window had already closed.',
    outcome: 'opportunity',
  },
]

export const OUTCOME_COPY: Record<FindingClass, { label: string; note: string }> = {
  recoverable: { label: 'Likely recoverable', note: 'Drafts a recovery request for you to review.' },
  review: { label: 'Needs review', note: 'Opens an internal note — no refund is assumed.' },
  opportunity: { label: 'Future savings', note: 'A process change, not money already lost.' },
}

/** Raw lines from the bundled sample export, used for the paper artifacts. */
export const SAMPLE_CSV_HEADER = 'vendor,invoice_number,invoice_date,payment_date,invoice_amount,amount_paid,terms'

export const SAMPLE_CSV_ROWS = [
  'Sierra Coffee Supply,INV-3301,2025-01-05,2025-02-02,5200.00,5200.00,net 30',
  'Sierra Coffee Supply,INV-3303,2025-01-19,2025-02-14,4850.00,4850.00,net 30',
  'Sierra Coffee Supply,INV-3305,2025-02-02,2025-02-28,6800.00,6800.00,net 30',
  'Sierra Coffee Supply,INV-3305,2025-02-02,2025-03-15,6800.00,6800.00,net 30',
  'Sierra Coffee Supply,INV-3308,2025-03-01,2025-03-07,6000.00,6000.00,2/10 net 30',
  'Golden Bean Exports,INV-9016,2025-03-01,2025-03-25,7400.00,8200.00,net 30',
  'Blue Bag Packaging,INV-4471,2025-03-05,2025-03-20,1450.00,1450.00,net 30',
  'Blue Bag Packaging,INV-4471-R,2025-03-05,2025-04-07,1450.00,1450.00,net 30',
]

/** The canonical duplicate pair the workspace opens on, straight from the sample. */
export const CANONICAL_PAIR = landingSamplePresentation.records.filter(
  (record) => record.invoiceNumber === 'INV-3305'
)

export const SAMPLE_RECORD_COUNT = landingSamplePresentation.recordCount
export const SAMPLE_RECOVERABLE_TOTAL = landingSamplePresentation.recoverableTotal

export const SITE_FAQ: [string, string][] = [
  [
    'Does Reclaim replace QuickBooks or Xero?',
    'No. Reclaim adds a focused recovery layer after accounting. You export the ledger you already use, review possible cases, and take confirmed evidence back into your existing workflow.',
  ],
  [
    'Does Reclaim decide that a payment is wrong?',
    'No. Reclaim points to records worth a second look and explains why they match. A person reviews the evidence and confirms the next step.',
  ],
  [
    'Where does my ledger data go?',
    'Your ledger stays on this device, in this browser. It is processed locally, is never uploaded to our servers, and can be deleted from your workspace.',
  ],
  [
    'What does Reclaim need in the file?',
    'Vendor, payment date, and amount paid are required. Invoice number, invoice amount, terms, and the vendor bank account last four make more of the seven checks possible.',
  ],
  [
    'Is there an AI model reading my ledger?',
    'No. Reclaim runs a deterministic rules engine, so the same file always produces the same findings and every amount traces back to a rule and its source rows.',
  ],
  [
    'What happens to rows Reclaim cannot read?',
    'Malformed dates and currency values are rejected, and a row missing vendor, payment date, or amount paid is skipped. The count of skipped rows is shown in the interface, so nothing is quietly dropped.',
  ],
  [
    'Can I keep more than one review?',
    'Yes. Each review is saved as a project in this browser. You can reopen a past review, switch between projects, or delete one from the workspace.',
  ],
  [
    'Which columns does my file need?',
    'Vendor, payment date, and amount paid are required. Invoice number, invoice date, invoice amount, terms, bank account last four, and category are all optional, and each one makes more of the seven checks possible.',
  ],
  [
    'How does Reclaim read payment terms?',
    'Terms written like "2/10 net 30" tell Reclaim there was an early-payment discount and how long the window ran. It compares the payment date against that window to separate a discount you could still claim from one that has already closed.',
  ],
  [
    'Is Reclaim finished software?',
    'Not yet. It is a working prototype built around a deterministic rules engine, with no backend, database, or external API. The detection rules and the evidence they produce are real; the surrounding product is still being built out.',
  ],
  [
    'When would I pay a recovery fee?',
    'Only after a verified refund, credit, or offset. The recovery terms are agreed before outreach; a possible finding or an unanswered request does not create a fee.',
  ],
]
