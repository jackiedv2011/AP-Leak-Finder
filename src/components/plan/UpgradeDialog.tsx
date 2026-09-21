import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, X } from 'lucide-react'
import { PLAN_FEATURES, PLAN_PRICE_USD } from '@/lib/plans'
import { requestUpgrade } from '@/lib/auth/apiAuthService'
import { useOptionalAuth } from '@/lib/auth/AuthContext'
import '@/workspace/workspace.css'

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** One line naming what the person just bumped into, e.g. "AI drafts are part of Pro." */
  reason?: string
}

/**
 * The plan comparison. There is no checkout behind the button yet — it asks
 * the server, which says so — and nothing here pretends otherwise.
 */
export function UpgradeDialog({ open, onOpenChange, reason }: UpgradeDialogProps) {
  const auth = useOptionalAuth()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isGuest = auth?.user?.isGuest ?? false

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(680px, calc(100vw - 32px))' }} data-testid="upgrade-dialog">
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">Reclaim Pro</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                {reason ? `${reason} ` : ''}Pro is {formatPrice(PLAN_PRICE_USD.pro)} a month and unlocks the whole recovery workflow.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <div className="wk-plan-grid">
            <PlanCard name="Free" price={PLAN_PRICE_USD.free} features={PLAN_FEATURES.free} current={!isGuest && auth?.user?.plan !== 'pro'} />
            <PlanCard name="Pro" price={PLAN_PRICE_USD.pro} features={PLAN_FEATURES.pro} current={auth?.user?.plan === 'pro'} highlight />
          </div>

          <div className="wk-panel-foot" style={{ alignItems: 'center' }}>
            {notice ? (
              <span className="wk-dim" style={{ fontSize: 13, marginRight: 'auto' }} role="status">
                {notice}
              </span>
            ) : (
              <span className="wk-dim" style={{ fontSize: 12.5, marginRight: 'auto' }}>
                Payments aren&apos;t open yet. Nothing is charged today.
              </span>
            )}
            <button type="button" className="wk-btn" data-variant="ghost" onClick={() => onOpenChange(false)}>
              Not now
            </button>
            {isGuest ? (
              <a className="wk-btn" data-variant="primary" href="/signup">
                Create an account first
              </a>
            ) : (
              <button
                type="button"
                className="wk-btn"
                data-variant="primary"
                disabled={busy || auth?.user?.plan === 'pro'}
                onClick={async () => {
                  setBusy(true)
                  const result = await requestUpgrade()
                  setNotice(result.message)
                  setBusy(false)
                }}
              >
                {auth?.user?.plan === 'pro' ? 'You’re on Pro' : 'Upgrade to Pro — coming soon'}
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function formatPrice(usd: number): string {
  return usd === 0 ? '$0' : `$${usd}`
}

function PlanCard({ name, price, features, current, highlight }: { name: string; price: number; features: string[]; current: boolean; highlight?: boolean }) {
  return (
    <div className="wk-plan-card" data-highlight={highlight || undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="wk-label">{name}</span>
        {current ? <span className="wk-mark" data-tone="quiet">Current plan</span> : null}
      </div>
      <div className="wk-display" style={{ fontSize: 28, marginTop: 6, letterSpacing: '-0.02em' }}>
        {formatPrice(price)}
        <span className="wk-dim" style={{ fontSize: 13, fontWeight: 400, marginLeft: 4 }}>
          / month
        </span>
      </div>
      <ul className="wk-plan-features">
        {features.map((f) => (
          <li key={f}>
            <Check aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}
