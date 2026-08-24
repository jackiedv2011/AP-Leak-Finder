# Reclaim target reference board

Plan-only visual direction. These are composed visual targets for the non-footer landing sections. The footer remains locked to the current implementation and is intentionally excluded.

## Global direction

- Light, tactile, editorial world: ivory / warm white surface, charcoal type, restrained Reclaim green.
- Attached TasteSkill reference used for material, object placement, and composition only; do not copy its text, logo, or exact objects.
- Dark surfaces appear only when they represent evidence, a ledger, or a review record.
- No dither outside the locked footer.
- No generic dashboard cards or abstract AI decoration.
- Motion should be implied by physical relationships: rows align, paper attaches, records unfold, and totals assemble from visible evidence.

## Target references

| Section | Reference | Role |
| --- | --- | --- |
| Hero | [01-hero.png](../reference-captures/target-board/01-hero.png) | Light tactile opening scene with ledger and evidence objects |
| Motto | [02-motto.png](../reference-captures/target-board/02-motto.png) | Handwritten paragraph, static principle, static logo |
| Ledger | [03-ledger.png](../reference-captures/target-board/03-ledger.png) | Light desk with contained dark relationship ledger |
| Evidence | [04-evidence.png](../reference-captures/target-board/04-evidence.png) | Strongest evidence-first composition |
| Workflow | [05-workflow.png](../reference-captures/target-board/05-workflow.png) | CSV export becoming a Reclaim review record |
| Results | [06-results.png](../reference-captures/target-board/06-results.png) | Recoverable total grounded in selected source rows |
| Recovery | [07-recovery.png](../reference-captures/target-board/07-recovery.png) | One physical recovery case assembled from source evidence |
| Security | [08-security.png](../reference-captures/target-board/08-security.png) | Browser boundary containing a local ledger |
| Pricing | [09-pricing.png](../reference-captures/target-board/09-pricing.png) | Outcome timeline ending in a clear fee rule |
| About | [10-about.png](../reference-captures/target-board/10-about.png) | Large editorial brand statement |
| FAQ | [11-faq.png](../reference-captures/target-board/11-faq.png) | Light ruled question list with physical document objects |

## Critical audit notes

- The target set is visually coherent and substantially stronger than the current dark/dither chapters.
- Hero, ledger, evidence, recovery, pricing, About, and FAQ are implementation-ready visual directions.
- Motto correctly keeps the paragraph as one written thought, with the normal Reclaim lockup beneath it.
- Workflow and results need their small data labels replaced with the existing Reclaim sample data during implementation.
- Generated image text is reference-level typography and hierarchy, not a production copy source. Production must use the approved copy and real sample values from the app.
- The visual surface should remain static while the foreground objects and text morph through the scroll sequence.
- Footer is not to be redesigned; preserve its current light-to-dark fade, dark surface, dither, CTA, and navigation.

## Motion direction

The physical objects in the references are not static decorations. They use a two-layer motion model:

### Wake / materialization

When a section enters the viewport, its objects wake into place automatically. The visitor does not need to keep scrolling to complete the entrance.

- Use a staggered reveal and slide-in from the object's implied resting place.
- Use clip-path or mask reveals for paper edges and document surfaces rather than opacity-only fades.
- Use a restrained spring or ease-out settle with no playful bounce.
- Let the heaviest object arrive first; lighter slips, labels, and rules follow.
- Preserve object identity and final layout throughout the entrance.

### Scroll depth

After wake, scrolling adds a small amount of parallax and depth rather than controlling whether the object exists.

- Background material moves least.
- Main ledger / book moves slightly.
- Loose paper, evidence slips, and annotations move a little more.
- Relationship lines stay spatially attached to the records they explain.
- Use transform-only movement; never animate layout dimensions every frame.
- Do not make the scroll movement large enough to harm reading or feel like a carousel.

The precise vocabulary is: staggered reveal, shared-element continuity, parallax, scroll-driven animation, spring settle, follow-through, and spatial consistency. This is not a scroll-gated reveal and not a crossfade between screens.

### Motto exception

The motto is simpler: its paragraph typewrites automatically once the section enters. The lower principle and Reclaim lockup remain static. No object choreography is needed there.
