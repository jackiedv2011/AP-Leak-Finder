"""Hero loop: a filed column of ledger blocks that opens into an exploded view
(rings lift apart, blocks slide out and tilt), turns a full revolution, and
locks back together. 240 frames @30fps, seamless.

This is reconciliation, which is the word for what the product does: every
entry pulled out, looked at, and put back in balance. One block does not come
back with the others — the green one on the top ring hangs out about thirty
frames longer and seats on the last frame of the loop. Everything else moves
as a system; that one moves like a finding.

Each block carries an index tab standing proud of one outer face, offset off
centre the way a real filing tab is, stepping round the column ring by ring so
the tabs read as a helix rather than as scatter.
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
# the index tab: how wide across the face, how far it stands out, how thick, and
# how far into the face it is seated so it reads as inserted rather than glued on
TAB_W, TAB_D, TAB_T, TAB_IN = .30, .105, .030, .05


def P(ang, rad):
    return Vector((rad * math.cos(ang), rad * math.sin(ang)))


def chevron(s, e):
    """Ring piece from face-middle (60s-30 deg) to face-middle (60e-30 deg): it wraps
    the outer corners in between, so every block carries a corner."""
    a0, a1 = math.radians(60 * s - 30), math.radians(60 * e - 30)
    t0 = Vector((-math.sin(a0), math.cos(a0))) * GAP / 2
    t1 = Vector((-math.sin(a1), math.cos(a1))) * GAP / 2
    walls = [P(a0, R * C30) + t0]
    walls += [P(math.radians(60 * k), R) for k in range(s, e)]
    walls += [P(a1, R * C30) - t1]
    pts = [P(a0, RIN) + t0] + walls + [P(a1, RIN) - t1]
    pts += [P(math.radians(60 * m - 30), RIN) for m in range(e - 1, s, -1)]
    return pts, walls


def index_tab(name, walls, seg, mat):
    """A divider slid into the block and left sticking out: a thin card, seated
    into one outer face and standing proud of it.

    It is a separate object rather than part of the outline because an extruded
    outline can only make a full-height fin, and a fin reads as a structural rib.
    A tab has to be thinner than the block it marks. Returns (object, centroid,
    outward normal) — the normal aims the printed mark."""
    a, b = walls[seg], walls[seg + 1]
    ed = b - a
    nrm = Vector((ed.y, -ed.x)).normalized()
    ehat = ed.normalized()
    ctr = a + ed * .5
    q0 = ctr - ehat * (TAB_W / 2) - nrm * TAB_IN
    q1 = ctr + ehat * (TAB_W / 2) - nrm * TAB_IN
    out = nrm * (TAB_IN + TAB_D)
    ob, c = K.prism(name, [q0, q0 + out, q1 + out, q1], TAB_T, M, mat, bevel=.006)
    return ob, c, nrm


def paint_inner(ob, c, mat):
    """Faces looking into the well get the inner tint. One tint for the whole
    column: the well is the inside of the ledger, and it is the same green as
    everything else that means money."""
    me = ob.data
    me.materials.append(mat)
    idx = len(me.materials) - 1
    for p in me.polygons:
        if abs(p.normal.z) > .5:
            continue
        rad = Vector((p.center.x + c.x, p.center.y + c.y)).normalized()
        if p.normal.x * rad.x + p.normal.y * rad.y < -.3:
            p.material_index = idx


# (height, side material, top material or None for the side's, pieces per ring,
#  {piece index: accent}, inner colour)
# Read upward: cover board at the base, working stock through the middle, and
# the ring the camera actually sits on at the top. Colour appears four times in
# twelve rings, and each one is a cause the product names — paid too much,
# paid twice, paid to the wrong place, and money back.
LAYERS = [
    (.48, 'ream', None, 6, {}, None),
    (.50, 'card', 'paper', 3, {}, 't_green'),
    (.40, 'ink', None, 6, {}, None),
    (.52, 'ream', 'paper', 6, {}, 't_green'),
    (.46, 'ream_w', 'ruled', 6, {}, None),
    (.36, 'carbon', None, 3, {}, None),
    (.54, 'ream', 'paper', 3, {1: 'blue'}, None),
    (.42, 'ink', None, 6, {4: 'orange'}, None),
    (.54, 'ream_w', 'ruled', 6, {2: 'pink'}, 't_green'),
    (.36, 'carbon', None, 3, {}, None),
    (.50, 'card', 'paper', 6, {}, None),
    (.54, 'ream', 'ruled', 6, {3: 'green'}, 't_green'),
]

# The one block that comes home late. Top ring, so it is never hidden behind
# the column, and a third of a turn off the lens so it seats in three-quarter
# view rather than edge-on.
FINDING = (11, 3)
# Every other block is home by frame 212. This one holds its position until 196
# and then takes the rest of the loop to seat, landing exactly on the seam —
# smootherstep brings its speed to zero there, so the cut is invisible and the
# motion blur has nothing to catch.
FINDING_DIN, FINDING_DUR = 68.0, 44.0

# ---- printed record marks: a few tiny labels (vendor, invoice, payment, credit
# memo) on some outer walls and the top ring, like stock marks printed on
# material. Spread around the column so roughly one faces the camera at a time.
# (layer, piece, outer-wall segment or 'top', lines top-down as (text, font, size), ink)
LABELS = [
    (11, 4, 0, [('INV-1834', 'mono', .056), ('HALDEN SUPPLY CO.', 'mono', .032)], 'd'),
    (10, 1, 0, [('QuickBooks', 'sans', .058), ('BILL 4471 · EXPORT', 'mono', .031)], 'd'),
    (9, 0, 1, [('CR MEMO 0217', 'mono', .05), ('850.00  UNAPPLIED', 'mono', .034)], 'l'),
    (8, 4, 1, [('stripe', 'sans', .066), ('PMT 05/04  4,280.00', 'mono', .031)], 'd'),
    (7, 3, 0, [('TXN 8F3A-21C', 'mono', .04)], 'l'),
    (6, 1, 1, [('XERO', 'sans', .07), ('BILL #1834-A  ·  05/09', 'mono', .032)], 'd'),
    (10, 5, 1, [('ramp', 'sans', .062), ('CARD 4411  1,200.00', 'mono', .031)], 'd'),
    (5, 2, 1, [('BILL', 'sans', .06), ('DUE 05/31 · NET 30', 'mono', .032)], 'l'),
]
LABEL_SEG = {(li, pi): seg for li, pi, seg, _, _ in LABELS}

# ---- tab codes: one line on the upward face of a divider, written the way a
# filing tab is — enough to find a record by, not to read it from.
TABMARKS = [
    (11, 3, 'INV-1834'),
    (11, 0, 'MAY'),
    (10, 2, 'Q2'),
    (9, 1, 'CR-0217'),
    (8, 4, 'A–C'),
    (7, 0, 'VENDORS'),
    (6, 2, 'PMT'),
    (5, 1, 'APR'),
    (4, 3, 'D–H'),
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
        # tabs step round one face per ring, so they climb the column as a helix;
        # a block carrying a printed mark keeps that face clear and tabs the next
        nseg = span + 1
        seg = (li + pi) % nseg
        if LABEL_SEG.get((li, pi)) == seg:
            seg = (seg + 1) % nseg
        pts, walls = chevron(s, s + span)
        ob, c = K.prism(f'L{li}P{pi}', pts, h, M, mat, (top or side) if mat == side else mat, bevel=.016)
        if inner:
            paint_inner(ob, c, M[inner])
        ob.parent = rig
        ob.rotation_mode = 'QUATERNION'
        # every block is filed: one divider, seated at its own depth in the stack
        # one divider stock throughout, so a tab always reads as something put
        # into the block rather than cut from it — and the one in the green block
        # is the only white thing on it
        tob, tc, tn = index_tab(f'L{li}P{pi}T', walls, seg, 'card')
        tob.parent = ob
        tob.location = (tc.x - c.x, tc.y - c.y, rnd.uniform(-.19, .19) * h)
        base = Vector((c.x, c.y, z + h / 2))
        mid = math.radians(60 * (s + span / 2) - 30)
        radial = Vector((math.cos(mid), math.sin(mid), 0))
        tang = Vector((-radial.y, radial.x, 0))
        pieces.append(dict(
            ob=ob, base=base, radial=radial, tang=tang, c=c, h=h,
            outer=walls,                     # outer wall points: half face, (full face), half face
            tab=(tob, tn),
            tilt=math.radians(TILT * rnd.uniform(.8, 1.2)),
            twist=math.radians(TWIST * (1 if li % 2 else -1)),
            D=R * OPEN * rnd.uniform(.95, 1.05),
            dz=(li - pivot) * SPREAD,
            dout=(nL - 1 - li) * 2.6 + jitter_t + rnd.uniform(0, 1.5),
            din=FINDING_DIN if (li, pi) == FINDING else li * 2.6 + jitter_t + rnd.uniform(0, 1.5),
            din_dur=FINDING_DUR if (li, pi) == FINDING else 52.0,
        ))
        piece_at[li, pi] = pieces[-1]
    z += h + VGAP
TOP = z - VGAP

FONT_FILES = {'mono': 'C:/Windows/Fonts/consola.ttf', 'sans': 'C:/Windows/Fonts/arialbd.ttf'}
FONTS = {k: bpy.data.fonts.load(v) for k, v in FONT_FILES.items() if os.path.exists(v)}
INK = {'d': K.plain('InkDark', '#33332f', .62), 'l': K.plain('InkLight', '#eae7e1', .62)}
def mark(parent, lines, ink, origin, X, Y, N, align):
    """One printed mark: lines stacked upward from `origin`, in the frame X/Y/N."""
    rot = Matrix((X, Y, N)).transposed().to_4x4()
    y = 0.0
    for i, (txt, fk, size) in enumerate(reversed(lines)):
        cu = bpy.data.curves.new(f'{parent.name}_mark{i}', 'FONT')
        cu.body = txt
        if fk in FONTS:
            cu.font = FONTS[fk]
        cu.size = size
        cu.align_x, cu.align_y = align, 'BOTTOM_BASELINE'
        cu.materials.append(INK[ink])
        t = bpy.data.objects.new(cu.name, cu)
        sc.collection.objects.link(t)
        t.parent = parent
        t.matrix_basis = Matrix.Translation(origin + Y * y) @ rot
        y += size * 1.3


for li, pi, seg, lines, ink in LABELS:      # bottom-left of one flat outer wall
    p = piece_at[li, pi]
    c, h = p['c'], p['h']
    a, b = p['outer'][seg], p['outer'][seg + 1]
    d = (b - a).normalized()
    X, Y, N = Vector((d.x, d.y, 0)), Vector((0, 0, 1)), Vector((d.y, -d.x, 0))
    mark(p['ob'], lines, ink,
         Vector((a.x - c.x, a.y - c.y, -h / 2)) + X * .08 + Y * .075 + N * .0015,
         X, Y, N, 'LEFT')

for li, pi, txt in TABMARKS:                # centred on the divider, reading from outside
    tob, nrm = piece_at[li, pi]['tab']
    X, Y, N = Vector((-nrm.y, nrm.x, 0)), Vector((-nrm.x, -nrm.y, 0)), Vector((0, 0, 1))
    mark(tob, [(txt, 'mono', .032)], 'd',
         Vector((nrm.x, nrm.y, 0)) * (TAB_IN / 2 + .011) + Vector((0, 0, TAB_T / 2 + .0012)),
         X, Y, N, 'CENTER')

# ---- animation, keyed every frame (linear) so motion blur sees true sub-frame motion
IDENT = Quaternion()
ZAX = Vector((0, 0, 1))
for f in range(LOOP + 1):
    fr = f + 1
    for p in pieces:
        eo = K.sstep((f - 14 - p['dout']) / 46)
        ei = K.sstep((f - 128 - p['din']) / p['din_dur'])
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
