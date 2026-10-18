# Reclaim v2 — reference inventory and implementation specification

## Reference inspection

Inspected the authenticated live Vercel dashboard with permission, read-only, on 4–5 September 2026. Screens observed: project Overview; Deployments queue, filter hierarchy and row-action menu; failed deployment detail and build logs; Settings forms; Find command menu; Analytics onboarding and empty-state content. Tested desktop, 1280 px laptop and 390 px mobile viewports. Screenshots are recorded in the task transcript; no account assets or application source were extracted.

| System | Observed in live reference | Reclaim implementation |
| --- | --- | --- |
| Shell | 255 px sidebar; 36 px navigation rows with 8 px inset; compact project header; main inset 24 px | Stable workspace sidebar, ledger selector, contextual breadcrumb; five product destinations |
| Color | Black canvas, #0a0a0a surfaces, #1f1f1f borders/selection, #ededed text, #a1a1a1 secondary | Same restrained tonal structure; status colors only for semantic differences |
| Type | Geist Sans; common 14 px text; 20–24 px headings; Geist Mono identifiers | Independently authored system-font stack, tabular numeric amounts, monospace IDs; no copied assets |
| Geometry | 6 px control radii; 32/36 px buttons; thin borders; tightly aligned toolbars | Explicit tokens and primitives, flat sections, no decorative cards or hero |
| Queue | Approximately 48 px rows, status dots plus labels, truncated secondary identifiers | 65 px two-line evidence rows with explicit amount, vendor, class and state; responsive two-line cards |
| Filters | Anchored ~320 px search/menu; category → values inside same surface; Esc dismisses | Anchored filter panel with type/state selections and clear reset; URL-persisted filters |
| Details | Stable shell, local tabs, structured metadata and expandable diagnostic evidence | Right investigation panel; comparison table, rationale, activity and recovery draft; URL-addressable selection |
| Forms | Bordered sections, 36 px inputs, explanatory text, separate footer; Save disabled when clean | Settings with explicit local persistence and clean/dirty save state |
| Command | Sidebar-anchored search with dim scrim, input focus and Esc | Keyboard-accessible command navigation plus finding search |
| Mobile | Sidebar disappears; bottom Find/Menu control; queue rows split into two bands | Compact header and bottom navigation access; full-width detail; no document overflow |
| Motion | Computed button transitions: 150 ms cubic-bezier(.4,0,.2,1); disclosure 200 ms. Opening Find captured in intermediate and settled positions | 150 ms control colors; 180 ms opacity/origin-aware popover; 220 ms transform/opacity panel. Reduce motion to near-instant state updates |

### Evidence limits

Route timing, loading skeletons, hover duration across every component, focus trapping and drawer mechanics were not conclusively measured in Vercel. Reclaim's choices here are authored behavior, not claims of exact replication. No artificial errors, network throttling, account changes or destructive actions were performed on the reference. Its deployment/build/product concepts and promotional panels are not carried over.

## Product corrections

1. One navigation system. Overview → actionable Findings → evidence → decision → Recovery. Records supplies source context, not a competing workflow.
2. One money model. Initial fixture: six recoverable findings $11,684; seven unverified findings $9,794.40; three prevention findings $200. Creating a claim moves an amount out of the unclaimed bucket. Recovered money is separate. Unverified findings cannot be claimed without confirmation.
3. Stable place. Search, filters, sort and selected case are URL-backed; browser Back restores prior context. Investigation overlays the current queue without destroying it.
4. Concrete evidence. Matched payment records, differing fields, record IDs, rule explanation and uncertainty accompany every finding. No confidence percentages fabricated from fixtures.
5. Real prototype behavior. Local drafts, claim state transitions, dismissal reasons, record links, searches, filters, command navigation and preferences work. No simulated outbound sending or bank integration.
6. Deliberate density. Compact headings and summary bands; space is allocated to rows and comparisons. No meaningless charts, oversized metric type, giant case-study panels or decorative gradients.

## Implementation and quality gates

Independent, dependency-free ES-module application with semantic HTML, authored CSS, Node static server and Node test runner. No existing Reclaim imports, package links or edits. Components: sidebar/header, section, button, status, metric strip, filter popover, data rows, dialog panel, evidence comparison, form section and toast. Native dialogs provide modal focus containment; URL state supplies navigation continuity. Local storage is versioned and all fixture mutations are explicitly local.

Verify: accounting invariants and transitions; all five destinations; desktop and mobile overflow; keyboard open/close/focus return; drawer tabs and evidence navigation; filtering and Back; recovery draft/save/confirm state; record searching; preferences; empty/error/loading previews; screenshots and reference comparison. Do not call untested behavior verified.
