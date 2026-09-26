"""D15 align — scattered pieces that, from exactly one point of view, line up into a clean shape.

A loose constellation hangs in space at every depth, no order to it. The view turns
slowly round it. At one angle every piece falls into line and a clean ring appears —
all but one gap. The missing piece (green) travels in from where it had strayed and
closes the loop. The view moves on and the ring dissolves back into scatter.
Nothing but the point of view (and one piece) moved. Behaviours: correlating
unexpectedly, resolving, chaos to clean, closing the loop.

Each piece is built in the focal plane and then pushed along its own sight line by a
homothety centred on the key camera position, which leaves its projection unchanged:
exact alignment at the key view, at any depth.

knobs: orbit=full|swing|lock  shape=ring|square  depth=5.5  pal=mixed|neutral
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
DIST, EL, AZ = 18.0, 20.0, -90.0
TGT = Vector((0, 0, 1.4))
c = cam(sc, TGT, DIST, EL, AZ, 85)
C0 = c.location.copy()
fwd = (TGT - C0).normalized()
right = fwd.cross(Vector((0, 0, 1))).normalized()
up = right.cross(fwd).normalized()
BASIS = Matrix((right, up, -fwd)).transposed()     # local x=right, y=up, z=toward camera
rng = np.random.default_rng(int(A.get('seed', 9)))
NSEG = int(A.get('nseg', 20))
R0, R1, TH = .95, 1.45, .32
DEPTH = float(A.get("depth", 4.5))
PALS = {
    'mixed': ['bone', 'g4', 'cream', 'orange', 'g2', 'g5', 'blue', 'bone', 'g3', 'pink', 'cream', 'purple', 'g4', 'bone', 'g2', 'orange', 'cream', 'g5', 'blue', 'g3'],
    'neutral': ['bone', 'g4', 'cream', 'g2', 'g5', 'bone', 'g3', 'cream', 'g4', 'bone', 'g2', 'cream', 'g5', 'g3'],
}
PAL_K = PALS[A.get('pal', 'mixed')]
GREEN = 5          # ring mode: the missing segment


def wedge(name, a0, a1, mat, n=10):
    """Annulus sector in the focal plane (local coords), extruded along local z."""
    v = []
    for zz in (-TH / 2, TH / 2):
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            v.append((R1 * math.cos(a), R1 * math.sin(a), zz))
        for i in range(n, -1, -1):
            a = a0 + (a1 - a0) * i / n
            v.append((R0 * math.cos(a), R0 * math.sin(a), zz))
    m = 2 * (n + 1)
    f = [tuple(range(m))[::-1], tuple(range(m, 2 * m))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    # recentre on the sector centroid
    cx = sum(p[0] for p in v) / len(v)
    cy = sum(p[1] for p in v) / len(v)
    v = [(p[0] - cx, p[1] - cy, p[2]) for p in v]
    ob = mesh_obj(name, v, f, mat)
    bevel(ob, .025, 2, 40)
    return ob, Vector((cx, cy, 0))


SHAPE = A.get("shape", "mark")


def slab(name, pts, mat):
    """2D polygon (focal-plane local coords) extruded along local z, recentred on its centroid."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    n = len(pts)
    v = [(p[0] - cx, p[1] - cy, zz) for zz in (-TH / 2, TH / 2) for p in pts]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    ob = mesh_obj(name, v, f, mat)
    bevel(ob, .018, 2, 40)
    return ob, Vector((cx, cy, 0))


# Reclaim's hexagon mark (assets/favicon.svg), six trapezoids; y flipped from SVG
MK = float(A.get("mk", 2.0)) / 11.0
TRAP = [(-2.056, 4.6), (2.056, 4.6), (5.751, 11), (-5.751, 11)]
SEGCOL = A.get("segcol", "bone,cream|g2,g3|g4,g5|t_blue,blue|t_orange,orange|green,green").split("|")
NB, NT = int(A.get("nb", 3)), 2
LATE = int(A.get("late", 5))


def mark_pieces():
    out = []
    for sgi in range(6):
        rot = math.radians(60 * sgi + 90)
        cols = SEGCOL[sgi].split(",")
        for bi in range(NB):
            u0, u1 = bi / NB, (bi + 1) / NB
            inner = [Vector(TRAP[0]).lerp(Vector(TRAP[3]), u0), Vector(TRAP[1]).lerp(Vector(TRAP[2]), u0)]
            outer = [Vector(TRAP[0]).lerp(Vector(TRAP[3]), u1), Vector(TRAP[1]).lerp(Vector(TRAP[2]), u1)]
            for ti in range(NT):
                w0, w1 = ti / NT, (ti + 1) / NT
                g = .045 / MK
                quad = [inner[0].lerp(inner[1], w0), inner[0].lerp(inner[1], w1), outer[0].lerp(outer[1], w1), outer[0].lerp(outer[1], w0)]
                cen = sum(quad, Vector((0, 0))) / 4
                quad = [cen + (q - cen) * (1 - g / max(1e-3, (q - cen).length)) for q in quad]
                pts = [((q.x * math.cos(rot) - q.y * math.sin(rot)) * MK, (q.x * math.sin(rot) + q.y * math.cos(rot)) * MK) for q in quad]
                out.append((sgi, pts, cols[(bi + ti) % len(cols)]))
    return out


pieces = []
gap = .06
if SHAPE == "mark":
    for j, (sgi, pts, key) in enumerate(mark_pieces()):
        mat = glow("green", .5, "green") if key == "green" else rich(key, .36, .25)
        ob, cl = slab(f"M{j}", pts, mat)
        q = TGT + BASIS @ cl
        s = 1 + rng.uniform(-DEPTH, DEPTH) / DIST
        ob.rotation_euler = BASIS.to_euler()
        home = C0 + s * (q - C0)
        ob.location = home
        ob.scale = (s, s, s)
        pieces.append(dict(ob=ob, home=home, s=s, seg=sgi))
for i in range(NSEG if SHAPE == "ring" else 0):
    a0 = 2 * math.pi * i / NSEG + gap / 2 - math.pi / 2 + math.pi / NSEG
    a1 = 2 * math.pi * (i + 1) / NSEG - gap / 2 - math.pi / 2 + math.pi / NSEG
    key = 'green' if i == GREEN else PAL_K[i % len(PAL_K)]
    ob, cl = wedge(f'W{i}', a0, a1, satin(key, .36, .25) if key != 'green' else glow('green', .6, 'green'))
    q = TGT + BASIS @ cl                       # centroid in the focal plane
    s = 1 + rng.uniform(-DEPTH, DEPTH) / DIST
    if i == GREEN:
        s = 1.0
    ob.rotation_euler = BASIS.to_euler()
    home = C0 + s * (q - C0)
    ob.location = home
    ob.scale = (s, s, s)
    pieces.append(dict(ob=ob, home=home, s=s))

if SHAPE == "ring":
    for p in pieces:
        p["seg"] = -1
    pieces[GREEN]["seg"] = LATE
LATEP = [p for p in pieces if p["seg"] == LATE]
for j, p in enumerate(LATEP):
    p["stray"] = p["home"] + right * (2.4 + rng.uniform(-.6, .6)) + up * (-1.5 + rng.uniform(-.7, .7)) + fwd * rng.uniform(-2, 4)
    p["dl"] = j * 3
    p["spin"] = rng.uniform(1.5, 3)
MODE = A.get('orbit', 'swing')


@on_pose
def pose(t):
    u = (t - 120) / LOOP                       # key view at t = 120
    if MODE == 'full':
        a = .82
        off = 360 * (u - a * math.sin(2 * math.pi * u) / (2 * math.pi))
    elif MODE == 'swing':
        off = float(A.get("swing", 42)) * math.sin(math.pi * u) ** 2      # one-sided: key view only at t=120
    else:
        off = 0.0
    tg = Vector(tuple(float(v) for v in A['tgt'].split(','))) if 'tgt' in A else TGT
    orbit_cam(c, tg, DIST / float(A.get('zoom', 1)), EL + float(A.get('del', 0)), AZ + off + float(A.get('daz', 0)))
    # the late segment: strays until ~92, comes home by ~124 (staggered), holds through the dwell, leaves 185..228
    for p in LATEP:
        k = ramp(t, 78 + p["dl"], 108 + p["dl"]) * (1 - ramp(t, 190 + p["dl"] * .5, 228))
        arc = math.sin(math.pi * k) * .7
        p["ob"].location = p["stray"].lerp(p["home"], k) + up * arc
        p["ob"].rotation_euler = (BASIS.to_4x4() @ Matrix.Rotation((1 - k) * p["spin"], 4, "X")).to_euler()


go(sc, 'align', '1,60,120', LOOP)
