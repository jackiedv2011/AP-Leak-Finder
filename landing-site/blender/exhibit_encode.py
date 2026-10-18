"""Encodes the exhibit renders (exhibit_*.py, still=1) and the hero (hero_stack.py) for the page.

  "$B" -b --factory-startup --python exhibit_encode.py -- src=out/ex dst=../media/exhibits

For each <src>/<name>/ (echo, overflow, piece, shadow; hero) writes <dst>/<name>/d.mp4 (1280 wide) and m.mp4 (960):
the frames as a film the page plays through on its own (H.264, at the fps in meta.json); first.webp (1280, its
opening frame, shown until the film is in); still.webp (2560, the resting pose) and still-m.webp (1600).
The renders are transparent (a shadow catcher keeps only the floor shadow): each frame is laid over the
exhibit's colour from meta.json, in display space as the page would, into <src>/<name>/flat/ first. The catcher
leaves a faint veil over the far floor (a few levels); coverage under `veil` (.02) is taken off, eased in to
2.5x that, so it cannot show as smudges on a flat page. Films keep the frames' own aspect (16:9, square).
Knobs: crf (HIGH, MEDIUM..: Blender's quality presets), q, veil, only=echo,piece (just those), stills=0.
"""
import bpy, os, sys, glob, json
import numpy as np

A = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
SRC = os.path.abspath(A.get('src', 'out/ex'))
DST = os.path.abspath(A.get('dst', '../media/exhibits'))
Q = int(A.get('q', 80))
CRF = A.get('crf', 'HIGH')
VEIL = float(A.get('veil', .02))


def pixels(path, bg):
    """The render laid over bg (straight alpha), as an (h, w, 3) array, top row last as Blender keeps it."""
    src = bpy.data.images.load(path); src.colorspace_settings.name = 'Non-Color'
    w, h = src.size
    px = np.empty(w * h * 4, np.float32); src.pixels.foreach_get(px)
    bpy.data.images.remove(src)
    px = px.reshape(h, w, 4)
    a = px[..., 3:4]
    if VEIL:
        k = np.clip((a - VEIL) / (VEIL * 1.5), 0, 1)
        a = a * k * k * (3 - 2 * k)
    return px[..., :3] * a + bg * (1 - a)


def save(rgb, path, width, quality, fmt='WEBP'):
    """A new image of the pixels, scaled and saved directly (a copy() of a generated image comes out black)."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new('out', w, h, alpha=False); img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.dstack([rgb, np.ones((h, w, 1), np.float32)]).ravel())
    if w != width:
        img.scale(width, round(width * h / w))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = fmt
    img.save(quality=quality)
    bpy.data.images.remove(img)
    if fmt == 'WEBP':
        print('WROTE', path, os.path.getsize(path))


def film(d, files, path, width, fps, aspect):
    """The frames through the sequencer into an MP4, passed through untouched (Standard view, no look)."""
    sc = bpy.data.scenes.new('film')
    r = sc.render
    r.fps = fps
    r.resolution_x, r.resolution_y, r.resolution_percentage = width, round(width * aspect), 100   # before the strip: it fits to this
    se = sc.sequence_editor_create()
    st = se.strips.new_image('frames', os.path.join(d, files[0]), 1, 1, fit_method='FIT')
    for f in files[1:]:
        st.elements.append(f)
    sc.frame_start, sc.frame_end = 1, len(files)
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    r.image_settings.media_type = 'VIDEO'; r.image_settings.file_format = 'FFMPEG'
    ff = r.ffmpeg
    ff.format = 'MPEG4'; ff.codec = 'H264'; ff.constant_rate_factor = CRF; ff.ffmpeg_preset = 'BEST'
    ff.gopsize = fps; ff.audio_codec = 'NONE'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r.filepath = path; r.use_file_extension = False
    bpy.ops.render.render(animation=True, scene=sc.name)
    bpy.data.scenes.remove(sc)
    print('WROTE', path, os.path.getsize(path))


ONLY = A['only'].split(',') if 'only' in A else None
for name in sorted(os.listdir(SRC)):
    if ONLY and name not in ONLY:
        continue
    d = os.path.join(SRC, name)
    files = sorted(os.path.basename(f) for f in glob.glob(os.path.join(d, 'f_*.png')))
    if not os.path.isdir(d) or not files:
        continue
    meta = json.load(open(os.path.join(d, 'meta.json')))
    bg = np.array([int(meta['bg'][i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    flat = os.path.join(d, 'flat')
    for f in files:
        rgb = pixels(os.path.join(d, f), bg)
        save(rgb, os.path.join(flat, f), rgb.shape[1], 100, 'PNG')
    print('FLAT', name, len(files))
    aspect = rgb.shape[0] / rgb.shape[1]
    film(flat, files, os.path.join(DST, name, 'd.mp4'), 1280, meta['fps'], aspect)
    film(flat, files, os.path.join(DST, name, 'm.mp4'), 960, meta['fps'], aspect)
    save(pixels(os.path.join(d, files[0]), bg), os.path.join(DST, name, 'first.webp'), 1280, Q)
    s = os.path.join(d, 'still.png')
    if os.path.exists(s) and A.get('stills') != '0':
        rgb = pixels(s, bg)
        save(rgb, os.path.join(DST, name, 'still.webp'), 2560, Q + 4)
        save(rgb, os.path.join(DST, name, 'still-m.webp'), 1600, Q + 4)
