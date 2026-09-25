import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, X } from 'lucide-react'
import { PLANS, PLAN_LABEL, PLAN_PITCH, planOf, type Plan } from '@/lib/plans'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import '@/workspace/workspace.css'

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** One line naming what the person just bumped into, e.g. "AI drafts are part of Growth and Flat." */
  reason?: string
}

/** The three tracks side by side. Growth and Flat continue to checkout. */
export function UpgradeDialog({ open, onOpenChange, reason }: UpgradeDialogProps) {
  const auth = useOptionalAuth()
  const isGuest = auth?.user?.isGuest ?? false
  const current: Plan | null = auth?.user && !isGuest ? planOf(auth.user.plan) : null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(960px, calc(100vw - 32px))' }} data-testid="upgrade-dialog">
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">Get back everything you’re owed</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                {reason ? `${reason} ` : ''}Free shows you the leak. Growth and Flat show every finding and run the whole recovery for you.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <div className="wk-plan-grid" data-plans="3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan}
                plan={plan}
                current={current === plan}
                highlight={plan === 'growth'}
                action={
                  plan === 'free' || current === plan ? null : (
                    <a
                      className="wk-btn"
                      data-variant={plan === 'growth' ? 'primary' : 'outline'}
                      data-size="sm"
                      href={isGuest ? `/signup?next=${encodeURIComponent(`/checkout?plan=${plan}`)}` : `/checkout?plan=${plan}`}
                    >
                      Continue with {PLAN_LABEL[plan]}
                    </a>
                  )
                }
              />
            ))}
          </div>

          <div className="wk-panel-foot" style={{ alignItems: 'center' }}>
            <span className="wk-dim" style={{ fontSize: 12.5, marginRight: 'auto' }}>
              Monthly, cancel any time. You’ll review everything before anything is charged.
            </span>
            <button type="button" className="wk-btn" data-variant="ghost" onClick={() => onOpenChange(false)}>
              Not now
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PlanCard({ plan, current, highlight, action }: { plan: Plan; current: boolean; highlight?: boolean; action: React.ReactNode }) {
  const pitch = PLAN_PITCH[plan]
  return (
    <div className="wk-plan-card" data-highlight={highlight || undefined} data-testid={`plan-${plan}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="wk-label">{PLAN_LABEL[plan]}</span>
        {current ? <span className="wk-mark" data-tone="quiet">Current plan</span> : highlight ? <span className="wk-mark" data-tone="strong">Most popular</span> : null}
      </div>
      <div className="wk-display" style={{ fontSize: 20, marginTop: 8 }}>{pitch.tagline}</div>
      <div className="wk-num" style={{ fontSize: 14, marginTop: 6, fontWeight: 600 }}>{pitch.price}</div>
      <p className="wk-dim" style={{ fontSize: 13, marginTop: 8 }}>{pitch.summary}</p>
      <ul className="wk-plan-features">
        {pitch.features.map((f) => (
          <li key={f}>
            <Check aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <p className="wk-table-sub" style={{ marginTop: 10 }}>{pitch.note}</p>
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  )
}
