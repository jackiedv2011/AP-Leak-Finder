"""D15 system sketch — Evidence / Proof in the align language.

Two orange pieces sit far apart in depth, looking like two different things. From the
key angle they become exactly one silhouette — the same payment, twice. A handful of
neutral pieces around them never line up with anything. Cheap sketch for the board.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
DIST, EL, AZ = 16.0, 20.0, -90.0
TGT = Vector((0, 0, 1.2))
c = cam(sc, TGT, DIST, EL, AZ, 85)
C0 = c.location.copy()
fwd = (TGT - C0).normalized()
right = fwd.cross(Vector((0, 0, 1))).normalized()
up = right.cross(fwd).normalized()
BASIS = Matrix((right, up, -fwd)).transposed()
rng = np.random.default_rng(4)
TH = .22


def slab(name, pts, mat):
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    n = len(pts)
    v = [(p[0] - cx, p[1] - cy, zz) for zz in (-TH / 2, TH / 2) for p in pts]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    ob = mesh_obj(name, v, f, mat)
    bevel(ob, .02, 2, 40)
    return ob, Vector((cx, cy, 0))


def place(ob, cl, s):
    q = TGT + BASIS @ cl
    ob.rotation_euler = BASIS.to_euler()
    ob.location = C0 + s * (q - C0)
    ob.scale = (s, s, s)


# the pair: one shape (a notched card silhouette), twice
shape = [(-.9, -.55), (.9, -.55), (.9, .35), (.55, .55), (-.9, .55)]
a, ca = slab('PairA', shape, rich('orange', .36, .3))
b, cb = slab('PairB', shape, frosted('t_orange', .25, .85))
place(a, ca, 1.38)
place(b, cb, .72)
# neutrals that never line up
for i in range(9):
    w, h = rng.uniform(.3, .8), rng.uniform(.2, .5)
    cx, cy = rng.uniform(-2.2, 2.2), rng.uniform(-1.8, 1.8)
    if abs(cx) < 1.2 and abs(cy) < .9:
        cx += 2.0 * np.sign(cx or 1)
    ob, cl = slab(f'N{i}', [(cx - w, cy - h), (cx + w, cy - h), (cx + w, cy + h), (cx - w, cy + h)],
                  rich(['bone', 'g4', 'cream', 'g2', 'g5', 'bone', 'g3', 'cream', 'g2'][i], .4, .2))
    place(ob, cl, 1 + rng.uniform(-.35, .35))
    ob.rotation_euler = (BASIS @ Matrix.Rotation(rng.uniform(-.6, .6), 3, 'Y')).to_euler()


@on_pose
def pose(t):
    off = 40 * math.sin(math.pi * (t - 120) / LOOP) ** 2
    orbit_cam(c, TGT, DIST, EL, AZ + off)


go(sc, 'pair', '1,120', LOOP)
