# 3D loops (Blender 5.2, Cycles/OptiX)

All site 3D is pre-rendered here and shipped as looping video, the same way DayOS does it:
transparent VP9 WebM for Chrome/Firefox/Edge, plus an H.264 MP4 with the section colour
baked in for Safari (`reels.js` swaps it in).

| file | what |
|---|---|
| `looklib.py` | shared look: materials (terrazzo, oak, plywood, dark wood, accents), sun + fill, render settings |
| `hero.py` | hero column, 240 frames (8 s) |
| `solutions.py` | `scene=find\|build\|recover`, 150 frames (5 s) each |
| `encode.py` | PNG frames -> `.webm` (alpha) or, with `bg=RRGGBB`, `.mp4` |
| `compare.py` | side-by-side sheet vs reference frames (`path@x0,y0,x1,y1` crops) |

Colour targets were sampled from dayos.com's own renders (lit faces): white terrazzo `#e9e1de`,
oak `#e2c09e`, yellow `#f5d836`, green `#0d6e2b`, dark wood `#3a302c`. View transform is
Khronos PBR Neutral so flat accent colours stay saturated.

## Render

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
# quick look (writes *_test_NNNN.png and *_bg.png composites)
"$B" -b --factory-startup --python hero.py -- out=out/t res=960 spp=64 frames=1,70,110 bg=e5e5e5 overwrite=1 topdrop=.58
# final
"$B" -b --factory-startup --python hero.py -- out=out/hero_final3 res=1920 spp=128 frames=all topdrop=.58
"$B" -b --factory-startup --python solutions.py -- scene=find out=out/find_final res=1080 spp=96 frames=all
```

Useful knobs (all `key=value` after `--`): `sunE` `fill` `sun=x,y,z` `exp` `view` `look`,
hero: `open` `spread` `tilt` `twist` `pivot` `topdrop` `dist` `el` `lens`; recover: `fan`.
Renders resume where they stopped (existing frames are skipped unless `overwrite=1`).

## Encode

```bash
"$B" -b --factory-startup --python encode.py -- src=out/hero_final3 prefix=hero out=../media/hero.webm crf=30
"$B" -b --factory-startup --python encode.py -- src=out/hero_final3 prefix=hero out=../media/hero.mp4 crf=20 bg=e5e5e5
# solutions: crf=31 for webm, bg=000000 for the mp4
```
