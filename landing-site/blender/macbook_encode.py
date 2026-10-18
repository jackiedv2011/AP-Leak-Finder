"""Encodes the walkthrough render (macbook.py) for the page: WebP, flattened onto the section's ink.

  "$B" -b --factory-startup --python macbook_encode.py -- src=out/macbook dst=../media/macbook

Writes <dst>/d/000.webp.. (1280 wide), <dst>/m/000.webp.. (960 wide), <dst>/still.webp (3840, the open pose
for the zoomed steps, taller than a frame: it takes in the deck), <dst>/still-m.webp (2560) and corners.json
(the frames' corners, with the still's from still.json under "still").
The renders keep their alpha; the web copies do not. Baked onto the ink they are about half the size and
cheaper to decode and draw, which is what keeps the scrub smooth. If the section's colour changes
(--cl-black in styles.css), re-encode with bg=RRGGBB. Pixel values pass through untouched (Non-Color),
and the blend is done on the sRGB values, as the browser did when it laid the transparent frames on the page.
"""
import bpy, os, sys, glob, json
import numpy as np

A = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
SRC = os.path.abspath(A.get('src', 'out/macbook'))
DST = os.path.abspath(A.get('dst', '../media/macbook'))
Q = int(A.get('q', 78))
DW, MW = int(A.get('dw', 1280)), int(A.get('mw', 960))   # frame widths: desktop, phone (the stills carry the detail)
BG = np.array([int(A.get('bg', '08100c')[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def flat(path):
    src = bpy.data.images.load(path)
    src.colorspace_settings.name = 'Non-Color'
    w, h = src.size
    px = np.empty(w * h * 4, np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[..., :3] * px[..., 3:4] + BG * (1 - px[..., 3:4])
    bpy.data.images.remove(src)
    img = bpy.data.images.new('flat', w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.dstack([rgb, np.ones((h, w, 1), np.float32)]).ravel())
    return img


def save(img, path, width, quality):
    out = img
    if img.size[0] != width:
        out = img.copy()
        out.scale(width, round(width * img.size[1] / img.size[0]))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.filepath_raw = path
    out.file_format = 'WEBP'
    out.save(quality=quality)
    if out is not img:
        bpy.data.images.remove(out)
    print('WROTE', path, os.path.getsize(path))


for i, f in enumerate(sorted(glob.glob(os.path.join(SRC, 'mac_*.png')))):
    img = flat(f)
    save(img, os.path.join(DST, 'd', f'{i:03d}.webp'), DW, Q)
    save(img, os.path.join(DST, 'm', f'{i:03d}.webp'), MW, Q)
    bpy.data.images.remove(img)

still = os.path.join(SRC, 'open_still.png')
if os.path.exists(still):
    img = flat(still)
    save(img, os.path.join(DST, 'still.webp'), 3840, Q + 4)
    save(img, os.path.join(DST, 'still-m.webp'), 2560, Q + 4)

# the page reads one file: the frames' corners, plus the still's own (it is taller than a frame, with the deck)
with open(os.path.join(SRC, 'corners.json')) as fh:
    data = json.load(fh)
sj = os.path.join(SRC, 'still.json')
if os.path.exists(sj):
    with open(sj) as fh:
        data['still'] = json.load(fh)
with open(os.path.join(DST, 'corners.json'), 'w') as fh:
    json.dump(data, fh, separators=(',', ':'))
