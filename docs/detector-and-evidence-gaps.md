# Detector and evidence gaps (REC-14)

**Status: fixes for issues 1, 2 and 3 implemented with tests, not committed.** Measured 2026-10-16 on branch `claude/cool-herschel-059d6c`. The evidence gate (`src/recovery/eligibility.ts`) was not changed.

## What was measured

| Dataset | Rows | Findings before | Findings after |
|---|---|---|---|
| `public/sample-ledger.csv` (planted issues) | 80 | 16, all planted | 16, unchanged |
| QuickBooks sandbox export (`data/qbo-sandbox/qbo-export.csv`, current mapping: Purchases carry no reference) | 43 | 3, all false alarms (weekly car wash) | 0 |
| Same export with each Purchase's `DocNumber` as its reference (the old mapping, and what a CSV of card/check expenses looks like) | 43 | 6, all false alarms | 0 |
| `src/lib/detection.adversarial.test.ts` | — | 34 pass | 47 pass (13 new) |

The Intuit sample company has no real duplicates, overpayments or discounts to find, so it tests false alarms only. "Misses" below come from the sample ledger and the adversarial cases.

## Results by check

| Check | True hits | False alarms | Misses | Proposed fix |
|---|---|---|---|---|
| Exact duplicate (Rule 1) | Sample: 2 of 2 (Sierra INV-3305, Harbor Point INV-7710) | QBO with check numbers: 1. Chin's Gas $65 and $52.56 grouped as "Repeated payments for invoice 1" | None seen | **Done.** A reference of 1–2 characters ties rows to one invoice only when the amount repeats too. Placeholder words ("Debit", "N/A", "Cash", all zeros) count as no reference. |
| Near duplicate / same amount (Rule 2) | Sample: 3 of 3 (Blue Bag 4471-R, Milk & Honey 2210B, Riverside 559/560) | QBO: 3. Weekly $19.99 car wash (Purchases 136, 138, 141, 142) | None seen. Blue Bag "-R" and "2210B" show as "same amount" rather than "reference variant" (a weaker label, but still found) | **Done.** Recurring-series detection now includes rows without an invoice number. A payment that keeps to the schedule is never the suspect, so one extra charge is flagged once, not once for every later payment in the series. |
| Near duplicate without invoice numbers (issue 3) | New tests: a bill paid by check and again by card (no reference) is caught; two card charges 3 days apart are caught | None in the QBO data after fix 1. Before this fix, two same-amount, round-number card purchases up to 45 days apart (e.g. two $50 fuel fills) were flagged | None seen | **Done.** When neither payment has a reference, they're only matched within 14 days (`NO_REFERENCE_WINDOW_DAYS`). If either has one, the 45-day window still applies. Daily same-amount orders (cadence under 5 days) still chain; that's left alone because it looks the same as a burst of duplicates. |
| Overpayment (Rule 3) | Sample: 2 of 2 (Golden Bean, Evergreen) | None | None | — |
| Unclaimed discount (Rule 4) | Sample: 2 (Sierra INV-3308, CloudPOS CP-01) | None | None | — |
| Missed discount (Rule 5) | Sample: 3 | None | None | — |
| Bank-account change (Rule 6) | Sample: 2 of 2 (CloudPOS, Metro Electric) | None | Can't run on QBO data (no account digits in the export) | Map vendor bank details from QBO if the API exposes them. |
| Amount outlier (Rule 7) | Sample: 2 of 2 (Northwest Pastry, Cascade Ice) | None | Vendors with fewer than 5 payments are never checked | — |
| Shared invoice number (Rule 8) | Covered by existing tests | QBO with check numbers: 2 high-severity alerts (refs "1" across 3 vendors, "12" across 2) | None seen | **Done.** Only references of 3 or more characters are compared across vendors. |

## Trade-offs of the fixes

- Two payments with the same short reference (e.g. "12") **and the same amount** are still an exact duplicate. With **different amounts**, no repeated-invoice review is raised, and those rows can still be matched by Rule 2.
- Rows whose reference is a placeholder ("Debit") are no longer exact duplicates of each other. If they have the same amount within 45 days, they show up as the weaker "same vendor and amount" review instead.
- A real double charge on a card that's more than 14 days apart, with no reference on either payment, is no longer flagged. With nothing but vendor and amount to go on, a gap that long was mostly coincidence.
- A strong reference with different amounts and no invoice total (often instalments) is still sent to review. This is unchanged and worth revisiting.

## Other follow-ups

- `src/lib/duplicateSignals.ts` is a second duplicate engine that nothing imports, not even tests. It has its own recurring rule and doesn't know about reference strength. Delete it or bring it in line with `detection.ts`.
- `detection.ts` is the only place that knows reference strength. Labels or explanations in the UI don't say "looks recurring"; recurring series are left out silently, the same way invoiced series already were.

## How it was measured

A throwaway script parsed each CSV with `parseCsv` and ran `detectFindings`, as `scripts/qbo-sandbox/qbo.ts report` does. The new tests are in `src/lib/detection.adversarial.test.ts`. Check: `npx tsc -b && npx vitest run --exclude '.claude/**' && npx oxlint` (534 tests pass; oxlint shows 0 errors and only pre-existing warnings).
