# Reclaim release readiness — 2026-10-20

This is a code and configuration review of `codex/reclaim-implementation`, not a deployment certificate. The audited `recovery-eligibility-gate` commit `96cfb9e` is older than this branch's starting point `d32be03` on local `origin/main`. No production deployment, real customer connection, supplier send, live billing, or external penetration test was performed for this change.

## Integration status

| Capability | Code present | Configuration checked here | Sandbox with provider | Production approval | Deployed test | Real-user verification |
| --- | --- | --- | --- | --- | --- | --- |
| CSV upload and review | Yes; parser, import identity, checks and case workflow | Local tests and build | Not applicable | Not applicable | Not verified | Not verified |
| QuickBooks Online | Yes; OAuth, token sealing, GET-only import and disconnect | Variables and startup checks inspected | Mocked adapter tests only; live Intuit sandbox not verified | Not verified | Not verified | Not verified |
| Gmail sending | Yes; `gmail.send` scope, manual send, follow-up and uncertainty handling | Variables and startup checks inspected | Mocked Gmail tests only | Not verified | Not verified | Not verified |
| Anthropic drafting | Yes; server-held key and authorized case lookup | No key provided in this review | Mocked provider tests only | Not verified | Not verified | Not verified |
| Case assistant | Yes; server-scoped, deterministic answers with citations | No external key required | Local tests only | Not applicable | Not verified | Not verified |
| Stripe subscriptions | Yes; checkout, webhook and plan state code | No Stripe credentials supplied in this review | Fake Stripe tests only | Not verified | Not verified | Not verified |
| Success fees | Billing code path disabled for customer-entered returns | Disabled in code | Local tests only | Policy and approval missing | Not verified | Not verified |

QuickBooks requests `com.intuit.quickbooks.accounting`. That permission permits writes even though Reclaim's adapter currently issues GET data calls. Do not describe the OAuth grant as read-only. The Intuit implementation is already on the branch's starting commit; it was not on the older audited commit.

## Data and security gates

| Gate | Current evidence | Before real financial records |
| --- | --- | --- |
| Server authority | Typed case commands, revision conflicts, idempotent command IDs, tenant-scoped event log; old whole-project saves blocked from changing active cases and their source rows. Imported ledger rows and initial findings still originate from the customer client, so this is case-action authority, not independent proof of source transactions. | Run a two-device pilot and review conflict recovery with real-sized projects; define any provider-backed source verification needed for production claims |
| Local unsent work | Per-account persisted operation queue and local project copy; refused saves stay visible | Verify browser storage quota behavior and export/recovery procedure on each supported browser |
| Historical cases | Migration marks old approvals and returns as legacy assertions; append-only legacy event. A sent request can now be archived into a separate generation. Fresh evidence, a new decision, and a new approval are required before another request. The new amount is capped by evidence after earlier recorded returns. Old receipts, supplier replies, and late returns remain attributed to the archived request; a late return holds contact if the active request is no longer supported. Local command tests cover revision conflict, replay, tenant ownership, and the money boundary. | Repeat the pre-migration restore and two-device conflict workflow in staging; resolve historical cases whose original request amount or return reference is missing before any new request |
| Encryption | Production startup requires `DATA_KEY`; project payloads use AES-256-GCM; integration tokens have separate keys | Verify host volume encryption, key custody and rotation outside this repo |
| Backup and restore | Backup code checks SQLite integrity; a local test copies a backup and reopens an encrypted project with its retained data key | Schedule offsite copies and perform a hosted staging restore with retained keys |
| Export and deletion | Account routes and local tests exist | Test full account lifecycle in staging, including backup retention policy |
| Development mailbox | Production startup rejects it; localhost default only | Verify `NODE_ENV`, public origin and network binding on chosen host |
| CSP | Frame/object/base restrictions enforced; broader policy is report-only because active pages use inline scripts | Remove incompatible inline script/style patterns, enforce a tested policy, review violation reports |
| Security review | Authorization, malformed payload and cross-account tests exist | Independent review and penetration test remain unperformed |

The next integration to verify is **QuickBooks in an Intuit sandbox**, because the first duplicate-payment workflow needs bill, payment, supplier and adjustment identities. Test its granted permission boundary and token lifecycle with the actual Intuit app before considering production access. Bank matching remains a separate, later choice for independently verified returns.

## Setup for a local review

1. Use an isolated database and `NODE_ENV` other than `production`. Install dependencies with `npm ci` if they are not present.
2. Set `DATABASE_PATH` and `APP_ORIGIN` to a localhost URL. Start the server with `npm run dev:server` and the client with `npm run dev`.
3. For account email in a localhost-only test, use the development mailbox. Do not expose it on a public host.
4. Optional services require `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google sign-in; `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_TOKEN_KEY`, and `QBO_ENVIRONMENT=sandbox` for QuickBooks; `GMAIL_TOKEN_KEY` with the Google client for Gmail sending; `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL` for AI email drafting. Use different random 32-byte base64 keys for `DATA_KEY`, `QBO_TOKEN_KEY`, and `GMAIL_TOKEN_KEY`.
5. Stripe subscription testing uses a **test** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and matching `VITE_STRIPE_PUBLISHABLE_KEY`. Do not use a live key for this review. Success-fee invoicing remains disabled.

See `docs/deploy.md` and `.env.example` for the full variable list and host-specific steps. No secret value belongs in this file or the repository.

## Review demonstration

### Isolated supplier recovery exercise

Use a throwaway local account and a fresh shell with no provider credentials exported. Start the API without loading a credential file, then start Vite in a second terminal. The local development mailbox handles account verification.

```powershell
# API terminal
$env:NODE_ENV = 'development'
$env:PORT = '8790'
$env:APP_ORIGIN = 'http://localhost:5174'
$env:DATABASE_PATH = ':memory:'
node server/index.ts

# Client terminal
$env:RECLAIM_API_ORIGIN = 'http://127.0.0.1:8790'
$env:VITE_PORT = '5174'
npm run dev
```

1. Log in through `/login?next=%2Faudit%3Fsample%3Drecovery`. Open **Example Supply Co.** The repeated-payment rule flags two payments against bill `SAMPLE-4280`.
2. Review the fictional bill, payments, and refund references. Select **Save evidence**. Open **Show calculation** to see the original $4,280 duplicate, the $1,000 confirmed refund, and the $3,280 outstanding balance.
3. Choose **I reviewed this check**, prepare authorization, and save the decision. Select **Refund** and review the suggested `billing@example-supply.test` address from the sample supplier master. Confirm the address and answer the prior-knowledge question. Open **Preview request** and optionally add the editable `payment-evidence.txt` summary.
4. Approve the exact package and click **Simulate sending request**. The sample records a local activity entry and a follow-up date. There is no external send path for this exercise.
5. Under **Log a reply**, choose **Promised a refund or credit**, enter $3,280, and add a fictional note. The outstanding amount stays $3,280. Then choose **Record money back**, select **Cash refund** and **Bank transaction**, and enter the fictional reference `SAMPLE-DEPOSIT-3280`. The outstanding amount becomes $0. Reconciliation is available on the closed case.

For repeatable local verification, run `npm test -- src/accountFlow.test.tsx -t "isolated recovery demo"`. The test authenticates against the running local HTTP server and drives the rendered workspace. The exercise is in memory and never syncs to a saved project.

### Sending modes

- **Simulated** uses the local sample action. The Gmail adapter tests separately use a fake Google client to exercise acceptance, rejection, uncertain outcomes, version checks, and concurrent sends.
- **Manual** uses **Copy draft**, optionally downloads the approved evidence summary, and records **Mark request sent** after the customer sends from their own mailbox. This is a customer record.
- **Live Gmail** requires the Google OAuth client, `GMAIL_TOKEN_KEY`, and an authorized customer mailbox connected through Settings. See [deployment configuration](deploy.md). Live sending still needs an authorized test mailbox and an approved sandbox recipient before a pilot. Gmail acceptance leaves delivery unconfirmed. Supplier replies are entered manually.
- A server process interruption during an active Gmail reservation can leave a pending attempt. Reconcile the attempt against the sender's Sent folder before further outreach. Staging verification of interrupted sends is still required.

### Additional historical and cross-device checks

1. Upload a CSV with one repeated invoice payment and inspect both raw rows, import identity and the check's flagged value.
2. Confirm entity, supplier ID, obligation, currency, settled payment IDs and adjustment checks. Note that these are reviewer assertions; the possible request appears only after the gate passes.
3. Record a review decision, approve an amount and recipient, then mark a request. Use copy/download for the demonstration; do not send to a supplier.
4. Enter a partial refund or applied credit with a reference. Check the money timeline, outstanding balance and reconciliation. It remains customer-recorded unless matched independently. For a historical sent request, archive it, save fresh evidence, decide again, approve only the remaining supported amount, and verify that a late return for the old request holds further contact when necessary.
5. Dismiss a known recurring bill as a false alarm and inspect its retained history.
6. Open the same saved case on two devices, edit it on both, and confirm the second save receives a visible revision conflict with its local work preserved.

## Remaining release blockers

1. Real Intuit sandbox, Gmail, Anthropic and Stripe test credentials and provider approvals are absent from this review.
2. Independent matching of refunds and applied credits, cross-project settlement identity, and the policy for invoicing success fees need product and accounting decisions. Reimporting changed source rows for an active case currently raises a revision or case-command conflict; a reviewed source-change/revalidation workflow is still needed. Historical requests with a missing original amount or unresolved unverified return remain blocked from the new-generation workflow until their records can be corrected.
3. A staging restore, hosted security review, enforceable CSP, browser and responsive walkthrough, and real pilot data have not been verified.
4. Pricing in code is Free, Growth at $15/month plus a proposed 10% success fee, and Flat at $50/month. Website and app now describe these as proposed; the older $19.99/$100 figures in the prompt do not match `server/plans.ts`. A founder must choose the final price before live checkout.

## Safe continuation point

This branch contains the implementation and review changes. The new-generation path has focused server, model, Gmail, journey, selector, sync, and app coverage: **169 tests across 10 affected files passed** after correcting the outcome-reopen issue. The final focused run passed **108 tests across 7 files**, including the dashboard balance correction. A serial full suite run observed **802 passes and one failure** while its test file and implementation were being edited concurrently; the corrected affected test passed in the later focused run. The final production build, client and server type checks, lint, and diff whitespace check passed; lint reports existing warnings. A visual browser walkthrough and hosted staging restore have not been performed. The full suite excludes archived experiments and preview copies through `vite.config.ts`.

Next: repeat the pre-migration backup and restore in staging, exercise the two-device conflict in a browser, and run a real Intuit sandbox workflow with approved test credentials. Keep customer-entered returns separate from independently matched results.
