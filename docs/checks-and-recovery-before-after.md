# Checks and recovery: before and after

**Status: IMPLEMENTED; AUTOMATED CHECKS PASS; BROWSER CHECK PARTIAL (guest session).** The before-state below was inspected at commit `2a113e4` on September 25, 2026. The after-state is implemented on branch `recovery-eligibility-gate`. The verification record at the end lists what has actually been checked.

## Current website flow

CSV upload → parsed records → eight checks → `recoverable`, `review`, or `opportunity` → dashboard and findings → customer decision and recovery workflow → reports.

The importer reads vendor, payment date, and amount paid as required fields. Optional fields are invoice number, invoice date, invoice amount, terms, bank-account last four digits, and category. Rows missing usable required fields are skipped. Unknown column names are reported; their individual values were not preserved. The original importer has no currency or external transaction identity field.

Dates and amounts become usable values. Text is trimmed, and vendor resolution replaces the imported vendor name with a chosen display name. The original spelling and all original cell values are not retained. Each upload receives new row identities and is appended to the project. Uploading the same file again can therefore create apparent duplicate payments. Checks rerun across the accumulated records.

Findings have an amount, a severity, and a rule-based evidence-strength label. These describe what the check saw; they do not establish clearing, contractual entitlement, or a remaining vendor obligation. The website nevertheless treats some rule results as recoverable immediately.

## Existing categories and where they appear

| Old category | Meaning in the existing implementation | Website behavior |
|---|---|---|
| `recoverable` | Selected exact duplicates, row-level overpayments, and unclaimed discounts | Appears in findings and recovery-candidate summaries; may become a vendor recovery case after the customer acts. Reports also call this rule-selected amount “Verified.” |
| `review` | Near duplicates, ambiguous repeated invoices, bank changes, outliers, shared references | Appears in findings and internal investigation flows. Broad “potential” totals still include these amounts. |
| `opportunity` | Missed early-payment discounts | Appears as a savings opportunity, but also contributes to broad “potential” totals. |

All eight checks can appear in the findings list, finding detail, dashboard summaries, and report breakdowns. Plan restrictions can hide finding details: the inspected Free guest sample exposed only three low-value findings. Such access limits are separate from evidence or eligibility.

## What the eight current checks actually establish

“Broad totals” below means the old all-open-findings potential value, vendor potential, and related flagged/report summaries. Overlap protection exists for selected recoverable findings, but it does not make the broad total a unique amount of money owed.

| Existing check | What it looks for | Old category and financial effect | What it cannot prove |
|---|---|---|---|
| Exact duplicate | Repeated normalized vendor and invoice reference, clustered by equal amounts. Payment dates may differ. The rule considers recorded negative amounts and invoice totals; differing payment amounts can produce a separate review finding. | Equal-amount clusters: `recoverable`, affecting rule-selected recovery and broad totals. Differing amounts: `review`, affecting broad totals. Both appear in findings; recoverable results can enter vendor recovery. | Two rows may describe one payment, an import overlap, installments, or unsettled activity. The CSV does not prove distinct cleared payments or that all refunds were found. |
| Near duplicate | Same vendor and amount, different invoice references within edit distance two and 45 days. The old rule requires both references and suppresses some regular payment series. | `review`; findings/internal review and broad totals. Despite a stale code comment saying recoverable, the actual output is review. | Similar reference text and timing do not prove the same obligation. Recurring charges can look similar. |
| Row-level overpayment | One payment exceeds its row's invoice amount by at least two cents. | `recoverable`; findings, vendor recovery, rule-selected recovery and broad totals. | The invoice amount may omit tax, fees, other bills, or adjustments. A row is not a complete account reconciliation. |
| Unclaimed discount | Full-price payment within the stated early-payment window. | `recoverable`; findings, vendor recovery, rule-selected recovery and broad totals. | Terms in an export do not prove a surviving contractual right to a refund or an agreed retrospective credit. |
| Missed discount | Full-price payment after the stated discount window. | `opportunity`; findings/savings and broad totals. | A possible future saving is not an existing vendor debt. |
| Bank-account change | Consecutive payments for a vendor use different recorded account endings. | `review`; findings/internal review and broad totals use the changed payment's amount. | Last four digits do not establish account ownership, fraud, or a recoverable loss. A legitimate account change is possible. |
| Amount outlier | With at least four vendor payments, a payment exceeds the mean plus 2.5 sample standard deviations. The amount shown is the excess above the mean. | `review`; findings/internal review and broad totals. | A large order or changed contract can explain the difference. Statistics do not identify an amount owed. |
| Shared invoice number | Different normalized vendors use the same normalized invoice reference. The amount is the sum of related payments. | `review`; findings/internal review and broad totals. | Independent vendors commonly reuse invoice numbering. This is a data-quality/identity question, not proof of duplicate payment. |

The dashboard sample had **80 records and 16 findings**, displaying **$11,684** as recovery candidates, including unclaimed discounts. The broad flagged amount was **$21,678.40**. Reports labeled the $11,684 rule-selected amount “Verified,” even though no settlement evidence had been collected.

## Existing recovery and money behavior

The customer opens a finding and records a decision. Old recoverable findings can enter case preparation, customer approval, request drafting, recorded outreach, vendor-response tracking, verification, and accounting closeout. Other categories follow internal investigation actions. Playbook advice asks the customer to check facts, but advice is not an enforced eligibility gate.

AI drafting is reached from recovery preparation. Before this change, the server checks login, plan entitlement, and request shape, then drafts from facts supplied by the client. It does not independently require an eligible, customer-authorized stored case.

Old “potential” adds all open findings, less recorded returns, excluding dismissed and resolved findings. Old “verified” adds open `recoverable` findings until the request stage. Active recovery uses requested amount less recorded returned amount. Vendor commitments track accepted/promised amounts separately, but the old pending-return bucket excludes an accepted claim until a later promise/status. Vendor summaries inherit the broad potential problem.

The existing settlement workflow already has useful controls: promises do not count as returned money; recording a return requires a settlement reference; a credit or offset requires the bill where it was applied. Multiple partial returns accumulate, leaving a remaining balance. Closeout records reconciliation and root cause. These behaviors and their history must survive the change. Verification remains a customer-recorded accounting action; Reclaim has no independent bank feed proving receipt.

## Before and after comparison

The After column is the implementation target until the final verification record is completed.

| Area | Before | After | Why it is changing |
|---|---|---|---|
| Categories | Recoverable, review, opportunity | Recovery candidate, review needed, preventive security, future savings | A signal and an eligible claim need different meanings. |
| Exact duplicate payments | Equal-amount repeated invoices can immediately be recoverable | Versioned repeated-payment review signal; evidence gate required | Repeated rows alone do not prove two settled payments. |
| Near duplicates | Similar references, equal amounts, 45-day window | Separate reference-variant and same-vendor/amount review rules; retain a configurable initial 45-day threshold | Text similarity and timing are review aids. |
| Row-level overpayments | Immediate recoverable excess | Review needed | Invoice and payment context must be reconciled. |
| Discounts | Unclaimed may be recoverable; missed is opportunity | Both are future savings/contract review | Exported terms alone do not establish a refund right. |
| Bank-account changes | Review amount enters broad potential | Preventive security; no recovery value | A control alert is not an established loss. |
| Amount outliers | Statistical excess enters broad potential | Review needed; flagged amount only | Unusual spending may be legitimate. |
| Shared invoice numbers | Cross-vendor payments enter broad potential | Review needed with a data-quality explanation | Vendor numbering can overlap normally. |
| Potential recovery | All open findings in some views | Unique eligible candidate amount, with known currency and sufficient evidence | Prevent inflation and unsupported claims. |
| Flagged value | Broad values may be called recovery or potential | Explicitly labeled flagged/involved value | Show review workload without implying money owed. |
| Recovery-case creation | Rule class and customer action enable preparation | Eligibility first; separate customer authorization before recovery | Evidence and permission answer different questions. |
| AI email drafting | Client-supplied facts after login/plan checks | Stored eligible and authorized case checked by server; AI writes wording | AI and client claims cannot establish eligibility. |
| Evidence | Ledger rows, matched conditions, and advisory playbooks | Structured confirmations, sources, person/time, missing facts, contradictions | The user must see exactly what supports a claim. |
| Duplicate imports | New row identities on every upload | Content checksum, stable row identity, scoped overlap detection, import outcomes | Reimporting must not manufacture duplicates. |
| Vendor normalization | Resolved name replaces imported spelling | Raw name plus parsed/normalized name and canonical identity | Preserve the evidence and explain grouping. |
| Raw CSV values | Trimmed/parsed values only | Raw values, transformations, filename, row, and batch provenance | Reviewers need to trace findings to source. |
| Dashboard totals | Broad potential and rule-selected “Verified” can mislead | Flagged, eligible potential, authorized outstanding, pending return, and verified recovery have distinct definitions | Users need figures that reconcile across screens. |

## New product flow

CSV import → preserve raw information → prevent duplicate imports → deterministic review checks → review/security/savings findings → collect missing evidence → eligibility gate → retain for review, dismiss/suppress, or promote to recovery candidate → customer authorization → recovery communication → vendor response → refund or credit → verification → accounting closeout.

No existing automated check produces a recovery candidate from the current CSV alone. Exact repeated payments, reference variants, near duplicates, overpayments, outliers, and shared references start as `review_needed`. Bank changes become `preventive_security`. Both discount checks become `future_savings`.

The primary actions become **Review evidence**, **Resolve security alert**, **View savings opportunity**, and, only for eligible candidates, **Authorize recovery**. Findings show the rule/version, flagged amount, evidence state, missing evidence, explanation, and any contradiction or suppression reason. Potential recovery appears only when eligible.

The duplicate-payment gate requires distinct payment identities, clearing evidence, matching known currency, the same obligation, duplicate-import exclusion, void/reversal checks, refund/credit searches, and an explanation ruling out legitimate installments, splits, retainage, and recurring obligations. Customer confirmation and a deterministic amount are also required. A source payment or economic event cannot support multiple counted candidates. Amounts are calculated in currency minor units, such as cents for USD.

Missing evidence leaves potential amount empty and blocks recovery creation and AI recovery drafting. Contradictions retain the original signal and explain why pursuit is blocked. A completed checklist establishes eligibility; a separate customer decision authorizes contact and the requested amount. Severity, similarity, or AI confidence cannot replace either requirement.

“Ledger supported” means the rows justify investigating. “Eligible” means all required recovery facts have been recorded. Neither means the vendor has agreed or cash has arrived.

## One duplicate-payment example

An upload contains two $1,000 USD payments to ABC Supply for invoice INV-0042, dated September 1 and September 8. The original cells and import identities are preserved. The repeated-payment rule raises a review signal. The apparent extra payment is $1,000 flagged for investigation; potential recovery is empty. A second upload of the same file adds no payments.

The customer supplies two distinct payment references and clearing confirmations, the $1,000 invoice, and matching currency. Searches find no void, reversal, refund, or applied credit. The customer confirms these were not installments or recurring obligations. Reclaim checks that another candidate does not already claim the same event. The gate now supports a $1,000 recovery candidate.

The customer separately authorizes requesting $1,000. Reclaim can prepare the communication; AI may help word it using the approved facts. The vendor promises $1,000: pending return is $1,000 and recovered remains $0. A verified $400 refund makes recovered $400 and outstanding $600. A $600 credit memo alone does not change recovered; applying it to a valid bill and recording verification makes recovered $1,000 and outstanding $0. The customer then reconciles the accounting entry and closes the case.

These figures describe stages and must not be added together. Pending return is part of outstanding recovery. Historical flagged values are not extra money. Mixed currencies require separate treatment; an unknown currency cannot become potential recovery.

## Import and migration limitations

An external transaction ID is preferable to a fingerprint made from source fields. When no ID exists, identical-looking rows can represent either duplicated exports or genuinely distinct payments. An ambiguous overlap must be recorded and surfaced, not silently treated as a new payment or silently discarded. Import outcomes distinguish newly imported, exact duplicate, possible overlap, rejected, and missing identification fields. Deduplication is scoped to the appropriate tenant/project/source context.

Old projects retain parsed values with **raw source unavailable**. The old importer already discarded spelling, source-cell formatting, and unknown-column values; migration cannot reconstruct them. Missing currency, settlement proof, or transaction identities must remain missing. Reuploading an authoritative export can provide evidence, but cannot retroactively make a guessed old value original source data.

Versioned project migration must retain old finding snapshots, customer decisions, recovery cases/events, and verified returned amounts. Open legacy cases need visible revalidation when their old automatic classification no longer passes the new gate. Keeping historical evidence of a return is different from approving a new request. Migrated projects must save and reload without losing either history or the revalidation flag.

Manual evidence remains customer-supplied. An external reference can help an accountant trace a fact; recording a reference is not independent verification that the document exists or is correct. Attachments, source-system integrations, automatic bank reconciliation, cross-project claim reconciliation, and complex obligation allocation require explicit capability checks before promising them to a customer.

## Questions for the accountant and pilot

1. Which accounting and bank records are acceptable proof of distinct settled payments, and who may confirm them?
2. How should refund searches, unapplied credits, voids, reversals, tax, fees, retainage, and partial obligations affect the request amount?
3. Which exported transaction IDs are stable across reports, accounts, and corrections? How often do identical legitimate rows occur?
4. Which vendor aliases and invoice-prefix transformations are safe for each source system? Who resolves ambiguous matches?
5. Do real payment cycles support the initial 45-day review window? Which recurring patterns still generate noise?
6. Which currencies and minor-unit conventions must the pilot support, and how should reports display mixed currencies?
7. When can a credit count as applied, what closeout evidence is required, and how should corrections be audited?
8. Which customer role may authorize outreach, and what process handles disputes or evidence withdrawn after authorization?

The next phase should validate these assumptions with an accountant and a small, reconciled pilot dataset, then prioritize reliable source-system/payment evidence and the remaining recovery types. Passing software tests alone does not establish deployment readiness or financial correctness for every accounting situation.

## Verification record

**Before:** live inspection covered landing `/`, guest sample dashboard `/audit`, findings, unclaimed-discount detail, recoveries, reports, audits, and the Add CSV dialog. Project/vendor financial calculations were also inspected in source. Free guest access limited full recovery-detail interaction. Frontend: `npm run dev`; server: `npm run dev:server`; tests: `npm test`; production build: `npm run build`.

**After (September 25, 2026, automated):** `npm test` 502/502 passing across 47 files; `npx tsc -b` and `npx tsc -p tsconfig.server.json` clean; `npm run build` succeeds; `npm run lint` reports only pre-existing warnings. Covered by tests:

- No CSV-only rule produces `recovery_candidate`; the sample's $11,684 of strong rule signals is flagged for review with $0 potential recovery.
- The versioned rules `exact_repeated_payment_v1`, `invoice_reference_variant_v1` and `same_vendor_amount_near_duplicate_v1` each raise review signals. Missing references now raise a same-amount review signal instead of nothing.
- The evidence gate promotes a duplicate only with recorded synthetic attestations. Authorization is a separate step. AI drafting is refused by the server (`recovery_not_authorized`) unless the stored case is eligible, approved and asks for exactly the approved amount. Vendor and rows come from the stored case, not the browser.
- Letters: an ineligible signal only produces an internal note; a partial request lowers the ask; nothing exceeds the evidenced excess.
- Totals: flagged, potential, in recovery, pending return and recovered reconcile across a 200-session random walk with reload, and the vendor rollup counts legacy returns the same way as the dashboard. A vendor's “accepted the claim” reply now counts as pending return.
- An approval saved before the gate no longer makes an ineligible signal a vendor recovery case; it stays an internal review with its history.

**Unsupported or deferred:** only exact and reference-variant duplicates in USD can pass the gate; overpayments, outliers and shared references stay review-only. Evidence is customer-recorded, with no bank feed.

**After (September 25, 2026, browser, guest session):** a synthetic nine-row CSV was uploaded at `/audit`. It held an exact repeat, a one-character reference variant, a same-amount pair with no reference, a missed 2/10 discount and a bank-account change. Results:

- Overview: Recovery candidates $0 (0 passed the evidence gate); Flagged for review $1,940 (3 signals: $1,000 + $640 + $300); In recovery $0; Recovered $0. The $720 bank change and the $40 discount sit outside the flagged total.
- The reference variant shows `invoice_reference_variant_v1 · review_needed`, potential recovery unavailable, and the next step "Review evidence". No finding offered "Start recovery".
- The missed discount is `future_savings` with the next step "View savings opportunity". Found and fixed during this check: the duplicate-evidence form was rendering on every finding, including savings and security ones. It now appears only on duplicate rules, the only rules that can pass the gate.
- Not reachable as a guest, so these stay covered only by the automated tests: the exact duplicate and the bank change (locked on the free plan), evidence promotion, authorization, gated AI drafting, and append re-import idempotency (the guest UI offers new audits only).
