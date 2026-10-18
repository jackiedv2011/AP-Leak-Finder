/**
 * The page's evidence objects — the physical layer of the marketing site.
 *
 * Each one renders real figures from the bundled sample export so the page
 * shows Reclaim's actual output rather than decorative filler. They are
 * presentational only: no product logic runs here, and every surface that
 * carries a number is labelled as sample data where it is shown.
 */
import type { HTMLAttributes, ReactNode } from 'react'
import {
  CANONICAL_PAIR,
  SAMPLE_CSV_HEADER,
  SAMPLE_CSV_ROWS,
  SAMPLE_RECORD_COUNT,
} from '@/components/site/siteData'
import './artifacts.css'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Artifacts take placement props so sections can stage them without wrappers. */
type ArtifactProps = HTMLAttributes<HTMLElement>

/** A single ✓ / ○ condition, mirroring the workspace's rule checklist. */
export function Tick({ matched }: { matched: boolean }) {
  return (
    <span className="site-tick" data-state={matched ? 'matched' : 'open'} aria-hidden="true">
      {matched ? '✓' : ''}
    </span>
  )
}

/** Raw CSV lines on a paper strip, with the duplicate pair marked. */
export function CsvStrip({ className = '', ...rest }: ArtifactProps) {
  return (
    <div className={`paper csv-strip ${className}`} aria-hidden="true" {...rest}>
      <div className="csv-strip-head">
        <strong>sample_payments.csv</strong>
        <span className="paper-label">{SAMPLE_RECORD_COUNT} rows</span>
      </div>
      <code className="csv-strip-rows site-mono">
        <span>{SAMPLE_CSV_HEADER}</span>
        {SAMPLE_CSV_ROWS.map((row, index) => (
          <span key={row} data-mark={index === 2 || index === 3 ? '' : undefined}>
            {row}
          </span>
        ))}
      </code>
    </div>
  )
}

/** One payment record, the way it arrives from the ledger. */
export function PaymentSlip({
  index,
  className = '',
  matched = false,
  ...rest
}: ArtifactProps & { index: 0 | 1; matched?: boolean }) {
  const record = CANONICAL_PAIR[index]

  return (
    <article className={`paper slip ${className}`} aria-hidden="true" {...rest}>
      <div className="slip-top">
        <span className="slip-vendor">{record.vendor}</span>
        <span className="paper-label">Row {record.rowIndex}</span>
      </div>
      <dl className="slip-rows">
        <div data-match={matched ? '' : undefined}>
          <dt>Invoice</dt>
          <dd className="site-mono">{record.invoiceNumber}</dd>
        </div>
        <div>
          <dt>Payment date</dt>
          <dd>{day.format(record.paymentDate)}</dd>
        </div>
        <div data-match={matched ? '' : undefined}>
          <dt>Terms</dt>
          <dd>net 30</dd>
        </div>
      </dl>
      <div className="slip-amount">
        <span className="paper-label">Amount paid</span>
        <strong className="site-num">{money.format(record.amountPaid)}</strong>
      </div>
    </article>
  )
}

/** A page of the ledger, with the two matching rows highlighted. */
export function LedgerSheet({ className = '', ...rest }: ArtifactProps) {
  const rows: [string, string, string, string, boolean][] = [
    ['Sierra Coffee Supply', 'INV-3301', 'Feb 2, 2025', '$5,200', false],
    ['Sierra Coffee Supply', 'INV-3303', 'Feb 14, 2025', '$4,850', false],
    ['Sierra Coffee Supply', 'INV-3305', 'Feb 28, 2025', '$6,800', true],
    ['Golden Bean Exports', 'INV-9013', 'Feb 26, 2025', '$6,100', false],
    ['Blue Bag Packaging', 'INV-4465', 'Mar 2, 2025', '$980', false],
    ['Sierra Coffee Supply', 'INV-3308', 'Mar 7, 2025', '$6,000', false],
    ['Sierra Coffee Supply', 'INV-3305', 'Mar 15, 2025', '$6,800', true],
  ]

  return (
    <div className={`paper ledger ${className}`} aria-hidden="true" {...rest}>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Invoice</th>
            <th>Payment date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([vendor, invoice, date, amount, mark], index) => (
            <tr data-mark={mark ? '' : undefined} key={`${invoice}-${index}`}>
              <td>{vendor}</td>
              <td className="site-mono">{invoice}</td>
              <td>{date}</td>
              <td className="site-num">{amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The finding as the workspace states it — the rule's conditions, each one
 * either matched or still an open difference. Wording mirrors
 * `buildRuleChecklist` for `exact_duplicate`.
 */
export function FindingCard({ className = '', ...rest }: ArtifactProps) {
  const checks: [string, boolean][] = [
    ['Same vendor', true],
    ['Same invoice reference', true],
    ['Same amount', true],
    ['Different payment date', false],
  ]

  return (
    <article className={`paper finding ${className}`} aria-hidden="true" {...rest}>
      <span className="site-tag" data-outcome="recoverable">
        Likely recoverable
      </span>
      <h3 className="finding-title">Exact duplicate payment</h3>
      <p className="finding-sub">Sierra Coffee Supply · INV-3305 · 2 source rows</p>
      <ul className="finding-checks">
        {checks.map(([label, matched]) => (
          <li data-matched={String(matched)} key={label}>
            <Tick matched={matched} />
            {label}
          </li>
        ))}
      </ul>
      <div className="finding-foot">
        <span className="paper-label">Potential recovery</span>
        <strong className="site-num">{money.format(CANONICAL_PAIR[0].amountPaid)}</strong>
      </div>
    </article>
  )
}

/** What Reclaim recognised in the file, before anything is analysed. */
export function ImportReceipt({ className = '', ...rest }: ArtifactProps) {
  return (
    <article className={`paper receipt ${className}`} aria-hidden="true" {...rest}>
      <div>
        <span className="paper-label">Payment export</span>
        <p className="slip-vendor">sample_payments.csv</p>
      </div>
      <dl className="receipt-stats">
        <div>
          <dt>Valid records</dt>
          <dd className="site-num">{SAMPLE_RECORD_COUNT}</dd>
        </div>
        <div>
          <dt>Vendors</dt>
          <dd className="site-num">12</dd>
        </div>
        <div>
          <dt>Date range</dt>
          <dd>Jan–Jul 2025</dd>
        </div>
        <div>
          <dt>Skipped rows</dt>
          <dd className="site-num">0</dd>
        </div>
      </dl>
      <p className="receipt-foot">
        <Tick matched />
        Parsed in this browser
      </p>
    </article>
  )
}

/** The drafted request, still editable, still tied to its source rows. */
export function RecoveryLetter({ className = '', ...rest }: ArtifactProps) {
  return (
    <article className={`paper letter ${className}`} aria-hidden="true" {...rest}>
      <div className="letter-meta">
        <span className="paper-label">Editable recovery draft</span>
        <span className="site-tag" data-outcome="recoverable">
          Ready to prepare
        </span>
      </div>
      <p className="letter-subject">Re: Duplicate payment on invoice INV-3305</p>
      <p className="letter-body">
        To whom it may concern,
        <br />
        <br />
        We are reviewing <em>2 payments</em> associated with invoice <em>INV-3305</em>. Please
        confirm whether both payments were applied and advise on a refund, credit, or offset for any
        duplicate amount.
      </p>
      <div className="letter-sign">
        <p className="site-body-sm">
          Vendor, invoice, amount, and payment dates stay linked to the draft.
        </p>
      </div>
    </article>
  )
}

/** A frame of the review workspace itself. */
export function WorkspaceFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <b>Standing ledger</b>
        <span>sample_payments.csv</span>
        <div className="workspace-tabs">
          <span>Overview</span>
          <span data-active="true">Findings</span>
          <span>Recovery</span>
        </div>
      </div>
      <div className="workspace-body">{children}</div>
    </div>
  )
}

/** The findings list, classified the three ways the product classifies them. */
export function FindingsList() {
  const rows: [string, string, string, 'recoverable' | 'review' | 'opportunity'][] = [
    ['Exact duplicate payment', 'Sierra Coffee Supply · INV-3305', '$6,800', 'recoverable'],
    ['Overpayment vs. invoice', 'Golden Bean Exports · INV-9016', '$800', 'recoverable'],
    ['Near-duplicate payment', 'Blue Bag Packaging · INV-4471-R', '$1,450', 'review'],
    ['Missed early-payment discount', 'Sierra Coffee Supply · INV-3311', '$42', 'opportunity'],
  ]

  return (
    <div className="workspace-rows">
      {rows.map(([title, meta, amount, outcome], index) => (
        <div className="workspace-row" data-active={String(index === 0)} key={title}>
          <div>
            <strong>{title}</strong>
            <small>{meta}</small>
          </div>
          <span className="site-tag" data-outcome={outcome}>
            {outcome === 'recoverable'
              ? 'Likely recoverable'
              : outcome === 'review'
                ? 'Needs review'
                : 'Future savings'}
          </span>
          <b className="site-num">{amount}</b>
        </div>
      ))}
    </div>
  )
}
