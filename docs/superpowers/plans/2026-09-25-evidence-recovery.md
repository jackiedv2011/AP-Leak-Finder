# Evidence and recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans or the already assigned implementation owners to execute these tasks. The supplied user specification authorizes implementation; this plan records the current coordinated work.

**Goal:** Automated checks produce review signals; only evidenced, unique recovery candidates can be authorized, drafted, and counted as potential recovery.

**Architecture:** Keep the existing project JSON storage and recovery event history. Share deterministic eligibility and money rules between workflow, selectors, and server drafting. Preserve original source values alongside parsed/normalized fields, and migrate old projects conservatively.

**Tech stack:** React, TypeScript, Vite, Node server, Vitest.

**Spec:** `C:/Users/sidha/.codex/attachments/e64f05e1-de0f-441d-879b-772107914d3c/pasted-text.txt`.

## Global constraints

- No current CSV-only check creates `recovery_candidate`.
- Preserve unrelated user changes, historical findings, decisions, cases, and recovery events.
- Keep eligibility separate from customer authorization; AI only drafts wording.
- Preserve unknown data as unknown, including currency and unavailable legacy raw values.
- Retain the initial 45-day near-duplicate review window; avoid unrelated statistical/discount/bank-rule redesign.
- Run the full suite after each logical phase and at the end. Do not weaken tests to make them pass.

## Review focus

- Renamed, overlapping, or interrupted imports must not manufacture payment identities; ambiguous collisions must remain visible.
- Equal-looking legitimate payments without source IDs must not disappear silently.
- Evidence edits or migrated open cases must not leave authorization/AI access usable after eligibility is lost.
- An event shared by several findings must enter recovery totals at most once, including after save/reload.
- Historical verified partial returns must survive reclassification while unapplied credits remain pending.

## Task 1: Source integrity and versioned review signals — root owner

**Files:** `src/types.ts`, `src/lib/csv.ts`, `src/lib/detection.ts`, vendor normalization helpers, `src/ledger/store.ts`, project persistence, import UI, and their tests.

- [ ] Test duplicate/renamed files, interrupted retry, overlapping batches, legitimate distinct payments, ambiguous missing-ID collisions, and tenant isolation.
- [ ] Add schema/batch identity, content checksum, row fingerprint, external-ID preference, raw fields, normalization transformations, provenance, and explicit row outcomes.
- [ ] Test all eight classifications, dates differing in exact repeated payments, normalized reference variants, missing-reference near duplicates, recurring-payment traps, and stable deduplication groups.
- [ ] Implement versioned rule identities and review metadata; keep all original check families with corrected meaning and null CSV-only potential amounts.
- [ ] Test old project load/save/reload, unavailable raw markers, historical snapshots/events, customer decisions, verified returns, and open-case revalidation.
- [ ] Implement conservative schema migration and run `npm test`.

## Task 2: Evidence and recovery boundary — eligibility owner

**Files:** `src/recovery/eligibility.ts`, recovery model and case state, finding detail/workflow components, AI request client, `server/app.ts`, and corresponding tests.

- [ ] Test each required missing/contradictory fact: settlement, payment identity, currency, obligation, duplicate import, void, reversal, refund/credit, legitimate installments/recurrence, customer confirmation, calculable amount, and overlapping event.
- [ ] Implement one gate returning classification, evidence state, missing/contradictory reasons, and potential minor units; persist confirmation person/time and source references.
- [ ] Expose manual evidence entry, raw versus normalized facts, rule version, evidence state, next action, and eligibility explanation.
- [ ] Require eligibility before case creation and separate authorization of contact/request amount. Test evidence invalidation and legacy revalidation against existing active workflow.
- [ ] Resolve AI case facts from the authenticated user's stored project, recheck eligibility/authorization on the server, and reject spoofed client facts or other users' cases.
- [ ] Preserve vendor responses, verified partial returns, credit application, corrections, and accounting closeout; run `npm test`.

## Task 3: Reconciled totals and navigation — financial owner

**Files:** `src/workspace/selectors.ts`, dashboard/findings/recoveries/reports views and panels, audit statistics, project summaries, landing/resume actions, and their tests.

- [ ] Test review/security/savings exclusion from potential, unique eligible events, currency restrictions, approved requested less verified return, accepted/promised pending values, and applied-versus-unapplied credits.
- [ ] Replace broad recovery labels with flagged value; expose true potential, authorized outstanding, pending return, and verified returned value without summing stages.
- [ ] Reconcile dashboard, reports, vendor rows, project cards, finding detail, and recovery queue; preserve historical verified money during migration.
- [ ] Ensure resume/primary actions lead to evidence review for ineligible findings and authorization for eligible candidates; run `npm test`.

## Task 4: Integration and founder verification — root owner

**Files:** integration tests and `docs/checks-and-recovery-before-after.md`.

- [ ] Review all interfaces together: classification versus deprecated class, evidence persistence versus server JSON hydration, deduplication groups versus claimed record IDs, minor units versus display amounts, and authorization versus requested amount.
- [ ] Run `npm test`, `npm run build`, and `npm run lint`; resolve failures without deleting or weakening coverage.
- [ ] Revisit landing, CSV import, dashboard, findings/detail, recoveries, reports, and project/vendor financial summaries using the existing browser capability.
- [ ] Demonstrate repeated-payment/variant/near-duplicate signals, savings/security classification, duplicate-file retry, visible missing evidence, blocked recovery/AI, manual eligibility plus authorization, and reconciled partial returns using synthetic data.
- [ ] Update the founder guide's IMPLEMENTATION IN PROGRESS status only with observed results; record inaccessible paid/authenticated interactions and remaining limitations accurately.
- [ ] Deliver the requested before/after explanation, changed-file summary, test results, migration treatment, accountant/pilot questions, and next phase. No deployment-readiness claim follows solely from passing tests.
