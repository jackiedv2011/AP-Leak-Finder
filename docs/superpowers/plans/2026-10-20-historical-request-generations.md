# Historical Request Generations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve an already-sent historical request and require fresh evidence and approval for a separate supplier request.

**Architecture:** Keep one active request in `CaseState` for compatibility. Add immutable archived request snapshots and a generation number. Store settlements once in the existing cumulative list, tagged with their request generation; derive active return and outstanding amounts from that tag. Existing untagged settlements belong to generation 1. A server command creates a generation boundary, then the existing evidence, decision, approval, and request commands govern the new generation.

**Tech Stack:** TypeScript, React, SQLite, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-historical-request-generations-design.md`

## Global Constraints

- Preserve old project reads, append-only case events, tenant ownership, revisions, and idempotent command IDs.
- Do not send supplier email, move money, deploy, or activate live billing in this task.
- Run focused tests serially before a production build; keep each committed slice reviewable.

## Review Focus

- An old partial refund must reduce the maximum new request once and must not reduce the new request's outstanding balance again.
- A late refund for the old request must count once, remain attributed to the old generation, and pause outreach if the new balance is now unsupported.
- A legacy amount with no settlement reference must not silently count as returned or permit an unsupported repeat request.
- A stale device or retried command must not create duplicate active generations or duplicate a settlement.
- Old email receipts, replies, and returns must remain visible after a new request and after restore.
- The signed-in UI must retain local work if the generation command conflicts with the server.

---

### Task 1: Money boundary and archived state

**Files:** Modify `src/ledger/caseState.ts`, `src/recovery/financials.ts`, `src/recovery/model.ts`; test `src/recovery/model.test.ts`, `src/recovery/financials.test.ts` (create if absent).

**Interfaces:** Add `ArchivedRequest`, `CaseState.archivedRequests`, `CaseState.activeRequestGeneration`, and optional `RecoveryVerification.requestGeneration`. Add `activeReturned(state): number` and `beginNewRequestReview(state, at): CaseState`. Missing generation means 1. `validSettlements` and `verifiedReturned` remain cumulative.

- [ ] Write tests for archive immutability, zero new approval, old receipt/reply preservation, partial prior return, a late old return, ambiguous legacy amount refusal, and active versus cumulative return arithmetic.
- [ ] Run the focused tests and confirm the new assertions fail for the missing behavior.
- [ ] Implement the state transition and active return projection in integer cents. Update request/settlement/close/status logic to use the active projection where a request-specific balance is needed.
- [ ] Run the focused tests and existing recovery model/ledger tests until they pass.
- [ ] Commit the model slice.

### Task 2: Server generation command and amount ceiling

**Files:** Modify `server/caseCommands.ts`, `server/caseFacts.ts`; test `server/caseCommands.test.ts`, `server/gmail.test.ts`, and the existing project-write protection test.

**Interfaces:** Add a `begin_new_request_review` command accepting an explicit reviewer acknowledgement and the expected revision. Add a `historical_settlement` command with an archived generation ID; the server assigns that ID to the saved settlement and holds outreach when the active unreturned amount exceeds the newly supported balance. Compute `maxNewRequestMinor = max(0, evidencePotentialMinor - cumulativeReturnedMinor)` from the saved case; enforce it at approval, request, draft, and Gmail send. Keep the original command event and source references.

- [ ] Write failing tests for ownership, retry, stale revision, historical snapshots, old approval refusal, duplicate settlement reference, amount ceiling after an old partial return, and late return attribution and contact hold.
- [ ] Implement the command and amount checks without accepting totals or approval flags from browser JSON.
- [ ] Run focused server and Gmail tests; commit the server slice.

### Task 3: Client review and historical request display

**Files:** Modify `src/AuditApp.tsx`, `src/workspace/views/CaseDetail.tsx`, `src/workspace/views/RecoveryJourney.tsx`, `src/workspace/selectors.ts`, `src/recovery/ledger.ts`; test the affected component, selector, and sync tests.

**Interfaces:** Queue `begin_new_request_review` through the existing project sync command path. Show an explicit review action, archived request details, and the active request balance; require fresh evidence and decision before showing approval or outreach.

- [ ] Write failing component and sync tests for the old request display, fresh approval path, two-device conflict with retained local work, and partial-return money labels.
- [ ] Implement the UI and projections without implying bank matching or allowing a second contact from the old request.
- [ ] Run affected tests; commit the client slice.

### Task 4: Integration and release review

**Files:** Modify `docs/release-readiness-2026-10-20.md` and focused tests if the integration check exposes a gap.

- [ ] Demonstrate old sent request → archived generation → fresh evidence → approval → new recorded request → partial return, plus a false alarm and stale-device conflict in tests or local demo data.
- [ ] Run server and client type checks, lint, production build, focused tests, and a serial full suite if resource limits permit.
- [ ] Check the diff against the spec and report browser, hosted restore, and provider checks separately from local test results.
- [ ] Commit the release review.
