import { LegalLayout, Placeholder } from '@/pages/LegalLayout'
import { LEGAL_CONTACT_EMAIL } from '@/legal/terms'

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      summary="The agreement between you and Reclaim when you create an account, upload payment records, and use the findings Reclaim produces."
    >
      <section>
        <h2>1. Use of Reclaim</h2>
        <p>
          Reclaim is a tool that reviews payment records you upload and points out payments that may be worth a second
          look: duplicates, overpayments, unused credits and similar errors. By creating an account or using the
          service you agree to these terms. If you are using Reclaim on behalf of a company, you confirm you are
          authorised to agree on its behalf.
        </p>
      </section>

      <section>
        <h2>2. User accounts</h2>
        <ul>
          <li>You must give accurate account details and keep your password confidential.</li>
          <li>You are responsible for everything done under your account.</li>
          <li>One person per account; do not share log-in details.</li>
          <li>Tell us promptly at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> if you believe your account has been accessed without permission.</li>
        </ul>
      </section>

      <section>
        <h2>3. Uploaded data</h2>
        <p>
          You keep ownership of everything you upload. You grant Reclaim permission to process it only as needed to
          provide the service to you, as described in the <a href="/privacy">Privacy Policy</a>. You confirm that you
          have the right to upload the records you provide and that doing so does not breach any agreement or law that
          applies to you.
        </p>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Upload data you are not authorised to share</li>
          <li>Use Reclaim to harass vendors, or to send recovery requests you know to be unfounded</li>
          <li>Attempt to access another user's account or data</li>
          <li>Reverse-engineer, scrape, or interfere with the service</li>
          <li>Use the service in a way that breaks applicable law</li>
        </ul>
      </section>

      <section>
        <h2>5. Findings are not advice</h2>
        <p>
          Reclaim's findings are produced by rules applied to the records you upload. They are a starting point for your
          own review, not a determination that money is owed. You decide whether a finding is real and whether to
          contact a vendor. Reclaim does not provide accounting, legal, or financial advice.
        </p>
      </section>

      <section>
        <h2>6. Subscription and billing</h2>
        <p>
          <Placeholder>
            Pricing, billing frequency, free-tier limits, refund terms, and the payment processor are still being
            finalised. This section will describe them before any paid plan is offered. Until then, Reclaim is provided
            without charge and without a service-level commitment.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>7. Intellectual property</h2>
        <p>
          Reclaim, its software, design, and documentation belong to Reclaim and its licensors. These terms give you a
          limited, non-exclusive, non-transferable right to use the service for your own business purposes. They do not
          transfer any ownership to you.
        </p>
      </section>

      <section>
        <h2>8. Service availability and changes</h2>
        <p>
          Reclaim is under active development. Features may change, be added, or be removed, and the service may be
          unavailable from time to time for maintenance or for reasons outside our control. We will try to give notice
          of significant changes, but cannot guarantee uninterrupted access.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers</h2>
        <p>
          The service is provided "as is" and "as available". To the extent permitted by law, Reclaim makes no
          warranties, express or implied, including that the service will be error-free, that every duplicate or
          overpayment will be found, or that any finding is accurate or recoverable.
        </p>
      </section>

      <section>
        <h2>10. Limitation of liability</h2>
        <p>
          To the extent permitted by law, Reclaim will not be liable for any indirect, incidental, special or
          consequential loss, or for any loss of profit, revenue, data or goodwill, arising from your use of the
          service.{' '}
          <Placeholder>
            The overall cap on liability (for example, the fees paid in the preceding twelve months) is to be confirmed
            once pricing is set.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>11. Termination</h2>
        <p>
          You can stop using Reclaim and delete your audits at any time. We may suspend or close an account that
          breaches these terms or that we reasonably believe is being used to cause harm. Sections that by their nature
          should survive (ownership, disclaimers, limitation of liability) continue after termination.
        </p>
      </section>

      <section>
        <h2>12. Governing law</h2>
        <p>
          <Placeholder>Governing law and venue to be confirmed based on the legal entity's jurisdiction.</Placeholder>
        </p>
      </section>

      <section>
        <h2>13. Changes to these terms</h2>
        <p>
          When these terms change materially, the version and effective date at the top will change and account holders
          will be asked to accept the new version the next time they log in. Continued use after that is agreement to
          the updated terms.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about these terms: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.{' '}
          <Placeholder>Legal entity name and postal address to be added.</Placeholder>
        </p>
      </section>
    </LegalLayout>
  )
}
