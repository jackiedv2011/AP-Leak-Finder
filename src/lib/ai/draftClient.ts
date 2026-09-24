import type { CaseState, RecoveryMethod } from '@/ledger/caseState'
import type { Finding } from '@/types'
import { FINDING_TYPE_LABELS } from '@/lib/labels'
import { evidenceOf } from '@/workspace/selectors'
import type { SenderProfile } from '@/lib/senderProfile'

/**
 * Exactly what the AI drafting endpoint is told about a case — and nothing
 * else. Built here, in one place, so it is auditable: no free-text search
 * over the ledger, no other vendors, no account data beyond the sign-off.
 */
export interface DraftRequest {
  vendor: string
  findingType: string
  findingTitle: string
  explanation: string
  evidenceStrength: string
  amountFlagged: number
  amountRequested: number
  method: RecoveryMethod
  recoveryStage: CaseState['recoveryStage']
  /** The exact ledger rows behind the finding — the only "evidence" the model may cite. */
  rows: Array<{
    invoiceNumber: string | null
    invoiceDate: string | null
    paymentDate: string
    invoiceAmount: number | null
    amountPaid: number
    terms: string | null
  }>
  /** Anything the reviewer typed to steer the draft, e.g. "we have a good relationship, keep it warm". */
  userContext: string
  sender: SenderProfile
}

export interface DraftResponse {
  subject: string
  body: string
}

export function buildDraftRequest(
  finding: Finding,
  state: CaseState,
  options: { amountRequested: number; method: RecoveryMethod; userContext: string; sender: SenderProfile }
): DraftRequest {
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return {
    vendor: finding.vendor,
    findingType: FINDING_TYPE_LABELS[finding.type] ?? finding.type,
    findingTitle: finding.title,
    explanation: finding.explanation,
    evidenceStrength: evidenceOf(finding),
    amountFlagged: finding.dollarImpact,
    amountRequested: options.amountRequested,
    method: options.method,
    recoveryStage: state.recoveryStage,
    rows: finding.relatedRecords.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      invoiceDate: iso(r.invoiceDate),
      paymentDate: iso(r.paymentDate)!,
      invoiceAmount: r.invoiceAmount,
      amountPaid: r.amountPaid,
      terms: r.terms,
    })),
    userContext: options.userContext,
    sender: options.sender,
  }
}

export class DraftUnavailableError extends Error {}

/** Ask the server to draft the letter. The server holds the API key; the browser never sees it. */
export async function requestAiDraft(request: DraftRequest, fetchImpl: typeof fetch = fetch): Promise<DraftResponse> {
  const response = await fetchImpl('/api/ai/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(request),
  })
  if (response.status === 503) throw new DraftUnavailableError('AI drafting is not configured on this server.')
  if (!response.ok) throw new Error(`Drafting failed (${response.status}).`)
  const data = (await response.json()) as Partial<DraftResponse>
  if (typeof data.subject !== 'string' || typeof data.body !== 'string') throw new Error('The draft came back malformed.')
  return { subject: data.subject, body: data.body }
}
