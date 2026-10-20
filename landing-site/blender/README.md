# 3D loops (Blender 5.2, Cycles/OptiX)

All site 3D is pre-rendered here and shipped as looping video: transparent VP9 WebM for
Chrome/Firefox/Edge, plus an H.264 MP4 with the section colour baked in for Safari
(`reels.js` swaps it in).

| file | what |
|---|---|
| `looklib.py` | shared base: render settings, sun + fill, camera, the satin `plain` material and bevels; `library()` (terrazzo, wood, plywood) is the old look, used only by `solutions.py` |
| `exhibit_common.py` | the current look: the shared set for the `exhibit_*.py` pieces (see [What these are of](#what-these-are-of)) |
| `hero_stack.py` | the site hero, 1355 frames (22.6 s, square): a stack of record slabs that pulls out each of its four coloured sheets in turn and files it back; also the film on the app's log-in and sign-up pages (`src/pages/AuthSplit.tsx` plays `media/hero/d.mp4`) |
| `solutions.py` | `scene=find\|build\|recover`, 150 frames (5 s) each |
| `encode.py` | PNG frames -> `.webm` (alpha) or, with `bg=RRGGBB`, `.mp4` |
| `montage.py` | frames side by side at the size the page shows them, over the section colour |
| `compare.py` | side-by-side sheet vs reference frames (`path@x0,y0,x1,y1` crops) |
| `onboardlib.py` | onboarding substance: black clay, cream paper and ruled ledger stock, one glossy green, brass; the Reclaim mark as geometry |
| `onboarding.py` | the app's onboarding loops (`scene=welcome\|business\|tools\|how\|data\|finale_in\|finale\|ic_*\|card_*`); `card_*` are the two ledger-choice cards on Launch |
| `render_onboarding.sh` | renders every onboarding loop and ships it to `public/onboarding/` (WebM + dark/light MP4 + poster) |
| `poster.py` | first frame as a transparent WebP (`<video poster>`, reduced motion) |
| `grid.py` | contact sheet of frames at any aspect, for reviewing a batch at once |
| `render_tests.sh` | half-size preview frames of named onboarding scenes (`scene:1,40,80`) |
| `macbook.py` | the home page walkthrough: a laptop opening over 120 frames, plus `corners.json` (where the screen lands in every frame) |
| `macbook_encode.py` | those frames -> opaque WebP flattened onto the section's ink (`media/macbook/`: desktop, phone and the open-pose stills) |

## What these are of

The current look is `exhibit_common.py`'s: one object, one hue, on a pastel tile of that hue. The
object is built from primitives (soft one-segment bevels, no model files) in a satin material, lit by
one sun from the front right whose shadow falls back-left onto a shadow-catcher floor, through a 100 mm
lens. Each hue keeps its meaning: green = duplicate payment, orange = overpayment, violet = unused
credit, blue = duplicate bill; `PALETTES` holds each one's tile floor and object stock. The full spec
(materials, light, camera, output, gotchas) is `plans/003-imagery-section-pieces.md` §1. Start a new
piece from `exhibit_shadow.py` or `exhibit_piece.py`.

`solutions.py` (the `/how-it-works` loops, `media/{connect,find,build,recover}.*`) and `onboarding.py`
with `onboardlib.py` (the app's loops in `public/onboarding/`) are the old look: terrazzo, wood and
plywood from `looklib.library()`, black clay, cream paper and brass. They are kept only until their
replacements land (plan 003 §4); don't start anything new from them.

## Onboarding (the app, not the site)

Onboarding uses the same light, render settings, camera and motion grammar as these loops — only the
substance changes: matte black clay blocks, cream paper (some ruled in faint green), and one glossy green
piece per scene, the money still in the paperwork. Stage loops sit on the workspace canvas
(`#000` / `#f3f3f3`), card icons on a card (`#111` / `#fff`); the MP4 bakes match those.
The pile in `welcome`, `business`, `tools` and `finale` is one object at rest at every loop seam, so
moving between those steps reads as the same thing continuing. `finale_in` plays once and its last
frame is `finale`'s first. The ledger-choice cards (`card_upload`, `card_sample`) render on the card colours, like the icons.

```bash
./render_onboarding.sh                       # everything
SCENES="ic_show ic_draft" ./render_onboarding.sh  # just these (delete their out/onb_final/<scene> to re-render)
./render_tests.sh welcome:1,120 how:1,130     # quick look
```

## Render

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
# quick look (writes *_test_NNNN.png and *_bg.png composites)
"$B" -b --factory-startup --python solutions.py -- scene=find out=out/t res=720 spp=48 frames=1,40,80 bg=000000 overwrite=1
# final
"$B" -b --factory-startup --python solutions.py -- scene=find out=out/find_v3 res=1080 spp=96 frames=all
```

Paths are made absolute against the working directory before Blender sees them (on Windows,
Blender resolves a bare relative output path against the drive root, so `out/x` would land in `C:\out\x`).

Useful knobs (all `key=value` after `--`): `sunE` `fill` `sun=x,y,z` `exp` `view` `look` `dist` `el` `az` `lens`;
recover: `fan`.
Renders resume where they stopped (existing frames are skipped unless `overwrite=1`).

These loops are watched at ~317px in a three-up row on the homepage, so judge them at that
size, not at 1080. A seventh record in frame is not more evidence there, just less of
everything — check the real size before spending a full render:

```bash
"$B" -b --factory-startup --python montage.py -- size=317 bg=000000 \
  srcs=out/find_v3/find_0078.png,out/build_v3/build_0078.png,out/recover_v3/recover_0078.png out=out/cards.png
```

## Encode

```bash
"$B" -b --factory-startup --python encode.py -- src=out/find_v3 prefix=find out=../media/find.webm crf=31
"$B" -b --factory-startup --python encode.py -- src=out/find_v3 prefix=find out=../media/find.mp4 bg=000000
```

## The home page laptop (walkthrough)

The "See the money and the proof" section is a laptop that opens as you scroll, then a dashboard
walkthrough on its screen. This is not a loop: it is a frame sequence the page scrubs (`walkthrough.js`)
and draws on a canvas, with the live HTML dashboard mapped onto the screen corners of each frame, so
the screen stays sharp when the page zooms in. The screen renders as dark glass for that reason.

The model is not in the repo (its licence is unconfirmed): it lives in `out/models/macbook/` (ignored).
Open it with `-Y` so its scripts do not run. Its logo is hidden, and nothing from its texture folder
(Apple reference photos, wallpapers) is used or shipped.

```bash
"$B" -b -Y out/models/macbook/macbookpro.blend --python macbook.py -- out=out/macbook spp=48 frames=all
"$B" -b -Y out/models/macbook/macbookpro.blend --python macbook.py -- out=out/macbook still=1 stillres=3840 stillh=0.88 spp=64
"$B" -b --factory-startup --python macbook_encode.py -- src=out/macbook dst=../media/macbook
# review a few frames first: spp=32 frames=0,60,90,119 overwrite=1 into another out=
```

About 8.5 s a frame on OptiX at 1280 (the default `res`). The page fetches every frame, decodes a few
either side of the scroll position and blends neighbours, so the frame width is what keeps the scrub
smooth: the zoomed steps sit on the 4K still, not the frames.
Composition knobs: `el0` `d0` `d1` `shift0` (the closed laptop sits low, under the heading; the open one
is square to the screen). Light: `alu` `rough` `top` `topy` `light` `world`. The front fill is kept
under the screen's mirror angle, or the glass picks it up as a grey strip; the shadow catcher reflects
as the page's ink for the same reason.
Reflections are kept low on purpose: `gspec` `grough` (the cover glass: a faint gloss over a clear
layer, not refracting glass), `sspec` `srough` (the panel), `bspec` `brough` (the bezel). The glass
reflection fades to nothing over t .62-.80, before the page wakes the screen, so nothing sits over the
dashboard; the still has none.
The still is taller than a frame (`stillh`, a fraction of its width): the same view with room added
below for the whole deck, which the frames crop. It writes `still.json` (its own screen corners); the
encoder folds that into `corners.json`, and the page lays the still on the last frame by those corners.
The screen corners run past the model's panel to the bottom of the black glass (`YB` in `macbook.py`),
so the dashboard fills the screen to a bezel as thin as the sides.
The encoder flattens the frames onto `bg=08100c` (`--cl-black` in styles.css): change both together.
If the corners change, re-encode: the page reads `corners.json` from `media/macbook/`.

## The home page exhibits (What Reclaim finds)

Four mistakes, each an object on a floor of its own colour, shown wrong and then put right. They are
built from nothing (`--factory-startup`, no model files) and share a set in `exhibit_common.py`. The page
shows each one's resting pose, put right, as a still (`still.webp`, `still-m.webp` for phones): the four
tiles under the passage in `src/pages/index.html` (`.finds`, `finds.js`), and the recovery summary's icons.
The scenes still render as short films too; the page no longer uses those.

The look is the loops' own, taken from `looklib` unchanged: one sun with a low warm fill, the 100 mm lens,
Cycles with motion blur, the satin `plain` materials, one-segment angle-limited bevels, the bright accent
stocks (a face square to the sun renders as the site's colour). The floor is a shadow catcher, so the film
is transparent but for the sun's shadow; a shadowless sun linked to the floor alone sets how dark that
shadow is (`shade=`, 0..1, .32 in the shipped films). The motion is the apple-style-motion skill's, ported
to Python in `exhibit_common.py`: cubic-bezier eases by role (`out`, `inOut`, `swoop`), SwiftUI springs,
arcs, staggers, a slow camera push; every moving thing is keyed on every frame, at 60 fps.

| script | mistake | the object | palette |
| --- | --- | --- | --- |
| `exhibit_echo.py` | paid twice | a stack of coins slides out of itself, then back | mint |
| `exhibit_overflow.py` | overpaid | spheres pour past a cup's rim, the spill stacks into a pyramid beside it | apricot |
| `exhibit_piece.py` | credit never used | a tray of eight with one piece lying out, which drops home | lilac |
| `exhibit_shadow.py` | billed twice | a cube and a tower of the same six plates; from overhead they are one square | sky |

```bash
for e in echo overflow piece shadow; do
  "$B" -b --factory-startup --python exhibit_$e.py -- out=out/ex/$e spp=48 still=1 stillres=2560 shade=.32
done
"$B" -b --factory-startup --python exhibit_encode.py -- src=out/ex dst=../media/exhibits
# review a few frames first: frames=1,40,80,120 spp=32 out=out/<name>_t
```

Each film is short (1.9 to 2.65 s); a script renders every frame of it (`f_0001.png`..) and `meta.json`
(its floor colour, fps, frame count), and with `still=1` the resting pose at `stillres`. Echo, piece and
shadow take a few seconds a frame on OptiX; overflow first runs its pour as a rigid-body simulation (rolled
on off camera until the cup is nearly full), so it takes longest.
The encoder lays each frame over its floor colour (into `flat/`), puts them through Blender's sequencer into
an H.264 film, `d.mp4` (1280) and `m.mp4` (960), and writes `first.webp` (the opening frame, the film's
poster), `still.webp` and `still-m.webp`. Only the stills are published (`media/exhibits/<name>/`); a re-encode
writes the films and posters there too, so delete them again. Each tile sits on its still's floor colour,
written into styles.css (`.fd-tile[data-ex]`, sampled from the stills): a palette change means changing those.

## The closing coin stack

The closing section above the footer (`src/partials/closing.html`, on every page that ends with a call to
action) shows the echo exhibit's single stack at rest, cut out so it sits straight on the page with its own
soft shadow. It is the film's last frame, rendered large with a lighter shadow for the white page, then
cropped by `cutout.py` into WebP with alpha:

```bash
"$B" -b --factory-startup --python exhibit_echo.py -- out=out/closing frames=139 res=2560 spp=128 shade=.22
"$B" -b --factory-startup --python cutout.py -- src=out/closing/echo_139.png dst=../media/closing/coins widths=1200,720
```

## The hero record stack

The home hero (`src/pages/index.html`, `.hero-film`) is `hero_stack.py`, built to the approved concept frames:
a lid printed as a record, neutral slabs, and four coloured sheets in the "What Reclaim finds" tiles' colours
and order (mint, peach, lavender, blue). Four times over, the lid lifts, a parting runs down the stack to a
sheet, the sheet slides out a third of its length, holds, slides home, and the layers settle back, the lid
last. The camera never moves, and the loop starts and ends on the closed stack at rest (also the poster).

The camera is fitted, not placed: `box` is where the resting stack sits in the hero square in the concept
frame, and the script solves the distance and lens shift to fill it at a fixed angle (`el`, `az`, a 250 mm
lens). `wire=0` writes the stack's edges as frame fractions instead of rendering, for laying over a concept
frame. The light is a soft key high behind on the right; the floor's bounce is taken by a card only diffuse
rays see, so the shadow's depth (`shade`) and the faces' brightness can be set apart. The shadow's last tail
is faded out at the frame's left and bottom edges, so the square never cuts it off. A full render copies any
frame whose pose has not moved since the last one (the rests and holds), instead of rendering it again. It renders on the hero's floor (`#ebe7de`); `exhibit_encode.py` flattens it
into MP4s (`d.mp4` 1280, `m.mp4` 960 for phones) and a poster (`first.webp`), and the page samples the film's
corner into `--cl-bg1`, so the floor and the section never show a seam. The page links all three with a `?v=`
tag: bump it in `src/pages/index.html` whenever the films are re-encoded, so cached copies are dropped.

```bash
"$B" -b --factory-startup --python hero_stack.py -- review=1 out=out/hero_review res=1280 spp=64
"$B" -b --factory-startup --python hero_stack.py -- out=out/hero_final/hero res=1280 spp=64
"$B" -b --factory-startup --python exhibit_encode.py -- src=out/hero_final dst=../media only=hero stills=0
```

