# Piece kit (plan 003)

These are the rules for drawing the nine proposed section pieces as flat SVG stand-ins. The owner approves each piece's
object and hue from these drawings before anyone models it in Blender. The rules come from the Blender set
(`landing-site/blender/exhibit_common.py` and the four `exhibit_*.py`), and they were checked against the real stills in
`calibration.html`. Two stills were redrawn with this kit and laid over the renders: the outlines land within 4 px at
2560 px wide.

| File | What it is |
|---|---|
| `kit/piecekit.py` | The kit as code: Python 3, standard library only. It reproduces the camera, sun, palette, faces, shadows and framing, and writes one SVG per tile. **Use it.** Hand-drawing (§11) is the fallback. |
| `kit/calib.py` | Builds `pieces/_calib-shadow.svg` and `pieces/_calib-echo.svg` from the scripts' own numbers. |
| `kit/examples.py` → `kit/examples/*.svg` | Every primitive once, one per hue (`shots/kit-primitives.png`). These are reference drawings, not proposals. |
| `kit/snippets.svg` | The hand-drawn box and coin stack from §11. |
| `calibration.html` | Each still beside its SVG, with a 50% overlay (`shots/calibration-1440.png`, `shots/calibration-overlay-1440.png`). |

---

## 1. The tile

- `viewBox="0 0 2560 1440"` (16:9, the stills' size), `width="2560" height="1440"`.
- The first element is `<rect width="2560" height="1440" fill="FLOOR"/>`. Nothing else goes in the background: no
  vignette, no gradient, no border.
- Put **one object, or one small group that reads as one thing**, in **one hue**. At most one second material, the
  near-white of §3.
- Objects are smooth and untextured with soft small bevels. No outlines: strokes are allowed only in the face's own
  colour, to close seams. No gradients on objects, no texture, no speckle, no wood, terrazzo or clay. No text or
  icons on objects.
- Save each piece as `pieces/<slug>.svg` with a `<title>`.

## 2. Palette (per hue)

Floor, lit, mid and shade come from the render audit. The other tones were sampled from the four stills with PIL;
"proposed" marks the ones no still shows yet.

| token | mint (green) | apricot (orange) | lilac (violet) | sky (blue) | used for |
|---|---|---|---|---|---|
| `floor` | `#c4e9d3` | `#f6cfb2` | `#d8d0f3` | `#c2dff2` | tile background |
| `lit` | `#63fa8e` | `#fb7b60` | `#795ef8` | `#53cbf9` | walls and chamfers facing the sun (front, right); round walls |
| `mid` | `#28ee75` | `#f66d4b` | `#7153f1` | `#2bc8f3` | **tops** (every upward face) |
| `shade` | `#22cb57` | `#a92509` | `#3e23b8` | `#016693` | walls facing away (left, back); shadows cast on the hue |
| `bev` | `#25d466` | `#d2502f` | `#5a3dd8` | `#2aa4c6` | top chamfers facing away (back, left edge lines); a sphere's dark side |
| `deep` | `#00a224` | `#6e1200` | `#2a148c` | `#00557f` | crevices: gaps between stacked things, a thin lip's line (2–3 px) |
| `shadow` | `#8ba495` | `#b1957f` | `#9e9ab2` | `#8ea3b0` | floor shadow (≈ floor × .72), measured in each still |
| `sec_lit` | `#eefbf3` proposed | `#fbf1e9` | `#f0eefc` | `#ecf6fd` proposed | near-white walls facing the sun |
| `sec_mid` | `#e5f2ea` | `#f3e7de` | `#e8e3f3` | `#e2edf4` | near-white tops |
| `sec_shade` | `#c9d8cf` | `#dccbbf` | `#cdcad9` | `#c6d4de` | near-white walls and chamfers facing away |
| `sec_cast` | `#b7c6bd` | `#d2bfb2` | `#bdb7cf` | `#b4c3ce` | shadows cast on the near-white |
| `sec_deep` | `#a9bdb1` | `#c2ab9b` | `#aaa4bf` | `#a6b7c3` | crevices in the near-white |
| `ink` | `#0c3a23` | `#4a1d0c` | `#241858` | `#0b2e48` | caption text on the tile (landing `.fd-tile --ink`) |

The lilac near-white was measured on the piece tray (front `#f0eefc`, top `#e8e3f3`, left end `#cdcad9`), and the
apricot one on the bowl (`#fbf1e9`). The others are scaled from these. The hues keep their meanings: green is duplicate
payment, orange is overpayment, violet is unused credit, and blue is duplicate bill.

## 3. Which face gets which tone

Measured on the stills. The top is **not** the brightest face: satin walls catch the floor's light.

| face | hue object | near-white object |
|---|---|---|
| top (any face pointing up) | `mid` | `sec_mid` |
| front wall, right wall (facing camera and sun) | `lit` | `sec_lit` |
| left wall, back wall (facing away from the sun) | `shade` | `sec_shade` |
| a wall seen almost edge-on (a side sliver) | `lit` | `sec_lit` |
| round wall (coin edge, cylinder, bowl outside) | `lit` all round the visible front | `sec_lit` |
| top chamfer on the front or right edge | `lit` (merges with the front wall) | `sec_lit` |
| top chamfer on the back or left edge | `bev`, a thin line | `sec_shade` |
| underside visible in a gap | `deep` | `sec_deep` |
| shadow cast on the object | `shade` | `sec_cast` |
| crevice (gap < .02 m, a lip < .03 m tall, a thing lying flush) | `deep` | `sec_deep` |
| inside a hole (well, cup, dish) | back and left inner walls `lit` down to the rim's shadow line, `shade` below it and on the right wall; floor `mid` with a `shade` band along its front and right | the same in `sec_*` |
| sphere (bead, ball) | `bev` disc of radius R; `mid` disc of radius 1.02R offset 0.2R toward the upper right (screen dx +.62, dy −.78), clipped to the sphere; `lit` disc of radius .56R offset .34R the same way | the same in `sec_*` |

## 4. Light

- There is one sun, from the front right, **43° up**: direction `(.5, −.55, .7)` in Blender (x right, y away from the
  camera, z up).
- A point at height `z` throws its shadow onto the floor at `(x − .714·z, y + .786·z)`, which is back and to the left.
  The shadow's length is **1.06 × the height**.
- Light never comes from the left, and shadows never fall right or toward the camera.

## 5. Projection (camera)

The Blender camera has a 100 mm lens on a 36 mm sensor: almost orthographic.

- **Scale:** `s = 7111 / dist` px per metre at 2560 px wide. The stills use dist ≈ 13.9 (echo), so `s ≈ 512`.
- **Elevation** `θ`: **30°** by default. The stills range from 26° (overflow) to 36° (piece). The camera looks from
  straight in front (azimuth 0). Top-down (`θ = 89.5°`) is only the shadow piece's end pose: use it only when a
  piece's idea is a shadow or footprint seen from above.
- **Orthographic mapping**, good enough for hand drawing:

  ```
  X = 1280 + s·(x − tx)
  Y =  720 − s·((y − ty)·sin θ + (z − tz)·cos θ)        (t = the point the camera aims at)
  ```

- **A box** w wide, d deep and h tall, standing on the floor:
  - The **top face** is a rectangle `w·s` wide and `d·s·sin θ` tall. At 30° that is half its depth.
  - The **front face** is `w·s` wide and `h·s·cos θ` tall (.866·h·s at 30°). It hangs directly below the top face's
    front edge. Its bottom edge is the box's foot.
  - The **side faces** don't show (`az = 0`). Real perspective shows a sliver of the side facing the frame centre,
    1–2% of the width. Draw it `lit` or leave it out.
- **A disc or cylinder** of radius r and height h: the top is an ellipse with `rx = r·s` and `ry = r·s·sin θ`. The wall
  is the band between that ellipse and the same ellipse moved down by `h·s·cos θ`, front half only. A stack of
  disks repeats every `(h + gap)·s·cos θ` px upward.
- In true perspective, nearer things are ~5% larger and farther ones ~5% smaller. `piecekit` does this; by hand,
  ignore it.

## 6. Shadows

- **Floor shadow polygon:** take the convex hull of the object's footprint on the floor and that footprint shifted by
  the shadow vector of its top. On screen, the shadow vector from a point's foot is

  `s·z·(−0.714, −0.786·sin θ)`, which is `(−.714, −.393)·s·z` at 30° and `(−.714, −.786)·s·z` top-down.

  - Box: a hexagon (base rectangle plus the top rectangle shifted).
  - Cylinder: a capsule (base ellipse plus the shifted ellipse). By hand, draw ellipses every ≤ 20 px along the vector.
  - Floating parts: shift each part's own footprint by its bottom and its top. Gaps between floating parts make the
    stepped edge of the shadow still.
- **Fill:** the `shadow` colour, opaque, with every shadow shape of the tile in one group or mask, so overlaps never
  darken twice. Draw it under all objects. At 30°, most of the shadow hides behind the object and only the part to
  the left shows. That is correct.
- **Softness:** `feGaussianBlur stdDeviation = .021 × s × (height of that part's top)`, from 2 to 16 px. It is crisp
  at the contact and softer for tall parts (contact hardening). Examples: a .6 m box at s 512 gets 6.5 px, the echo
  stack ≈ 6.8 px, the shadow cube's top plate 11 px. Use
  `filterUnits="userSpaceOnUse" x="0" y="0" width="2560" height="1440"`, so the blur is never clipped.
- **Foot glow (optional, piecekit does it):** the stills' shadows are lighter close to the object. Inside the shadow
  mask, subtract the object's footprint, blurred by 12% of the object width, at 50%.
- **Shadows on the object** (a block on a tray, a coin on a coin, a lid over a box): use the same construction on the
  plane of the receiving top, clipped to that top, blurred 1.2 px, in `shade` (`sec_cast` on near-white). A flush
  contact or a thin lip gets `deep` instead (blur 0.5).
- The shadow must lie **fully inside the frame**, with at least 80 px to spare.

## 7. Bevels and corners

- The Blender bevel is 0.01–0.03 m: 5–15 px at s 512. Coins use .01, plates .02, the tray .03.
- **Vertical edges:** on the front face, round the corners with `rx = r·s`. On the top face, a corner is a quarter
  ellipse `(r·s, r·s·sin θ)`, about 10 × 5 px.
- **A top chamfer** b wide:
  - On the front and top it reads as `b·s·sin θ` off the top and `b·s·cos θ` down the front. Being `lit`, it merges
    with the front wall, so the top simply ends a few px higher.
  - On the back edge it shows as a `bev` line `b·s·(cos θ − sin θ)` tall (≈ 4 px).
  - On the left edge it shows as a `bev` strip `b·s` wide, and on the right edge as a `lit` strip.
- Top-down: every chamfer shows `b·s` wide, `lit` on the front and right edges and `bev` on the back and left.

## 8. Framing

- The objects (not their shadow) span **33–58% of the width**: 845–1485 px.
- They are centred horizontally on the object, ±3%. The shadow extends left.
- **Sitting low with air above:** the object's vertical middle is at 55–62% of the height (Y 790–890), its bottom at
  77–84% (Y 1110–1210), and at least 28% of the height is free above it.
- Measured in the stills:

  | still | width | middle | bottom |
  |---|---|---|---|
  | echo | 33% | 60% | 84% |
  | piece | 54% | 57% | 78% |
  | overflow | 52% | 55% | 83% |
  | shadow | 60% for the pair | | 82% |

- `piecekit`: `sc.frame(width=.45, cy=.58)` sets this, and `sc.report()` prints the numbers and whether the shadow is
  inside.

## 9. Sizes that match the stills (metres)

| part | size |
|---|---|
| coin | r .82, .078 thick, .012 gap, raised ring at .72r, .03 wide, .01 proud |
| shadow plates | .82 square, .13 thick, .028 gap |
| key piece | .5 × .5 × .26 |
| tray | 2.94 × 1.62 × .46, slots .52 square and .26 deep, pitch .66 |
| bowl | r .78, 1.25 tall, wall .05 |
| bead | r .12 |

Keep new objects in this range so their bevels and shadows read at the same scale.

## 10. piecekit

```python
import sys; sys.path.insert(0, 'docs/mockups/003-pieces/kit')
from piecekit import Scene, rrect, circle, convex
sc = Scene('sky', el=30)                         # hue: mint | apricot | lilac | sky
tray = sc.box(0, 0, 0, w=2.2, d=1.0, h=.32, mat='sec', bevel=.03,
              wells=[(-.75, 0, .5, .62, .26), (0, 0, .5, .62, .26)])   # (x, y, w, d, depth[, r]) in the box's top
sc.box(-.75, 0, .06, .44, .56, .5, inside=tray)  # drawn after the tray, hidden below the well's rim
sc.box(1.5, -.1, 0, .44, .56, .5, yaw=-12)       # degrees round z; tilt=(about x, about y) for lifted or leaning things
sc.frame(width=.5)                               # or Scene(..., dist=.., target=(x, y, z)) to place the camera yourself
print(sc.report())
sc.save('docs/mockups/003-pieces/pieces/<slug>.svg', title='…')
```

- **Units** are metres: x right, y away from the camera, z up. `z` is the bottom of a box, cylinder or cup, and the
  centre of a sphere.
- **Primitives:**
  - `box(x, y, z, w, d, h, bevel=.02, r=None, mat='hue'|'sec', yaw, tilt, wells, inside)`
  - `cylinder(x, y, z, r, h, bevel=.01)`
  - `cup(x, y, z, r, h, wall=.06, floor=.05)`: bowls, cups, dishes
  - `sphere(x, y, z, r)`
  - `prism(x, y, z, foot, h)` with `foot = rrect(w, d, r)`, `circle(r)` or `convex([(x, y), …])` (CCW): envelopes,
    wedges, flaps
- **What it does for you:**
  - culls hidden faces and paints back to front
  - picks each face's tone from its normal (§3)
  - draws floor shadows (hull, blur by height, glow)
  - throws shadows onto tops and hole floors
  - tones crevices `deep`
  - shades hole interiors
  - clips contents (`inside=`) to their opening's column
- **Limits:**
  - Solids are convex. Build anything else from convex parts.
  - Interpenetrating solids are painted by depth, not cut.
  - Only upright (untilted) tops receive shadows.
  - Leave `soft` and `glow` at their defaults.

## 11. Hand-drawn snippets (s = 512, θ = 30°; both are in `kit/snippets.svg`)

**Box** 1.0 × .8 × .6 m on sky:

- top: 512 × 205 px
- front: 512 × 266 px
- shadow vector: (−219, −121)
- blur: 6.5 px

```svg
<defs><filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="2560" height="1440"><feGaussianBlur stdDeviation="6.5"/></filter></defs>
<rect width="2560" height="1440" fill="#c2dff2"/>
<path filter="url(#soft)" fill="#8ea3b0" d="M624 1110 H1136 V905 L917 784 H405 V989 Z"/>          <!-- shadow: base rect + top rect shifted, hull -->
<path fill="#53cbf9" d="M624 839 H1136 V1100 Q1136 1110 1126 1110 H634 Q624 1110 624 1100 Z"/>   <!-- front: lit, rounded foot -->
<path fill="#2bc8f3" d="M634 639 H1126 Q1136 639 1136 644 V844 H624 V644 Q624 639 634 639 Z"/>   <!-- top: mid -->
<path fill="#2aa4c6" d="M634 639 H1126 L1120 643 H640 Z M624 644 L634 646 V838 L624 840 Z"/>      <!-- back + left chamfer: bev -->
<path fill="#53cbf9" d="M1136 644 L1126 646 V838 L1136 840 Z"/>                                  <!-- right chamfer: lit -->
```

**Coin stack**: coins r .82, .078 thick, .012 gap (ellipse 420 × 210, wall 35 px, pitch 40 px). Draw from the bottom
up. Before each upper coin, draw its wall moved 3 px down in `deep`: that is the gap line.

```svg
<g filter="url(#soft)" fill="#8ea3b0">                                                          <!-- shadow: ellipses along (−.714, −.393)·s·z -->
  <ellipse cx="1880" cy="1115" rx="420" ry="210"/><ellipse cx="1862" cy="1105" rx="420" ry="210"/> … <ellipse cx="1772" cy="1055" rx="420" ry="210"/>
</g>
<path fill="#53cbf9" d="M1460 1080 V1115 A420 210 0 0 0 2300 1115 V1080 A420 210 0 0 1 1460 1080 Z"/>  <!-- wall: lit -->
<ellipse cx="1880" cy="1080" rx="420" ry="210" fill="#2bc8f3"/>                                       <!-- top: mid -->
<path fill="#00557f" d="M1460 1043 V1078 A420 210 0 0 0 2300 1078 V1043 A420 210 0 0 1 1460 1043 Z"/>  <!-- gap: deep -->
<path fill="#53cbf9" d="M1460 1040 V1075 A420 210 0 0 0 2300 1075 V1040 A420 210 0 0 1 1460 1040 Z"/>
<ellipse cx="1880" cy="1040" rx="420" ry="210" fill="#2bc8f3"/>
```

A near-white tray or dish follows the same pattern in `sec_*`. A hole is the opening (top ellipse or rectangle)
filled `lit`, its floor (the same shape moved down by depth·s·cos θ, clipped to the opening) in `mid`, and the
shadow band on the front and right in `shade`.

## 12. The sheet: tile and caption

Lay the tiles out like the landing's exhibit tiles. At 1440 px wide, 1rem = 10 px.

```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
<figure class="pc">
  <div class="pc-tile" style="--floor:#c2dff2"><img src="pieces/connect.svg" alt="Blue blocks filing into a white tray"></div>
  <figcaption class="pc-cap">
    <span class="pc-title">Blocks filing into a white tray</span>
    <span class="pc-meta">How it works · 01 Connect · sky</span>
  </figcaption>
</figure>
```

```css
.pc { margin: 0; }
.pc-tile { border-radius: 2.4rem; overflow: hidden; background: var(--floor); }            /* the landing's .fd-tile radius */
.pc-tile img { display: block; width: 100%; aspect-ratio: 16 / 9; }
.pc-cap { display: flex; flex-direction: column; gap: .6rem; padding: 1.2rem .4rem 0; }
.pc-title { font: 500 1.8rem/1.2 'Geist', sans-serif; letter-spacing: -.015em; color: #08100c; }      /* .fd-title */
.pc-meta { font: 400 1.2rem/1.3 'Geist Mono', monospace; letter-spacing: .08em; text-transform: uppercase; color: #08100c; opacity: .6; }  /* .fd-meta */
@media (max-width: 1023px) { .pc-tile { border-radius: 1.6rem; } .pc-title { font-size: 1.6rem; } }
```

- **Meta line:** `PAGE · SLOT · HUE`, separated by ` · `, for example "Research · Occupational fraud · apricot".
- **Title:** the object in plain words, sentence case, no full stop.
- **Captions inside a tile** (in-place mockups): use the landing's own `.fd-cap` / `.fd-title` / `.fd-meta` in the
  hue's `ink`.

## 13. Checklist before you hand a piece in

1. Is it one object or group, one hue, and at most one near-white material?
2. Are tops `mid`, front and right walls `lit`, left and back walls `shade`, and gaps `deep`?
3. Does the shadow fall back and left, 1.06 × the height, soft but crisp at contact, opaque `shadow` colour, inside
   the frame?
4. Is the object 33–58% of the width, centred, with its middle at 55–62% of the height?
5. Are there no outlines, gradients, texture or text?
6. Did you render it (Playwright, 2560 × 1440), downscale it, look at it, and fix what is off?
