"""Cuts an object out of a transparent render (a shadow-catcher frame from exhibit_*.py) for a page: crops
to the object and its shadow, with a margin, and writes it as WebP with its alpha, at each width asked for,
so it sits straight on the page's own colour with its own soft shadow.

  "$B" -b --factory-startup --python cutout.py -- src=out/closing/echo_139.png dst=../media/closing/coins widths=1200,720

writes ../media/closing/coins-1200.webp and coins-720.webp. Knobs: q (WebP quality, 90), alpha (the
coverage that counts as part of the object, .1; the catcher leaves a faint veil over the whole floor),
pad (margin, a fraction of the crop's width, .06).
"""
import bpy, os, sys
import numpy as np

A = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
SRC, DST = os.path.abspath(A['src']), os.path.abspath(A['dst'])
WIDTHS = [int(w) for w in A.get('widths', '1200,720').split(',')]
Q, CUT, PAD = int(A.get('q', 90)), float(A.get('alpha', .1)), float(A.get('pad', .06))

im = bpy.data.images.load(SRC)
im.colorspace_settings.name = 'Non-Color'
w, h = im.size
px = np.empty(w * h * 4, np.float32)
im.pixels.foreach_get(px)
px = px.reshape(h, w, 4)
ys, xs = np.where(px[..., 3] > CUT)
m = round((xs.max() - xs.min()) * PAD)
x0, x1 = max(0, xs.min() - m), min(w, xs.max() + m)
y0, y1 = max(0, ys.min() - m), min(h, ys.max() + m)
crop = px[y0:y1, x0:x1].copy()
crop[..., 3] = np.where(crop[..., 3] < CUT * .25, 0, crop[..., 3])   # the faint veil off: clean edges, smaller file
ch, cw = crop.shape[:2]
print('CROP', (x0, y0, x1, y1), cw, ch)

# written through a scene's own output settings: that is the way to WebP with an alpha channel
sc = bpy.context.scene
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.quality = Q
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
os.makedirs(os.path.dirname(DST), exist_ok=True)
for W in WIDTHS:
    img = bpy.data.images.new('cut', cw, ch, alpha=True)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(crop.ravel())
    if W != cw:
        img.scale(W, round(W * ch / cw))
    path = f'{DST}-{W}.webp'
    img.save_render(path, scene=sc)
    bpy.data.images.remove(img)
    print('WROTE', path, os.path.getsize(path))
