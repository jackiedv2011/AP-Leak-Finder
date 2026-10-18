# Verification — Reclaim Dashboard v2

## Scope

Local fixture prototype reviewed in the Codex browser at 1440×900 desktop, 1280×800 laptop and 390×844 mobile. Reference screenshots and implementation screenshots are retained in the task transcript. No Vercel account mutations or old Reclaim code changes were made.

## Executed tests

Eight Node tests pass:

- Baseline: 16 findings, 80 payment records, 12 vendors; $11,684 potential recovery, $9,794.40 awaiting evidence, $200 future savings.
- Integer-cent conservation through draft → submitted → recovered, with no double counting.
- Review findings cannot enter recovery without documented confirmation.
- Dismissal requires a reason, supports reopening, and rejects invalid transitions.
- Combined category/type/search behavior and no-match results.
- Readiness categories exclude findings already moved into recovery.
- Gross payment differs from recovery delta correctly: $3,420 paid minus $3,000 contract = $420; all source links resolve; transitions do not mutate the original input.
- The downloadable CSV artifact exactly matches all 80 current source records, including integer-cent amounts.

## Computer-use checks performed

| Area | Direct evidence |
| --- | --- |
| Overview | Desktop and mobile screenshots; baseline amounts and source coverage visible |
| Findings | Desktop/mobile queue screenshots; type filter yields five duplicate candidates; adding Northstar search yields one; unmatched search yields zero; Clear filters restores 16 |
| Context | Browser Back from the investigation restores the Northstar search and duplicate filter; Escape closes; focus returns to the originating finding |
| Evidence | Northstar side-by-side payment comparison; source links; Fieldwork record $3,420 links to contract comparison with $420 excess |
| Recovery | Northstar draft created; submission confirmation; recovered confirmation; Recovery screen shows $4,884 unclaimed, $0 active claims, $6,800 recovered |
| Review decisions | Missing-note confirmation blocked in UI; explicit QA note allows confirmation; dismissal confirmation, dismissed state, and reopening exercised |
| Records | 20 → 40 records loaded; exact PAY-1007 search yields one; source-row metadata and investigation link inspected |
| Command | Page search narrows to Overview; Enter opens result; input focus and native dialog dismissal behavior exercised |
| Keyboard | Investigation tabs respond to arrow keys; Escape dismisses; mobile navigation wraps Tab and restores focus on Escape; background receives inert attribute |
| Preferences | Save disabled when clean, enabled after change, disabled after saving; disabling motion yields computed transition duration 0.000001 seconds |
| Error/empty/loading | No-results state; recoverable-error preview and Try again; six skeleton rows with aria-busy=true; normal data restoration |
| Responsive | No document-level horizontal overflow at 1280 or 390; record table has its own horizontal scroll; full-width mobile evidence panel |
| Runtime | Browser error/warning log empty on final preview load; local server remains separate on port 4180 |
| Copy link | Clipboard read-back matches the selected finding's local URL |
| Clean handoff | Final Overview DOM shows $11,684 / $9,794.40 / $200; sidebar measures 255 px, buttons 32 px, no desktop overflow; test decisions reset; preview marked to remain open |

QA transitions and notes are test-only and are reset before handoff. They do not represent real vendor verification, submission or recovered funds.

## Visual comparison and corrections

The implementation retains the reference's black canvas, very dark surfaces, fine dividers, compact controls, quiet status dots, stable sidebar and aligned rows. Reclaim introduces its own investigation and money semantics. Its detail drawer and route crossfade are authored adaptations, not observed Vercel replicas.

Iterations after screenshots: exposed vendor names on mobile; reduced the mobile toolbar from two lines to one; removed the conspicuous tab scrollbar; contained modal background scrolling; wrapped Overview actions at narrow widths; shortened mobile source metadata; added keyboard tab navigation and focus return; separated non-duplicate evidence into credit/contract/service-specific facts; prevented closed cases appearing in readiness categories.

## Explicit limits

- This is a working prototype, not a production application or a pixel-identical clone. It uses local sans-serif fonts and original icons. No proprietary reference assets were copied.
- Motion constants are verified in code and the app-level reduced-motion setting was checked in the browser. The operating system's reduced-motion setting and frame-by-frame timing were not instrumented. The system media query enforces the same near-instant behavior.
- Reference states that could not be safely or conclusively observed are enumerated in DESIGN.md. No unobserved reference motion is claimed as measured.
- Export uses a real downloadable CSV artifact whose contents are covered by a parity test. The browser's download observer timed out on the earlier Blob implementation, so it was replaced with a direct file link; operating-system save completion is not claimed. Clipboard behavior across browser permissions and storage-denial fallback require separate cross-browser acceptance testing. Production permission, multi-user concurrency and backend integration are outside this isolated prototype.

See INTEGRATION.md for the production connection and rollout gates.

## Goal acceptance audit

1. **Live reference inspection:** completed before implementation; observed screens and measured/inferred boundaries documented in DESIGN.md and screenshot transcript.
2. **System and primitives:** tokens, geometry, component roles, responsive rules and motion specified before app screens; source files implement the specified independent system.
3. **Shell and interactions:** live desktop/mobile screenshots and keyboard checks cover navigation, menus, command search, selection and investigation context. Reference fidelity is to design grammar, not proprietary pixels/assets.
4. **Reclaim workflows:** all five destinations run on consistent fixtures; evidence → documented decision → recovery lifecycle and record provenance verified; eight model/artifact tests pass.
5. **Visual comparison and iteration:** desktop/laptop/mobile reference and implementation reviewed; specific corrections recorded above. Motion is restrained, interruptible for controls, and reduced-motion aware; unsupported reference timings are not fabricated.
6. **Handoff:** independent runnable source, README, source inventory, verification record, sample ledger export and integration plan are present. Existing product remains untouched; no production rollout or live financial actions were performed.
