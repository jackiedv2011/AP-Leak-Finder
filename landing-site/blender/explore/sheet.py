"""Contact sheets for the exploration pass.

mode=sizes : one alpha frame at the page's real sizes (317, 500, 900) over the three grounds
             the site uses (#e5e5e5, #ffffff, #000000). Rows = grounds, columns = sizes.
mode=strip : several frames in a grid at one size over one ground (motion filmstrips, seam checks).
             srcs may be a glob-ish DIR/prefix@a:b:step to pick frames from a sequence.
mode=diff  : prints the mean/max abs difference between two frames (loop seam check).

Run: blender -b --factory-startup --python explore/sheet.py -- mode=sizes src=F.png out=S.png
     blender -b --factory-startup --python explore/sheet.py -- mode=strip srcs=a.png,b.png size=240 cols=6 bg=e5e5e5 out=S.png
"""
import bpy, os, sys
import numpy as np

A = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
GAP = int(A.get('gap', 12))
SHEET_BG = np.array([int(A.get('sheetbg', '5a5a5a')[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def load(p, size):
    img = bpy.data.images.load(os.path.abspath(p))
    img.colorspace_settings.name = 'Non-Color'
    if img.size[0] != size:
        img.scale(size, size)
    px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
    bpy.data.images.remove(img)
    return px


def over(px, bg_hex):
    bg = np.array([int(bg_hex[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    return px[..., :3] * px[..., 3:4] + bg * (1 - px[..., 3:4])


def save(arr, out):
    h, w = arr.shape[:2]
    res = bpy.data.images.new('sheet', w, h, alpha=False)
    res.colorspace_settings.name = 'Non-Color'
    res.pixels[:] = np.dstack([arr, np.ones((h, w, 1), np.float32)]).ravel()
    res.filepath_raw = os.path.abspath(out)
    res.file_format = 'PNG'
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    res.save()
    print(f'WROTE {out} {w}x{h}')


def expand(srcs):
    out = []
    for s in srcs.split(','):
        if '@' in s:
            base, rng = s.split('@')
            a, b, st = (int(x) for x in rng.split(':'))
            out += [f'{base}_{i:04d}.png' for i in range(a, b, st)]
        else:
            out.append(s)
    return out


mode = A.get('mode', 'sizes')
if mode == 'sizes':
    sizes = [int(x) for x in A.get('sizes', '317,500,900').split(',')]
    bgs = A.get('bgs', 'e5e5e5,ffffff,000000').split(',')
    W = sum(sizes) + GAP * (len(sizes) + 1)
    H = max(sizes) * len(bgs) + GAP * (len(bgs) + 1)
    sheet = np.ones((H, W, 3), np.float32) * SHEET_BG
    tiles = {s: load(A['src'], s) for s in sizes}
    for r, bg in enumerate(bgs):
        # rows run bottom-up in Blender images: first ground on top
        y0 = H - (r + 1) * (max(sizes) + GAP)
        x = GAP
        for s in sizes:
            yy = y0 + (max(sizes) - s)          # top-align each tile in its row
            sheet[yy:yy + s, x:x + s] = over(tiles[s], bg)
            x += s + GAP
    save(sheet, A['out'])
elif mode == 'strip':
    srcs = expand(A['srcs'])
    size = int(A.get('size', 240))
    cols = int(A.get('cols', len(srcs)))
    rows = (len(srcs) + cols - 1) // cols
    bg = A.get('bg', 'e5e5e5')
    W = cols * size + (cols + 1) * GAP
    H = rows * size + (rows + 1) * GAP
    sheet = np.ones((H, W, 3), np.float32) * SHEET_BG
    for i, p in enumerate(srcs):
        r, c = divmod(i, cols)
        y = H - (r + 1) * (size + GAP)
        x = GAP + c * (size + GAP)
        sheet[y:y + size, x:x + size] = over(load(p, size), bg)
    save(sheet, A['out'])
elif mode == 'diff':
    a, b = A['a'], A['b']
    ia = bpy.data.images.load(os.path.abspath(a)); ib = bpy.data.images.load(os.path.abspath(b))
    pa = np.array(ia.pixels[:], np.float32); pb = np.array(ib.pixels[:], np.float32)
    d = np.abs(pa - pb)
    print(f'DIFF mean={d.mean():.5f} max={d.max():.4f} p99={np.percentile(d, 99):.4f}')
