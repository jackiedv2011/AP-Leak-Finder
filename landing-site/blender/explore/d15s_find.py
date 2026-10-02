"""D15 system sketch — Find in the align language.

A dense cloud of neutral pieces. From the key angle, only three coloured pieces (orange,
blue, pink: paid twice, paid too much, paid to the wrong place) line up into one neat
row — a short list of findings, not a long list of maybes. Everything else stays noise.
Cheap sketch for the board: frame 1 off-angle, frame 120 on the key angle.
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
rng = np.random.default_rng(11)
pm = bevelled_mesh('chip', (.26, .26, .08), .02, 2)
NEU = ['bone', 'cream', 'g2', 'g3', 'g4', 'g5']
for k in NEU:
    pm.materials.append(rich(k, .42, .2))
N = 170
pos = np.array([tuple(TGT + right * rng.uniform(-2.6, 2.6) + up * rng.uniform(-2.2, 2.2) + fwd * rng.uniform(-3.5, 3.5)) for _ in range(N)])
rot = rng.uniform(-math.pi, math.pi, (N, 3))
ob, upd = point_instancer('Cloud', pm, N)
upd(pos, rot, np.ones((N, 3)), rng.integers(0, 6, N))
for i, (k, x) in enumerate([('orange', -1.0), ('blue', 0), ('pink', 1.0)]):
    s = 1 + [-.3, .25, -.1][i]
    q = TGT + right * x + up * -.1
    f = box(f'F{k}', (.62, .62, .16), (0, 0, 0), rich(k, .34, .3), bev=.04)
    f.rotation_euler = BASIS.to_euler()
    f.location = C0 + s * (q - C0)
    f.scale = (s, s, s)


@on_pose
def pose(t):
    off = 40 * math.sin(math.pi * (t - 120) / LOOP) ** 2
    orbit_cam(c, TGT, DIST, EL, AZ + off)


go(sc, 'find', '1,120', LOOP)
