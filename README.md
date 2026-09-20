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

The bundled ledger is fictional demo data. Its totals are potential impact, not customer money recovered by Reclaim.

## Product truth

Reclaim's detection is an explainable, deterministic rules engine that runs in the browser: the same CSV produces the same findings, and every displayed amount traces back to a rule and transaction records. AI is used in exactly one place — drafting the wording of a recovery request, on the server, from the case data on the page, for the person to read and edit before they send it themselves. Reclaim never emails a vendor.

Accounts, sessions and each account's audits live on the Reclaim server (`server/`, SQLite). The browser keeps a per-account cache in localStorage while that person is logged in and clears it on log-out.

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

The next product steps are a guided audit workflow, review-case statuses, accounting-platform imports, and carefully scoped AI-assisted categorization or finding explanations with human confirmation.

Reclaim is being developed as a prototype for the Atlanta Youth AI Hackathon & Pitch Summit 2026.
