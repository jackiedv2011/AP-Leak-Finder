# Reclaim Dashboard v2

An isolated, locally running payment investigation prototype. The existing Reclaim application is unchanged. No packages, source files or dependency folders are linked to it.

## Open

Run `node server.mjs` in this folder, then open http://127.0.0.1:4180. Node 20 or newer is sufficient; there is no dependency installation or build step. Run `node --test model.test.mjs` for the accounting tests.

## Try

1. Overview → Review findings → Northstar duplicate payment.
2. Inspect the two payment records. Prepare a recovery draft.
3. Review the draft in the Recovery tab. Save edits. Nothing is emailed.
4. Record submission, then record recovery, using the explicit confirmation steps. These are sample outcomes only.
5. Open Recovery: the amount moves from unclaimed potential to active recovery, then recovered, without being counted twice.
6. Try a needs-review finding. Confirmation requires a verification note. Dismissal also requires a reason and can be reversed.

Other working controls: combined search/type/status filters, amount/vendor sorting, source-record links and pagination, sample CSV export, Cmd/Ctrl+K navigation/search, keyboard tabs, browser Back/Forward, local preferences, and data-state previews from the Findings ellipsis. Settings can restore the original sample data after experimentation.

Notes and drafts save when leaving their editing surface; explicit Save buttons are also available. Decisions and preferences persist in this browser's local storage. The schema is versioned. Storage failure falls back to session-only behavior with a visible warning.

## Scope and limits

16 authored findings, 80 sample payment records, 12 fictional vendors. USD only. No login, bank connection, accounting integration, real document extraction, outbound email, partial recovery, team permissions or production audit trail. Supporting credit/contract/service facts are explicitly labeled fixtures. A locally recorded recovery is not proof of a real payment.

The interface follows observed Vercel design grammar, with original Reclaim content, icons and code. It is not a pixel-identical clone. The font uses the local sans-serif stack rather than extracted Vercel assets. Motion includes 150 ms controls, short menu/panel transitions, and a restrained content-only route crossfade when the browser supports View Transitions. Reduced-motion preferences take priority.

## Files

- DESIGN.md: source observation, decisions and evidence limits.
- VERIFICATION.md: tests, visual review and remaining production scope.
- INTEGRATION.md: future audit-engine connection plan.
- model.js: fixtures, integer-cent totals, filtering and guarded transitions.
- app.js: standalone UI and interactions.
- style.css / refinements.css: tokens, primitives, responsive design, motion and QA refinements.

No production deployment has been performed.
