import { useEffect, useState } from 'react'
import { ArrowRight, Search, SlidersHorizontal } from 'lucide-react'
import { formatCurrency, plural } from '@/lib/format'
import { DECISION_LABEL, type DecisionValue } from '@/ledger/caseState'
import type { LedgerEnvironment } from '@/ledger/store'
import { ladder, opportunities, type Opportunity } from '../selectors'
import { lockedSummary } from '../planGates'
import { Locked } from '@/components/plan/Locked'
import { Strength } from './Strength'

interface FindingsProps {
  env: LedgerEnvironment
  visible: Set<string>
  onOpenCase: (findingId: string) => void
}
type Category = 'all' | 'recoverable' | 'review' | 'opportunity'
type Status = 'all' | 'unreviewed' | DecisionValue
type Sort = 'priority' | 'amount-desc' | 'amount-asc' | 'vendor'
const categories: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'All findings' },
  { id: 'recoverable', label: 'Ready to recover' },
  { id: 'review', label: 'Needs review' },
  { id: 'opportunity', label: 'Prevention' },
]
const categoryValues: Category[] = ['all', 'recoverable', 'review', 'opportunity']
const statusValues: Status[] = ['all', 'unreviewed', 'confirmed', 'needs_info', 'expected']
const sortValues: Sort[] = ['priority', 'amount-desc', 'amount-asc', 'vendor']
function initial<T extends string>(key: string, allowed: T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(key) as T | null
  return value && allowed.includes(value) ? value : fallback
}

export function Findings({ env, visible, onOpenCase }: FindingsProps) {
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
  const locked = lockedSummary(all.map((o) => o.finding), visible)
  const normalizedQuery = query.trim().toLowerCase()
  const matching = all.filter((o) => {
    if (category !== 'all' && o.finding.class !== category) return false
    if (status === 'unreviewed' && o.state.decision !== null) return false
    if (status !== 'all' && status !== 'unreviewed' && o.state.decision !== status) return false
    if (normalizedQuery && !`${o.finding.vendor} ${o.finding.title} ${o.typeLabel} ${o.finding.id}`.toLowerCase().includes(normalizedQuery)) return false
    return true
  })
  const ordered = [...matching].sort((a, b) => {
    if (sort === 'amount-desc') return b.finding.dollarImpact - a.finding.dollarImpact
    if (sort === 'amount-asc') return a.finding.dollarImpact - b.finding.dollarImpact
    if (sort === 'vendor') return a.finding.vendor.localeCompare(b.finding.vendor)
    return b.priority - a.priority
  })
  const rows = ordered.filter((o) => visible.has(o.finding.id))
  const lockedRows = ordered.filter((o) => !visible.has(o.finding.id))
  const decided = all.filter((o) => visible.has(o.finding.id) && o.state.decision !== null).length

  function row(o: Opportunity, interactive: boolean) {
    const content = <><span className="wk-finding-name"><strong>{o.typeLabel}</strong><small>{o.finding.title}</small></span><span className="wk-finding-vendor">{o.finding.vendor}</span><span className="wk-finding-state">{o.state.decision ? <span className="wk-mark" data-tone={o.state.decision === 'confirmed' ? 'strong' : 'quiet'}>{DECISION_LABEL[o.state.decision]}</span> : <Strength level={o.evidence} />}</span><span className="wk-finding-amount">{formatCurrency(o.finding.dollarImpact)}</span>{interactive ? <ArrowRight aria-hidden="true" /> : null}</>
    return interactive ? <button type="button" className="wk-finding-row" key={o.finding.id} onClick={() => onOpenCase(o.finding.id)} aria-label={`${o.typeLabel}, ${o.finding.vendor}, ${formatCurrency(o.finding.dollarImpact)}`}>{content}</button> : <div className="wk-finding-row" key={o.finding.id}>{content}</div>
  }

  if (!all.length) return <div className="wk-empty"><span className="wk-label">Nothing flagged</span><p>Every check ran against this ledger and found nothing worth your time.</p></div>

  return <>
    <div className="wk-finding-tabs" role="tablist" aria-label="Finding category">{categories.map(({ id, label }) => <button type="button" role="tab" aria-selected={category === id} key={id} onClick={() => setCategory(id)}>{label}<span>{id === 'all' ? all.length : all.filter((o) => o.finding.class === id).length}</span></button>)}</div>
    <div className="wk-finding-toolbar"><label className="wk-finding-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search findings..." aria-label="Search findings" /></label><label className="wk-finding-select"><SlidersHorizontal aria-hidden="true" /><span className="wk-sr-only">Filter by decision</span><select value={status} onChange={(event) => setStatus(event.target.value as Status)}><option value="all">All decisions</option><option value="unreviewed">Not reviewed</option><option value="confirmed">Confirmed</option><option value="needs_info">Needs information</option><option value="expected">Expected</option></select></label><label className="wk-finding-select wk-finding-sort"><span className="wk-sr-only">Sort findings</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="priority">Priority</option><option value="amount-desc">Amount: high to low</option><option value="amount-asc">Amount: low to high</option><option value="vendor">Vendor</option></select></label></div>
    <div className="wk-finding-queue" aria-label="Finding results"><div className="wk-finding-row-head"><span>Finding</span><span>Vendor</span><span>Evidence / decision</span><span>Amount</span><span /></div>{rows.map((o) => row(o, true))}{rows.length === 0 ? <div className="wk-finding-empty">{lockedRows.length ? 'Matching findings are available on Pro.' : 'No findings match these filters.'}</div> : null}</div>
    <div className="wk-finding-foot"><span>{matching.length} of {all.length} findings</span><span>{decided} reviewed · {formatCurrency(l.awaitingDecision)} waiting on you</span></div>
    {lockedRows.length ? <Locked title={`${locked.count} larger ${plural(locked.count, 'finding')} worth ${formatCurrency(locked.value)} are part of Pro`} note="Free shows the lowest-value findings in full."><div className="wk-finding-queue">{lockedRows.slice(0, 5).map((o) => row(o, false))}</div></Locked> : null}
  </>
}
