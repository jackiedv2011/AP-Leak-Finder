import { Tick } from '@/components/site/artifacts/EvidenceObjects'
import { OUTCOME_COPY, SITE_CHECKS } from '@/components/site/siteData'
import type { LandingAction } from '@/components/site/useLandingAction'

/**
 * The quote slot. The reference fills it with a customer testimonial inside a
 * #fafafa panel; Reclaim has no customers to quote, so the same panel carries
 * the product's operating principle rather than a manufactured endorsement.
 */
export function Principle() {
  return (
    <section className="quote-band" aria-label="Reclaim's operating principle">
      <div className="quote-panel">
        <span className="site-eyebrow">Built on one idea</span>
        <blockquote>
          <p>A payment only tells part of the story. The rest lives in the records around it.</p>
        </blockquote>
        <p className="site-annotation">Find it. Understand it. Reclaim it.</p>
      </div>
    </section>
  )
}

/** The seven rules, in the reference's 325x166 card grid. */
export function Checks() {
  return (
    <section className="site-section" data-flush="top" id="checks" aria-labelledby="checks-title">
      <div className="site-shell">
        <div className="section-head">
          <span className="site-kicker">What Reclaim checks</span>
          <h2 className="site-heading" id="checks-title">
            Seven checks run against every file you review
          </h2>
        </div>

        <div className="card-grid">
          {SITE_CHECKS.map((check) => (
            <article className="grid-card" key={check.type}>
              <span className="grid-card-tag" data-outcome={check.outcome}>
                <i className="site-dot" aria-hidden="true" />
                {OUTCOME_COPY[check.outcome].label}
              </span>
              <h3>{check.name}</h3>
              <p className="site-body-sm">{check.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * The reference's three-column problem statement: a short text block over a
 * tinted card. Reclaim's three tints are its own three finding classes.
 */
export function Problem() {
  const columns: [string, string, 'recoverable' | 'review' | 'opportunity', string, string][] = [
    [
      'Slow',
      'Checking a year of payments by eye means sorting a spreadsheet by vendor and hoping you notice the second one.',
      'recoverable',
      'Same vendor, same invoice, same amount',
      'Two rows, six weeks apart in the file',
    ],
    [
      'Partial',
      'A duplicate hides behind a different invoice reference, or a payment made long after the first one cleared.',
      'review',
      'INV-4471 and INV-4471-R',
      'Sorting will not put these side by side',
    ],
    [
      'Unrepeatable',
      'A manual review is only as good as the day you did it, and nothing records why a payment was cleared.',
      'opportunity',
      '2/10 net 30',
      'Terms that were on the invoice all along',
    ],
  ]

  return (
    <section className="site-section" aria-labelledby="problem-title">
      <div className="site-shell">
        <h2 className="site-heading site-measure" id="problem-title">
          Reviewing payments by hand is slow, partial, and hard to repeat
        </h2>
        <div className="trio">
          {columns.map(([title, body, tint, cardTitle, cardNote]) => (
            <div className="trio-col" key={title}>
              <div className="trio-copy">
                <h3>{title}</h3>
                <p className="site-body-sm">{body}</p>
              </div>
              <div className="trio-card" data-tint={tint}>
                <strong>{cardTitle}</strong>
                <span>{cardNote}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The reference's feature list: head, two rows of 154px cards, then a CTA. */
export function Capabilities({ action }: { action: LandingAction }) {
  const capabilities: [string, string][] = [
    ['Reads the export you already have', 'CSV from QuickBooks, Xero, or your bank'],
    ['Runs seven deterministic checks', 'Same file in, same findings out'],
    ['Keeps the source rows attached', 'Every amount traces back to its records'],
    ['Sorts findings three ways', 'Recoverable, needs review, future savings'],
    ['Drafts the recovery request', 'Only where money may actually be owed'],
    ['Never leaves your browser', 'No upload, no server, no account required'],
  ]

  return (
    <section className="site-section" aria-labelledby="capabilities-title">
      <div className="site-shell">
        <div className="section-head">
          <h2 className="site-heading site-measure" id="capabilities-title">
            Local review. <br />
            Explainable findings.
          </h2>
          <p className="site-body site-measure">
            Reclaim is a review layer, not another accounting platform. It reads a file, applies its
            rules, and hands you evidence — the decision stays with you.
          </p>
        </div>

        <div className="feature-grid">
          {capabilities.map(([title, detail]) => (
            <div className="feature-card" key={title}>
              <Tick matched />
              <p>
                {title}
                <span>{detail}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="site-actions feature-cta">
          <a className="site-button" href={action.href}>
            {action.label}
          </a>
          <a className="site-button-ghost" href="/audit?entry=sample">
            Open the sample case
          </a>
        </div>
      </div>
    </section>
  )
}
