import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Banknote, FileSearch, FolderOpen, LayoutDashboard, Settings, Sparkles, X } from 'lucide-react'
import type { Entitlements } from '@/lib/plans'
import '@/workspace/workspace.css'

interface Step {
  icon: typeof LayoutDashboard
  title: string
  body: string
  tip?: string
}

function steps(entitlements: Entitlements): Step[] {
  const visible = entitlements.limits.findingsVisible
  return [
    {
      icon: Sparkles,
      title: 'Welcome to Reclaim',
      body: 'Reclaim reads the payments your business has already made and finds the ones that should not have gone out — duplicates, overpayments, missed discounts, suspicious account changes — then helps you get the money back.',
      tip: 'Two minutes, six stops. You can reopen this tour any time from Settings.',
    },
    {
      icon: FolderOpen,
      title: 'Audits — where you start',
      body: 'An audit is one payment ledger (a CSV export from your accounting system) run through eight checks. Start a new audit for each file. Everything else in Reclaim describes the audit you have open.',
      tip: entitlements.limits.auditsPerMonth === null ? 'Pro: unlimited audits.' : `Free includes ${entitlements.limits.auditsPerMonth} audits a month.`,
    },
    {
      icon: FileSearch,
      title: 'Findings — what the checks caught',
      body: 'Each finding is a specific vendor, amount and reason, with the exact ledger rows behind it. Nothing is inferred: if Reclaim says an invoice was paid twice, both payments are on the page.',
      tip: visible === null ? 'Pro shows every finding.' : `Free shows the ${visible} lowest-value findings in full; the larger ones are blurred until you upgrade.`,
    },
    {
      icon: LayoutDashboard,
      title: 'Reviewing — your call, once',
      body: 'Open a finding and press "Review this finding". You choose: it’s real (Reclaim prepares the recovery), you need more detail (it stays open with your note), or it was expected (it leaves the list, with the reason kept).',
    },
    {
      icon: Banknote,
      title: 'Recoveries — getting the money back',
      body: 'A confirmed finding becomes a recovery case. Reclaim writes the request from the records; you copy it into your own email and send it. Then you record what actually came back. Reclaim never contacts a vendor itself.',
      tip: 'The dashboard keeps "potential", "in recovery" and "recovered" as separate numbers — they are never added together.',
    },
    {
      icon: Settings,
      title: 'Reports and Settings',
      body: 'Reports break the money down by check and by vendor. Settings holds your account, your plan, the legal documents, and the button to delete an audit.',
      tip: 'That’s the tour. Start with an audit — the sample ledger is a good first run.',
    },
  ]
}

/**
 * The first-run walk-through. Shown once per account (the server remembers)
 * and again on request from Settings. Purely explanatory — it changes nothing.
 */
export function OnboardingTour({ open, entitlements, onDone }: { open: boolean; entitlements: Entitlements; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const list = steps(entitlements)
  const step = list[Math.min(index, list.length - 1)]
  const Icon = step.icon
  const last = index >= list.length - 1

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onDone()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(540px, calc(100vw - 32px))' }} data-testid="onboarding-tour">
          <header className="wk-panel-head">
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="wk-tour-icon" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <span className="wk-label">
                  Step {index + 1} of {list.length}
                </span>
                <DialogPrimitive.Title className="wk-display wk-h2" style={{ marginTop: 4 }}>
                  {step.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="wk-dim" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>
                  {step.body}
                </DialogPrimitive.Description>
                {step.tip ? (
                  <p className="wk-tour-tip">{step.tip}</p>
                ) : null}
              </div>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <div className="wk-tour-dots" aria-hidden="true">
            {list.map((_, i) => (
              <i key={i} data-active={i === index || undefined} />
            ))}
          </div>

          <div className="wk-panel-foot">
            <button type="button" className="wk-btn" data-variant="ghost" onClick={onDone} style={{ marginRight: 'auto' }}>
              Skip tour
            </button>
            {index > 0 ? (
              <button type="button" className="wk-btn" data-variant="ghost" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            ) : null}
            <button type="button" className="wk-btn" data-variant="primary" onClick={() => (last ? onDone() : setIndex(index + 1))}>
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
