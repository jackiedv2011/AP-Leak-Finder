# 3D loops (Blender 5.2, Cycles/OptiX)

All site 3D is pre-rendered here and shipped as looping video: transparent VP9 WebM for
Chrome/Firefox/Edge, plus an H.264 MP4 with the section colour baked in for Safari
(`reels.js` swaps it in).

| file | what |
|---|---|
| `looklib.py` | shared look: stock (`ream`/`paper`/`ruled`, `STOCKS` colours), accents, sun + fill, render settings |
| `hero.py` | hero column, 240 frames (8 s); ring blocks with index tabs, and one block that comes home late |
| `solutions.py` | `scene=find\|build\|recover`, 150 frames (5 s) each |
| `encode.py` | PNG frames -> `.webm` (alpha) or, with `bg=RRGGBB`, `.mp4` |
| `montage.py` | frames side by side at the size the page shows them, over the section colour |
| `compare.py` | side-by-side sheet vs reference frames (`path@x0,y0,x1,y1` crops) |

## What these are of

Everything is built from one substance: a block of ledger sheets. Edge-on it shows its
leaves (`ream`), face-on it is plain or printed card (`paper`, `ruled`), and every block
carries an index tab — a thin divider seated into one face and left standing proud, which
is a separate object because an extruded outline can only make a full-height fin.

Colour is the site's own (`styles.css`), never decoration:

| | |
|---|---|
| green `#00fd74` | money actually back |
| orange `#ff6838` | paid twice |
| blue `#00d1ff` | paid too much / approved |
| pink `#ff7ef2` | paid to the wrong place |

The chrome around these renders is monochrome on purpose, so whatever colour a viewer
sees on the page is colour that came from in here — which means these loops have to
carry it, and a frame of white cards with one coloured tab does not.

Stock comes in colours (`STOCKS` in `looklib.py`) and a card is usually made of one,
edge and face together. Two rules keep that from turning into confetti:

- **Value before hue.** Every scene runs `cream` and `bone` through `mid` to `dark` as well
  as through colour. Colour alone gives a picture variety; only value gives it depth, and on
  a black section the darks have to come out of the stock because they cannot come from the
  ground. Paper is never one white either — a real drawer holds bond, manila and board, and
  those neutrals carry most of a frame's variety without spending any saturation on it.
- **The subject gets contrast, not more colour.** The blue mark lands on a plain white
  record, because a blue mark on a blue card is a mark nobody sees land.

Saturated, not pale: a wash over every card reads as sticky notes and costs the leaves in
the cut edge, which is the only thing making these objects paper.

Each loop is about one event:

- **hero** — reconciliation: every block pulled out, turned, and put back in balance. The
  green block on the top ring holds out ~30 frames after the others and seats exactly on
  the loop seam (smootherstep takes its speed to zero there, so the cut is invisible).
- **find** — two records carrying the same invoice number cross the pile and come to rest
  face to face. They are cut from the same orange stock, so they read as a pair from the
  first frame, long before they go anywhere near each other.
- **build** — records file themselves bottom-first; the last one waits, proud of the pile,
  until Reclaim's mark comes down onto it, and only then do the two seat together.
- **recover** — the file fans open on a gap: an outline with nothing in it. The card that
  fills it arrives green, and the outline is left as a frame around something real.

The hero renders on grey `#e5e5e5`, so it can go all the way to `carbon` for its darks. The
solution loops sit on black and bottom out at `dark` instead — anything nearer to black
there stops being an object and becomes a hole in the page.

## Render

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
# quick look (writes *_test_NNNN.png and *_bg.png composites)
"$B" -b --factory-startup --python hero.py -- out=out/t res=960 spp=48 frames=1,70,214 bg=e5e5e5 overwrite=1 topdrop=.58
# final
"$B" -b --factory-startup --python hero.py -- out=out/hero_v2 res=1920 spp=128 frames=all topdrop=.58
"$B" -b --factory-startup --python solutions.py -- scene=find out=out/find_v3 res=1080 spp=96 frames=all
```

Paths are made absolute against the working directory before Blender sees them (on Windows,
Blender resolves a bare relative output path against the drive root, so `out/x` would land in `C:\out\x`).

Useful knobs (all `key=value` after `--`): `sunE` `fill` `sun=x,y,z` `exp` `view` `look` `dist` `el` `az`,
hero: `open` `spread` `tilt` `twist` `pivot` `topdrop` `lens`; recover: `fan`.
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
"$B" -b --factory-startup --python encode.py -- src=out/hero_v2 prefix=hero out=../media/hero.webm crf=30
"$B" -b --factory-startup --python encode.py -- src=out/hero_v2 prefix=hero out=../media/hero.mp4 crf=20 bg=e5e5e5
# solutions: crf=31 for webm, bg=000000 for the mp4
```
