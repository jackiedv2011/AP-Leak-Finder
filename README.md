# AP Leak Finder

**Find the money your business lost to payment errors.**

AP Leak Finder is a fully client-side web app that lets a small business upload their
accounts-payable payment history as a CSV, runs a **deterministic rules engine** to detect
money lost through payment errors, and presents the results as a clean dashboard with a
total dollar figure, a per-category breakdown, a detailed findings table, and an
auto-generated recovery letter for every finding.

Enterprise AP-recovery firms (PRGX, Xelix) only serve large companies on SAP/Oracle. The
~33 million US small businesses on QuickBooks/Xero get nothing but a basic "duplicate
invoice number" check. This MVP brings enterprise-grade payment-error detection to small
businesses.

## Why it's deterministic (no AI)

Every dollar figure traces back to a concrete rule. The detection is 100% local and
deterministic — the same input always produces the same output — so it can never
"hallucinate" a false number. There is **no backend, no database, no external API, and no
API key**. Your data never leaves your browser.

Findings are labeled honestly:

- **Recoverable** — money you can likely get back (duplicates, overpayments, unclaimed discounts).
- **Review** — flagged for a human to check, not a guaranteed recovery (bank-account changes, statistical outliers).
- **Opportunity** — future process savings, not a past recovery (missed early-payment discounts).

The headline "Recoverable" total never mixes in Review or Opportunity dollars.

## The detection rules

| # | Rule | Class | Severity |
|---|------|-------|----------|
| 1 | Exact duplicate payment (same vendor + invoice number paid 2+ times) | Recoverable | High |
| 2 | Near-duplicate payment (same vendor, same amount, different invoice #, within 45 days) | Recoverable | High |
| 3 | Overpayment vs. invoice (paid more than the invoice amount) | Recoverable | High |
| 4 | Unclaimed early-payment discount (paid in the discount window but at full price) | Recoverable | Medium |
| 5 | Missed early-payment discount (paid too late to claim an offered discount) | Opportunity | Low |
| 6 | Vendor bank-account change (deposit account changed — a fraud vector to verify) | Review | High |
| 7 | Payment amount outlier (payment far above a vendor's normal range) | Review | Medium |

No single record is counted in two "recoverable" findings (Rule 1 wins over Rule 2; the
higher-dollar finding wins on any other overlap).

## Expected CSV format

Header row required; column names are matched case-insensitively. Currency values may
include `$` and commas.

| Column | Notes |
|--------|-------|
| `vendor` | Vendor / supplier name (**required**) |
| `invoice_number` | Invoice ID as printed |
| `invoice_date` | `YYYY-MM-DD` |
| `payment_date` | `YYYY-MM-DD` (**required**) |
| `invoice_amount` | Amount the invoice was for |
| `amount_paid` | Amount actually paid (**required**) |
| `terms` | e.g. `2/10 net 30`, `net 30`, `net 15`, or blank |
| `bank_account_last4` | Last 4 digits of the vendor bank account paid to (may be blank) |
| `category` | GL category (optional) |

Rows missing `vendor`, `payment_date`, or `amount_paid` are skipped, and the count of
skipped rows is reported in the UI.

A ready-to-try sample is bundled: click **Load sample ledger**, or **Download sample CSV**
to inspect and re-upload it.

## Tech stack

- Vite + React 18 + TypeScript (strict mode)
- Tailwind CSS + shadcn/ui-style components (Radix primitives)
- PapaParse (CSV), Recharts (chart), lucide-react (icons)
- Vitest (unit tests)

No backend, no server features. Deploys as a static `dist/` folder.

## Run it locally

```bash
npm install
npm run dev      # start the dev server (Vite)
npm run test     # run the detection-engine unit tests
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

`npm run build` completes with zero TypeScript errors, and `npm run test` runs the full
unit-test suite (per-rule tests plus a sample-ledger sanity check).

## Project structure

```
src/
  components/        UploadCard, StatCards, ImpactChart, FindingsTable, FindingDialog, LetterDialog
  components/ui/     shadcn-style primitives (button, card, table, badge, tabs, dialog, input, select, separator)
  lib/
    detection.ts       the 7-rule engine (pure functions)
    detection.test.ts  unit tests for every rule
    csv.ts             CSV parse + normalize into APRecord[]
    format.ts          currency / date / vendor-normalize / terms helpers
    letters.ts         recovery-letter + internal-note templates
    labels.ts          human labels for finding types/classes/severities
  data/
    sampleLedger.ts          loads the bundled sample
    sample-ledger-source.csv single source of truth for the sample data
  types.ts           APRecord, Finding, DetectionResult, etc.
  App.tsx            three-state flow: upload -> results, with dialogs
public/
  sample-ledger.csv  downloadable copy (byte-identical to the bundled source)
```

## Deploy (static site)

The production build is a static `dist/` folder that can be hosted anywhere.

**Vercel:** import the repo, framework preset **Vite**, build command `npm run build`,
output dir `dist`. (Or `npm i -g vercel && vercel --prod`.)

**Netlify:** `npm run build`, then drag `dist/` into Netlify Drop, or connect the repo
with build command `npm run build` and publish dir `dist`.

## Future work

The next step is a live **QuickBooks / Xero OAuth sync** so businesses can pull their AP
ledger automatically instead of exporting a CSV. The detection engine stays exactly the
same — deterministic and local — regardless of how the data arrives.
