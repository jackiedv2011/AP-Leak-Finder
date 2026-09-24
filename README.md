# Reclaim.

**Payment intelligence, made explainable.**

Reclaim is a client-side FinTech prototype for growing businesses that review accounts-payable exports without a dedicated audit team. Upload a CSV ledger, surface potential payment issues, inspect the transactions behind each finding, and prepare the appropriate next action.

## What the prototype does

- Parses a local CSV ledger in the browser
- Detects duplicate payments, overpayments, discount opportunities, bank-account changes, and payment outliers
- Separates **likely recoverable**, **needs review**, and **future savings** findings
- Shows the records and rule behind every flag
- Drafts a recovery request only for likely recoverable findings
- Creates internal review notes for ambiguous, risk, and future-savings findings
- Tracks customer approval, vendor replies, follow-ups, settlement proof, and accounting reconciliation on each recovery case

The bundled ledger is fictional demo data. Its totals are potential impact, not customer money recovered by Reclaim.
Open flagged value includes findings that require review or point to future savings; it is not a recovery forecast. Reclaim does not count a future-savings finding as a payment it protected.

## Product truth

Reclaim's detection is an explainable, deterministic rules engine that runs in the browser: the same CSV produces the same findings, and every displayed amount traces back to a rule and transaction records. AI is used in exactly one place — drafting the wording of a recovery request, on the server, from the case data on the page, for the person to read and edit before they send it themselves. Reclaim never emails a vendor.

Accounts, sessions and each account's audits live on the Reclaim server (`server/`, SQLite). The browser keeps a per-account cache in localStorage while that person is logged in and clears it on log-out.

## Recovery MVP

If the customer already knew about a finding, approval captures a short explanation in the case history. Changing that disclosure requires renewed approval before the request can be recorded as sent.

Confirm a finding, review its evidence checklist and suggested refund or credit method, then approve the request before sending it from your own email. Approval requires an explicit answer about whether your team already knew of the issue, preserving recovery attribution for later billing decisions. Record when the request was sent, log vendor responses, and follow up on the suggested business-day date. Vendor promises and issued credits remain pending. Record returned value only after a refund settles or a credit is applied to a bill, with a reference to the supporting record. Partial returns keep the request open for more settlements or an explicit close of the remaining balance. A closed remainder can be reopened without deleting the valid partial return; correcting an erroneous return reverses its recorded amount. Then record the accounting reconciliation and root cause. The case shows a financial event ledger and a separate activity history.

The dashboard and recovery queue show vendor-agreed and pending-return amounts separately from returned value. Those figures come from customer-recorded replies, decrease as settlements are logged, and are never summed together as recovered money. The case ledger also distinguishes acknowledgement, agreement, a reported refund, an issued but unapplied credit, and an actual recorded return.

The dashboard groups open requests by time since recorded outreach and lists recent customer-recorded returns. An older request with no send date appears as undated instead of being assigned an invented age.

Older cases marked recovered without an amount stay visible for correction. Reclaim does not infer the full finding value as returned, and reconciliation stays unavailable until the reviewer records a return amount.

Risk and future-savings findings use an internal review path. The reviewer files a note, records the investigation outcome, and can reopen it. These findings stay in Findings and the dashboard's internal-review tasks; only recoverable findings enter the vendor Recoveries queue. Their flagged value never enters requested, returned, or reconciled recovery totals. Older saved internal outcomes remain readable without being counted as returned money.

These are customer-recorded actions. The app does not yet connect to a vendor inbox, accounting platform, bank, or payment system; it does not independently verify a customer-entered settlement. Existing detection checks and CSV inputs are unchanged.

## Running it

```bash
cp .env.example .env      # optional; everything has a development default
npm run dev:server        # API on :8787 (SQLite in ./data/, dev mailbox, no email sent)
npm run dev               # Vite on :5173, proxies /api to the server
```

Without a `.env`, sign-up still requires email confirmation — the "Check your email" screen shows the link the server *would* have sent (development mailbox). Google sign-in and AI drafting stay hidden until their variables are set; see `.env.example` for which values are public and which are secrets.

Production: `npm run build && NODE_ENV=production APP_ORIGIN=https://… npm start` serves `dist/` and the API from one process.

## Detection rules

| Rule | Classification | Current behavior |
| --- | --- | --- |
| Equal-value payments on the same vendor invoice | Likely recoverable | Highlights the extra equal payment(s) as potential recovery |
| Repeated invoice with different payment amounts | Needs review | Flags the payment schedule without assuming a refund is due |
| Same vendor, same amount, different invoice within 45 days | Needs review | Highlights a suspected duplicate for human confirmation |
| Amount paid above invoice amount | Likely recoverable | Flags the paid-over-invoice difference |
| Early-payment discount not taken inside the discount window | Likely recoverable | Prepares a possible discount-credit request for review |
| Early-payment discount missed after the window | Future savings | Identifies a process improvement, not a past recovery |
| Vendor bank-account change | Needs review | Prompts an internal verification step |
| Unusually large vendor payment | Needs review | Prompts a contract or purchase-order check |

## Expected CSV format

Required columns are `vendor`, `payment_date`, and `amount_paid`. Other fields strengthen the analysis when available.

| Column | Notes |
| --- | --- |
| `vendor` | Vendor or supplier name |
| `invoice_number` | Invoice ID as printed |
| `invoice_date` | `YYYY-MM-DD` |
| `payment_date` | `YYYY-MM-DD` |
| `invoice_amount` | Amount invoiced |
| `amount_paid` | Amount paid |
| `terms` | For example, `2/10 net 30` |
| `bank_account_last4` | Vendor deposit account last four digits |
| `category` | Optional GL category |

Malformed dates and currency values are rejected. Rows missing a required field are skipped and counted in the interface.

## Local development

On Windows PowerShell, use `npm.cmd` if PowerShell blocks the `npm` shim.

```bash
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The development server exposes two product surfaces:

- `/` is the Reclaim landing page.
- `/audit` is the CSV audit workspace.
- `/audit?sample=1` opens the workspace with the bundled sample already analyzed.
- `/audit?upload=1` opens the workspace at the CSV upload entry point.
- Unknown routes render the branded 404 page.

`vercel.json` rewrites application routes to `index.html` so direct links work after a Vercel deployment.

## Social preview

The current Open Graph and X metadata uses the existing Reclaim logo asset as a lightweight prototype preview. Before a public launch, export the approved identity at 1200 by 630 pixels as a PNG, host it on the production domain, and replace the relative preview path with its absolute URL.

## Stack

- Vite, React 19, TypeScript
- Self-hosted Manrope variable type
- Tailwind CSS and Radix primitives
- PapaParse for CSV parsing
- Recharts for data visualization
- Vitest for rule and sample-data tests

## Roadmap

The next product steps are accounting-platform imports, customer-approved email integration, automatic reply and settlement matching, and billing. Financial decisions remain customer-controlled.

Reclaim is being developed as a prototype for the Atlanta Youth AI Hackathon & Pitch Summit 2026.
