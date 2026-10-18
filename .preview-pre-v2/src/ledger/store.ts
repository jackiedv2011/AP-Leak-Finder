import type { APRecord, DetectionResult, ParseResult } from '@/types'
import { detectFindings } from '@/lib/detection'
import { EMPTY_CASE_STATE, normalizeCaseState, type CaseState } from '@/ledger/caseState'

export interface ImportBatch {
  id: string
  sourceLabel: string
  mode: 'sample' | 'upload'
  importedAt: number
  recordCount: number
  skippedCount: number
  /** Recognized source columns, retained so coverage remains explainable after reload. */
  detectedColumns?: string[]
  /** Findings first surfaced by this scan, retained independently of the new-badge lifecycle. */
  findingIds?: string[]
}

/**
 * The standing ledger. One instance persists for the life of the product —
 * imports merge into it, cases persist across those merges, and it is the
 * single source of truth every lens (Overview / Findings / Recovery) reads.
 */
export interface LedgerEnvironment {
  records: APRecord[]
  imports: ImportBatch[]
  result: DetectionResult
  /** Keyed by finding id. Stable because finding ids are derived from stable record ids. */
  caseStates: Record<string, CaseState>
  /** Finding ids introduced by the most recent import, not yet acknowledged by viewing Findings. */
  newFindingIds: string[]
  createdAt: number
  updatedAt: number
  nextRecordSeq: number
}

const STORAGE_KEY = 'reclaim.ledger.v1'

function reviveRecord(raw: Record<string, unknown>): APRecord {
  return {
    ...raw,
    paymentDate: new Date(raw.paymentDate as string),
    invoiceDate: raw.invoiceDate ? new Date(raw.invoiceDate as string) : null,
  } as APRecord
}

export function serializeEnvironment(env: LedgerEnvironment): string {
  return JSON.stringify(env)
}

export function deserializeEnvironment(json: string): LedgerEnvironment {
  const parsed = JSON.parse(json)
  const records = (parsed.records as Record<string, unknown>[]).map(reviveRecord)
  const recordsById = new Map(records.map((r) => [r.id, r]))
  return {
    ...parsed,
    records,
    caseStates: Object.fromEntries(
      Object.entries(parsed.caseStates ?? {}).map(([id, state]) => [id, normalizeCaseState(state as CaseState)])
    ),
    result: {
      ...parsed.result,
      findings: (parsed.result.findings as Array<Record<string, unknown>>).map((f) => ({
        ...f,
        // Re-link to the revived record objects (with real Date instances) instead of
        // the plain JSON clones nested inside the serialized finding.
        relatedRecords: (f.relatedRecords as Array<{ id: string }>).map((r) => recordsById.get(r.id) ?? reviveRecord(r as Record<string, unknown>)),
      })),
    },
  }
}

export function loadEnvironment(): LedgerEnvironment | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return deserializeEnvironment(raw)
  } catch {
    return null
  }
}

export function saveEnvironment(env: LedgerEnvironment): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeEnvironment(env))
  } catch {
    // Storage full or unavailable — the environment still works for this tab, it just won't persist.
  }
}

export function clearEnvironment(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function createEmptyEnvironment(): LedgerEnvironment {
  const now = Date.now()
  return {
    records: [],
    imports: [],
    result: { findings: [], recoverableTotal: 0, reviewTotal: 0, opportunityTotal: 0 },
    caseStates: {},
    newFindingIds: [],
    createdAt: now,
    updatedAt: now,
    nextRecordSeq: 0,
  }
}

export interface MergeImportInput {
  sourceLabel: string
  mode: 'sample' | 'upload'
  parsed: ParseResult
}

/**
 * Merge newly parsed records into the environment, creating it if this is
 * the first import. Assigns stable global ids, re-runs detection over the
 * full accumulated record set, and tracks which findings are new — this is
 * the one place record/finding identity is minted, so it's the one place
 * that has to guarantee stability across every future merge.
 */
export function mergeImport(env: LedgerEnvironment | null, input: MergeImportInput): LedgerEnvironment {
  const base = env ?? createEmptyEnvironment()
  const batchId = `batch_${base.imports.length + 1}_${Date.now()}`
  let seq = base.nextRecordSeq

  const newRecords: APRecord[] = input.parsed.records.map((r) => ({
    ...r,
    id: `rec_${seq++}`,
    importBatchId: batchId,
  }))

  const allRecords = [...base.records, ...newRecords]
  const result = detectFindings(allRecords)

  const previousFindingIds = new Set(base.result.findings.map((f) => f.id))
  const newFindingIds = result.findings.filter((f) => !previousFindingIds.has(f.id)).map((f) => f.id)

  const batch: ImportBatch = {
    id: batchId,
    sourceLabel: input.sourceLabel,
    mode: input.mode,
    importedAt: Date.now(),
    recordCount: newRecords.length,
    skippedCount: input.parsed.skippedCount,
    detectedColumns: [...input.parsed.detectedColumns],
    findingIds: newFindingIds,
  }

  return {
    records: allRecords,
    imports: [...base.imports, batch],
    result,
    // Finding ids are stable across a merge as long as the same records
    // produced them, so existing case decisions stay attached to the right case.
    caseStates: base.caseStates,
    newFindingIds,
    createdAt: base.createdAt,
    updatedAt: Date.now(),
    nextRecordSeq: seq,
  }
}

export function getCaseState(env: LedgerEnvironment, findingId: string): CaseState {
  return env.caseStates[findingId] ?? EMPTY_CASE_STATE
}

export function setCaseState(env: LedgerEnvironment, findingId: string, state: CaseState): LedgerEnvironment {
  return { ...env, caseStates: { ...env.caseStates, [findingId]: state }, updatedAt: Date.now() }
}

/** Viewing the Findings queue counts as having seen what's new. */
export function acknowledgeNewFindings(env: LedgerEnvironment): LedgerEnvironment {
  if (env.newFindingIds.length === 0) return env
  return { ...env, newFindingIds: [] }
}
