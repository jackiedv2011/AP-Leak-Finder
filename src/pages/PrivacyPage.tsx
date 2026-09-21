import { LegalLayout, Placeholder } from '@/pages/LegalLayout'
import { LEGAL_CONTACT_EMAIL } from '@/legal/terms'

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      summary="How Reclaim handles the information you give it: your account details, your company details, and the financial records you upload for review."
    >
      <section>
        <h2>1. What this policy covers</h2>
        <p>
          This policy describes what information Reclaim collects when you create an account and run an audit, how that
          information is used, where it is kept, and the choices you have. It applies to the Reclaim web application
          and the reclaim marketing site. It does not cover third-party websites linked from Reclaim.
        </p>
      </section>

      <section>
        <h2>2. Account information</h2>
        <p>When you create an account we ask for:</p>
        <ul>
          <li>Your first and last name</li>
          <li>Your work email address</li>
          <li>A password, which is stored only as a salted hash and never in plain text</li>
          <li>The date and time you accepted these terms, and the version you accepted</li>
        </ul>
        <p>We use this to identify your account, let you log in, and keep a record of your agreement to our terms.</p>
      </section>

      <section>
        <h2>3. Company information</h2>
        <p>
          We ask for the name of the company you are auditing on behalf of. We use it to label your workspace and, if
          you contact us, to understand who we are speaking with. We do not verify it against any external register.
        </p>
      </section>

      <section>
        <h2>4. Uploaded financial data</h2>
        <p>
          To run an audit you upload a CSV export of payment records. Depending on what your export contains, this can
          include vendor names, invoice numbers and dates, payment dates and amounts, payment terms, general-ledger
          categories, and the last four digits of a vendor bank account. It may also contain other columns Reclaim does
          not use.
        </p>
        <p>
          This is business financial data. Treat it as such before uploading: remove columns you do not need Reclaim to
          see, and do not upload data you are not authorised to share.
        </p>
      </section>

      <section>
        <h2>5. How Reclaim uses uploaded data</h2>
        <p>Reclaim uses uploaded records only to provide the service to you. Specifically, to:</p>
        <ul>
          <li>Run its checks for duplicate payments, overpayments, unused credits and similar errors</li>
          <li>Show you each finding together with the source rows behind it</li>
          <li>Keep a record of the decisions you make on each finding and the recovery steps you record</li>
          <li>Produce the summaries and reports shown in your workspace</li>
        </ul>
        <p>
          Reclaim does not sell uploaded data, use it to train models, or share it with other customers. Reclaim does
          not contact your vendors on your behalf; recovery requests are drafted for you to review and send yourself.
        </p>
      </section>

      <section>
        <h2>6. Where data is stored</h2>
        <p>
          <b>With an account, your uploaded records, findings, decisions and recovery history are stored on Reclaim's
          server, attached to your account and visible only to it.</b> Your browser keeps a working copy while you are
          logged in and removes it when you log out. In a guest session nothing is sent to the server: the sample audit
          stays in your browser for that tab only.
        </p>
        <p>
          <Placeholder>
            The hosting provider, the region data is stored in, backup arrangements and the retention period are not
            yet settled. They will be listed here before Reclaim opens to customers.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>7. Security practices</h2>
        <p>
          Passwords are never stored in plain text; they are hashed with scrypt and a per-account salt before being
          saved, and never leave the server. If you sign in with Google, Reclaim receives only your name, email address
          and Google account identifier — it does not request access to your Gmail or any other Google data. Sessions
          are kept in an HttpOnly cookie that page scripts cannot read. The security of your data also depends on the
          security of your device and browser profile.
        </p>
        <p>
          <Placeholder>
            Reclaim does not currently hold any third-party security certification (such as SOC 2 or ISO 27001). This
            section will list specific controls, encryption in transit and at rest, and any certifications once they
            are in place. Do not rely on protections that are not listed here.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>8. Third-party services</h2>
        <p>
          Reclaim currently has no direct integration with accounting systems such as QuickBooks, Xero or NetSuite; it
          reads only the CSV files you upload. Reclaim loads web fonts from Google Fonts, which may record your IP
          address when the font files are requested.
        </p>
        <p>
          <Placeholder>
            If Reclaim adds payment processing, email delivery, analytics, error reporting, or accounting-system
            integrations, each provider and what it receives will be listed here before it is enabled.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>9. Cookies and local storage</h2>
        <p>
          Reclaim sets one cookie, which keeps you logged in, and uses browser local storage as a working copy of your
          audits while you are logged in. It does not set advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2>10. Your choices and data deletion</h2>
        <ul>
          <li>You can delete any audit from its Settings page, which removes every record, finding and decision in it.</li>
          <li>You can log out at any time, which ends your session on that device and removes the working copy of your audits from it.</li>
          <li>Clearing your browser's site data for Reclaim removes the working copy and any guest-session data; your account and its audits remain on the server until you delete them or ask us to.</li>
          <li>
            To ask for anything else, or to confirm what data exists for you, email{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>Reclaim is a business tool and is not directed at anyone under 18.</p>
      </section>

      <section>
        <h2>12. Changes to this policy</h2>
        <p>
          When this policy changes materially, the version and effective date at the top will change and existing
          account holders will be asked to review it the next time they log in.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Questions about this policy: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.{' '}
          <Placeholder>Legal entity name and postal address to be added.</Placeholder>
        </p>
      </section>
    </LegalLayout>
  )
}
