import { useState } from 'react'
import { Tick } from '@/components/site/artifacts/EvidenceObjects'
import { SITE_FAQ } from '@/components/site/siteData'
import type { LandingAction } from '@/components/site/useLandingAction'

/**
 * The reference's compliance strip: two dark cards, 500x348, inside the
 * content column. Reclaim's equivalent is the boundary the prototype keeps.
 */
export function Boundary() {
  return (
    <section className="strip" id="privacy" aria-label="Privacy boundary">
      <div className="strip-grid">
        <div>
          <span className="strip-mark">Local</span>
          <h3>Your ledger stays on this device</h3>
          <p className="site-body">
            Parsing and review happen in your browser. The file you choose is not uploaded to our
            servers, and a saved project can be deleted from the workspace.
          </p>
        </div>
        <div>
          <span className="strip-mark">Read-only</span>
          <h3>Nothing is written back</h3>
          <p className="site-body">
            Reclaim never changes your accounting system for you. It produces evidence and a draft;
            every action after that is yours to take.
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * The reference's closing section: a 296px head block over a 1024x600 visual.
 * Reclaim's pricing lives here, since it is the page's final commitment.
 */
export function Closing({ action }: { action: LandingAction }) {
  const steps: [string, string, string][] = [
    ['01', 'Potential case', 'You share the details. We review at no cost.'],
    ['02', 'Confirmed', 'You approve the case and agree the fee.'],
    ['03', 'Outreach', 'The evidence-backed request moves forward.'],
    ['04', 'Verified recovery', 'You receive a refund, credit, or offset.'],
  ]

  return (
    <section className="closing" id="pricing" aria-labelledby="closing-title">
      <div className="site-shell">
        <div className="closing-head">
          <span className="site-kicker">Outcome-aligned pricing</span>
          <h2 className="site-heading-lg" id="closing-title">
            If the money does not come back, you do not pay
          </h2>
          <p className="site-lead">
            A fee is agreed before outreach and becomes due only after a verified refund, credit, or
            offset.
          </p>
          <div className="site-actions">
            <a className="site-button" href={action.href}>
              {action.label}
            </a>
            <a className="site-button-ghost" href="/audit?entry=sample">
              Explore the sample case
            </a>
          </div>
        </div>

        <div className="closing-visual">
          <ol className="pricing-steps">
            {steps.map(([number, title, body]) => (
              <li key={number}>
                <span className="site-eyebrow">{number}</span>
                <strong>{title}</strong>
                <p className="site-body-sm">{body}</p>
              </li>
            ))}
          </ol>
          <p className="pricing-note">
            <Tick matched />
            $0 fee if no money returns
          </p>
        </div>
      </div>
    </section>
  )
}

export function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <div className="site-shell">
        <div className="faq-head">
          <h2 className="site-heading-lg" id="faq-title">
            Questions
          </h2>
        </div>
        <div className="faq-list">
          {SITE_FAQ.map(([question, answer], index) => {
            const isOpen = open === index
            const answerId = `faq-answer-${index}`
            return (
              <article className="faq-item" data-open={isOpen} key={question}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpen((current) => (current === index ? -1 : index))}
                  >
                    <span>{question}</span>
                    <i aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-answer" id={answerId} aria-hidden={!isOpen}>
                  <div>
                    <p className="site-body">{answer}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
