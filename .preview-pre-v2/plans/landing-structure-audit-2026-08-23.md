# Landing structural audit - 2026-08-23

## Design read

Reclaim is a trust-first B2B payment-recovery landing page with an editorial, material light-mode language. Its approved dials remain: design variance 6, motion 7, visual density 6.

## Root cause

The current page had four stylesheets independently defining section geometry. The latest visual symptoms were not individual responsive bugs. They were structural conflicts:

- Incoming scenes had negative top margins, pulling live section content underneath the prior scene.
- The same incoming scene then used a mask to hide the overlap. That mask changed with the viewport, so it cut proof panels and visual assets.
- Scene images were enlarged to 114% and offset by -7%, so their composition could never remain stable at every aspect ratio.
- Ledger and evidence result cards used absolute placement outside the reserved layout area.
- The footer used the same overlap-and-mask mechanism as content chapters.
- Navigation styles were defined in multiple late overrides, mixing transparent, blurred, and solid states.

## Structural rules now being enforced

1. Every scene stays in normal document flow. There are no negative chapter margins.
2. A scene has one background plate at layer 0 and live content at layer 1.
3. Generated scene images use their real bounds: `inset: 0`, `width: 100%`, `height: 100%`, `object-fit: cover`. No zoom, blur, or mask.
4. The navigation is the only fixed page chrome. Open state is transparent; condensed state is a solid floating control.
5. Product proof cards must live inside a grid or another space-reserving container. They never hang below their parent section.
6. Section transitions do not overlap live DOM. Material continuity can be reintroduced later as a background-only effect after this layout is stable.
7. The footer is the only intentional light-to-dark transition and is not allowed to cover the preceding section.

## Verification sequence

1. Hero, ledger, evidence, pricing, and footer at 16:9 desktop.
2. Laptop 1366px, tablet 820px, mobile 390px.
3. Inspect every chapter boundary and right/bottom edge for crop, mask, or scroll-width overflow.
4. Only after clean static composition, restore motivated wake motion and handwriting. Motion must never alter document layout or background image bounds.
