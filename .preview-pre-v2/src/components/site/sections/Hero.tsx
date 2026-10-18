import {
  CsvStrip,
  FindingCard,
  LedgerSheet,
  PaymentSlip,
  Tick,
} from '@/components/site/artifacts/EvidenceObjects'
import type { LandingAction } from '@/components/site/useLandingAction'

/**
 * The opening scene: the claim, and underneath it the evidence trail that
 * backs it — a raw export, the ledger it becomes, the two payments that match,
 * and the finding Reclaim writes. The documents deliberately run past both
 * viewport edges; the page is a desk, not a grid.
 */
export function Hero({ action }: { action: LandingAction }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <span className="site-eyebrow">Payment recovery for small businesses</span>
        {/* The break is deliberate: it lands the emphasis on its own line. */}
        <h1 className="site-display" id="hero-title">
          <span>Find the payments</span>{' '}
          <span>
            worth a <em>second look.</em>
          </span>
        </h1>
        <p className="site-lead hero-sub">
          Reclaim reads the payment export you already have, connects the records that belong
          together, and leaves you with evidence a person can review.
        </p>
        <div className="site-actions">
          <a className="site-button" href={action.href}>
            {action.label}
          </a>
          <a className="site-button-ghost" href="#how">
            See how it works
          </a>
        </div>
        <div className="hero-signals">
          <span className="hero-signal">
            <Tick matched />
            Seven checks <span>on every file</span>
          </span>
          <span className="hero-signal">
            <Tick matched />
            Runs in your browser <span>nothing uploaded</span>
          </span>
          <span className="hero-signal">
            <Tick matched />
            Every flag <span>shows its rule</span>
          </span>
        </div>
      </div>

      <div className="hero-stage" aria-hidden="true">
        <CsvStrip className="hero-object" data-name="csv" />
        <LedgerSheet className="hero-object" data-name="ledger" />
        <PaymentSlip index={0} matched className="hero-object" data-name="slip-a" />
        <PaymentSlip index={1} matched className="hero-object" data-name="slip-b" />
        <FindingCard className="hero-object" data-name="finding" />
        <span className="hero-note">
          <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden="true">
            <path
              d="M1 21C6 9 14 2 25 2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M19 1.5 25.5 2 25 8.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="site-annotation">same invoice, same amount</span>
        </span>
      </div>
    </section>
  )
}
