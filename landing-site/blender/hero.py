"""Hero loop: a hexagonal column of chevron-cut blocks that opens into an exploded
view (rings lift apart, blocks slide out and tilt), turns a full revolution, and
locks back together. 240 frames @30fps, seamless.
Run: blender -b --factory-startup --python hero.py -- out=DIR [res=960 spp=64 frames=1,70,120|all bg=e5e5e5]"""
import bpy, math, random, os, sys
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K

A = K.args()
OUT = A['out']
LOOP = 240
K.reset()
sc = K.setup_render(int(A.get('res', 960)), int(A.get('spp', 64)), LOOP, A)
K.lights(sc, sun_from=tuple(float(x) for x in A.get('sun', '.42,-.6,.7').split(',')),
         strength=float(A.get('sunE', 5.0)), angle=float(A.get('sunA', 2.0)), fill=float(A.get('fill', .12)))
M = K.library()

R, RIN, GAP, VGAP = 1.0, .40, .016, .014
C30 = math.cos(math.pi / 6)


def P(ang, rad):
    return Vector((rad * math.cos(ang), rad * math.sin(ang)))


def chevron(s, e):
    """Ring piece from face-middle (60s-30 deg) to face-middle (60e-30 deg): it wraps
    the outer corners in between, so every block carries a corner (DayOS cuts at corners)."""
    a0, a1 = math.radians(60 * s - 30), math.radians(60 * e - 30)
    t0 = Vector((-math.sin(a0), math.cos(a0))) * GAP / 2
    t1 = Vector((-math.sin(a1), math.cos(a1))) * GAP / 2
    pts = [P(a0, RIN) + t0, P(a0, R * C30) + t0]
    pts += [P(math.radians(60 * k), R) for k in range(s, e)]
    pts += [P(a1, R * C30) - t1, P(a1, RIN) - t1]
    pts += [P(math.radians(60 * m - 30), RIN) for m in range(e - 1, s, -1)]
    return pts


def paint_inner(ob, c, mat):
    """Faces looking into the well get the inner colour (pink/blue, as on DayOS)."""
    me = ob.data
    me.materials.append(mat)
    idx = len(me.materials) - 1
    for p in me.polygons:
        if abs(p.normal.z) > .5:
            continue
        rad = Vector((p.center.x + c.x, p.center.y + c.y)).normalized()
        if p.normal.x * rad.x + p.normal.y * rad.y < -.3:
            p.material_index = idx


# (height, side material, top material, pieces per ring, {piece index: accent}, inner colour)
LAYERS = [
    (.48, 'terr', 'terr', 6, {}, None),
    (.50, 'oak', 'oak', 3, {}, 'pink'),
    (.40, 'dark', 'dark', 6, {}, None),
    (.52, 'terr', 'terr', 6, {}, 'blue'),
    (.46, 'oak', 'oak', 6, {}, None),
    (.36, 'dark', 'dark', 3, {}, 'pink'),
    (.54, 'terr', 'terr', 3, {1: 'green'}, None),
    (.42, 'yel', 'yel', 6, {4: 'green'}, 'pink'),
    (.54, 'terr', 'terr', 6, {2: 'pink'}, None),
    (.36, 'dark', 'dark', 3, {}, 'blue'),
    (.50, 'oak', 'oak', 6, {}, None),
    (.54, 'oak', 'white', 6, {}, 'pink'),
]

rig = bpy.data.objects.new('Rig', None)
sc.collection.objects.link(rig)

rnd = random.Random(11)
pieces = []
piece_at = {}
z = 0.0
nL = len(LAYERS)
pivot = float(A.get('pivot', 9.6))           # ring that stays at its height
SPREAD = float(A.get('spread', .36))         # extra air between rings when open
OPEN = float(A.get('open', .56))             # radial slide, in column radii
TILT = float(A.get('tilt', 11))              # petal tilt, degrees (top edge outward)
TWIST = float(A.get('twist', 14))            # each ring turns as a unit, alternating
for li, (h, side, top, n, acc, inner) in enumerate(LAYERS):
    span = 6 // n
    rot0 = li % 2                    # stagger the seams ring to ring
    jitter_t = rnd.uniform(0, 2.5)
    for pi in range(n):
        s = pi * span + rot0
        mat = acc.get(pi, side)
        pts = chevron(s, s + span)
        ob, c = K.prism(f'L{li}P{pi}', pts, h, M, mat, top if mat == side else mat, bevel=.024)
        if inner:
            paint_inner(ob, c, M[inner])
        ob.parent = rig
        ob.rotation_mode = 'QUATERNION'
        base = Vector((c.x, c.y, z + h / 2))
        radial = Vector((c.x, c.y, 0)).normalized()
        tang = Vector((-radial.y, radial.x, 0))
        pieces.append(dict(
            ob=ob, base=base, radial=radial, tang=tang, c=c, h=h,
            outer=pts[1:3 + span],           # outer wall points: half face, (full face), half face
            tilt=math.radians(TILT * rnd.uniform(.8, 1.2)),
            twist=math.radians(TWIST * (1 if li % 2 else -1)),
            D=R * OPEN * rnd.uniform(.95, 1.05),
            dz=(li - pivot) * SPREAD,
            dout=(nL - 1 - li) * 2.6 + jitter_t + rnd.uniform(0, 1.5),
            din=li * 2.6 + jitter_t + rnd.uniform(0, 1.5),
        ))
        piece_at[li, pi] = pieces[-1]
    z += h + VGAP
TOP = z - VGAP

# ---- printed record marks: a few tiny labels (vendor, invoice, payment, credit memo)
# on some outer walls and the top ring, like stock marks printed on material.
# Spread around the column so roughly one faces the camera at a time.
FONT_FILES = {'mono': 'C:/Windows/Fonts/consola.ttf', 'sans': 'C:/Windows/Fonts/arialbd.ttf'}
FONTS = {k: bpy.data.fonts.load(v) for k, v in FONT_FILES.items() if os.path.exists(v)}
INK = {'d': K.plain('InkDark', '#2e2a27', .62), 'l': K.plain('InkLight', '#e4dbcf', .62)}
# (layer, piece, outer-wall segment or 'top', lines top-down as (text, font, size), ink)
LABELS = [
    (11, 4, 'top', [('INV-1834', 'mono', .056), ('HALDEN SUPPLY CO.', 'mono', .032)], 'd'),
    (10, 1, 0, [('QuickBooks', 'sans', .058), ('BILL 4471 · EXPORT', 'mono', .031)], 'd'),
    (9, 0, 1, [('CR MEMO 0217', 'mono', .05), ('850.00  UNAPPLIED', 'mono', .034)], 'l'),
    (8, 4, 1, [('stripe', 'sans', .066), ('PMT 05/04  4,280.00', 'mono', .031)], 'd'),
    (7, 3, 0, [('TXN 8F3A-21C', 'mono', .04)], 'd'),
    (6, 1, 1, [('XERO', 'sans', .07), ('BILL #1834-A  ·  05/09', 'mono', .032)], 'd'),
    (10, 5, 1, [('ramp', 'sans', .062), ('CARD 4411  1,200.00', 'mono', .031)], 'd'),
    (5, 2, 1, [('BILL', 'sans', .06), ('DUE 05/31 · NET 30', 'mono', .032)], 'l'),
]
for li, pi, seg, lines, ink in LABELS:
    p = piece_at[li, pi]
    c, h = p['c'], p['h']
    if seg == 'top':    # near the outer corner, reading upright from outside
        rad = p['radial']
        X, Y, N = Vector((-rad.y, rad.x, 0)), -rad, Vector((0, 0, 1))
        origin, align = rad * .16 + N * (h / 2 + .0015), 'CENTER'
    else:               # bottom-left of one flat outer wall
        a, b = p['outer'][seg], p['outer'][seg + 1]
        d = (b - a).normalized()
        X, Y, N = Vector((d.x, d.y, 0)), Vector((0, 0, 1)), Vector((d.y, -d.x, 0))
        origin = Vector((a.x - c.x, a.y - c.y, -h / 2)) + X * .08 + Y * .075 + N * .0015
        align = 'LEFT'
    rot = Matrix((X, Y, N)).transposed().to_4x4()
    y = 0.0
    for i, (txt, fk, size) in enumerate(reversed(lines)):
        cu = bpy.data.curves.new(f'{p["ob"].name}_mark{i}', 'FONT')
        cu.body = txt
        if fk in FONTS:
            cu.font = FONTS[fk]
        cu.size = size
        cu.align_x, cu.align_y = align, 'BOTTOM_BASELINE'
        cu.materials.append(INK[ink])
        t = bpy.data.objects.new(cu.name, cu)
        sc.collection.objects.link(t)
        t.parent = p['ob']
        t.matrix_basis = Matrix.Translation(origin + Y * y) @ rot
        y += size * 1.3

# ---- animation, keyed every frame (linear) so motion blur sees true sub-frame motion
IDENT = Quaternion()
ZAX = Vector((0, 0, 1))
for f in range(LOOP + 1):
    fr = f + 1
    for p in pieces:
        eo = K.sstep((f - 14 - p['dout']) / 46)
        ei = K.sstep((f - 128 - p['din']) / 52)
        e = eo * (1 - ei)
        tw = Quaternion(ZAX, p['twist'] * e)
        rad = tw @ p['radial']
        pos = tw @ Vector((p['base'].x, p['base'].y, 0)) + rad * p['D'] * e
        p['ob'].location = Vector((pos.x, pos.y, p['base'].z + p['dz'] * e))
        # tilt about the (twisted) tangent so the top edge leans outward, like petals
        tang = tw @ p['tang']
        p['ob'].rotation_quaternion = Quaternion(tang, -p['tilt'] * e) @ tw
        p['ob'].keyframe_insert('location', frame=fr)
        p['ob'].keyframe_insert('rotation_quaternion', frame=fr)
    # one full turn per loop; the linear share keeps it drifting through the solid hold
    rig.rotation_euler = (0, 0, 2 * math.pi * (.15 * f / LOOP + .85 * K.sstep((f - 12) / 210)))
    rig.keyframe_insert('rotation_euler', frame=fr)

tz = TOP - float(A.get('topdrop', 1.25))
K.camera(sc, (0, 0, tz), float(A.get('dist', 15.5)), float(A.get('el', 30)), lens=float(A.get('lens', 100)))
print('TOP', round(TOP, 3), 'pieces', len(pieces), 'tz', round(tz, 3))
K.render(sc, OUT, 'hero', A.get('frames', '1,70,120'), A.get('bg'))
