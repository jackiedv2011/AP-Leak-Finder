# Imagery: retire the old generated 3D, continue the section pieces

Status: **plan**, waiting for approval. When approved, the next step is mockups of the new pieces (§6), then renders and code.
Audit run 2026-10-19 over the whole repo: five parallel sweeps, then an independent verifier. The verifier found no live
reference the sweeps missed. Full results, with every reference, line and per-slot idea: `docs/audits/2026-10-19-old-imagery.json`; this file is the summary.

## 0. The direction (Aditya, Oct 19)

> The images we had generated, the 3D shape stuff, are no longer the direction. Take inspiration from our colourful green,
> orange, blue and violet section pieces. Those replace the previous generated images with the blocks and textures.
> Wherever that existed, remove it and continue that style.

**Kept, already in the new direction:**

- the four section pieces in `landing-site/media/exhibits/`: echo, overflow, piece and shadow
- the record-stack hero (`media/hero/`), which also plays on the log-in pages
- the MacBook walkthrough (`media/macbook/`)
- the green coin closer (`media/closing/`), which is a cut-out of the echo piece

## 1. The target style, as rendered

Everything comes from `landing-site/blender/exhibit_common.py`, the four `exhibit_*.py` scripts and `exhibit_encode.py`.

- **One object, one hue, on a pastel tile of that hue.**
  - The object is built from primitives: soft one-segment bevels (0.01–0.03), smooth round walls, no model files.
  - Material: satin Principled BSDF, roughness 0.45, specular 0.45. An invisible noise bump at scale 240 means the surface
    reads as untextured.
  - **Never** terrazzo, wood, plywood, clay or speckle (`K.library()` is the old look).
  - At most one secondary material, a near-white tinted toward the hue (`#fff3ea` apricot, `#f1edff` lilac).
- **Light:**
  - one sun from the front right, about 43° up, energy 5, angle 2°, giving a crisp edge with a small penumbra
  - the shadow falls back-left, about 1.06× the object's height
  - a shadow-catcher floor; shadow depth `shade = .32` on tiles
  - world `#f1eeea` at 0.12
- **Camera:** 100 mm lens, so nearly orthographic, about 20° from the front. The subject fills 33–58% of the frame width,
  sits a little low with air above, and its shadow stays inside the frame.
- **Output:** 16:9 tile stills at 2560 and 1600 (WebP q84) on a tile whose CSS background is the floor colour. Cut-outs
  for white pages use `cutout.py`. Seamless opaque loops follow `hero_stack.py` (frame 1 = last frame, H.264 `d.mp4` /
  `m.mp4` plus a `first.webp` poster).
- **The four hues.** A face square to the sun renders as the site colour. Keep the meanings: green = duplicate payment,
  orange = overpayment, violet = unused credit, blue = duplicate bill.

| hue | tile floor | object stock | renders as | secondary |
|---|---|---|---|---|
| mint (green) | `#c4e9d3` | `#2fee76` | ≈ `#00fd74` | none yet (suggest `#eefbf3`) |
| apricot (orange) | `#f6cfb2` | `#f66535` | ≈ `#ff6838` | `#fff3ea` |
| lilac (violet) | `#d8d0f3` | `#7558f6` | ≈ `#7a5cff` | `#f1edff` |
| sky (blue) | `#c2dff2` | `#00c9f6` | ≈ `#00d1ff` | none yet (suggest `#ecf6fd`) |

- **Tooling:** Blender 5.2, Cycles with OptiX, headless:
  `blender -b --factory-startup --python exhibit_X.py -- out=… spp=48 still=1 stillres=2560 shade=.32`.
  A tile still takes about 1–2 minutes. The cloud sessions have no Blender and no GPU.
- **Gotchas:**
  - `stage()` forces 16:9; set the resolution afterwards for square or 4:3 pieces.
  - A new hue must be added to `PALETTES` and to `styles.css`.
  - `encode.py` defaults to 30 fps.
  - On a dark canvas the catcher shadow disappears. For the app's dark theme, use opaque tiles or loops, not alpha WebM.

## 2. Where the old imagery is still live

### Marketing site

| Surface | Old asset (what it is) | Replace with | Render? |
|---|---|---|---|
| `/how-it-works` steps 1–4 (desktop only) | `media/connect` (green/orange hex chain), `find` (rainbow hex posts and ball), `build` (cyan/orange wedges), `recover` (green/yellow terrazzo disc stack), each as `.webm` and `.mp4`, 7.7 MB (from `solutions.py`) | Connect = **blue**, blocks filing into a white tray · Find = **orange**, one coral bead lifted from a white bowl · Evidence = **violet**, a key drawn from a white stack · Recover = **green**, coins settling into a white dish | 4 stills (loops later) |
| `/how-it-works` "numbers" carousel | `assets/cs-1.png` (slab stack on a pallet), `dept-inventory.png` (barcode scanner), `dept-freight.png` (toy truck) | The figure on a pastel tile, no picture (plan 002) | none |
| `/research` cards, the `/about` research carousel | `assets/dept-finance`, `-freight`, `-procurement`, `-warehousing` (striped renders) | One thumbnail per article, shared by `/research` and `/about`. Occupational fraud = **orange**, an invoice slab with a coral copy sliding out · Improper payments = **blue**, a tall column of bars with a stepped shadow · Payments fraud = **orange or violet**, an envelope in a white tray · AP benchmarks = **green**, a row of white coins with one green pair | 4 stills |
| `/research/*` stat carousels (×4 articles) | `cs-1`, `cs-2` (puzzle), `cs-3` (bar chart), `dept-*` | The figure on a pastel tile, no picture | none |
| `/guides` | a hexagon outline placeholder (code) | the landing's export tiles (plan 002) | none |
| `/security` | flat line-icon shield and envelope boxes (code, not 3D) | white summary-card rows; optionally one **violet** sealed record box | 0–1 still |

### App (tracked in Linear REC-31, with a per-screen table)

All 16 loops in `public/onboarding/` (17 MB) are black clay cubes, cream paper, a green gem and a brass stamp, from
`onboarding.py` and `onboardlib.py`:

- 7 goal and autonomy card icons
- 7 onboarding stage loops
- the 2 Launch cards ("Your payments", "Our sample")

`ic_duplicate` can reuse echo, `ic_credit` can reuse piece, and the finale can reuse the record stack.

| Count | New renders |
|---|---|
| Marketing | 8 stills (4 How It Works, 4 research thumbnails), plus 1 optional for Security |
| App | about 13 new pieces (16 slots minus 3 reused). Stills first; loops only where motion carries meaning (the onboarding stages). |

The render-pipeline sweep estimates about 4 days for the marketing stills. The app takes 6–15 days depending on stills
versus loops.

## 3. Dead weight: old imagery nothing shows (delete)

| What | Size | Note |
|---|---|---|
| `landing-site/media/hero.webm`, `hero.mp4`, `hero-white.mp4` (the old exploding-hex column) | 22 MB | **Still copied into production `dist/`** by `scripts/landingSitePlugin.ts` |
| `landing-site/blender/hero.py`, `blender/v3/` (byte-identical copy), `blender/orig/` (incl. `orig/media/*.mp4`) | 9.3 MB | Archives of the old look |
| `src/assets/landing/**`: AI atmosphere and scene plates, "worlds", fresh-desktop, optimized, backgrounds, scenes | 70 MB | Used only by the unrouted React landings. Note `/` is served from `landing-site/`. |
| `src/components/landing/*`, `src/components/site/*`, the `'/'` → `SiteLanding` route in `src/App.tsx`, and the `ogl` dependency (used only by `SideRays`) | 0.8 MB of code | Unreachable. `SiteLanding` is still lazy-imported, so its assets are in the build graph. |
| `src/assets/app/evidence-room.webp`, `public/art/` (17 crops), `public/generated/reclaim-tutorial/` (6 AI-generated UI mock-ups) | 10 MB | Referenced by nothing |
| `src/workspace/WorkObject.tsx`, `objects.ts`, `.wk-object` CSS | small | Orphaned. Points at `media/stills/`, which was deleted. |
| `scripts/prepare_landing_scene_plates.py` | small | Tooling for the AI scene plates |
| After §4 step 2: `solutions.py`, `onboarding.py`, `onboardlib.py`, `render_onboarding.sh`, the old `media/{connect,find,build,recover}.*` and the old `public/onboarding/*` | 25 MB | Once each is replaced |

`.preview-pre-v2/` (72 MB) is Aditya's archive snapshot from `7964a7b`. Keep it or delete it: owner's call.

## 4. Order of work

1. **Now, no Blender needed.**
   - Delete the dead weight in §3 except `.preview-pre-v2/`. Run the tests and the build, and check that `dist/` shrinks.
   - As plan 002's pages are coded: stat carousels become figure tiles, Guides gets export tiles, and How It Works and
     Research use the four existing pieces where the meaning fits (duplicate payment → echo, and so on). An empty tile is
     better than an old render; don't ship "piece to render" placeholders.
   - Fix the stale `landing-site/blender/README.md`, which still calls `hero.py` the log-in film and describes ledger
     stocks the code no longer has.
2. **On a machine with Blender 5.2 and a GPU.** Write one `exhibit_*.py` per new piece, modelled on `exhibit_shadow.py`
   and `exhibit_piece.py`. Order: How It Works (4) → research thumbnails (4) → onboarding and Launch (REC-31). Encode
   with `exhibit_encode.py`, then swap the assets in.
3. **Clean-up.** Remove the old scripts and assets as each replacement lands.

## 5. Decisions for the owner

1. **Stat cards:** figure on a pastel tile, no picture (recommended; it saves 8–10 renders), or a render per stat?
2. **Onboarding:** stills (faster, about 6 days) or loops (about 15 days)? Recommended: stills for the card icons and Launch,
   loops for the 7 stage pieces.
3. **`.preview-pre-v2/`:** keep the 72 MB archive or delete it?
4. **Who renders:** the owner's Blender machine, or the Higgsfield Blender connector this session has, driving a Blender
   that someone opens and connects.

## 6. Mockups for this plan (after approval)

A single sheet of every proposed piece, drawn flat in CSS/SVG at the final tile size and colour. The four existing pieces
sit beside them for reference, and each one is shown in place on its page. The point is to approve objects and hues
before anything is modelled. Then render.
