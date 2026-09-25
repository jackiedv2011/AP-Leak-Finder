import type { APRecord, DetectionResult, ParseResult, Finding, ImportRowResult } from '@/types'
import { detectFindings } from '@/lib/detection'
import { EMPTY_CASE_STATE, normalizeCaseState, type CaseState } from '@/ledger/caseState'
import { checksum, recordIdentity, sourceSignature, normalizeReference } from '@/lib/sourceIdentity'
import { normalizeVendor } from '@/lib/format'
import { reviewMetadata } from '@/lib/findingMetadata'
import { evaluateEligibility, type RecoveryEvidence } from '@/recovery/eligibility'

export interface ImportBatch {
  schemaVersion?: 2
  fileChecksum?: string
  rowResults?: ImportRowResult[]
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
  schemaVersion?: 2
  historicalFindings?: Finding[]
  migration?: { fromVersion: number; at: number; limitations: string[] }
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
    source: raw.source ?? {
      schemaVersion: 2, rawAvailable: false, raw: null,
      parsed: { vendor: raw.vendor, invoiceReference: raw.invoiceNumber, amountPaid: raw.amountPaid, paymentDate: raw.paymentDate },
      normalized: { vendor: normalizeVendor(String(raw.vendor ?? '')), invoiceReference: normalizeReference(raw.invoiceNumber as string | null).value },
      transformations: {}, filename: null, rowNumber: Number(raw.rowIndex ?? 0) + 2, batchId: raw.importBatchId,
    },
  } as APRecord
}

/**
 * Findings reference their rows by id only: the rows are already in
 * `records`, and embedding full copies roughly doubled what a large ledger
 * wrote to storage. deserializeEnvironment re-links them (and still accepts
 * the older, embedded form).
 */
export function serializeEnvironment(env: LedgerEnvironment): string {
  return JSON.stringify({
    ...env,
    result: {
      ...env.result,
      findings: env.result.findings.map((f) => ({ ...f, relatedRecords: f.relatedRecords.map((r) => ({ id: r.id })) })),
    },
  })
}

export function deserializeEnvironment(json: string): LedgerEnvironment {
  const parsed = JSON.parse(json)
  const records = (parsed.records as Record<string, unknown>[]).map(reviveRecord)
  const recordsById = new Map(records.map((r) => [r.id, r]))
  const env = {
    ...parsed,
    records,
    historicalFindings: (parsed.historicalFindings ?? []).map((f: Finding) => ({ ...f, relatedRecords: f.relatedRecords.map(r=>reviveRecord(r as unknown as Record<string,unknown>)) })),
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
  } as LedgerEnvironment
  if (parsed.schemaVersion !== 2) {
    env.schemaVersion = 2
    env.historicalFindings = [...(env.historicalFindings ?? []), ...env.result.findings]
    env.migration = { fromVersion: Number(parsed.schemaVersion ?? 1), at: Date.now(), limitations: ['Raw CSV values, transaction identity, currency and settlement evidence were not recorded by earlier versions. No missing facts have been inferred.'] }
    env.result.findings = env.result.findings.map(f => {
      const state = env.caseStates[f.id]
      if (state && ['confirmed','requested'].includes(state.recoveryStage ?? '')) env.caseStates[f.id] = { ...state, requiresRevalidation: true }
      return reviewMetadata(f, env.createdAt)
    })
    env.result.recoverableTotal = 0
    env.result.reviewTotal = env.result.findings.filter(f=>f.class==='review').reduce((s,f)=>s+f.dollarImpact,0)
    env.result.opportunityTotal = env.result.findings.filter(f=>f.class==='opportunity').reduce((s,f)=>s+f.dollarImpact,0)
  }
  return env
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
    schemaVersion: 2,
    historicalFindings: [],
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

export function inspectImport(env: LedgerEnvironment | null, input: MergeImportInput) {
  const fileChecksum = input.parsed.fileChecksum ?? checksum(input.parsed.records.map(sourceSignature).join('\n'))
  const duplicateFile = Boolean(env?.imports.some(batch=>batch.fileChecksum === fileChecksum))
  const known = new Map((env?.records ?? []).map(r=>[r.identityKey ?? recordIdentity(r),r]))
  const accepted: APRecord[] = []
  const rowResults: ImportRowResult[] = [...(input.parsed.rowResults ?? [])]
  for(const record of input.parsed.records) {
    const key = record.identityKey ?? recordIdentity(record)
    const previous = known.get(key)
    const raw = record.source?.raw ?? null
    const fingerprint = record.rowFingerprint ?? checksum(key)
    const missing = !record.externalTransactionId && !record.invoiceNumber
    const status = previous ? record.externalTransactionId && sourceSignature(previous)===sourceSignature(record) ? 'exact_duplicate' : 'possible_overlap' : missing ? 'missing_identification_fields' : 'newly_imported'
    rowResults.push({ rowNumber: record.source?.rowNumber ?? record.rowIndex+2, status, reason: previous ? status==='exact_duplicate' ? 'This external transaction was already imported.' : 'Possible overlap or conflicting source identity. Row retained in this receipt; obtain distinct transaction IDs before importing it as another payment.' : missing ? 'No external transaction ID or invoice reference; payment identity needs confirmation.' : 'New source record.', raw, fingerprint, ...(previous ? {existingRecordId:previous.id} : {}) })
    if(!previous) { const identified:APRecord={...record,identityKey:key,rowFingerprint:fingerprint,importStatus:status}; accepted.push(identified); known.set(key,identified) }
  }
  return { fileChecksum, duplicateFile, accepted, rowResults: rowResults.sort((a,b)=>a.rowNumber-b.rowNumber) }
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
  const inspection = inspectImport(base,input)
  if(inspection.duplicateFile) return base
  const batchId = `batch_${inspection.fileChecksum}`
  let seq = base.nextRecordSeq

  const newRecords: APRecord[] = inspection.accepted.map((r) => ({
    ...r,
    id: `rec_${seq++}`,
    importBatchId: batchId,
    ...(r.source ? {source:{...r.source,filename:input.sourceLabel,batchId}} : {}),
  }))

  const allRecords = [...base.records, ...newRecords]
  const result = detectFindings(allRecords)
  const oldById = new Map(base.result.findings.map(f=>[f.id,f]))
  const revised: Finding[] = []
  const caseStates = { ...base.caseStates }
  result.findings = result.findings.map(f=> {
    const previous = oldById.get(f.id)
    if (!previous) return f
    const changed = previous.relatedRecords.map(r=>r.id).sort().join('|') !== f.relatedRecords.map(r=>r.id).sort().join('|')
    if(changed) {
      revised.push(previous)
      const state=caseStates[f.id]
      if(state) caseStates[f.id]={...state,requiresRevalidation:true,approvedAt:null}
    }
    const current={ ...f, createdAt: previous.createdAt, evidence: previous.evidence, customerDecision: previous.customerDecision }
    const gate=evaluateEligibility(current,current.evidence,base.result.findings)
    return gate.eligible ? {...current,...gate,classification:'recovery_candidate',class:'recoverable'} : {...current,...gate,requiresRevalidation:changed||previous.requiresRevalidation}
  })
  // Keep findings with decisions/recovery history visible even when new rows supersede the rule result.
  const currentIds=new Set(result.findings.map(f=>f.id))
  const superseded=base.result.findings.filter(f=>!currentIds.has(f.id))
  for(const old of superseded) if(base.caseStates[old.id]) result.findings.push({ ...old, requiresRevalidation:true, potentialAmountMinor:null, classification:'review_needed', class:'review', suppressionReason:'Source records changed after this finding. Revalidate the evidence against the current ledger.' })

  const previousFindingIds = new Set(base.result.findings.map((f) => f.id))
  const newFindingIds = result.findings.filter((f) => !previousFindingIds.has(f.id)).map((f) => f.id)

  const batch: ImportBatch = {
    schemaVersion: 2,
    fileChecksum: inspection.fileChecksum,
    rowResults: inspection.rowResults,
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
    ...base,
    schemaVersion: 2,
    historicalFindings: [...(base.historicalFindings ?? []), ...superseded, ...revised],
    records: allRecords,
    imports: [...base.imports, batch],
    result,
    // Finding ids are stable across a merge as long as the same records
    // produced them, so existing case decisions stay attached to the right case.
    caseStates,
    newFindingIds,
    createdAt: base.createdAt,
    updatedAt: Date.now(),
    nextRecordSeq: seq,
  }
}

export function recordEvidence(env: LedgerEnvironment, findingId: string, evidence: RecoveryEvidence): LedgerEnvironment {
  const original = env.result.findings.find(f=>f.id===findingId)
  if (!original) throw new Error('Finding no longer exists.')
  const finding = { ...original, evidence, contradictoryEvidence: [] }
  const gate = evaluateEligibility(finding,evidence,env.result.findings)
  const classification = gate.eligible ? 'recovery_candidate' : original.type==='bank_account_change' ? 'preventive_security' : ['unclaimed_discount','missed_discount'].includes(original.type) ? 'future_savings' : 'review_needed'
  const updated: Finding = { ...finding, ...gate, classification, class: gate.eligible ? 'recoverable' : classification==='future_savings' ? 'opportunity' : 'review', requiresRevalidation:!gate.eligible }
  const state=env.caseStates[findingId]
  return { ...env, updatedAt:Date.now(), result:{...env.result,findings:env.result.findings.map(f=>f.id===findingId ? updated : f)}, historicalFindings:[...(env.historicalFindings??[]),original], caseStates:state ? {...env.caseStates,[findingId]:{...state,requiresRevalidation:!gate.eligible,approvedAt:null}} : env.caseStates }
}

export function getCaseState(env: LedgerEnvironment, findingId: string): CaseState {
  const state = env.caseStates[findingId] ?? EMPTY_CASE_STATE
  // Requests sent before amounts were stored used the finding's value on screen.
  // Keep that value so money that actually came back can still be recorded; it
  // never authorizes new outreach, which re-checks the evidence gate.
  if (state.recoveryStage && state.recoveryStage !== 'confirmed' && state.requestedAmount == null) {
    const finding = env.result.findings.find((row) => row.id === findingId)
    if (finding) return { ...state, requestedAmount: finding.flaggedAmount ?? finding.dollarImpact }
  }
  return state
}

export function setCaseState(env: LedgerEnvironment, findingId: string, state: CaseState): LedgerEnvironment {
  return { ...env, result:{...env.result,findings:env.result.findings.map(f=>f.id===findingId?{...f,customerDecision:state.decision}:f)}, caseStates: { ...env.caseStates, [findingId]: state }, updatedAt: Date.now() }
}

/** Viewing the Findings queue counts as having seen what's new. */
export function acknowledgeNewFindings(env: LedgerEnvironment): LedgerEnvironment {
  if (env.newFindingIds.length === 0) return env
  return { ...env, newFindingIds: [] }
}
