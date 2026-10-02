"""Lay frames side by side at the size the page actually shows them, over the
section colour they actually sit on.

These loops are judged at ~317px in the homepage's three-up row, not at 1080,
and a composition that reads at full size can come apart at card size — too many
objects, too much air, an accent too small to survive. Check that here before
spending a full render.
Run: blender -b --factory-startup --python montage.py -- srcs=A.png,B.png out=FILE.png [size=317 bg=000000]"""
import bpy, os, sys
import numpy as np

A = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
SIZE = int(A.get('size', 317))
BG = [int(A.get('bg', '000000')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
out = os.path.abspath(A['out'])

tiles = []
for p in A['srcs'].split(','):
    img = bpy.data.images.load(os.path.abspath(p))
    img.colorspace_settings.name = 'Non-Color'
    img.scale(SIZE, SIZE)
    px = np.array(img.pixels[:], np.float32).reshape(SIZE, SIZE, 4)
    tiles.append(px[..., :3] * px[..., 3:4] + np.array(BG, np.float32) * (1 - px[..., 3:4]))
    bpy.data.images.remove(img)

sheet = np.concatenate(tiles, axis=1)
h, w = sheet.shape[:2]
res = bpy.data.images.new('sheet', w, h, alpha=False)
res.colorspace_settings.name = 'Non-Color'
res.pixels[:] = np.dstack([sheet, np.ones((h, w, 1), np.float32)]).ravel()
res.filepath_raw = out
res.file_format = 'PNG'
res.save()
print(f'WROTE {out} {w}x{h}')
