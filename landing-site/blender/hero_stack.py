"""Hero loop: the discovery. A stack of record slabs on the table, built to the approved concept frames
(the lid a record with a title and ruled lines; a mint sheet hidden between the two slabs under it; peach,
lavender and blue filed tight below; two thick slabs at the base). The four sheets are the four things
Reclaim finds, in the colours and order of the home page's "What Reclaim finds" tiles: mint duplicate
payment, peach overpayment, lavender unused credit, blue duplicate bill. Four times over, Reclaim looks
through the stack and pulls one out:

  rest     the stack is still and square, its shadow soft on the table
  search   the lid lifts and a parting runs down the layers, stopping above the sheet it found
           (the deeper the sheet, the longer the search)
  find     that sheet slides out of the right-hand face, a third of its length, and stops under friction
  hold     the money frame: the layers above still parted, the sheet out
  return   it slides home flush, and the layers settle back down onto it, the lowest first, the lid last

No camera move and no turn. Nothing bounces (nothing here is thrown); every move starts and ends at rest, so
the loop seam, which falls in a rest, is invisible. Frame 1 is the whole stack at rest: the poster and the
reduced-motion still.

  B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b --factory-startup --python hero_stack.py -- review=1 out=out/hero_s     # the review frames
  "$B" -b --factory-startup --python hero_stack.py -- out=out/hero_s frames=1,200 res=1280 spp=64
  "$B" -b --factory-startup --python hero_stack.py -- out=out/hero_final/hero spp=64          # every frame
  "$B" -b --factory-startup --python exhibit_encode.py -- src=out/hero_final dst=../media only=hero stills=0

60 fps, square, on the hero's floor colour (#ebe7de; a shadow catcher keeps only the shadow). The camera is
fitted, not placed: it is solved so the resting stack covers the same part of the hero square as in the
concept frame (`box`, fractions of the square from its top left).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K
from exhibit_common import A, FPS, stage, camera, aim, bake, out_dir, render, tw, spring, bezier, frames_in, ftime

# a soft key high behind on the right (the shadow falls to the left and fades out well inside the frame,
# so the square never cuts it), a lot of fill: the faces stay
# nearly as light as the table, and the seams between the rounded slabs draw the stack
A.setdefault('sun', '.5,.6,.9')
A.setdefault('sunA', '20')
A.setdefault('sunE', '3.6')
A.setdefault('fill', '.45')
A.setdefault('shade', '.36')
A.setdefault('exp', '.2')
A.setdefault('res', '1280')

# ---------------------------------------------------------------- the stack
W, D, R = 2.3, 1.806, .2           # footprint: x along the left face (the long one), y into the picture
STONE = '#' + A.get('stone', 'd8d5ce')
COLOUR = {'mint': '#' + A.get('mint', 'c2f1d4'), 'peach': '#' + A.get('peach', 'f4b99e'),
          'lavender': '#' + A.get('lavender', 'c9aeeb'), 'blue': '#' + A.get('blue', 'a2c9ec')}
# bottom to top: (name, stock, thickness, edge round, inset)
LAYERS = [
    ('d', 'stone', .155, .05, 0), ('c', 'stone', .225, .06, 0),
    ('blue', 'blue', .088, .026, 0), ('lavender', 'lavender', .088, .026, 0), ('peach', 'peach', .062, .02, 0),
    ('b', 'stone', .13, .042, 0),
    ('mint', 'mint', .05, .016, .12),          # hidden: only the seam it holds open shows
    ('a', 'stone', .135, .042, 0),
    ('lid', 'stone', .222, .056, 0),
]
TOP = len(LAYERS) - 1
IDX = {n: i for i, (n, *_) in enumerate(LAYERS)}
FINDS = ['mint', 'peach', 'lavender', 'blue']   # the tiles' order

# ---------------------------------------------------------------- the motion (seconds)
PRE, POST = 1.0, .5           # rest before each search, after each settle (1.5 s between finds and at the seam)
WAVE = .07                    # the parting's step from one layer to the next
OPEN = .55                    # a gap's spring (critically damped)
LIFT, GAP = float(A.get('lift', .09)), float(A.get('gap', .03))   # the lid's rise, each layer's parting
DWELL = .2                    # the gap above the sheet has opened: a beat, then it moves
SLIDE = .33 * W               # how far it comes out
PULL = 1.05                   # out: a gentle start (it is pulled) and a long friction stop
HOLD = 1.1                    # from the stop to the return
HOME = .9                     # back in
CLOSE, STEP = .45, .05        # the layers settling, the lowest first, the lid last
PULL_EASE = bezier(.45, 0, .2, 1)
HOME_EASE = bezier(.42, 0, .25, 1)

beats, t = [], 0.0
for name in FINDS:
    T = IDX[name]
    t0 = t + PRE
    above = list(range(TOP, T, -1))                         # the gap under each layer above the sheet, lid first
    opens = {j: t0 + WAVE * n for n, j in enumerate(above)}
    s0 = opens[T + 1] + DWELL
    h1 = s0 + PULL + HOLD
    c0 = h1 + HOME + .05
    b = {'name': name, 'T': T, 'above': above, 'opens': opens, 's0': s0, 'h1': h1,
         'close': {j: c0 + STEP * (j - T - 1) for j in above}}
    b['end'] = max(b['close'].values()) + CLOSE
    beats.append(b)
    t = b['end'] + POST
DUR = t

for b in beats:
    print(f"{b['name']:9s} search {b['opens'][TOP]:.2f}  out {b['s0']:.2f}-{b['s0'] + PULL:.2f}  "
          f"home {b['h1']:.2f}-{b['h1'] + HOME:.2f}  settled {b['end']:.2f}")
print(f'loop {DUR:.2f} s, {frames_in(DUR)} frames')


def gaps(t):
    """The opening under each layer at time t (0 = resting on the one below)."""
    g = [0.0] * len(LAYERS)
    for b in beats:
        for j in b['above']:
            g[j] += (LIFT if j == TOP else GAP) * spring(t, b['opens'][j], OPEN) * (1 - tw(t, b['close'][j], CLOSE, 'inOut'))
    return g


def slid(t):
    """How far out each layer is at time t."""
    x = [0.0] * len(LAYERS)
    for b in beats:
        out = PULL_EASE(min(1.0, max(0.0, (t - b['s0']) / PULL)))
        back = HOME_EASE(min(1.0, max(0.0, (t - b['h1']) / HOME)))
        x[b['T']] += SLIDE * out * (1 - back)
    return x


# ---------------------------------------------------------------- the set
OUT = out_dir('out/hero_s')
sc, floor, _ = stage('mint', DUR)
res = int(A['res'])
sc.render.resolution_x = sc.render.resolution_y = res
sc['bg'] = 'ebe7de'
# the catcher's lift light (exhibit_common) brightens the floor to set the shadow's depth; kept from bouncing
# that light onto the stack, so the shadow can be as light as the concept's without washing out the faces
if A.get('floorbounce') != '1':
    floor.visible_diffuse = False
    # the light the table would have bounced up under the slabs' edges, from a card under it that only
    # diffuse rays see (not the camera, not the shadow)
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -.002))
    card = bpy.context.object
    card.name = 'bounce'
    for k in ('visible_camera', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter', 'visible_shadow'):
        setattr(card, k, False)
    em = bpy.data.materials.new('Bounce')
    em.use_nodes = True
    nt = em.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = K.hexrgb('#ebe7de')
    e.inputs['Strength'].default_value = float(A.get('bounce', .6))
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs['Surface'])
    card.data.materials.append(em)


def rrect(w, d, r, n=12):
    """A rounded rectangle, counter-clockwise, as 2D points."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -d / 2 + r, -90), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append(Vector((cx + r * math.cos(a), cy + r * math.sin(a))))
    return pts


MATS = {}


def mat(stock):
    if stock not in MATS:
        if stock in COLOUR:
            MATS[stock] = K.plain(stock.title(), COLOUR[stock], float(A.get('rough', .5)), spec=.4)
        else:
            MATS[stock] = K.plain('Stone', STONE, float(A.get('srough', .55)), spec=.4)
    return MATS[stock]


def slab(name, stock, h, rnd, inset):
    ob, _ = K.prism(name, rrect(W - 2 * inset, D - 2 * inset, R - min(inset, R * .5)), h, {'m': mat(stock)}, 'm', bevel=0, smooth=True)
    # a full round on the top edge, a small one underneath: each slab sits on the next with a fine dark seam,
    # not a shaded groove
    me = ob.data
    wt = me.attributes.new('bevel_weight_edge', 'FLOAT', 'EDGE')
    for e in me.edges:
        za, zb = (me.vertices[i].co.z for i in e.vertices)
        if abs(za - zb) < 1e-6:
            wt.data[e.index].value = 1.0 if za > 0 else float(A.get('under', .5))
    bv = ob.modifiers.new('round', 'BEVEL')
    bv.width, bv.segments, bv.limit_method = rnd, 5, 'WEIGHT'
    bv.harden_normals = True
    return ob


def capsule(name, length, r):
    """A rod with round ends along y: cuts one ruled line into the lid."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=11, radius=r)
    for v in bm.verts:
        x, y, z = v.co.y, v.co.z, v.co.x                     # turned so the poles lie on y (a rotation, not a
                                                             # mirror: the rod stays solid), then stretched apart
        v.co = Vector((x, y + math.copysign(length / 2 - r, y), z))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return bpy.data.objects.new(name, me)


slabs = [slab(*layer) for layer in LAYERS]

# the lid is a record, read from the left face: a title pocket by its top edge, then six ruled lines
# (the last one short), all running into the picture and starting at one margin
lid, hl = slabs[TOP], LAYERS[TOP][2]
cuts = bpy.data.collections.new('lid_cuts')
sc.collection.children.link(cuts)


GROOVE = K.plain('Groove', '#' + A.get('groove', 'aea89e'), .6, spec=.3)
POCKET = K.plain('Pocket', '#' + A.get('pocket', 'cfcac0'), .6, spec=.3)   # the title: a lighter recess


def cutter(o, at, groove=GROOVE):
    o.location = at
    if o.name not in cuts.objects:
        cuts.objects.link(o)
    o.parent = lid
    o.hide_render = True
    o.display_type = 'WIRE'
    o.data.materials.clear()
    o.data.materials.append(groove)                       # the faces it cuts take this (a shade under the stone)


tl = .2 * D
title, _ = K.prism('title', rrect(.16, tl, .025, 6), .028, {'m': mat('stone')}, 'm', bevel=0, coll=cuts)
cutter(title, (-W / 2 + .2 * W, -D / 2 + .17 * D + tl / 2, hl / 2), POCKET)
y0, rr = -D / 2 + .18 * D, float(A.get('line', .016))
for k in range(6):
    L = (.68 if k < 5 else .19) * D
    cutter(capsule(f'line{k}', L, rr), (-W / 2 + .38 * W + k * .093 * W, y0 + L / 2, hl / 2 + .15 * rr))     # shallow: a groove, not a slot
bo = lid.modifiers.new('cuts', 'BOOLEAN')
bo.operation, bo.operand_type, bo.collection, bo.solver = 'DIFFERENCE', 'COLLECTION', cuts, 'EXACT'
bo.material_mode = 'TRANSFER'
lid.modifiers.move(1, 0)          # cut first: the rounding only takes the edges weighted for it, so the marks stay crisp

rest_z, z = [], 0.0
for n, s, h, *_ in LAYERS:
    rest_z.append(z + h / 2)
    z += h
HEIGHT = z

cam = camera(sc)
cam.data.lens = float(A.get('lens', 250))           # near-orthographic, as in the concept frames
EL, AZ = float(A.get('el', 18.3)), float(A.get('az', 54))


def place(t):
    g, x = gaps(t), slid(t)
    lift = 0.0
    for i, o in enumerate(slabs):
        lift += g[i]
        o.location = (x[i], 0, rest_z[i] + lift)


def outline(t=0.0):
    """Each layer's top and bottom edge loops at time t, in world space."""
    place(t)
    loops = []
    for o, (n, s, h, rnd, inset) in zip(slabs, LAYERS):
        ring = rrect(W - 2 * inset, D - 2 * inset, R - min(inset, R * .5), 6)
        for zz in (-h / 2, h / 2):
            loops.append([Vector((p.x + o.location.x, p.y, o.location.z + zz)) for p in ring])
    return loops


def frame_xy(p):
    v = world_to_camera_view(sc, cam, p)
    return v.x, 1 - v.y                                       # fractions of the frame from its top left


def fit(box):
    """Aim at the stack's middle at exactly EL and AZ, then solve the distance (size) and the lens shift
    (place) so the resting stack's outline fills box: x0, y0, x1, y1 as fractions of the frame from its top
    left. Shifting the lens, not the aim, keeps the view of the stack itself the same."""
    pts = [p for loop in outline() for p in loop]
    dist = 14.0
    for _ in range(40):
        aim(cam, (0, 0, HEIGHT / 2), EL, dist, AZ)
        bpy.context.view_layer.update()
        q = [frame_xy(p) for p in pts]
        x0, x1 = min(a for a, _ in q), max(a for a, _ in q)
        y0, y1 = min(b for _, b in q), max(b for _, b in q)
        dist *= (x1 - x0) / (box[2] - box[0])
        cam.data.shift_x += (x0 + x1) / 2 - (box[0] + box[2]) / 2
        cam.data.shift_y += (box[1] + box[3]) / 2 - (y0 + y1) / 2
    print(f'FIT dist {dist:.2f} shift {cam.data.shift_x:.3f},{cam.data.shift_y:.3f} | box x {x0:.3f}-{x1:.3f} '
          f'y {y0:.3f}-{y1:.3f} (wanted y {box[1]:.3f}-{box[3]:.3f})')
    return dist


# where the resting stack sits in the concept frame, as fractions of the hero square
DIST = fit([float(v) for v in A.get('box', '.289,.222,.863,.643').split(',')])


def pose(t):
    place(t)
    aim(cam, (0, 0, HEIGHT / 2), EL, DIST, AZ)


if 'wire' in A:
    # every layer's edges as frame fractions at time t (for laying over a concept frame), no render
    import json
    tt = float(A['wire'])
    loops = outline(tt)
    with open(os.path.join(OUT, f'wire_{tt:g}.json'), 'w') as fh:
        json.dump([[frame_xy(p) for p in loop] for loop in loops], fh)
    print('WIRE', os.path.join(OUT, f'wire_{tt:g}.json'))
    sys.exit(0)

if A.get('review') == '1':
    # rest; the mint search at its widest; the mint halfway out; each find held; the blue search (the deepest)
    m, bl = beats[0], beats[3]
    times = [0.0, m['opens'][TOP] + .45, m['s0'] + PULL * .45] + [b['h1'] - .1 for b in beats] + [bl['opens'][bl['T'] + 1] + .3]
    A['frames'] = ','.join(str(round(tt * FPS) + 1) for tt in times)
    print('REVIEW FRAMES', A['frames'])


def fade_edges(path, left=.06, bottom=.04):
    """Take the shadow's last tail to nothing at the frame's left and bottom edges (only floor shadow
    reaches them; the sheets come out on the right), so the square never cuts it off on the page."""
    import numpy as np
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = 'Non-Color'
    w, h = im.size
    px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)          # rows bottom first

    def ramp(n, edge):
        x = np.clip(np.arange(n) / (edge * n), 0, 1)
        return x * x * (3 - 2 * x)
    px[..., 3] *= ramp(w, left)[None, :] * ramp(h, bottom)[:, None]
    im.pixels[:] = px.ravel()
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)


def film():
    """Every frame as f_NNNN.png (and meta.json for the encoder). The camera never moves and the noise
    seed is fixed, so a frame whose pose is the same as the last one's across the whole shutter comes out
    the same: it is copied, not rendered again (the rests and holds are about a third of the loop)."""
    import json, shutil
    n = frames_in(DUR)
    with open(os.path.join(OUT, 'meta.json'), 'w') as fh:
        json.dump({'bg': sc['bg'], 'fps': FPS, 'frames': n}, fh)
    half = sc.render.motion_blur_shutter / 2 / FPS

    def sig(f):
        t = ftime(f)                                             # to 1e-5 units: far under a pixel
        return tuple(round(v, 5) for tt in (t - half, t, t + half) for v in gaps(tt) + slid(tt))

    last, last_path, made, copied = None, None, 0, 0
    for f in range(1, n + 1):
        path = os.path.join(OUT, f'f_{f:04d}.png')
        s = sig(f)
        if os.path.exists(path) and A.get('overwrite') != '1':
            pass                                                     # resuming: kept as it is
        elif s == last and last_path:
            shutil.copyfile(last_path, path)
            copied += 1
        else:
            sc.frame_set(f)
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            fade_edges(path)
            made += 1
            print(f'FRAME {f}/{n} rendered ({made} rendered, {copied} copied)', flush=True)
        last, last_path = s, path
    print(f'FILM DONE {made} rendered, {copied} copied, {n} frames')


bake(sc, slabs + [cam], pose, DUR)
if 'frames' in A:
    import time
    started = time.time()
    render(sc, OUT, 'hero', DUR)
    if A.get('fade', '1') == '1':
        new = [f for f in sorted(os.listdir(OUT)) if f.startswith('hero_') and f.endswith('.png')
               and os.path.getmtime(os.path.join(OUT, f)) >= started]
        for f in new:
            fade_edges(os.path.join(OUT, f))
else:
    film()
