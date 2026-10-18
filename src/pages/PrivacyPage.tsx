import { LegalLayout, Placeholder } from '@/pages/LegalLayout'
import { LEGAL_CONTACT_EMAIL } from '@/legal/terms'

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      summary="How Reclaim handles the information you give it: your account details, your company details, and the financial records you upload or import from QuickBooks for review."
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
        <h2>5. Connected accounts: QuickBooks Online and Gmail</h2>
        <p>
          Instead of uploading a file you can connect QuickBooks Online. During testing this works only with Intuit's
          sandbox (test) companies. You approve the connection on Intuit's own page; Reclaim never sees your Intuit
          password.
        </p>
        <p>When you connect, Reclaim receives and keeps:</p>
        <ul>
          <li>An access token and a refresh token from Intuit, which let Reclaim read the company's records until you disconnect</li>
          <li>The QuickBooks company ID and company name</li>
          <li>The date you connected and the date of your last import</li>
        </ul>
        <p>When you import, Reclaim reads only these records from the connected company:</p>
        <ul>
          <li>Vendors, bills and bill payments, including invoice numbers, dates, amounts, payment terms and the account each payment came from</li>
          <li>Vendor credits, deposits, and checks or card purchases paid directly to vendors</li>
        </ul>
        <p>
          It does not read your customers, sales invoices, payroll, employees, bank login details or attachments. The
          imported records become an audit in your workspace and are handled like an uploaded file (sections 6 to 8).
        </p>
        <p>
          <b>Reclaim only reads from QuickBooks.</b> Intuit's permission for accounting data also allows changes, but
          Reclaim's software only ever requests to read, and never creates, changes or deletes anything in your books.
          Reclaim is not affiliated with or endorsed by Intuit.
        </p>
        <p>
          <b>Gmail, sending only.</b> On any plan you can connect a Gmail account so that recovery requests you approve are sent from your own
          address. This is a separate Google consent from signing in. You approve it on Google's own page; Reclaim
          never sees your Google password.
        </p>
        <p>
          <b>Reclaim asks Google only for permission to send email</b> (the <code>gmail.send</code> permission), plus
          your email address (<code>openid</code> and <code>email</code>) so it can show which account is connected.
          <b> Reclaim never reads, searches, lists, labels or deletes anything in your inbox</b>, and the permission it
          holds does not allow it to.
        </p>
        <p>When you connect Gmail, Reclaim keeps:</p>
        <ul>
          <li>A refresh token from Google, encrypted (section 8), which lets Reclaim send email as you until you disconnect</li>
          <li>The connected Gmail address and Google's account ID for it, and the date you connected</li>
        </ul>
        <p>
          <b>Reclaim sends only the emails you approve.</b> An email goes out only after you approve a recovery request
          and then confirm the send, and only with the recipient, subject and message you approved, plus any Cc
          addresses you add. For each email sent, Reclaim keeps the Gmail message ID, the time, the sender, the
          recipients and the amount requested, and adds them to that case's history. The sent email itself stays in
          your Gmail Sent folder; Reclaim does not keep a separate copy beyond the letter already saved on the case.
        </p>
      </section>

      <section>
        <h2>6. How Reclaim uses your financial data</h2>
        <p>Reclaim uses uploaded and imported records only to provide the service to you. Specifically, to:</p>
        <ul>
          <li>Run its checks for duplicate payments, overpayments, unused credits and similar errors</li>
          <li>Show you each finding together with the source rows behind it</li>
          <li>Keep a record of the decisions you make on each finding and the recovery steps you record</li>
          <li>Produce the summaries and reports shown in your workspace</li>
        </ul>
        <p>
          Reclaim does not sell your data, use it to train models, or share it with other customers. Reclaim does not
          contact your vendors on your behalf; recovery requests are drafted for you to review and send yourself.
        </p>
        <p>
          <b>AI-drafted recovery emails.</b> On paid plans, when you choose to draft a recovery email with AI, Reclaim
          sends the facts of that one case to Anthropic, which provides the AI model: the vendor name, the finding, the
          amounts, the invoice numbers, dates and terms of the payments involved, any note you add, and the business
          and sender name to sign with. Nothing is sent until you ask for a draft, and nothing else from your ledger is
          included.
        </p>
      </section>

      <section>
        <h2>7. Where data is stored</h2>
        <p>
          <b>With an account, your uploaded records, findings, decisions and recovery history are stored on Reclaim's
          server, attached to your account and visible only to it.</b> A QuickBooks connection is stored the same way,
          with its tokens encrypted (section 8). Your browser keeps a working copy while you are
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
        <h2>8. Security practices</h2>
        <p>
          Passwords are never stored in plain text; they are hashed with scrypt and a per-account salt before being
          saved, and never leave the server. If you sign in with Google, Reclaim receives only your name, email address
          and Google account identifier — signing in does not give Reclaim access to your Gmail or any other Google
          data. Sessions are kept in an HttpOnly cookie that page scripts cannot read. QuickBooks tokens and the Gmail
          refresh token are encrypted (AES-256-GCM) with keys kept outside the database, are never shown to your
          browser, and are never written to logs. The security of your data also depends on the security of your device and browser profile.
        </p>
        <p>
          <Placeholder>
            Reclaim does not currently hold any third-party security certification (such as SOC 2 or ISO 27001).
            Uploaded and imported financial records are not yet encrypted at rest beyond the QuickBooks tokens
            described above. This section will list encryption in transit and at rest, and any certifications, once
            they are in place. Do not rely on protections that are not listed here.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>9. Third-party services</h2>
        <p>These services receive information from Reclaim, and only what is listed:</p>
        <ul>
          <li>
            <b>Google sign-in (optional).</b> If you choose Sign in with Google, Google tells Reclaim your Google account
            ID, email address, whether Google has verified that address, and your first and last name. Reclaim asks
            only for those (the <code>openid</code>, <code>email</code> and <code>profile</code> permissions), stores
            the account ID, email and name, and does not request access to Gmail, Drive, contacts or any other Google
            data. Google learns that you signed in to Reclaim.
          </li>
          <li>
            <b>Intuit QuickBooks Online (optional).</b> If you connect QuickBooks, Intuit learns that your company
            authorised Reclaim, and Reclaim reads the records described in section 5. Intuit's own privacy statement
            covers what Intuit does with your data.
          </li>
          <li>
            <b>Gmail (optional, sending only).</b> If you connect Gmail, Google learns that you authorised Reclaim to
            send email for you, and each recovery request you approve and send is delivered by Gmail from your address
            to the recipients you chose (section 5). Google's own privacy policy covers what Google does with your
            email.
          </li>
          <li>
            <b>Anthropic (AI drafting, paid plans).</b> Receives the facts of a single case when you ask for an AI
            draft, as described in section 6.
          </li>
          <li>
            <b>Email delivery.</b> Account emails (verification, password reset) and messages sent through the contact
            form pass through Reclaim's email provider so they can be delivered.
          </li>
          <li>
            <b>Stripe (checkout, test mode).</b> Card details typed at checkout go directly to Stripe; Reclaim never
            sees the full card number. Billing is not live and no card is charged.
          </li>
          <li>
            <b>Google Fonts.</b> Reclaim loads web fonts from Google Fonts, which may record your IP address when the
            font files are requested.
          </li>
        </ul>
        <p>
          <Placeholder>
            If Reclaim adds analytics, error reporting, hosting, or another accounting-system integration, each provider
            and what it receives will be listed here before it is enabled.
          </Placeholder>
        </p>
      </section>

      <section>
        <h2>10. Cookies and local storage</h2>
        <p>
          Reclaim sets one cookie that keeps you logged in. While you sign in with Google or connect QuickBooks it also
          sets a short-lived cookie (ten minutes at most) that confirms the reply came back to the same person who
          started. Reclaim uses browser local storage as a working copy of your audits while you are logged in. It does
          not set advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2>11. Your choices and data deletion</h2>
        <ul>
          <li>You can delete any audit from its Settings page, which removes every record, finding and decision in it.</li>
          <li>You can disconnect QuickBooks at any time from Settings → Connected accounts. Reclaim asks Intuit to cancel its access and deletes the stored tokens; audits you already imported stay until you delete them. You can also remove Reclaim from the connected apps in your QuickBooks account.</li>
          <li>You can disconnect Gmail at any time from Settings → Connected accounts. Reclaim asks Google to cancel its access and deletes the stored token and address. You can also remove Reclaim from the third-party apps in your Google account. Emails already sent stay in your Gmail and in the case history.</li>
          <li>You can log out at any time, which ends your session on that device and removes the working copy of your audits from it.</li>
          <li>Clearing your browser's site data for Reclaim removes the working copy and any guest-session data; your account and its audits remain on the server until you delete them or ask us to.</li>
          <li>
            To ask for anything else, or to confirm what data exists for you, email{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>12. Children</h2>
        <p>Reclaim is a business tool and is not directed at anyone under 18.</p>
      </section>

      <section>
        <h2>13. Changes to this policy</h2>
        <p>
          When this policy changes materially, the version and effective date at the top will change and existing
          account holders will be asked to review it the next time they log in.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about this policy: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.{' '}
          <Placeholder>Legal entity name and postal address to be added.</Placeholder>
        </p>
      </section>
    </LegalLayout>
  )
}
