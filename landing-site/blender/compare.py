"""Side-by-side sheet: DayOS reference frame (left) vs our render (right), one pair per row.
Transparent frames are laid over black so both sides sit on the same ground as DayOS's MP4s.
Run: blender -b --factory-startup --python compare.py -- out=FILE.png tile=720 LEFT|RIGHT LEFT|RIGHT ..."""
import bpy, sys
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
opts = dict(a.split('=', 1) for a in args if '=' in a and '|' not in a)
pairs = [a.split('|') for a in args if '|' in a]
T, GAP = int(opts.get('tile', 720)), 16


def tile(spec):
    """spec = path or path@x0,y0,x1,y1 (square crop, pixels, top-left origin)."""
    path, _, box = spec.partition('@')
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    if box:
        w, h = img.size
        x0, y0, x1, y1 = (int(v) for v in box.split(','))
        full = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[::-1]   # row 0 = top
        crop = np.ascontiguousarray(full[y0:y1, x0:x1][::-1])
        bpy.data.images.remove(img)
        img = bpy.data.images.new('crop', x1 - x0, y1 - y0, alpha=True)
        img.colorspace_settings.name = 'Non-Color'
        img.pixels[:] = crop.ravel()
    img.scale(T, T)
    px = np.array(img.pixels[:], np.float32).reshape(T, T, 4)
    bpy.data.images.remove(img)
    return px[..., :3] * px[..., 3:4]          # over black


W = 2 * T + 3 * GAP
H = len(pairs) * T + (len(pairs) + 1) * GAP
sheet = np.full((H, W, 3), .12, np.float32)
for r, (left, right) in enumerate(pairs):
    y = H - (r + 1) * (T + GAP)                # Blender rows run bottom-up
    sheet[y:y + T, GAP:GAP + T] = tile(left)
    sheet[y:y + T, 2 * GAP + T:2 * GAP + 2 * T] = tile(right)

out = bpy.data.images.new('sheet', W, H, alpha=False)
out.colorspace_settings.name = 'Non-Color'
out.pixels[:] = np.dstack([sheet, np.ones((H, W, 1), np.float32)]).ravel()
out.filepath_raw = opts['out']
out.file_format = 'PNG'
out.save()
print('SHEET', opts['out'], W, H)
