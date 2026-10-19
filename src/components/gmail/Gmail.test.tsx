/**
 * Connect, review, edit and send, end to end: the real recovery panel in the
 * browser, a real Reclaim server, and a stand-in for Google that records what
 * would have been sent. Nothing reaches the network.
 */
import { randomBytes } from 'node:crypto'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { startLiveServer, type LiveServer } from '@/test/liveServer'
import { authorizedProject } from '../../../server/testProject.ts'
import { GmailSendError, type GmailClient } from '../../../server/gmail.ts'
import { RecoveryRequestPanel, type RequestPackage } from '@/workspace/views/RecoveryPanels'
import { GmailFollowUp, GmailSettings } from '@/components/gmail/Gmail'
import { updateRecoveryPackage, withHistory, type CaseState } from '@/ledger/caseState'
import { approveRecovery, recordEmailSent, recordFollowUpSent, recordVendorUpdate, setFollowUpAfterDays } from '@/recovery/model'
import { PLAN_LIMITS } from '@/lib/plans'
import type { GmailSendReceipt } from '@/lib/gmailApi'
import type { Finding } from '@/types'

function fakeGmail() {
  const state = { sent: [] as string[], revoked: [] as string[], failNext: null as null | 'rejected' | 'uncertain' }
  const client: GmailClient = {
    authorizationUrl: ({ state: s }) => `https://accounts.google.test/auth?state=${s}`,
    exchangeCode: async () => ({ refreshToken: 'refresh-SECRET', accessToken: 'access-SECRET', email: 'owner@gmail.com', sub: 'sub-1' }),
    accessToken: async () => 'fresh-SECRET',
    send: async (_token, raw) => {
      const fail = state.failNext
      state.failNext = null
      if (fail) throw new GmailSendError('Gmail rejected the message.', fail)
      state.sent.push(raw)
      return { id: `msg-${state.sent.length}`, threadId: 't' }
    },
    revoke: async (t) => {
      state.revoked.push(t)
    },
  }
  return { client, state }
}

let live: LiveServer
let gmail: ReturnType<typeof fakeGmail>
const owner = { firstName: 'Alice', lastName: 'Ng', email: 'alice@example.com', company: 'Ng Co', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', acceptedTerms: true, termsVersion: 't' }

async function signUpAndConnect(connectGmail = true) {
  await live.api('/api/auth/signup', { method: 'POST', json: owner })
  const [mail] = await live.inbox(owner.email)
  await live.api('/api/auth/verify-email', { method: 'POST', json: { token: live.tokenFrom(mail.link) } })
  if (!connectGmail) return
  const start = await live.fetch('/api/integrations/gmail/connect?next=%2Faudit%3Fcase%3Dx')
  const state = new URL(start.headers.get('location')!).searchParams.get('state')
  const back = await live.fetch(`/api/integrations/gmail/callback?code=c&state=${state}`)
  expect(back.headers.get('location')).toBe('/audit?case=x&gmail=connected')
}

/** An evidence-backed case saved on the account, before approval. */
async function savedCase() {
  const { project, findingId } = authorizedProject('p1', { vendor: 'Sierra Coffee Supply', invoice: 'INV-1', amount: 6800, requested: 6800 })
  const env = project.environment as unknown as { records: Array<{ id: string }>; result: { findings: Array<Record<string, unknown>> }; caseStates: Record<string, CaseState> }
  env.caseStates[findingId] = { decision: 'confirmed', reason: null, decidedAt: 1, recoveryStage: 'confirmed' }
  const raw = env.result.findings[0]
  const finding = { ...raw, relatedRecords: env.records } as unknown as Finding
  expect((await live.api('/api/projects/p1', { method: 'PUT', json: project })).status).toBe(200)
  return { project, env, finding, findingId }
}

/** The case page's job, reduced: keep the case state, save it to the server, record a Gmail send. */
function Harness({ finding, initial, save }: { finding: Finding; initial: CaseState; save: (state: CaseState) => Promise<void> }) {
  const [state, setState] = useState(initial)
  const [saved, setSaved] = useState(0)
  const commit = (next: CaseState) => {
    const recorded = withHistory(state, next, 'Alice Ng')
    setState(recorded)
    void save(recorded).then(() => setSaved((n) => n + 1))
  }
  const approve = (pkg: RequestPackage, known: boolean, note: string | null) =>
    commit(approveRecovery(updateRecoveryPackage(state, { subject: pkg.subject, body: pkg.body, recipientEmail: pkg.recipientEmail, requestedResolution: pkg.method, requestedAmount: pkg.requestedAmount }), { knownBeforeReclaim: known, knownBeforeNote: note }))
  const sent = (pkg: RequestPackage, receipt: GmailSendReceipt) => commit(recordEmailSent(state, { channel: 'gmail', ...receipt }, pkg.requestedAmount))
  return (
    <>
      <span data-testid="saves">{saved}</span>
      <span data-testid="stage">{state.recoveryStage}</span>
      <ol data-testid="history">{(state.history ?? []).map((e, i) => <li key={i}>{e.summary} · {e.note}</li>)}</ol>
      {state.recoveryStage === 'confirmed' ? (
        <RecoveryRequestPanel finding={finding} projectId="p1" state={state} sender={{ businessName: 'Ng Co', senderName: 'Alice Ng', senderEmail: 'alice@example.com' }} limits={PLAN_LIMITS.free} onMarkRequested={vi.fn()} onApprove={approve} onEmailSent={sent} onContactHold={vi.fn()} />
      ) : null}
    </>
  )
}

beforeEach(async () => {
  gmail = fakeGmail()
  live = await startLiveServer({ env: { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GMAIL_TOKEN_KEY: randomBytes(32).toString('base64') }, gmail: gmail.client })
  vi.stubGlobal('fetch', live.fetch)
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await live.close()
})

describe('sending a recovery request from Gmail', () => {
  it('Free plan: edit the letter, approve, confirm, and the case is recorded as sent with Gmail’s id', async () => {
    await signUpAndConnect()
    const { project, env, finding, findingId } = await savedCase()
    const save = async (state: CaseState) => {
      env.caseStates[findingId] = state
      await live.api('/api/projects/p1', { method: 'PUT', json: project })
    }
    render(<Harness finding={finding} initial={env.caseStates[findingId]} save={save} />)
    const panel = screen.getByTestId('recovery-request')

    // Free can edit the letter now; AI drafting stays on paid plans.
    const body = within(panel).getByLabelText('Message') as HTMLTextAreaElement
    expect(body).not.toHaveAttribute('readonly')
    expect(within(panel).getByRole('button', { name: 'Draft with AI (paid plans)' })).toBeInTheDocument()
    fireEvent.change(body, { target: { value: `${body.value}\n\nOur AP contact is Alice.` } })
    fireEvent.change(within(panel).getByLabelText('Vendor email'), { target: { value: 'ap@sierra.test' } })

    const send = await within(panel).findByRole('button', { name: 'Send from owner@gmail.com' })
    expect(send).toBeDisabled()
    expect(within(panel).getByText('Approve this version of the request above first.')).toBeInTheDocument()

    fireEvent.click(within(panel).getByLabelText('No, Reclaim surfaced it'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve recovery request' }))
    await waitFor(() => expect(screen.getByTestId('saves')).toHaveTextContent('1'))
    expect(send).toBeEnabled()
    fireEvent.change(within(panel).getByLabelText('Cc (optional)'), { target: { value: 'controller@ng.test' } })

    fireEvent.click(send)
    const confirm = screen.getByTestId('gmail-confirm')
    expect(confirm).toHaveTextContent('Send this request to ap@sierra.test?')
    expect(confirm).toHaveTextContent('from owner@gmail.com to Sierra Coffee Supply at ap@sierra.test, cc controller@ng.test, asking for $6,800.00 as refund')
    expect(gmail.state.sent).toHaveLength(0)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Send $6,800.00 request' }))

    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('requested'))
    expect(gmail.state.sent).toHaveLength(1)
    const mime = Buffer.from(gmail.state.sent[0], 'base64url').toString('utf8')
    expect(mime).toContain('To: ap@sierra.test')
    expect(mime).toContain('Cc: controller@ng.test')
    const text = Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8')
    expect(text).toContain('Our AP contact is Alice.')
    expect(screen.getByTestId('history')).toHaveTextContent('Recovery request sent from Gmail · From owner@gmail.com to ap@sierra.test, cc controller@ng.test. Gmail message ID msg-1')
  })

  it('a refused send leaves the case unsent, and an unconfirmed one needs the Sent folder checked', async () => {
    await signUpAndConnect()
    const { project, env, finding, findingId } = await savedCase()
    const save = async (state: CaseState) => {
      env.caseStates[findingId] = state
      await live.api('/api/projects/p1', { method: 'PUT', json: project })
    }
    render(<Harness finding={finding} initial={env.caseStates[findingId]} save={save} />)
    const panel = screen.getByTestId('recovery-request')
    fireEvent.change(within(panel).getByLabelText('Vendor email'), { target: { value: 'ap@sierra.test' } })
    fireEvent.click(within(panel).getByLabelText('No, Reclaim surfaced it'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve recovery request' }))
    await waitFor(() => expect(screen.getByTestId('saves')).toHaveTextContent('1'))

    gmail.state.failNext = 'rejected'
    fireEvent.click(await within(panel).findByRole('button', { name: 'Send from owner@gmail.com' }))
    fireEvent.click(within(screen.getByTestId('gmail-confirm')).getByRole('button', { name: 'Send $6,800.00 request' }))
    expect(await within(screen.getByTestId('gmail-confirm')).findByRole('alert')).toHaveTextContent('Gmail rejected the message.')
    expect(screen.getByTestId('stage')).toHaveTextContent('confirmed')

    gmail.state.failNext = 'uncertain'
    fireEvent.click(within(screen.getByTestId('gmail-confirm')).getByRole('button', { name: 'Send $6,800.00 request' }))
    const retry = await within(screen.getByTestId('gmail-confirm')).findByRole('button', { name: 'Try again' })
    expect(within(screen.getByTestId('gmail-confirm')).getByRole('alert')).toHaveTextContent(/Sent folder/)
    expect(retry).toBeDisabled()
    expect(screen.getByTestId('stage')).toHaveTextContent('confirmed')
    fireEvent.click(within(screen.getByTestId('gmail-confirm')).getByLabelText(/isn’t there/))
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('requested'))
    expect(gmail.state.sent).toHaveLength(1)
  })

  it('without Gmail connected, offers to connect from the case and keeps the copy-and-send path', async () => {
    await signUpAndConnect(false)
    const { env, finding, findingId } = await savedCase()
    render(<Harness finding={finding} initial={env.caseStates[findingId]} save={async () => {}} />)
    const step = await screen.findByTestId('gmail-send')
    const link = within(step).getByRole('link', { name: 'Connect Gmail' })
    expect(link.getAttribute('href')).toMatch(/^\/api\/integrations\/gmail\/connect\?next=%2F/)
    expect(within(step).getByText(/can’t read, search or delete anything in your inbox/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark request sent' })).toBeInTheDocument()
  })
})

describe('Gmail in Settings → Connected accounts', () => {
  it('shows the connected address and disconnect revokes it with Google', async () => {
    await signUpAndConnect()
    render(<GmailSettings />)
    expect(await screen.findByTestId('gmail-settings')).toHaveTextContent('Sending from owner@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Gmail' }))
    await waitFor(() => expect(screen.getByTestId('gmail-settings')).toHaveTextContent('Not connected'))
    expect(gmail.state.revoked).toEqual(['refresh-SECRET'])
    expect(screen.getByRole('link', { name: 'Connect Gmail' })).toHaveAttribute('href', '/api/integrations/gmail/connect?next=%2Faudit%3Fmode%3Dsettings')
  })

  it('stays hidden when the server can’t send through Gmail', async () => {
    await live.close()
    live = await startLiveServer()
    vi.stubGlobal('fetch', live.fetch)
    await signUpAndConnect(false)
    const { container } = render(<GmailSettings />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

const DAY = 86_400_000

describe('following up from Gmail', () => {
  /** A request Gmail sent `daysAgo`, saved on the account as sent, and the follow-up section around it. */
  async function sentDaysAgo(daysAgo: number, extra: Partial<CaseState> = {}) {
    const { project, env, finding, findingId } = await savedCase()
    const sentAt = Date.now() - daysAgo * DAY
    const sent = { channel: 'gmail' as const, messageId: 'msg-original', from: 'owner@gmail.com', to: 'ap@sierra.test', cc: ['controller@ng.test'], sentAt }
    const approved = approveRecovery({ ...env.caseStates[findingId], recoverySubject: 'Duplicate payment of invoice INV-1', recoveryDraft: 'Hello,\nPlease refund $6,800.00.', recoveryRecipientEmail: 'ap@sierra.test', requestedAmount: 6800, requestedResolution: 'refund' }, { knownBeforeReclaim: false, at: sentAt - 1000 })
    env.caseStates[findingId] = { ...recordEmailSent(approved, sent, 6800), ...extra }
    await live.api('/api/projects/p1', { method: 'PUT', json: project })
    const save = async (state: CaseState) => {
      env.caseStates[findingId] = state
      await live.api('/api/projects/p1', { method: 'PUT', json: project })
    }
    return { finding, initial: env.caseStates[findingId], save }
  }

  function FollowUpHarness({ finding, initial, save }: { finding: Finding; initial: CaseState; save: (s: CaseState) => Promise<void> }) {
    const [state, setState] = useState(initial)
    const commit = (next: CaseState) => {
      const recorded = withHistory(state, next, 'Alice Ng')
      setState(recorded)
      void save(recorded)
    }
    return (
      <>
        <ol data-testid="history">{(state.history ?? []).map((e, i) => <li key={i}>{e.summary} · {e.note}</li>)}</ol>
        <GmailFollowUp finding={finding} state={state} projectId="p1" sender={{ businessName: 'Ng Co', senderName: 'Alice Ng', senderEmail: 'alice@example.com' }}
          onChangeDays={(days) => commit(setFollowUpAfterDays(state, days))}
          onSent={(receipt) => commit(recordFollowUpSent(state, { channel: 'gmail', ...receipt }))} />
      </>
    )
  }

  it('after 7 days with no reply: review a polite draft, edit it, confirm, and it’s on the case', async () => {
    await signUpAndConnect()
    render(<FollowUpHarness {...await sentDaysAgo(8)} />)
    const section = await screen.findByTestId('gmail-follow-up')
    expect(within(section).getByTestId('follow-up-state')).toHaveTextContent('No reply since')
    fireEvent.click(within(section).getByRole('button', { name: 'Follow up' }))

    const dialog = screen.getByTestId('follow-up-dialog')
    expect(within(dialog).getByLabelText('To')).toHaveValue('ap@sierra.test')
    expect(within(dialog).getByLabelText('Cc (optional)')).toHaveValue('controller@ng.test')
    expect(within(dialog).getByLabelText('Subject')).toHaveValue('Re: Duplicate payment of invoice INV-1')
    const body = within(dialog).getByLabelText('Message') as HTMLTextAreaElement
    expect(body.value).toMatch(/^Hello,\n\nI'm following up on my email of /)
    expect(body.value).toContain('$6,800.00')
    expect(body.value).toContain('> Please refund $6,800.00.')
    fireEvent.change(body, { target: { value: `${body.value}\nP.S. Happy to send the remittance advice.` } })
    expect(gmail.state.sent).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Review and send' }))
    expect(dialog).toHaveTextContent('Send this follow-up to ap@sierra.test?')
    expect(dialog).toHaveTextContent('from owner@gmail.com to ap@sierra.test, cc controller@ng.test')
    expect(gmail.state.sent).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send follow-up' }))

    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('Follow-up sent from Gmail · From owner@gmail.com to ap@sierra.test, cc controller@ng.test. Gmail message ID msg-1'))
    const mime = Buffer.from(gmail.state.sent[0], 'base64url').toString('utf8')
    expect(Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8')).toContain('P.S. Happy to send the remittance advice.')
    expect(within(screen.getByTestId('gmail-follow-up')).getByTestId('follow-up-state')).toHaveTextContent('If there’s no reply by')
    expect(screen.queryByRole('button', { name: 'Follow up' })).not.toBeInTheDocument()
  })

  it('isn’t offered before the chosen number of days, or once the vendor has replied', async () => {
    await signUpAndConnect()
    const early = await sentDaysAgo(3)
    const { unmount } = render(<FollowUpHarness {...early} />)
    expect(await screen.findByTestId('follow-up-state')).toHaveTextContent('If there’s no reply by')
    expect(screen.queryByRole('button', { name: 'Follow up' })).not.toBeInTheDocument()
    // Shortening the wait to 2 days makes it due now.
    fireEvent.change(screen.getByLabelText('Follow up if there’s no reply after (days)'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Follow up' })).toBeInTheDocument()
    unmount()

    const replied = await sentDaysAgo(10)
    const withReply = recordVendorUpdate(replied.initial, { status: 'acknowledged', note: 'Looking into it', at: Date.now() - 2 * DAY })
    render(<FollowUpHarness {...replied} initial={withReply} />)
    expect(await screen.findByTestId('follow-up-state')).toHaveTextContent('The vendor replied on')
    expect(screen.queryByRole('button', { name: 'Follow up' })).not.toBeInTheDocument()
  })

  it('a refused follow-up isn’t recorded and says why', async () => {
    await signUpAndConnect()
    render(<FollowUpHarness {...await sentDaysAgo(8)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }))
    gmail.state.failNext = 'rejected'
    fireEvent.click(screen.getByRole('button', { name: 'Send follow-up' }))
    expect(await within(screen.getByTestId('follow-up-dialog')).findByRole('alert')).toHaveTextContent('Gmail rejected the message.')
    expect(screen.getByTestId('history')).not.toHaveTextContent('Follow-up sent')
  })
})
