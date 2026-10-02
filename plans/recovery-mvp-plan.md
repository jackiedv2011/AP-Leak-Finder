# Recovery MVP implementation plan

**Goal:** Turn a confirmed Reclaim finding into a dependable, customer-run recovery case from approval through reconciliation. The later eligibility follow-up refined duplicate classification while retaining the existing check families.

**Source:** `plans/RECLAIM_V2_PRODUCT_AND_PRICING_SPEC.md`, especially §§2–3, 11–18, 21–25, 28–29, 31, 35. The attached conversation is not available as a file in this workspace; the V2 spec is the local research source.

**Boundary:** The accounting, inbox, bank, and payment integrations are later work. For this MVP, the customer records actions and evidence manually. The interface must never imply Reclaim sent an email, verified a bank settlement, applied a credit, or changed accounting records.

## Design

- Keep the existing `/audit` route and finding IDs. A confirmed finding becomes a case in the existing per-project ledger; no second case store or new route is needed.
- Add a recovery workflow record to `CaseState` with approval, contact policy, communications, vendor response, promise, follow-up, settlement proof, reconciliation, and root cause. All transitions go through pure functions and an append-only activity log. Persist with the existing project sync and server model.
- Derive next action, status, money buckets, and an evidence-backed refund/credit recommendation from the case and ledger. A promise or credit memo cannot increase recovered dollars. Cash counts after customer-confirmed settlement; a credit counts only after customer-confirmed application to a bill.
- Show vendor-agreed and pending-return amounts as customer-recorded stages. A partial acceptance, promise, reported refund, or issued credit with no stated amount contributes no dollar value to those stages; an explicit acceptance of the full claim can use the remaining request amount.
- Label the aggregate of all open findings as flagged value rather than recovery. The Protected bucket stays at zero until a real prepayment prevention check exists.
- Show the journey on the case page and a task-first recovery queue. Put recovered, active, ready, and customer action counts on Overview, with clear labels and no sum of distinct financial stages.
- Show open-request aging and recent customer-recorded returns on Overview. Use the recorded outreach and settlement dates; keep legacy requests with missing dates visibly undated.
- Preserve existing request drafting and its plan gates. The first vendor request requires explicit customer approval. The customer copies/sends it externally and records that action. No OAuth, Gmail, Stripe, automatic outreach, or new detection rule is added.

## Implementation and checks

1. Add transition and recommendation tests covering approval gates, business-day follow-ups, response/promise vs settled money, partial recovery, credit application, reconciliation, and old persisted cases.
2. Implement pure recovery model functions and backward-compatible `CaseState` fields; keep existing project serialization and history intact.
3. Wire customer actions through `AuditApp` persistence, then build the case journey and recovery queue in the current workspace design system.
4. Update the Overview task card and pipeline labels. Fix keyboard access on clickable recovery rows.
5. Run focused tests, full tests, TypeScript build, and a browser pass through the sample case at desktop and narrow widths. Inspect the resulting UI and correct any workflow dead ends.

## Review focus

- A promise and an issued but unapplied credit must never count as recovered.
- A follow-up date must be based on business days and may be changed by the customer.
- A partial settlement must remain an active request, show the remaining requested balance distinctly, and accept additional settlement entries or an explicit close of the remainder.
- Reopening a closed remainder must preserve prior valid settlements and log the reopened balance separately from a correction that reverses returned value.
- Legacy projects with only `confirmed`, `requested`, or `recovered` stages must still open.
- Reopening a corrected outcome must remove stale recovered dollars without deleting the audit trail.

## Verification recorded

- Full suite: 348 tests across 31 files passed. Production build and lint exited successfully; lint reports only existing warnings in unrelated files.
- Browser walkthrough: customer approval, recorded outreach, vendor promise, partial/complete settlement and reconciliation were exercised in the sample workspace. The dashboard and recovery queue kept a $64 promise in vendor-agreed and pending-return stages while recovered stayed at $0. Desktop and 375px mobile layouts were checked; the mobile recovery page has no page-wide horizontal overflow.
- The attached conversation URI is not readable from this workspace. This implementation is aligned to the local V2 research spec and can be checked against an export of that conversation when available.
- A closed partial recovery was reopened in the browser: the $20 recorded return remained intact, the $44 remainder became outstanding again, and the action stayed distinct from correcting a mistaken return.
- The financial ledger now names vendor agreement and vendor-reported refunds separately from mere acknowledgement and actual returned value. Activity history records the amount specific to each event.
- Older saved requests without a stored requested amount remain visible, but the original request amount must be confirmed before another settlement can be recorded. The finding value is not substituted for that missing fact. Full-claim acceptance freezes the then-outstanding verified amount, and closed/reopened balances are stored in exact cents.
- The dashboard now shows open request age and recent returned value. A browser check confirmed the $44 outstanding/$20 returned split and case navigation at desktop and 375px phone width.
- Open finding totals are labelled flagged value across the workspace, and future-savings signals do not count as protected payments. The original MVP did not change detection; the later eligibility follow-up classified raw exact references separately from normalized variants.
- Internal reviews now close with a required investigation note. Their current and legacy outcomes are excluded from returned-money totals and vendor rollups; the case summary, timeline, and history use review labels. Focused tests cover this boundary.
- Browser walkthrough of a sample future-savings finding confirmed the internal note can be filed and closed with an outcome, recovered and in-recovery dollars stay at $0, and the closed case leaves Priority findings. The decision dialog now explains that the path is internal rather than a vendor request.
- Legacy recovered cases without a positive recorded amount no longer create inferred returned dollars, a recent return, or a ledger movement. They show a correction action and cannot be reconciled until an amount is recorded.
- Dashboard Action needed now counts every visible undecided or needs-information finding, including internal reviews. Finding and audit table links have keyboard-focusable buttons; the browser check confirmed the guest sample shows three actionable findings and opens the intended case from the table button.
- Internal investigations stay in Findings and a separate dashboard task section. Vendor Recoveries, navigation counts, and project recovery shortcuts now include only recoverable findings. The browser check confirmed an active internal note remains reachable while the Recoveries queue stays empty and its money totals remain at $0.
- Before the first vendor request, the reviewer must explicitly say whether the issue was already known. The answer is recorded with approval instead of defaulting silently to newly discovered; the browser check confirmed the choice gates approval and appears in the case ledger.
- The AI draft packet excludes bank account suffixes and internal reviewer notes. The server rejects unexpected draft fields rather than silently accepting extra case data.
- The financial ledger preserves older settlement proof alongside newer activity events. When a legacy outcome is reopened, any older return without a saved activity event is recorded before its reversal so the correction remains auditable.
- The settlement form catches duplicate references and shows an inline explanation before the customer submits the same return again.
- A customer who already knew of an issue must add a short disclosure before approving outreach. The explanation stays in the case and approval history; editing it makes the request require approval again. Vendor expected dates also drive the customer-action task when they arrive before the ordinary follow-up date.
- Reopening a case closed with no return now records the unpaid balance becoming active again. Correcting a partially returned close records both the reopened remainder and the reversed return. Older cases without saved closure events are backfilled when corrected; saved zero-amount reopen events are interpreted using their preceding closure. Closure and first outreach events use their recorded action dates.
- Dashboard recent returns now lists individual settlements at their own dates and amounts rather than showing a case's full cumulative return on its latest settlement date. Browser walkthrough recorded $20 and $44 returns on a $64 sample case; the activity feed showed both entries separately while the recovered total stayed $64.
