import { formatCurrency } from '@/lib/format'
import type { SenderProfile } from '@/lib/senderProfile'
import type { CaseState, RecoveryMethod } from '@/ledger/caseState'
import { verifiedReturned } from '@/recovery/financials'
import type { Finding } from '@/types'

const longDate = (ts: number) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(ts))

const ASK: Record<RecoveryMethod, string> = {
  refund: 'when we can expect the refund',
  credit: 'when the credit will be applied to our account',
  offset: 'whether we can apply the credit against our next payment to you',
}

/**
 * A short, polite follow-up on a request that has had no reply: what was
 * asked, when, and one question. It states only facts already on the case
 * (the amount still open, the date of the last email) and quotes the
 * original request so the vendor doesn't have to search for it. The customer
 * reads and edits it before anything is sent.
 */
export function generateFollowUp(finding: Finding, state: CaseState, sender: SenderProfile, lastOutreachAt: number): { subject: string; body: string } {
  const originalSubject = state.recoverySubject?.trim() || finding.title
  const subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`
  const requested = state.requestedAmount ?? finding.dollarImpact
  const open = Math.max(0, Math.round(requested * 100) - Math.round(verifiedReturned(state) * 100)) / 100
  const method = state.requestedResolution ?? 'refund'
  const followUps = state.recoveryFollowUps?.length ?? 0
  const amountLine = open < requested
    ? `Thank you for what has come back so far. ${formatCurrency(open)} of the ${formatCurrency(requested)} we asked for is still open.`
    : `We asked for ${formatCurrency(requested)} back on our account with ${finding.vendor}.`
  const signOff = [sender.senderName || 'Accounts Payable Team', sender.businessName].filter(Boolean)
  const lines = [
    'Hello,',
    '',
    `I'm following up on my email of ${longDate(lastOutreachAt)} about ${finding.title.charAt(0).toLowerCase()}${finding.title.slice(1)}. ${amountLine}`,
    '',
    followUps === 0
      ? `Could you let me know ${ASK[method]}, or whether you need anything else from us to process it?`
      : `I haven't been able to find a reply yet. Could you let me know ${ASK[method]}, or point me to the right person if this should go to someone else?`,
    '',
    'Thank you,',
    ...signOff,
  ]
  const original = state.recoveryDraft?.trim()
  if (original) {
    lines.push('', `On ${longDate(state.recoverySentEmail?.sentAt ?? state.recoveryRequestedAt ?? lastOutreachAt)}, I wrote:`, ...original.split('\n').map((l) => `> ${l}`))
  }
  return { subject, body: lines.join('\n') }
}
