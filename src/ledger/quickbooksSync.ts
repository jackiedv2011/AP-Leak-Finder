import type { APRecord, ImportRowResult, ParseResult } from '@/types'
import { checksum, recordIdentity, sourceSignature } from '@/lib/sourceIdentity'
import { plural } from '@/lib/format'
import type { QuickBooksFacts, QuickBooksTxnRef, QuickBooksVendorActivity } from '../../server/quickbooksFacts.ts'
import { createEmptyEnvironment, mergeImport, rebuildLedger, type ImportBatch, type LedgerEnvironment, type MergeImportInput } from './store'

/**
 * Importing from QuickBooks into an audit that already has that company's
 * payments. QuickBooks names every payment (`qbo:BillPayment:<id>`,
 * `qbo:Purchase:<id>`), so a second import is a sync, not another upload:
 * new payments are added, changed ones updated in place (keeping their id, so
 * findings and cases stay attached), and voided or deleted ones retired.
 */
export interface QuickBooksSyncSummary {
  /** `first`: nothing from this company was in the audit yet. */
  mode: 'first' | 'full' | 'changes'
  added: number
  changed: number
  /** Voided or deleted in QuickBooks since the last import. */
  removed: number
  /** Already in this audit and unchanged. */
  unchanged: number
}

interface SyncPlan {
  summary: QuickBooksSyncSummary
  added: APRecord[]
  /** Existing record id → the updated record from QuickBooks. */
  changed: Map<string, APRecord>
  removed: APRecord[]
  rowResults: ImportRowResult[]
}

const txnKey = (externalId: string | null | undefined) => {
  const m = externalId?.match(/^qbo:(BillPayment|Purchase):(\d+)(?::\d+)?$/)
  return m ? `${m[1]}:${m[2]}` : null
}

/** The QuickBooks searches of this company that the audit already holds, newest first. */
function companyBatches(env: LedgerEnvironment, facts: QuickBooksFacts) {
  return env.imports
    .filter((b) => b.quickbooks && (b.quickbooks.sync?.realmId && facts.sync?.realmId ? b.quickbooks.sync.realmId === facts.sync.realmId : b.quickbooks.companyName === facts.companyName))
    .sort((a, b) => b.quickbooks!.pulledAt - a.quickbooks!.pulledAt)
}

/** This company's QuickBooks payments already in the audit, by transaction id. */
function existingPayments(env: LedgerEnvironment, facts: QuickBooksFacts): Map<string, APRecord> {
  const batches = new Set(companyBatches(env, facts).map((b) => b.id))
  return new Map(
    env.records
      .filter((r) => txnKey(r.externalTransactionId) && (batches.has(r.importBatchId) || (r.company ?? '') === facts.companyName))
      .map((r) => [r.externalTransactionId!, r])
  )
}

/** When this audit last pulled this company from QuickBooks: the client sends it so the server can ask only for changes. */
export function lastQuickBooksPull(env: LedgerEnvironment | null, companyName: string): number | null {
  if (!env) return null
  return env.imports.filter((b) => b.quickbooks?.companyName === companyName).reduce<number | null>((latest, b) => Math.max(latest ?? 0, b.quickbooks!.pulledAt), null)
}

export function planQuickBooksSync(env: LedgerEnvironment | null, parsed: ParseResult, facts: QuickBooksFacts): SyncPlan {
  const existing = env ? existingPayments(env, facts) : new Map<string, APRecord>()
  const mode: QuickBooksSyncSummary['mode'] = existing.size === 0 ? 'first' : facts.sync?.mode === 'changes' ? 'changes' : 'full'
  const added: APRecord[] = []
  const changed = new Map<string, APRecord>()
  const seen = new Set<string>()
  const rowResults: ImportRowResult[] = [...(parsed.rowResults ?? [])]
  let unchanged = 0
  for (const incoming of parsed.records) {
    const id = incoming.externalTransactionId
    const fact = id ? facts.payments[id] : undefined
    const record: APRecord = fact ? { ...incoming, quickbooks: fact } : incoming
    const previous = id ? existing.get(id) : undefined
    const row = { rowNumber: incoming.source?.rowNumber ?? incoming.rowIndex + 2, raw: incoming.source?.raw ?? null, fingerprint: checksum(recordIdentity(record)) }
    if (!previous || seen.has(id!)) {
      added.push(record)
      rowResults.push({ ...row, status: 'newly_imported', reason: 'New in QuickBooks.' })
      continue
    }
    seen.add(id!)
    if (sourceSignature(previous) !== sourceSignature(record) || JSON.stringify(previous.quickbooks ?? null) !== JSON.stringify(fact ?? null)) {
      changed.set(previous.id, record)
      rowResults.push({ ...row, status: 'newly_imported', reason: 'Changed in QuickBooks; the record in this audit was updated.', existingRecordId: previous.id })
    } else {
      unchanged += 1
      rowResults.push({ ...row, status: 'exact_duplicate', reason: 'Already in this audit, unchanged.', existingRecordId: previous.id })
    }
  }

  // A full pull is the whole ledger: a payment it no longer has was voided or deleted.
  // A change pull only speaks for the transactions it mentions.
  const touched = new Set(facts.sync?.touched ?? [])
  const removed = [...existing.values()].filter((r) => !seen.has(r.externalTransactionId!) && (mode === 'full' || (mode === 'changes' && touched.has(txnKey(r.externalTransactionId)!))))
  if (mode === 'changes') unchanged += existing.size - seen.size - removed.length
  rowResults.sort((a, b) => a.rowNumber - b.rowNumber)
  return { summary: { mode, added: added.length, changed: changed.size, removed: removed.length, unchanged }, added, changed, removed, rowResults }
}

/** The vendor searches after this import: a change pull extends the last full picture instead of replacing it. */
function mergedSearches(env: LedgerEnvironment, facts: QuickBooksFacts): Omit<QuickBooksFacts, 'payments'> {
  const { payments: _payments, ...current } = facts
  const sync = facts.sync ? { ...facts.sync, touched: [], removed: [] } : undefined
  const previous = companyBatches(env, facts)[0]?.quickbooks
  if (facts.sync?.mode !== 'changes' || !previous) return { ...current, ...(sync ? { sync } : {}) }
  const touched = new Set(facts.sync.touched)
  const key = (t: QuickBooksTxnRef) => `${t.txnType}:${t.id}`
  const vendors: Record<string, QuickBooksVendorActivity> = {}
  for (const id of new Set([...Object.keys(previous.vendors), ...Object.keys(facts.vendors)])) {
    const before = previous.vendors[id] ?? { credits: [], refunds: [], voided: [] }
    const now = facts.vendors[id] ?? { credits: [], refunds: [], voided: [] }
    vendors[id] = {
      credits: [...before.credits.filter((t) => !touched.has(key(t))), ...now.credits],
      refunds: [...before.refunds.filter((t) => !touched.has(key(t))), ...now.refunds],
      voided: [...before.voided.filter((t) => !touched.has(key(t))), ...now.voided],
    }
  }
  const sum = (k: keyof QuickBooksFacts['searched']) => previous.searched[k] + facts.searched[k]
  return { ...current, vendors, searched: { vendorCredits: sum('vendorCredits'), deposits: sum('deposits'), purchases: sum('purchases'), billPayments: sum('billPayments') }, ...(sync ? { sync } : {}) }
}

/**
 * Applies a QuickBooks import to an audit. Returns the audit unchanged (and
 * the summary) when QuickBooks has nothing new for it.
 */
export function mergeQuickBooksSync(env: LedgerEnvironment | null, input: MergeImportInput & { quickbooks: QuickBooksFacts }): { env: LedgerEnvironment; summary: QuickBooksSyncSummary } {
  const plan = planQuickBooksSync(env, input.parsed, input.quickbooks)
  if (plan.summary.mode === 'first') {
    const next = mergeImport(env, input)
    const last = next.imports.at(-1)
    if (last && last !== env?.imports.at(-1)) last.quickbooksSync = plan.summary
    return { env: next, summary: plan.summary }
  }
  const base = env ?? createEmptyEnvironment()
  if (plan.summary.added + plan.summary.changed + plan.summary.removed === 0) return { env: base, summary: plan.summary }

  const facts = input.quickbooks
  const batchId = `batch_${checksum(`${input.parsed.fileChecksum ?? ''}|${facts.pulledAt}`)}`
  const stamp = (r: APRecord): APRecord => ({ ...r, ...(r.source ? { source: { ...r.source, filename: input.sourceLabel, batchId } } : {}) })
  let seq = base.nextRecordSeq
  const added = plan.added.map((r) => {
    const identityKey = recordIdentity(r)
    return { ...stamp(r), id: `rec_${seq++}`, importBatchId: batchId, identityKey, rowFingerprint: checksum(identityKey), importStatus: 'newly_imported' as const }
  })
  const removedIds = new Set(plan.removed.map((r) => r.id))
  const records = base.records
    .filter((r) => !removedIds.has(r.id))
    .map((r) => {
      const update = plan.changed.get(r.id)
      if (!update) return r
      const identityKey = recordIdentity(update)
      // Same record, new values: the id (and so every finding and case) stays.
      return { ...stamp(update), id: r.id, importBatchId: r.importBatchId, identityKey, rowFingerprint: checksum(identityKey), importStatus: r.importStatus ?? 'newly_imported' }
    })

  const batch: Omit<ImportBatch, 'findingIds'> = {
    schemaVersion: 2,
    fileChecksum: `${input.parsed.fileChecksum ?? ''}|${facts.pulledAt}`,
    rowResults: plan.rowResults,
    id: batchId,
    sourceLabel: input.sourceLabel,
    mode: input.mode,
    importedAt: Date.now(),
    recordCount: added.length,
    skippedCount: input.parsed.skippedCount,
    detectedColumns: [...input.parsed.detectedColumns],
    quickbooks: mergedSearches(base, facts),
    quickbooksSync: plan.summary,
  }
  const next = rebuildLedger(base, [...records, ...added], batch, seq, new Set(plan.changed.keys()), plan.removed)
  return { env: next, summary: plan.summary }
}

/** "12 new payments, 1 changed, 30 already in this audit" */
export function describeQuickBooksSync(s: QuickBooksSyncSummary): string {
  if (s.mode === 'first') return `${s.added} ${plural(s.added, 'payment')}, all new to this audit`
  const parts = [`${s.added} new ${plural(s.added, 'payment')}`, `${s.changed} changed`]
  if (s.removed) parts.push(`${s.removed} voided or deleted`)
  parts.push(`${s.unchanged} already in this audit`)
  return parts.join(', ')
}
