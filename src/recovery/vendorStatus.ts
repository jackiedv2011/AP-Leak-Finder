import type { CaseState, VendorUpdate, VendorUpdateStatus } from '@/ledger/caseState'

/**
 * Everything the app knows about each kind of vendor reply, in one place.
 * Before this table the same status lists were repeated in the engine, the
 * dashboard figures and the case page; adding a status meant finding them all.
 */
export interface VendorStatusInfo {
  /** How the customer describes what happened, in the reply form and the log. */
  label: string
  /** The case status it produces, or null when it leaves the case "Waiting on vendor". */
  caseStatus: string | null
  /** False for our own chasing ("follow-up sent", "no response"), which says nothing about the vendor's position. */
  progress: boolean
  /** The vendor has agreed some money is owed. Never settled value. */
  agreed: boolean
  /** Agreed and on its way (promise, issued credit, reported refund) until a settlement proves it. */
  pending: boolean
  /** The reply needs a person to look before the next reminder is useful. */
  clearsFollowUp: boolean
  /** The case needs the customer's action because of this reply. */
  needsAction: boolean
  /** Whether a dollar figure must, may or cannot accompany the reply. */
  amount: 'required' | 'optional' | 'none'
}

export const VENDOR_STATUS: Record<VendorUpdateStatus, VendorStatusInfo> = {
  acknowledged: { label: 'Acknowledged the request', caseStatus: null, progress: true, agreed: false, pending: false, clearsFollowUp: false, needsAction: false, amount: 'none' },
  accepted: { label: 'Accepted the claim', caseStatus: 'Claim accepted', progress: true, agreed: true, pending: false, clearsFollowUp: false, needsAction: false, amount: 'optional' },
  partial_acceptance: { label: 'Accepted part of the claim', caseStatus: 'Partially accepted', progress: true, agreed: true, pending: false, clearsFollowUp: true, needsAction: true, amount: 'required' },
  promised: { label: 'Promised a refund or credit', caseStatus: 'Return promised', progress: true, agreed: true, pending: true, clearsFollowUp: false, needsAction: false, amount: 'optional' },
  credit_issued: { label: 'Issued a credit, not yet applied', caseStatus: 'Credit issued, unapplied', progress: true, agreed: true, pending: true, clearsFollowUp: false, needsAction: true, amount: 'optional' },
  already_refunded: { label: 'Says a refund was sent', caseStatus: 'Refund reported, verify', progress: true, agreed: true, pending: true, clearsFollowUp: true, needsAction: true, amount: 'optional' },
  needs_documents: { label: 'Asked for documents', caseStatus: 'Documents requested', progress: true, agreed: false, pending: false, clearsFollowUp: true, needsAction: true, amount: 'none' },
  disputed: { label: 'Disputed the claim', caseStatus: 'Vendor disputed', progress: true, agreed: false, pending: false, clearsFollowUp: true, needsAction: true, amount: 'none' },
  payment_not_found: { label: 'Cannot find the payment', caseStatus: 'Payment not found', progress: true, agreed: false, pending: false, clearsFollowUp: true, needsAction: true, amount: 'none' },
  no_action_required: { label: 'Says nothing is owed', caseStatus: 'Vendor says resolved', progress: true, agreed: false, pending: false, clearsFollowUp: true, needsAction: true, amount: 'none' },
  wrong_contact: { label: 'Wrong contact', caseStatus: 'Wrong contact', progress: true, agreed: false, pending: false, clearsFollowUp: true, needsAction: true, amount: 'none' },
  followed_up: { label: 'I sent a follow-up', caseStatus: null, progress: false, agreed: false, pending: false, clearsFollowUp: false, needsAction: false, amount: 'none' },
  no_response: { label: 'No response yet', caseStatus: null, progress: false, agreed: false, pending: false, clearsFollowUp: false, needsAction: false, amount: 'none' },
}

/** The order the reply form offers them in: the common outcomes first. */
export const VENDOR_STATUS_ORDER: VendorUpdateStatus[] = [
  'acknowledged', 'accepted', 'partial_acceptance', 'promised', 'credit_issued', 'already_refunded',
  'needs_documents', 'disputed', 'payment_not_found', 'no_action_required', 'wrong_contact', 'followed_up', 'no_response',
]

/** The vendor's latest real position, ignoring our own reminders. */
export function latestVendorPosition(state: CaseState): VendorUpdate | undefined {
  return [...(state.vendorUpdates ?? [])].reverse().find((update) => VENDOR_STATUS[update.status].progress)
}
