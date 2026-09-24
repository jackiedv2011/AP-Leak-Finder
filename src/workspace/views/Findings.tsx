import { useEffect, useState } from 'react'
import { ArrowRight, Download, Lock, Search, SlidersHorizontal } from 'lucide-react'
import { formatCurrency, formatDate, plural } from '@/lib/format'
import { DECISION_LABEL, type DecisionValue } from '@/ledger/caseState'
import { recoveryStatusLabel } from '@/recovery/model'
import type { LedgerEnvironment } from '@/ledger/store'
import { useEntitlements } from '@/lib/auth/AuthContext'
import { UpgradeDialog } from '@/components/plan/UpgradeDialog'
import { EVIDENCE_LABEL, ladder, opportunities, type Opportunity } from '../selectors'
import { KindChip } from './KindChip'
import { Strength } from './Strength'
import { findingReference } from './findingText'

interface FindingsProps {
  env: LedgerEnvironment
  visible: Set<string>
  onOpenCase: (findingId: string) => void
}
type Category = 'all' | 'recoverable' | 'review' | 'opportunity'
type Status = 'all' | 'unreviewed' | DecisionValue
type Sort = 'priority' | 'amount-desc' | 'amount-asc' | 'vendor'
const categories: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'recoverable', label: 'Ready to claim' },
  { id: 'review', label: 'Needs context' },
  { id: 'opportunity', label: 'Prevention' },
]
const categoryValues: Category[] = ['all', 'recoverable', 'review', 'opportunity']
const statusValues: Status[] = ['all', 'unreviewed', 'confirmed', 'needs_info', 'expected']
const sortValues: Sort[] = ['priority', 'amount-desc', 'amount-asc', 'vendor']
function initial<T extends string>(key: string, allowed: T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(key) as T | null
  return value && allowed.includes(value) ? value : fallback
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The rows this plan can see, as a spreadsheet a controller can file or forward. */
function exportCsv(rows: Opportunity[]) {
  const header = ['Vendor', 'Finding', 'Kind', 'Invoices', 'Payment dates', 'Evidence', 'Decision', 'Recovery', 'Amount']
  const lines = rows.map((o) => [
    o.finding.vendor,
    o.typeLabel,
    o.finding.class === 'recoverable' ? 'Ready to claim' : o.finding.class === 'review' ? 'Needs context' : 'Prevention',
    [...new Set(o.finding.relatedRecords.map((r) => r.invoiceNumber).filter(Boolean))].join('; '),
    o.finding.relatedRecords.map((r) => formatDate(r.paymentDate)).join('; '),
    EVIDENCE_LABEL[o.evidence],
    o.state.decision ? DECISION_LABEL[o.state.decision] : 'Not reviewed',
    o.state.recoveryStage ? recoveryStatusLabel(o.state, o.finding.class !== 'recoverable') : '',
    o.finding.dollarImpact.toFixed(2),
  ])
  const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'reclaim-findings.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function decisionChip(o: Opportunity) {
  if (o.state.recoveryStage) {
    const returned = o.state.recoveryStage === 'recovered' && o.finding.class === 'recoverable' && (o.state.recoveredAmount ?? 0) > 0
    return <span className="wk-chip" data-tone={returned ? 'accent' : o.state.recoveryStage === 'not_recovered' ? 'quiet' : 'done'}>{recoveryStatusLabel(o.state, o.finding.class !== 'recoverable')}</span>
  }
  if (!o.state.decision) return <span className="wk-chip" data-tone="quiet">Not reviewed</span>
  return <span className="wk-chip" data-tone={o.state.decision === 'confirmed' ? 'done' : undefined}>{DECISION_LABEL[o.state.decision]}</span>
}

export function Findings({ env, visible, onOpenCase }: FindingsProps) {
  const entitlements = useEntitlements()
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [category, setCategory] = useState<Category>(() => initial('kind', categoryValues, 'all'))
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [status, setStatus] = useState<Status>(() => initial('decision', statusValues, 'all'))
  const [sort, setSort] = useState<Sort>(() => initial('sort', sortValues, 'priority'))
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const [key, value, fallback] of [['kind', category, 'all'], ['q', query.trim(), ''], ['decision', status, 'all'], ['sort', sort, 'priority']]) {
      if (value === fallback) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }, [category, query, status, sort])
  const all = opportunities(env)
  const l = ladder(env)
  const normalizedQuery = query.trim().toLowerCase()
  const matching = all.filter((o) => {
    if (category !== 'all' && o.finding.class !== category) return false
    if (status === 'unreviewed' && o.state.decision !== null) return false
    if (status !== 'all' && status !== 'unreviewed' && o.state.decision !== status) return false
    if (normalizedQuery && !`${o.finding.vendor} ${o.finding.title} ${o.typeLabel} ${findingReference(o.finding)}`.toLowerCase().includes(normalizedQuery)) return false
    return true
  })
  const ordered = [...matching].sort((a, b) => {
    if (sort === 'amount-desc') return b.finding.dollarImpact - a.finding.dollarImpact
    if (sort === 'amount-asc') return a.finding.dollarImpact - b.finding.dollarImpact
    if (sort === 'vendor') return a.finding.vendor.localeCompare(b.finding.vendor)
    return b.priority - a.priority
  })
  const lockedCount = ordered.filter((o) => !visible.has(o.finding.id)).length
  const decided = all.filter((o) => o.state.decision !== null).length

  if (!all.length) return <div className="wk-empty"><span className="wk-label">Nothing flagged</span><p>Every check ran against this ledger and found nothing worth your time.</p></div>

  return <>
    <div className="wk-toolbar">
      <div className="wk-tabs" role="tablist" aria-label="Finding kind">{categories.map(({ id, label }) => <button type="button" role="tab" aria-selected={category === id} key={id} onClick={() => setCategory(id)}>{label}<span>{id === 'all' ? all.length : all.filter((o) => o.finding.class === id).length}</span></button>)}</div>
    </div>
    <div className="wk-toolbar">
      <label className="wk-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor, invoice or type…" aria-label="Search findings" /></label>
      <label className="wk-select"><SlidersHorizontal aria-hidden="true" /><span className="wk-sr-only">Filter by decision</span><select value={status} onChange={(event) => setStatus(event.target.value as Status)}><option value="all">Any decision</option><option value="unreviewed">Not reviewed</option><option value="confirmed">Confirmed</option><option value="needs_info">Needs information</option><option value="expected">Expected</option></select></label>
      <label className="wk-select"><span className="wk-sr-only">Sort findings</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="priority">Sort: priority</option><option value="amount-desc">Sort: largest first</option><option value="amount-asc">Sort: smallest first</option><option value="vendor">Sort: vendor A–Z</option></select></label>
      <span className="wk-toolbar-spacer" />
      <button type="button" className="wk-btn" data-variant="outline" onClick={() => exportCsv(ordered.filter((o) => visible.has(o.finding.id)))}><Download aria-hidden="true" />Export CSV</button>
    </div>

    <div className="wk-grid-table" aria-label="Finding results">
      <div className="wk-grid-head"><span>Vendor and records</span><span>Finding</span><span>Evidence</span><span>Status</span><span style={{ textAlign: 'right' }}>Amount</span><span /></div>
      {ordered.map((o) => {
        const locked = !visible.has(o.finding.id)
        return <button type="button" className="wk-grid-row wk-finding-row" key={o.finding.id} data-locked={locked || undefined} onClick={() => (locked ? setUpgradeOpen(true) : onOpenCase(o.finding.id))} aria-label={locked ? `${o.typeLabel}, ${formatCurrency(o.finding.dollarImpact)}, part of Pro` : `${o.typeLabel}, ${o.finding.vendor}, ${formatCurrency(o.finding.dollarImpact)}`}>
          <span className="wk-cell-main">{locked ? <><strong style={{ color: 'var(--text-muted)' }}>Shown on Pro</strong><small>Vendor and invoices hidden on Free</small></> : <><strong>{o.finding.vendor}</strong><small>{findingReference(o.finding)}</small></>}<span className="wk-mobile-meta" aria-hidden="true"><KindChip finding={o.finding} label={o.typeLabel} />{decisionChip(o)}</span></span>
          <span><KindChip finding={o.finding} label={o.typeLabel} /></span>
          <span className="wk-finding-state"><Strength level={o.evidence} /></span>
          <span>{decisionChip(o)}</span>
          <span className="wk-cell-money wk-finding-amount">{formatCurrency(o.finding.dollarImpact)}</span>
          {locked ? <Lock aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        </button>
      })}
      {ordered.length === 0 ? <div className="wk-grid-empty">No findings match. <button type="button" className="wk-link" onClick={() => { setCategory('all'); setQuery(''); setStatus('all') }}>Clear filters</button></div> : null}
      {lockedCount > 0 ? <div className="wk-upsell"><p><Lock aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} /><strong>{lockedCount} of {ordered.length}</strong> are shown in full on Pro. Free shows the {entitlements.limits.findingsVisible} lowest-value findings.</p><button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={() => setUpgradeOpen(true)}>See Pro</button></div> : null}
    </div>
    <div className="wk-grid-foot"><span>{matching.length} of {all.length} {plural(all.length, 'finding')}</span><span>{decided} reviewed · {formatCurrency(l.awaitingDecision)} supported and waiting on you</span></div>
    <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="Pro shows every finding in full, with its vendor and invoices." />
  </>
}
