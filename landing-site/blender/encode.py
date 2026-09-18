"""Pack a PNG RGBA frame sequence into a VP9 WebM with alpha (the format DayOS ships).
With bg=RRGGBB it instead bakes the frames over that flat page colour into an H.264 MP4
(the Safari fallback: Safari plays WebM but drops its alpha).
Run: blender -b --factory-startup --python encode.py -- src=DIR prefix=hero out=FILE.webm|.mp4 [crf=30 size=1920 fps=30 bg=e5e5e5]"""
import bpy, os, sys, glob

A = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
# absolute: Blender resolves bare relative output paths against the drive root on Windows
src, prefix, out = os.path.abspath(A['src']), A['prefix'], os.path.abspath(A['out'])
files = sorted(f for f in os.listdir(src)
               if f.startswith(prefix + '_') and f.endswith('.png') and '_test_' not in f and not f.endswith('_bg.png')
               and os.path.getsize(os.path.join(src, f)) > 0)
assert files, 'no frames'

sc = bpy.context.scene
sc.view_settings.view_transform = 'Standard'   # frames are already display-referred sRGB
sc.view_settings.look = 'None'
probe = bpy.data.images.load(os.path.join(src, files[0]))
w, h = probe.size
size = int(A.get('size', w))
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.resolution_percentage = 100
sc.render.fps = int(A.get('fps', 30))
sc.frame_start, sc.frame_end = 1, len(files)

se = sc.sequence_editor_create()
bg = A.get('bg')
chan = 1
if bg:
    col = se.strips.new_effect('bg', 'COLOR', 1, 1, length=len(files))
    col.color = tuple(int(bg[i:i + 2], 16) / 255 for i in (0, 2, 4))
    chan = 2
st = se.strips.new_image('seq', os.path.join(src, files[0]), chan, 1, fit_method='FIT')
for f in files[1:]:
    st.elements.append(f)
if bg:
    st.blend_type = 'ALPHA_OVER'

ims = sc.render.image_settings
ims.media_type = 'VIDEO'
ims.file_format = 'FFMPEG'
ff = sc.render.ffmpeg
if bg:
    ff.format = 'MPEG4'
    ff.codec = 'H264'
    ims.color_mode = 'RGB'
    ff.ffmpeg_preset = 'BEST'
else:
    ff.format = 'WEBM'
    ff.codec = 'WEBM'
    ims.color_mode = 'RGBA'
    ff.ffmpeg_preset = 'GOOD'
ff.constant_rate_factor = 'CUSTOM'
ff.custom_constant_rate_factor = int(A.get('crf', 30))
ff.gopsize = 30

ext = '.mp4' if bg else '.webm'
tmp = os.path.join(os.path.dirname(out), '_enc_' + prefix + '_')
for old in glob.glob(tmp + '*'):
    os.remove(old)
sc.render.filepath = tmp
bpy.ops.render.render(animation=True)
made = glob.glob(tmp + '*' + ext)
assert made, 'encoder produced nothing'
os.replace(made[0], out)
print(f'ENCODED {len(files)} frames {size}px -> {out} ({os.path.getsize(out) / 1e6:.2f} MB)')
