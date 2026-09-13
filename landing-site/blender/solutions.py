"""Find / Build / Recover loops for the black 'entry solutions' band.
Same materials and light as the hero; floating objects, transparent film, motion blur.
Run: blender -b --factory-startup --python solutions.py -- scene=find|build|recover out=DIR
     [res=720 spp=64 frames=1,40,80|all bg=000000 loop=150]"""
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K

A = K.args()
OUT = A['out']
SCENE = A.get('scene', 'find')
LOOP = int(A.get('loop', 150))
TAU = 2 * math.pi
ZAX = Vector((0, 0, 1))
K.reset()
sc = K.setup_render(int(A.get('res', 720)), int(A.get('spp', 64)), LOOP, A)
K.lights(sc, sun_from=tuple(float(x) for x in A.get('sun', '.5,-.55,.7').split(',')),
         strength=float(A.get('sunE', 5.0)), angle=float(A.get('sunA', 2.0)), fill=float(A.get('fill', .12)))
M = K.library()
rnd = random.Random(5)
moving = []


def hexpts(r, cx=0.0, cy=0.0, rot=0.0):
    return [Vector((cx + r * math.cos(rot + k * math.pi / 3), cy + r * math.sin(rot + k * math.pi / 3))) for k in range(6)]


def circle(r, n=96, cx=0.0, cy=0.0):
    return [Vector((cx + r * math.cos(TAU * k / n), cy + r * math.sin(TAU * k / n))) for k in range(n)]


def block(name, pts, h, body, cap=None, cap_h=.05, smooth=False, bevel=.02):
    """Body prism with an optional thin, flat colour cap (the DayOS accent slab).
    Plywood shows its plies on the sides and an oak veneer on top."""
    ob, c = K.prism(name, pts, h, M, body, top='oak' if body == 'ply' else None, bevel=bevel, smooth=smooth)
    ob.rotation_mode = 'QUATERNION'
    if cap:
        cp, _ = K.prism(name + '_cap', pts, cap_h, M, cap, bevel=.008, smooth=smooth)
        cp.parent = ob
        cp.location = (0, 0, h / 2 + cap_h / 2 + .002)
    moving.append(ob)
    return ob, c


def sphere(name, r, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=r)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M[mat])
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    ob.rotation_mode = 'QUATERNION'
    moving.append(ob)
    return ob


def keyall(fr):
    for o in moving:
        o.keyframe_insert('location', frame=fr)
        o.keyframe_insert('rotation_quaternion', frame=fr)


def cycle(t, t_open, t_close, dur):
    """0 -> 1 -> 0 with smootherstep edges; 0 at t=0 and t=1 (loop seam)."""
    return K.sstep((t - t_open) / dur) * (1 - K.sstep((t - t_close) / dur))


# ------------------------------------------------------------------ FIND
# A honeycomb of seven hex posts; a height wave sweeps round the ring and the
# centre post (green cap) carries a terrazzo ball up and down.
if SCENE == 'find':
    r, gap = .52, .035
    step = r * math.sqrt(3) + gap
    spec = [('terr', 'c_green', 1.10), ('terr', 'c_pink', .78), ('ply', None, .92), ('terr', 'c_cyan', .66),
            ('taupe', None, .88), ('terr', 'c_orange', .82), ('ply', None, .72)]
    posts = []
    for i, (body, cap, h) in enumerate(spec):
        ang = 0.0 if i == 0 else math.radians(30 + 60 * (i - 1))
        cx, cy = (0.0, 0.0) if i == 0 else (step * math.cos(ang), step * math.sin(ang))
        ob, c = block(f'post{i}', hexpts(r, cx, cy), h, body, cap)
        posts.append((ob, Vector((cx, cy, h / 2)), ang, h + (.052 if cap else 0)))
    ball = sphere('ball', .21, 'terr')
    for f in range(LOOP + 1):
        t = f / LOOP
        for i, (ob, base, ang, top) in enumerate(posts):
            dz = .20 * math.sin(TAU * (2 * t) + math.pi) if i == 0 else .24 * math.sin(TAU * t - ang)
            ob.location = base + Vector((0, 0, dz))
        ob0, base0, _, top0 = posts[0]
        # rest the ball on the centre post's cap: cap surface = centre z - h/2 + (h + cap)
        ball.location = Vector((0, 0, ob0.location.z - base0.z + top0 + .21))
        ball.rotation_quaternion = Quaternion(ZAX, TAU * t)
        keyall(f + 1)
    target, el, az, dist = (0, 0, .55), 34, -58, float(A.get('dist', 14))

# ------------------------------------------------------------------ BUILD
# Six wedges of a hexagon lock together, lift apart in alternating heights,
# the whole piece turns 120 deg (keeps the A/B pattern), and locks again.
elif SCENE == 'build':
    R, H, g = .98, .9, .03
    wedges = []
    for k in range(6):
        a0, a1 = math.radians(60 * k), math.radians(60 * (k + 1))
        mid = (a0 + a1) / 2
        off = Vector((math.cos(mid), math.sin(mid))) * g
        pts = [off, Vector((R * math.cos(a0), R * math.sin(a0))) + off, Vector((R * math.cos(a1), R * math.sin(a1))) + off]
        body, cap = ('terr', 'c_cyan') if k % 2 == 0 else ('ply', 'c_orange')
        ob, c = block(f'w{k}', pts, H, body, cap)
        radial = Vector((math.cos(mid), math.sin(mid), 0))
        wedges.append((ob, Vector((c.x, c.y, H / 2)), radial, k))
    core = sphere('core', .2, 'white')
    for f in range(LOOP + 1):
        t = f / LOOP
        spin = Quaternion(ZAX, math.radians(120) * K.sstep((t - .28) / .52))
        for ob, base, radial, k in wedges:
            e = cycle(t, .16 + k * .012, .66 + k * .012, .2)
            lift = (.30 if k % 2 == 0 else -.16) * e
            tang = Vector((-radial.y, radial.x, 0))
            loc = base + radial * .55 * e + Vector((0, 0, lift))
            ob.location = spin @ loc
            ob.rotation_quaternion = spin @ Quaternion(tang, math.radians(-9) * e)
        e0 = cycle(t, .16, .66, .2)
        core.location = Vector((0, 0, H / 2 + .55 * e0))
        core.rotation_quaternion = spin
        keyall(f + 1)
    target, el, az, dist = (0, 0, .45), 34, -58, float(A.get('dist', 11))

# ------------------------------------------------------------------ RECOVER
# A stack of discs fans out around a pin like a swatch book, then gathers back.
elif SCENE == 'recover':
    Rd, T, g = .72, .17, .012
    spec = [('ply', None), ('terr', None), ('ply', 'c_pink'), ('taupe', None), ('ply', None), ('terr', 'c_green')]
    discs = []
    z = 0.0
    for k, (body, cap) in enumerate(spec):
        ob, c = block(f'd{k}', circle(Rd), T, body, cap, cap_h=.035, smooth=True, bevel=.014)
        discs.append((ob, Vector((0, 0, z + T / 2)), k))
        z += T + g + (.037 if cap else 0)
    pin = Vector((-Rd + .12, -.05, 0))
    ball = sphere('ball', .17, 'white')
    for f in range(LOOP + 1):
        t = f / LOOP
        e = cycle(t, .14, .62, .26)
        fan = math.radians(float(A.get('fan', 28)))
        for ob, base, k in discs:
            q = Quaternion(ZAX, fan * k * e)
            rel = Vector((base.x - pin.x, base.y - pin.y, 0))
            p2 = q @ rel
            ob.location = Vector((pin.x + p2.x, pin.y + p2.y, base.z + .10 * k * e))
            ob.rotation_quaternion = q
        top, tb, tk = discs[-1]
        ball.location = top.location + Vector((0, 0, T / 2 + .037 + .17))
        ball.rotation_quaternion = top.rotation_quaternion
        keyall(f + 1)
    target, el, az, dist = (-.45, .3, .75), 40, -58, float(A.get('dist', 12.5))

K.camera(sc, target, dist, float(A.get('el', el)), float(A.get('az', az)), lens=float(A.get('lens', 100)))
K.render(sc, OUT, SCENE, A.get('frames', '1,40,80'), A.get('bg'))
