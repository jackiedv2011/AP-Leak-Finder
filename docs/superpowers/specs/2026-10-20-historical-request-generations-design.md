# Historical request generations — design

## Intent

An older supplier request was sent before Reclaim had server-authoritative case commands. Keep its request, replies, and customer-entered returns visible as historical facts. The customer chose a fresh evidence review and approval before Reclaim enables any more supplier contact. The product must not treat the old approval as current permission or count an old return twice.

## Current constraints verified in code

- `CaseState` has one active request amount, recipient, approval, outreach date, vendor-update list, and cumulative settlement list. `verifiedReturned` sums that list; `authorizedOutstanding`, settlement limits, Gmail facts, and dashboard projections compare it to the one request amount.
- `CaseCommands` records tenant-scoped, revisioned, idempotent actions and appends events. Existing migrated cases carry `requiresRevalidation`; approval, request, Gmail follow-up, manual follow-up, and follow-up scheduling are blocked. Replies, returns, and closure remain available.
- The signed-in UI makes optimistic local changes and queues matching server commands. A rejected command remains visible for recovery. Historical evidence cannot currently be edited in a requested or closed case.

## Behavior

1. A reviewer explicitly starts a new request generation from a historical sent request. This archives an immutable snapshot of the old request and its review/contact details. It never sends a message and never erases the case event log or its source references.
2. The old request stays readable with its amount, recipient, send receipts, replies, customer-entered returns, and unresolved balance. An older amount without a settlement reference remains labeled unverified and blocks a new request until the reviewer records what actually returned or resolves the ambiguity.
3. The new generation starts without approval. The reviewer supplies fresh source-linked evidence, records a new decision, and approves a new amount, recipient, method, and draft. Only then can a new request be recorded or explicitly sent through an authorized integration. The old approval cannot be reused.
4. Give each request a generation number. Existing untagged settlements belong to generation 1; the server assigns a generation number to every new settlement. The maximum new request is the current evidence-supported amount minus all valid customer-entered returns already associated with this case. Clamp in minor units. The active request's outstanding balance subtracts only returns assigned to its generation; aggregate returned value still counts every valid settlement once. A promise, issued but unapplied credit, or legacy unverified amount never reduces or proves a return.
5. A late return attributable to the archived request can still be recorded against that archived generation. It increases the case's cumulative returned value once and leaves the active request's recorded amount unchanged. If it reduces the evidence-supported balance below the active request's unreturned amount, Reclaim pauses further outreach and requires review; it does not silently rewrite a sent request or invoice a fee.
6. The server validates the generation transition and amount limit against saved source references, using project revisions and command IDs. A stale device cannot reopen old outreach, create two active generations, duplicate a settlement reference, or bypass the gate through whole-project save.
7. The case screen separates historical requests from the active request. Dashboard and Reports retain cumulative recorded returns while showing the active request's own outstanding amount. The new request has no follow-up until it is sent. Existing histories remain available after reimport and restore.

## Limits

- This does not independently match cash to a bank or applied credits to accounting; returns remain customer-entered.
- This does not send email, move money, bill a success fee, or declare the original request invalid.
- Live provider checks, staging restore, browser walkthrough, and pricing approval remain separate release gates.
