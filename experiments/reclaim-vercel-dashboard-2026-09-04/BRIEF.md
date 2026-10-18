# Reclaim Dashboard v2

Status: live reference inspected with explicit permission; isolated prototype implemented and reviewed. See VERIFICATION.md for executed checks and scope limits.

## Scope

Build a standalone prototype in this directory, independently of AP-Leak-Finder, using representative fixtures. Preserve the existing application. Integration is a later decision. No imports from, links to dependencies in, or edits to the old application.

The source of truth is this conversation's final direction: study the real Vercel dashboard with computer use, document its design and interactions, then build Reclaim-specific workflows using that evidence. Earlier July/August designs and Ramp references are superseded. Prior assistant descriptions of Vercel are hypotheses, not verified specifications.

## Reference evidence required before design

- Shell and workspace/project navigation at desktop, laptop, and mobile widths.
- Overview, lists, detail views, settings, and contextual navigation.
- Search, filters, menus, tabs, toolbars, pagination, drawers, dialogs.
- Default, hover, focus, active, selected, disabled, empty, loading, and error states where safely accessible.
- Motion: opening and closing, interruptions, keyboard behavior, scroll retention, reduced motion. Label timing estimates as estimates; do not claim measured timings without measurements.
- For each observation, record the page, viewport, state, visible evidence, and intended Reclaim translation. Distinguish inaccessible states from observed ones.
- Inspect without saving settings, deploying, changing data, or revealing secrets.

## Product requirements

- Overview communicates what requires action, money associated with those findings, and recovery progress without a marketing hero.
- Findings provides a searchable, filterable queue with vendor, reason, evidence readiness, amount, and next action.
- Evidence provides record comparisons, source traceability, uncertainty, and a reversible human decision.
- Recovery supports draft preparation, status tracking, and recorded outcomes. Fixture actions must make clear that no external requests are sent.
- Records exposes original ledger context and relationships to findings.
- Settings covers relevant prototype preferences and workspace context without pretending unavailable integrations are connected.
- Navigation, back/forward, selection, filters, and detail dismissal preserve useful context.
- Counts derive from the same fixture model. Potential recovery, amounts requiring investigation, prevention opportunities, claims, and recovered money must not be silently combined or double-counted.

## Quality gates

- Capture reference and implementation at comparable viewport sizes; review layout, type, density, surfaces, controls, and states.
- Validate complete Overview → Finding → Evidence → Decision → Recovery interactions using computer use.
- Validate search/filter combinations, no-results state, keyboard navigation, Escape dismissal, focus restoration, narrow widths, and reduced motion.
- Motion must clarify state and preserve responsiveness. Do not add transitions merely to every component.
- Avoid redundant upgrade gates, oversized evidence cards, repeated summaries, ornamental type, and unsupported charts.
- Document remaining discrepancies honestly; unobserved or untested requirements are not complete.

## Deliverables

1. Reference inventory with observed and inferred details separated.
2. Design tokens, component rules, and motion specification.
3. Working isolated prototype with consistent fixtures and meaningful interactions.
4. Visual and interaction verification evidence.
5. Brief integration plan for the current audit engine.

## Current access evidence

The user explicitly authorized read-only authenticated inspection. The live reference was inspected successfully without account changes. See DESIGN.md for measured details, observed states, implementation choices and evidence limits.
