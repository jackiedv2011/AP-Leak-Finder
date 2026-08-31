import type { ReactNode } from 'react'
import {
  CsvStrip,
  FindingCard,
  ImportReceipt,
  LedgerSheet,
  PaymentSlip,
  RecoveryLetter,
  Tick,
} from '@/components/site/artifacts/EvidenceObjects'
import { SAMPLE_RECORD_COUNT, SAMPLE_RECOVERABLE_TOTAL } from '@/components/site/siteData'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/**
 * The reference's long chapter, reproduced unit for unit. Every block is the
 * same shape — a 40px heading, a 1024x600 panel at 32px radius, then a 480px
 * quote block — with 80px between blocks and a 1024x416 panel to close.
 *
 * Inside each panel the body copy sits left and Reclaim's evidence objects are
 * staged right, cropped by the panel's rounded edge.
 */
function Block({
  title,
  scene,
  children,
  quote,
  cite,
}: {
  title: string
  scene: string
  children: ReactNode
  quote: string
  cite: string
}) {
  return (
    <article className="chapter-block">
      <h3>{title}</h3>
      <div className="chapter-visual scene" data-scene={scene}>
        {children}
      </div>
      <blockquote className="chapter-quote">
        <p>{quote}</p>
        <cite className="site-body-sm">{cite}</cite>
      </blockquote>
    </article>
  )
}

export function Story() {
  return (
    <section className="chapter site-shell" id="how" aria-labelledby="story-title">
      <div className="chapter-head">
        <span className="site-kicker">How it works</span>
        <h2 className="site-heading site-measure" id="story-title">
          One file in. Evidence you can act on out.
        </h2>
      </div>

      <Block
        title="Start with the export you already run"
        scene="intake"
        quote="The file stays in this browser."
        cite="Nothing is uploaded, and nothing is written back to your books."
      >
        <div className="scene-copy">
          <p className="site-body">
            Drop in a CSV from QuickBooks, Xero, or your bank. Reclaim tells you which columns it
            recognised, how many rows were valid, and what it skipped — before it claims to have
            found anything.
          </p>
        </div>
        <CsvStrip className="scene-object" data-slot="csv" />
        <ImportReceipt className="scene-object" data-slot="receipt" />
        <LedgerSheet className="scene-object" data-slot="ledger" />
      </Block>

      <Block
        title="A duplicate can look completely ordinary"
        scene="match"
        quote="Fifteen days apart, two payments look unrelated — until the fields line up."
        cite="Sierra Coffee Supply, INV-3305, from the bundled sample ledger."
      >
        <div className="scene-copy">
          <p className="site-body">
            In a spreadsheet these two rows sit far apart and neither looks wrong. Reclaim reads the
            relationship between them: same vendor, same invoice reference, same amount.
          </p>
        </div>
        <PaymentSlip index={0} matched className="scene-object" data-slot="a" />
        <PaymentSlip index={1} matched className="scene-object" data-slot="b" />
        <span className="scene-annotation site-annotation">same invoice, same amount</span>
      </Block>

      <Block
        title="Every flag shows the rule that produced it"
        scene="explain"
        quote="A finding only matters if you can act on it."
        cite="Reclaim's review model — no confidence scores, no black box."
      >
        <div className="scene-copy">
          <p className="site-body">
            Reclaim lists the conditions the rule required, marks the ones that matched, and leaves
            the real difference visible so you can judge it yourself.
          </p>
        </div>
        <FindingCard className="scene-object" data-slot="finding" />
        <ul className="scene-conditions">
          <li>
            <Tick matched />
            The conditions the rule required
          </li>
          <li>
            <Tick matched />
            The source rows behind the amount
          </li>
          <li>
            <Tick matched={false} />
            The difference that is still open
          </li>
        </ul>
      </Block>

      <Block
        title="From two payments to a recovery-ready case"
        scene="case"
        quote="Ambiguous findings get an internal note, never an assumed refund."
        cite="Illustrative sample data, not a customer recovery claim."
      >
        <div className="scene-copy">
          <p className="site-body">
            Where money may genuinely be owed, Reclaim drafts the request and keeps the vendor,
            invoice, amount, and payment dates linked to it. You stay the one who sends it.
          </p>
        </div>
        <ol className="scene-lifecycle" aria-hidden="true">
          {['Ready to verify', 'Confirmed', 'Ready to prepare', 'Ready to contact', 'Resolved'].map(
            (step, index) => (
              <li data-active={String(index < 3)} key={step}>
                {step}
              </li>
            )
          )}
        </ol>
        <RecoveryLetter className="scene-object" data-slot="letter" />
      </Block>

      {/* The chapter's closing panel — 1024x416 at 32px radius. */}
      <div className="chapter-panel">
        <div className="chapter-panel-figures">
          <div>
            <span className="site-eyebrow">Likely recoverable</span>
            <strong className="site-num">{money.format(SAMPLE_RECOVERABLE_TOTAL)}</strong>
            <p className="site-body-sm">Across findings the rules class as recoverable.</p>
          </div>
          <div>
            <span className="site-eyebrow">Payments reviewed</span>
            <strong className="site-num">{SAMPLE_RECORD_COUNT}</strong>
            <p className="site-body-sm">Every row parsed from the sample export.</p>
          </div>
          <div>
            <span className="site-eyebrow">Checks applied</span>
            <strong className="site-num">7</strong>
            <p className="site-body-sm">The full rule set, run on every import.</p>
          </div>
        </div>
        <p className="site-body-sm">
          These are the results of the fictional demo ledger shipped with the prototype. They are
          potential impact for that file — not money Reclaim has recovered for a customer.
        </p>
      </div>
    </section>
  )
}
