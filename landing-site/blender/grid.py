"""Contact sheet: frames in a grid, each scaled to `cell` px wide keeping its aspect,
over a flat colour. Run: blender -b --factory-startup --python grid.py -- srcs=A.png,B.png out=F.png [cols=4 cell=300 bg=000000]"""
import bpy, os, sys
import numpy as np
A = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
CELL, COLS = int(A.get('cell', 300)), int(A.get('cols', 4))
BG = np.array([int(A.get('bg', '000000')[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
tiles = []
for p in A['srcs'].split(','):
    img = bpy.data.images.load(os.path.abspath(p))
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    nh = max(1, round(CELL * h / w))
    img.scale(CELL, nh)
    px = np.array(img.pixels[:], np.float32).reshape(nh, CELL, 4)
    tiles.append((px[..., :3] * px[..., 3:4] + BG * (1 - px[..., 3:4]))[::-1])
    bpy.data.images.remove(img)
rows = [tiles[i:i + COLS] for i in range(0, len(tiles), COLS)]
rh = [max(t.shape[0] for t in r) for r in rows]
sheet = np.ones((sum(rh) + 4 * len(rows), CELL * COLS + 4 * COLS, 3), np.float32) * .25
y = 0
for r, hh in zip(rows, rh):
    for i, t in enumerate(r):
        x = i * (CELL + 4)
        sheet[y:y + t.shape[0], x:x + CELL] = t
    y += hh + 4
sheet = sheet[::-1]
h, w = sheet.shape[:2]
res = bpy.data.images.new('sheet', w, h, alpha=False)
res.colorspace_settings.name = 'Non-Color'
res.pixels[:] = np.dstack([sheet, np.ones((h, w, 1), np.float32)]).ravel()
res.filepath_raw = os.path.abspath(A['out'])
res.file_format = 'PNG'
res.save()
print('WROTE', A['out'], w, h)
