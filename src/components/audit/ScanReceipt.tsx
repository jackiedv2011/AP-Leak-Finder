import { Check, ChevronDown, FileText, ShieldCheck } from 'lucide-react'
import type { ScanReceiptSummary } from '@/ledger/views'
import { isUnlocked, type Entitlement } from '@/billing/entitlement'
import { formatCurrency } from '@/lib/format'

interface ScanReceiptProps {
  summary: ScanReceiptSummary
  entitlement?: Entitlement
  variant?: 'full' | 'compact'
}

function FindingBreakdown({ summary }: { summary: ScanReceiptSummary }) {
  return (
    <div className="audit-receipt-findings" aria-label="Finding classifications">
      <div data-class="recoverable"><span>Potential recovery</span><strong>{formatCurrency(summary.recoverableTotal)}</strong><small>{summary.recoverableCount} case{summary.recoverableCount === 1 ? '' : 's'}</small></div>
      <div data-class="review"><span>Needs review</span><strong>{formatCurrency(summary.reviewTotal)}</strong><small>{summary.reviewCount} case{summary.reviewCount === 1 ? '' : 's'} of exposure</small></div>
      <div data-class="opportunity"><span>Savings opportunity</span><strong>{formatCurrency(summary.opportunityTotal)}</strong><small>{summary.opportunityCount} case{summary.opportunityCount === 1 ? '' : 's'}</small></div>
    </div>
  )
}

function pluralize(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function AccessCoverage({ summary, entitlement }: { summary: ScanReceiptSummary; entitlement?: Entitlement }) {
  if (!entitlement) return null

  const unlockedCount = entitlement.plan === 'pro'
    ? summary.totalFindingCount
    : summary.findingIds.filter((findingId) => isUnlocked(entitlement, findingId)).length
  const lockedCount = Math.max(0, summary.totalFindingCount - unlockedCount)

  return (
    <div className="audit-receipt-access" data-limited={lockedCount > 0}>
      <span className="audit-receipt-access-label">{entitlement.plan === 'free' ? 'Free plan access' : 'Plan access'}</span>
      <strong>All {pluralize(summary.availableCheckCount, 'available check')} completed.</strong>
      {entitlement.plan === 'free' ? (
        <p>
          {pluralize(unlockedCount, 'finding')} {unlockedCount === 1 ? 'is' : 'are'} included in your free plan.
          {lockedCount > 0 && ` ${pluralize(lockedCount, 'additional finding')} require${lockedCount === 1 ? 's' : ''} an upgrade.`}
        </p>
      ) : (
        <p>All {pluralize(summary.totalFindingCount, 'finding')} from this scan {summary.totalFindingCount === 1 ? 'is' : 'are'} unlocked.</p>
      )}
    </div>
  )
}

function ReceiptBody({ summary, entitlement }: { summary: ScanReceiptSummary; entitlement?: Entitlement }) {
  return (
    <>
      <h3 className="audit-receipt-section-title">What was scanned</h3>
      <dl className="audit-receipt-facts">
        <div><dt>Valid records analyzed</dt><dd>{summary.recordCount}</dd></div>
        <div><dt>Vendors identified</dt><dd>{summary.vendorCount}</dd></div>
        <div><dt>Payment date range</dt><dd>{summary.dateRangeLabel ?? 'Not available'}</dd></div>
        <div><dt>Rows skipped</dt><dd>{summary.skippedCount}</dd></div>
        <div><dt>Checks completed</dt><dd>{summary.availableCheckCount} of {summary.totalCheckCount}</dd></div>
        <div><dt>Total findings</dt><dd>{summary.totalFindingCount}</dd></div>
      </dl>
      <h3 className="audit-receipt-section-title audit-receipt-findings-title">What the checks found</h3>
      <FindingBreakdown summary={summary} />
      <AccessCoverage summary={summary} entitlement={entitlement} />
      <div className="audit-receipt-coverage" data-limited={summary.limitations.length > 0}>
        <strong>{summary.limitations.length > 0 ? 'Coverage limitations' : 'Full data coverage available'}</strong>
        {summary.limitations.length > 0 ? <ul>{summary.limitations.map((item) => <li key={item.label}>{item.label}</li>)}</ul> : <p>All seven checks had the source fields they need.</p>}
      </div>
      <p className="audit-receipt-privacy"><ShieldCheck aria-hidden="true" />This prototype processed the ledger in your browser and stores this review on this device.</p>
    </>
  )
}

/** Scan provenance and coverage. Full at completion; compact and persistent in Overview. */
export function ScanReceipt({ summary, entitlement, variant = 'full' }: ScanReceiptProps) {
  if (variant === 'compact') {
    return (
      <details className="audit-last-scan">
        <summary>
          <span className="audit-last-scan-mark"><Check aria-hidden="true" /></span>
          <span><small>Last scan</small><strong title={summary.sourceLabel}>{summary.sourceLabel}</strong></span>
          <span className="audit-last-scan-meta">{summary.recordCount} records · {summary.availableCheckCount} of {summary.totalCheckCount} checks · {summary.totalFindingCount} finding{summary.totalFindingCount === 1 ? '' : 's'}</span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="audit-last-scan-body"><ReceiptBody summary={summary} entitlement={entitlement} /></div>
      </details>
    )
  }
  return (
    <section className="audit-receipt" aria-labelledby="scan-receipt-title">
      <header className="audit-receipt-header">
        <span><FileText aria-hidden="true" /> Scan receipt</span>
        <div><h2 id="scan-receipt-title" title={summary.sourceLabel}>{summary.sourceLabel}</h2><p>{summary.totalFindingCount === 0 ? 'The scan completed successfully with no findings.' : `${summary.totalFindingCount} evidence-backed case${summary.totalFindingCount === 1 ? '' : 's'} surfaced.`}</p></div>
      </header>
      <ReceiptBody summary={summary} entitlement={entitlement} />
    </section>
  )
}
