# Reclaim implementation plan — 2026-10-19

## Starting point

- Work on `codex/reclaim-implementation`, created from the local `origin/main` at `d32be03`; the earlier audited commit `96cfb9e` is an ancestor, 62 commits behind. The original `recovery-eligibility-gate` branch remains intact.
- The newer branch already contains QuickBooks OAuth and import, Gmail sending, Stripe code, encrypted project storage, backup, account data export/deletion, and a recovery evidence gate. These are code capabilities, not proof of a deployed or real-account integration.
- Main risk: `/api/projects/:id` accepts client-authored project JSON; the client drops refused saves and account entry can replace local cache. AI/Gmail authorization currently reads that same project JSON.
- Baseline server TypeScript succeeds. Lint succeeds with existing warnings. Full Vitest under default concurrency exhausted worker memory; Vite test/build startup needs process-spawn permission in this sandbox. Use serial, targeted tests and one production build after implementation.

## Delivery order

1. **Truthful product language.** Inventory active React and maintained landing/pricing surfaces and deployment configuration. Replace overclaims about money, proof, source availability, storage, and billing. Keep case evidence details and Reports access. Verify with targeted component tests and source searches.
2. **Authoritative case record.** Add an additive SQLite migration for per-project revision and append-only case events. Define typed server commands for decisions, evidence, approval, request, vendor updates, settlements, and reconciliation. Validate tenant ownership, state transitions, amounts, source references, command IDs, and idempotent retry. Compute money from validated events. Restrict legacy whole-project writes so they cannot overwrite authoritative case state. Include old-client conflict responses and preserve legacy assertions as such.
3. **Client sync migration.** Teach signed-in case actions to use commands and revision responses. Keep unsynced operations locally, surface conflict/refusal, and merge server pulls without discarding local work. Test concurrent edits, retry, offline/relogin, migration and restore.
4. **Deterministic evidence and amounts.** Preserve source identity and negative-row type; tighten entity/currency/vendor/obligation partitions, rule labels, adjustment handling, deduplication, and minor-unit breakdown with explicit missing evidence. Test adversarial ledger cases.
5. **Grounded assistant and draft.** Add tenant-scoped fact tools and versioned help text, read-only answer route with citations, no-key response, injection and cross-account tests. Keep AI drafting bound to a frozen approved snapshot and manual review.
6. **Integration and release review.** Audit actual OAuth scopes and token behavior, pricing/fee behavior, public pages, security/CSP, backups, retention, and environment configuration. Add a status checklist separating code/configuration/sandbox/production/deployed/real-user evidence. Run targeted tests, server/client types, lint, production build, and any available browser check. Report external blockers without calling mocks deployed.

## Constraints and verification

- No production deployment, live billing, supplier send, or money movement.
- Use additive migrations and small commits after each coherent slice; retain old project access and a restore path.
- Avoid default parallel test execution after the baseline memory failure; use one worker and targeted files.
- Review each changed slice against the prompt and run its tests before moving on. The final report will state exactly which plan items completed and which require credentials, real records, policy, or deployment evidence.

## Continuation — 2026-10-20

- Verify the saved checkpoint with one serial full test run before further edits.
- Close the observed legacy case boundary: an old `requiresRevalidation` case must not authorize a new approval, request, or Gmail follow-up. An already-sent Gmail receipt may still be recorded as history.
- Match the screen to server behavior: open or closed requests show their saved evidence without offering a save that the server rejects. A separate reviewed workflow for revalidating a previously sent request remains a release blocker.
- Add focused authorization and UI regression tests, then rerun types, lint, build, and the affected tests. Record the exact checkpoint results and leave the branch clean.
- Verify a local encrypted backup/restore round trip with the production-style data key and a copied restore file. Keep the separate hosted restore, offsite backup, and key-custody checks marked unverified.

## Historical sent-request decision — 2026-10-20

- The customer chose to preserve an already-sent historical request and require a newly reviewed and approved request before any more supplier contact. Do not resume follow-ups on the original request.
- Before implementing that path, introduce explicit request generations: retain each old request's recipient, amount, send receipts, replies, and returns in its generation; calculate new outstanding value without counting an old return twice; require fresh evidence and approval for a new generation. Keep the append-only case events and old-project restore behavior.
- Verify locally that a backup made before case migration can be restored, migrated, and read with its retained key; a hosted staging restore remains separate.
- First close the remaining legacy outreach affordances: reject a manual `followed_up` update on a stale sent request, hide its follow-up scheduling and status option, and show review as the next action. Continue allowing replies, returns, and closure to be recorded against the historical request. Add server, model, and component regression tests before implementation.
