# Intuit app assessment: draft answers

**Status:** draft, 2026-10-18. Written from what the code on `main` does
(QuickBooks: `server/quickbooks.ts`, `server/app.ts` QuickBooks routes,
`src/ledger/quickbooksSync.ts`; storage: `server/projectStore.ts`,
`server/crypto.ts`, `server/account.ts`), not from intentions. Anything in
**[Jagan: …]** is a fact only the founders can supply or a decision only they
can make. Keep this in step with `docs/pilot-data-policy.md` and the Privacy
Policy: Intuit reads all three.

Intuit asks these questions in the developer portal (your app → **Production
settings** → **App assessment questionnaire**). The headings below follow the
order of its sections. The questionnaire's exact wording changes from time to
time, so match each answer to the question it best fits.

---

## 1. Company and app

| Question | Answer |
|---|---|
| Company legal name, address, country | **[Jagan: legal entity name and registered address]** |
| App name | Reclaim |
| Primary contact | **[Jagan: name, role, email, phone]** |
| Security / incident contact | **[Jagan: an address that is watched every day, e.g. security@<your domain>]**. Until a domain exists, reclaimbusiness1@gmail.com is the public contact (footer, Terms, Privacy). |
| Website / host domain | **[Jagan: the production domain, e.g. https://app.<domain>]**. Must match `APP_ORIGIN`. |
| Launch URL | `<APP_ORIGIN>/audit` |
| Connect / redirect URI | `<APP_ORIGIN>/api/integrations/quickbooks/callback` (the only redirect URI the app uses) |
| Disconnect URL | `<APP_ORIGIN>/audit` (Settings → Connected accounts has the disconnect control; see §5 for what happens if a customer disconnects from QuickBooks' side) |
| Privacy policy URL | **[Jagan: `<APP_ORIGIN>/privacy` once deployed; the page is `src/pages/PrivacyPage.tsx`]** |
| End-user licence / Terms URL | **[Jagan: `<APP_ORIGIN>/terms`; page is `src/pages/TermsPage.tsx`]** |
| Hosting provider and region | **[Jagan: decision, see `docs/deploy.md` and the pilot data policy]** |
| Is the app listed on the QuickBooks App Store? | **[Jagan: decide. Production keys don't require a listing; a listing adds Intuit's branding and marketing review.]** |

### What the app does (for the "describe your app" box)

> Reclaim helps small and mid-sized businesses find and recover duplicate
> supplier payments. With the customer's permission it reads their accounts
> payable from QuickBooks Online: vendors, bills, bill payments, vendor
> credits, deposits and purchases. It then checks for the same bill paid
> twice, overpayments and similar leaks, and helps the customer assemble the
> evidence to ask the supplier for the money back. Reclaim only reads from
> QuickBooks. It never creates, changes or deletes anything in the customer's
> books, never moves money, and never contacts a supplier on its own.

---

## 2. Scopes and API use

**Scope requested:** `com.intuit.quickbooks.accounting` only. Intuit has no
read-only accounting scope, so read-only is enforced in Reclaim's code:

- Every company-data call goes through one function (`apiGet` in
  `server/quickbooks.ts`). It issues **GET requests only**, only to the API
  host of the configured environment (`https://sandbox-quickbooks.api.intuit.com`
  or `https://quickbooks.api.intuit.com`), and only for three paths: `query`,
  `cdc` (change data capture) and `companyinfo`.
- Queries must start with `SELECT` and may only name the six entities below;
  change data capture is restricted to the same list. The realm id must be
  digits only, so it cannot be used to reach another path.
- Automated tests (`server/quickbooks.test.ts`, "the QuickBooks client is
  read-only", run for both hosts) fail if any company-data request uses
  another method, another host or another statement. The only non-GET
  requests the module makes go to Intuit's OAuth service: token exchange,
  refresh and revoke.

**Entities read:** `CompanyInfo` (company name), `Vendor`, `Bill`,
`BillPayment`, `VendorCredit`, `Deposit`, `Purchase`. No customers,
invoices, sales, payroll, employees, attachments or reports.

**Minor version:** 75.

**How often:**

- When the customer clicks **Import from QuickBooks**.
- Automatically when a signed-in customer opens their dashboard, but only if
  the last sync was more than 15 minutes earlier.
- If the last pull of that company was within 29 days, Reclaim uses change
  data capture (`/cdc?entities=…&changedSince=…`) and reads only what changed.
  Otherwise it pages through each entity, 1,000 rows per query.
- A sync is roughly 7–15 GET requests for a small company. Each account is
  limited to 20 syncs an hour. There are no background jobs and no syncs for
  companies whose owner isn't using the app.

**Throttling and errors:**

| Response | What Reclaim does |
|---|---|
| 401 on a data call | Refreshes the access token once, re-seals the new tokens, and retries. |
| 400 or 401 on refresh | Treats the connection as revoked: deletes the stored tokens and shows "Reconnect QuickBooks". |
| 429 | Stops and tells the customer to try again in a minute. There is no automatic retry loop. |
| Any other failure | The customer sees a plain message ("QuickBooks didn't respond as expected"). |

Error messages and logs record the HTTP status and Intuit's `intuit_tid`, so a
failed call can be traced with Intuit support. They never include a response
body or token.

---

## 3. Authorization (OAuth 2.0)

- **Flow:** standard authorization-code flow. The customer clicks **Connect
  QuickBooks**. The server redirects to `https://appcenter.intuit.com/connect/oauth2`
  with a random `state`, and the customer approves on Intuit's own page. The
  callback exchanges the code server-side with the client secret. The browser
  never sees the client secret or any token.
- **CSRF / state:** `state` is 32 random bytes, stored in an HttpOnly cookie
  (scoped to the QuickBooks path, 10 minutes) together with the id of the
  account that started the flow. The callback refuses a missing, wrong or
  expired state, or one started by a different account, before exchanging
  the code.
- **Only signed-in accounts** can connect. With email verification on (the
  default), a session is issued only once the email is verified. Guests and
  the sample session never reach QuickBooks.
- **Token storage:** access and refresh tokens are sealed with AES-256-GCM
  under `QBO_TOKEN_KEY`. That 32-byte key is held in the host's secret store,
  never in the database, image or repository. The account id and realm id
  are bound in as associated data, so tokens copied to another account's
  row cannot be opened.
- **Refresh:** the access token is refreshed when within a minute of expiry,
  or after a 401. Intuit's new refresh token replaces the old one at once.
- **Status:** what the browser can see is connected or not, the company name,
  when it connected and when it last synced. No token, realm id or secret is
  ever exposed.
- **Environments:** `QBO_ENVIRONMENT=sandbox` (the default) or `production`.
  The server refuses to start with `production` unless all of these hold:
  - `NODE_ENV=production`, with every production startup check passing.
  - All three QuickBooks keys are set.
  - `APP_ORIGIN` is a public `https://` address; http and localhost are refused.

---

## 4. Data handling and security

### What is stored, and how

| Data | Protection | Kept until |
|---|---|---|
| QuickBooks access and refresh tokens, realm id, company name | Tokens: AES-256-GCM under `QBO_TOKEN_KEY`. | The customer disconnects or deletes the account. |
| Audits built from QuickBooks data (see the list below) | AES-256-GCM under `DATA_KEY`, a key separate from the token key, bound to the account and audit. | The customer deletes the audit or account. |
| Account: email, name, company, password hash | Password: scrypt (N=2^15) with a per-account salt. Other fields are not encrypted at rest. | Account deletion. |
| Sessions, email-verification and reset links | Only SHA-256 hashes are stored. Session cookies are HttpOnly, Secure and SameSite=Lax. | Expiry, log-out or deletion. |

An audit built from QuickBooks data holds:

- One row per bill-payment line and per vendor purchase: vendor, bill number,
  dates, amounts, terms, category, currency, bank or card account name, and
  the QuickBooks transaction id.
- The links QuickBooks provides: which bill each payment paid, and vendor
  credits, refunds and voids, by transaction id and amount.
- The findings and evidence built from them.

Raw API responses are not stored. The server turns each pull into those rows
in memory and discards the rest: customer deposits, line descriptions,
addresses and anything else the queries return.

Production refuses to start without `DATA_KEY`, so audits are always
encrypted in production.

- **In transit:** HTTPS only. `APP_ORIGIN` must be https in production, and
  HSTS is sent. **[Jagan: TLS termination at the host. Name the provider and
  confirm TLS 1.2+.]**
- **Deleted data** is zeroed in the database file (`PRAGMA secure_delete`),
  not left in free pages.
- **Backups** (`server/backup.ts`) are a consistent copy of the database.
  Audits and tokens inside stay encrypted. **[Jagan: where backups are kept,
  that they are encrypted at rest, and the retention, proposed 30 days.]**
- **Browser:** the customer's own browser keeps a working copy of their
  audits (localStorage). It is cleared at log-out and on account deletion.
  QuickBooks tokens never reach the browser.

### Who can see it

- Each customer sees only their own account, audits and connection. Every
  API route checks the signed-in account, and every database query is
  scoped to it. Tests cover cross-account access (`server/security.test.ts`).
- Reclaim staff: **[Jagan: who has access to the production host and database,
  how access is granted and removed, and whether MFA is required on the
  hosting, GitHub and Intuit developer accounts. It should be.]** The pilot
  rule is that nobody opens a customer's audit without that customer's
  permission (`docs/pilot-data-policy.md`).

### Shared with other parties

QuickBooks data is not sold, used to train models, or shared between
customers. It leaves Reclaim only when the customer asks:

- **Anthropic**, when the customer clicks Draft with AI on one case. Only that
  case's facts are sent (vendor, amounts, invoice numbers, dates); the rest of
  the ledger is not.
- **The customer's own Gmail**, when they send a recovery letter from it. The
  only Gmail permission is `gmail.send`, which can't read the mailbox.
- **The hosting provider**, which holds the encrypted database.
  **[Jagan: name it.]**

### Logging and monitoring

- Server logs record errors only: an error type and message, the HTTP status
  and, for QuickBooks, `intuit_tid`. Tokens, passwords, response bodies and
  ledger contents are never logged.
- **Not yet in place** (say so if asked): a per-customer access audit log, and
  alerting or intrusion detection. **[Jagan: what the host provides, e.g.
  uptime and error alerts.]**

### Vulnerability management

- Dependencies come from npm with a lockfile. Every change runs type checks,
  685 automated tests at the time of writing (including adversarial and cross-account suites)
  and lint.
- **[Jagan: whether you run `npm audit` or Dependabot, and how quickly you
  patch.]**
- There has been no third-party penetration test and there is no SOC 2 or
  ISO 27001 certification. Answer honestly that neither has been done yet.

### Incident response

From `docs/pilot-data-policy.md`, pilot rule 5:

1. Rotate the affected keys (`docs/deploy.md` §6–7). Rotating `QBO_TOKEN_KEY`
   makes every stored QuickBooks connection unusable; customers reconnect.
2. If QuickBooks tokens may be exposed, revoke them. Each customer's
   **Disconnect** does this; a bulk revoke would loop over the connections
   table.
3. Tell affected customers promptly, and Intuit where its data is involved.
   **[Jagan: the time frame, e.g. 72 hours, and the contact at Intuit:
   security@intuit.com or the developer support case route.]**
4. Write down what happened and what changed.

---

## 5. Disconnect, revoke and deletion

| Event | What happens |
|---|---|
| Customer clicks **Disconnect QuickBooks** (Settings → Connected accounts) | Reclaim calls Intuit's revoke endpoint with the refresh token, then deletes the stored tokens and connection row. The tokens are deleted even if Intuit can't be reached, which ends Reclaim's access either way. The audits already built stay until the customer deletes them. |
| Customer deletes their account (Settings → Your data, typing their email to confirm) | Revoke at Intuit first, then delete the account and everything tied to it in one step: audits, tokens, sessions, links, fingerprints. Every device is signed out and the browser copy is cleared. |
| Customer disconnects Reclaim from QuickBooks' side (QuickBooks → Apps → Disconnect) | Reclaim's next refresh is refused. Reclaim deletes the stored tokens and shows "Reconnect QuickBooks". Nothing is retried. |
| Customer connects a different company | The new tokens replace the old, and the old company's audit link is cleared. |
| Retention after deletion | Deleted data stays in backups until they expire. **[Jagan: state the backup window, proposed 30 days.]** |

Customers can also **export** everything Reclaim holds about them as one
JSON file (Settings → Your data). The export never includes tokens or
password hashes.

---

## 6. Before submitting

- [ ] Fill every **[Jagan: …]** above.
- [ ] Update the Privacy Policy and Terms. They still say the connection
  "works only with Intuit's sandbox (test) companies"
  (`src/pages/PrivacyPage.tsx`, `src/pages/TermsPage.tsx`) and need the
  changes listed at the end of `docs/pilot-data-policy.md`. Bump
  `TERMS_VERSION` in `src/legal/terms.ts` when you do.
- [ ] Deploy to the production domain, with `QBO_ENVIRONMENT=sandbox` still
  set, and run a sandbox connect, import and disconnect there.
- [ ] Only after Intuit approves: switch the keys and `QBO_ENVIRONMENT=production`
  (see "Needs Jagan" in the session report).
