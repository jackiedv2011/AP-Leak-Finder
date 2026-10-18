"""The home page walkthrough: a laptop opens on scroll, then the live dashboard is mapped onto its screen.

Renders the lid opening as a transparent frame sequence (with a contact shadow) and writes, for every
frame, where the four screen corners land in the image. The page draws the frames on a canvas and
warps the real HTML dashboard onto those corners, so the screen stays live and sharp at any zoom.

The model is not in the repo (licence unconfirmed); it lives at out/models/macbook/macbookpro.blend.
Open it without running its scripts (-Y):

  B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b -Y out/models/macbook/macbookpro.blend --python macbook.py -- out=out/macbook spp=48 frames=all
  "$B" -b -Y out/models/macbook/macbookpro.blend --python macbook.py -- out=out/macbook still=1 stillres=3840 stillh=0.88 spp=64
  "$B" -b -Y out/models/macbook/macbookpro.blend --python macbook.py -- out=out/macbook_t spp=32 frames=0,60,90,119 overwrite=1

Knobs (key=value after --): n (frame count), angle (open angle, degrees), el0 (camera elevation closed;
open is square to the screen, elx tilts it), d0/d1 (camera distance), shift0 (how low the closed laptop
sits), lens, alu/rough (aluminium), top/topy (overhead softbox), light, world, srough/sspec (the screen),
gspec/grough (its cover glass), bspec/brough (the bezel),
still=1 (one large frame of the open pose, stillres wide, stillh tall as a fraction of the width: the
frame's view with more room added below, for the deck).
The corners file is <out>/corners.json: {"w","h","frames":[[[x,y]*4 TL,TR,BR,BL] normalised 0-1]}; the still
writes its own to <out>/still.json ({"w","h","corners"}), which the encoder folds into corners.json.
"""
import bpy, math, json, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

A = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
OUT = os.path.abspath(A.get('out', 'out/macbook'))   # absolute: see README (Windows drive-root quirk)
RES = int(A.get('res', 1280))   # the motion frames; the open pose gets a large still
N = int(A.get('n', 120))         # the page blends neighbours, but the lid swings fast mid-open: keep the steps small
ANGLE = float(A.get('angle', 106))
STILL = A.get('still') == '1'
os.makedirs(OUT, exist_ok=True)

sc = bpy.context.scene
lid = bpy.data.objects['Cube.016']
base = bpy.data.objects['Cube']

# ---------- model clean-up ----------
logo = bpy.data.objects.get('Curve')          # the logo on the lid: a plain lid, no brand on it
if logo:
    logo.hide_render = True

def bsdf(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

# aluminium: lighter and smoother than the source, so edges catch the light on a dark page
alu = bpy.data.materials['Material.003']
p = bsdf(alu)
g = float(A.get('alu', .62))
for l in list(p.inputs['Base Color'].links):
    alu.node_tree.links.remove(l)
p.inputs['Base Color'].default_value = (g, g, g * 1.01, 1)
for l in list(p.inputs['Roughness'].links):
    alu.node_tree.links.remove(l)
p.inputs['Roughness'].default_value = float(A.get('rough', .34))
p.inputs['Metallic'].default_value = 1.0

# the screen: off (black glass); the page lays the live dashboard over it
scr = bpy.data.materials['Material.008']
nt = scr.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL':
        nt.nodes.remove(n)
b = nt.nodes.new('ShaderNodeBsdfPrincipled')
b.inputs['Base Color'].default_value = (0.004, 0.004, 0.005, 1)
b.inputs['Roughness'].default_value = float(A.get('srough', .3))
b.inputs['Specular IOR Level'].default_value = float(A.get('sspec', .015))   # barely there: the dashboard goes on top, and a glare under it reads as a fault
nt.links.new(b.outputs[0], next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL').inputs[0])

# the cover glass in front of the screen (Material.005, clear glass in the source) mirrors the lights at
# the grazing angles of the opening. A faint, soft reflection at a fixed strength instead: mostly see-through.
# It goes to nothing as the screen wakes (pose): no glint on the glass once the dashboard is on it.
gl = bpy.data.materials['Material.005']
nt = gl.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL':
        nt.nodes.remove(n)
mix = nt.nodes.new('ShaderNodeMixShader')
GSPEC = float(A.get('gspec', .012))
mix.inputs['Fac'].default_value = GSPEC
gloss = nt.nodes.new('ShaderNodeBsdfGlossy')
gloss.inputs['Roughness'].default_value = float(A.get('grough', .35))
nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0], mix.inputs[1])
nt.links.new(gloss.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL').inputs[0])

# the black bezel around it: satin, not gloss
bz = bsdf(bpy.data.materials['Material.007'])
bz.inputs['Specular IOR Level'].default_value = float(A.get('bspec', .08))
bz.inputs['Roughness'].default_value = float(A.get('brough', .4))

# key legends glow faintly, like a backlight at its lowest step
for n in bpy.data.materials['Material.002'].node_tree.nodes:
    if n.type == 'EMISSION':
        n.inputs['Strength'].default_value = float(A.get('keys', .35))

# ---------- stage ----------
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0.002))
floor = bpy.context.object
floor.is_shadow_catcher = True
ink = bpy.data.materials.new('ink'); ink.use_nodes = True     # what the glass and aluminium reflect is the page itself, not a grey floor
bsdf(ink).inputs['Base Color'].default_value = (0.0024, 0.005, 0.0037, 1); bsdf(ink).inputs['Roughness'].default_value = .5
floor.data.materials.append(ink)

w = bpy.data.worlds.new('studio'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.05, 0.055, 0.052, 1)
bg.inputs[1].default_value = float(A.get('world', .6))

def area(name, loc, target, size, energy, shape='RECTANGLE', sy=None):
    L = bpy.data.lights.new(name, 'AREA')
    L.shape = shape; L.size = size; L.size_y = sy or size; L.energy = energy
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

E = float(A.get('light', 1.0))
area('key', (-4.5, -5.5, 7.5), (0, 0.2, 0.6), 6, 1400 * E)              # big soft key, above front-left
area('rimL', (-6.5, 4.5, 3.0), (0, 0.8, 0.8), 1.2, 900 * E, sy=6)     # strip lights behind: edge the lid and base
area('rimR', (6.5, 4.5, 3.0), (0, 0.8, 0.8), 1.2, 900 * E, sy=6)
area('front', (0, -9, 0.55), (0, 0, 0.3), 8, 260 * E, sy=.8)           # low front fill for the deck; kept under the screen's mirror angle so the glass shows no strip
area('top', (0, float(A.get('topy', 8.0)), 8.0), (0, 0, 0), 11, float(A.get('top', 300)) * E, sy=4)   # overhead softbox: the sheen across the closed lid

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = float(A.get('lens', 58))
cam.data.sensor_width = 36

# ---------- render ----------
cp = bpy.context.preferences.addons['cycles'].preferences
cp.compute_device_type = 'OPTIX'; cp.get_devices()
for d in cp.devices:
    d.use = d.type == 'OPTIX'
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'
sc.cycles.samples = int(A.get('spp', 96))
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = .01
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.filter_width = 1.0
sc.cycles.max_bounces = 8; sc.cycles.glossy_bounces = 4; sc.cycles.transmission_bounces = 4
sc.render.film_transparent = True
sc.render.use_persistent_data = True
sc.render.resolution_x = RES
sc.render.resolution_y = round(RES * 9 / 16)
sc.render.resolution_percentage = 100
try:
    sc.view_settings.view_transform = A.get('view', 'Khronos PBR Neutral')
except TypeError:
    sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'None'
sc.view_settings.exposure = float(A.get('exp', 0))
ims = sc.render.image_settings
ims.file_format = 'PNG'; ims.color_mode = 'RGBA'; ims.color_depth = '8'; ims.compression = 30

# ---------- motion ----------
# Screen corners in the lid's local space: TL, TR, BR, BL as seen from the front. The panel (the screen material)
# ends at y -0.2276, well above the bottom of the black glass; the page's dashboard runs on to -0.1085, which
# leaves a bottom bezel as thin as the sides (measured on the open still: about 14 px in 3840).
SX, YT, YB, SZ = 1.4655, -2.0539, -0.1085, 0.035
CORNERS = [(-SX, YT, SZ), (SX, YT, SZ), (SX, YB, SZ), (-SX, YB, SZ)]
HINGE = Vector((0, 1.012, 0.1))

def ease(t):                          # smoothstep with a softer start, so the first scroll moves the lid gently
    t = max(0.0, min(1.0, t))
    return t * t * t * (t * (6 * t - 15) + 10)

def lerp(a, b, t):
    return a + (b - a) * t

def pose(t):
    """t: 0 closed .. 1 open. Lid first, camera settling a beat behind it."""
    a = ease(min(1.0, t / .92))
    th = -math.radians(ANGLE) * a
    lid.rotation_euler = (th, 0, 0)
    # where the open screen's centre will be, and the direction it faces
    sc_mid = HINGE + Vector((0, -math.cos(th) * 1.14, -math.sin(th) * 1.14))
    face = Vector((0, math.sin(th), -math.cos(th))) if a > 0 else Vector((0, 0, 1))
    c = ease(t)
    el = math.radians(lerp(float(A.get('el0', 52)), ANGLE - 90 + float(A.get('elx', 0)), c))   # open: square to the screen
    dist = lerp(float(A.get('d0', 11.0)), float(A.get('d1', 7.0)), c)
    target = Vector((0, lerp(0.15, sc_mid.y, c), lerp(0.55, sc_mid.z, c)))
    cam.location = target + Vector((0, -math.cos(el) * dist, math.sin(el) * dist))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # shift the closed laptop low in the frame (the heading sits above it); centred when open
    cam.data.shift_y = lerp(float(A.get('shift0', .04)), 0.0, c)
    # the page wakes the screen over t .72-.97: the glass reflection is gone before the dashboard shows
    mix.inputs['Fac'].default_value = GSPEC * (1 - ease((t - .62) / .18))

def corners():
    bpy.context.view_layer.update()
    out = []
    for co in CORNERS:
        v = world_to_camera_view(sc, cam, lid.matrix_world @ Vector(co))
        out.append([round(v.x, 5), round(1 - v.y, 5)])
    return out

frames = list(range(N)) if A.get('frames', 'all') == 'all' else [int(x) for x in A['frames'].split(',')]
if STILL:
    W = int(A.get('stillres', 3840))
    pose(1.0)
    cam.data.sensor_fit = 'HORIZONTAL'   # the same width of view as the frames, whatever the height
    sc.render.resolution_x = W; sc.render.resolution_y = round(W * 9 / 16)
    top = corners()[0][1] * sc.render.resolution_y          # the screen's top, px from the top of the frame
    sc.render.resolution_y = round(W * float(A.get('stillh', 9 / 16)))
    # the extra height goes below: shift the view down until the screen's top sits where it did (shift is linear)
    def at(s):
        cam.data.shift_y = s
        return corners()[0][1] * sc.render.resolution_y
    a0, a1 = at(0.0), at(-0.1)
    cam.data.shift_y = -0.1 * (top - a0) / (a1 - a0)
    sc.render.filepath = os.path.join(OUT, 'open_still.png')
    bpy.ops.render.render(write_still=True)
    data = {'w': sc.render.resolution_x, 'h': sc.render.resolution_y, 'corners': corners()}
    with open(os.path.join(OUT, 'still.json'), 'w') as fh:
        json.dump(data, fh, separators=(',', ':'))
    print('STILL', sc.render.filepath, data)
    raise SystemExit

data = {'w': sc.render.resolution_x, 'h': sc.render.resolution_y, 'n': N, 'angle': ANGLE, 'frames': []}
for f in range(N):
    pose(f / (N - 1))
    data['frames'].append(corners())
with open(os.path.join(OUT, 'corners.json'), 'w') as fh:
    json.dump(data, fh, separators=(',', ':'))
print('CORNERS', os.path.join(OUT, 'corners.json'))

over = A.get('overwrite') == '1'
for f in frames:
    path = os.path.join(OUT, f'mac_{f:03d}.png')
    if os.path.exists(path) and os.path.getsize(path) > 0 and not over:
        continue
    pose(f / (N - 1))
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('FRAME', f, path)
