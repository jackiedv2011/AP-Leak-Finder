"""E10 portals: a procession of arches that fans into a spiral and closes into one tunnel.

Walk: banks -> halls -> thresholds you pass through -> a sequence of portals.
Shape: seven thick arch frames of falling size, set one behind the other. Twisted, they
are a spiral of silhouettes; aligned, they collapse into a single deep nested frame with
a clear view down the middle. Motion: the twist unwinds into the tunnel and winds again.

knobs: n= arches  twist= degrees  mats=main,alt,accent
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *
from mathutils import Matrix

LOOP = 90
sc = scene(LOOP)
N = int(A.get('n', 7))
TW = math.radians(float(A.get('twist', 16)))
M = mats_arg('stone:bone,rubber:g6,lacquer:green')
SP = float(A.get('sp', .42))
arches = []
for k in range(N):
    s = 1 - .085 * k
    r, hl = 1.05 * s, 1.35 * s
    NP = 200
    u = np.linspace(0, 1, NP)
    # legs + half circle as one path, arc length split
    Lleg, Larc = hl, math.pi * r
    tot = 2 * Lleg + Larc
    P = []
    for q in u:
        d = q * tot
        if d < Lleg:
            P.append((-r, 0, d))
        elif d < Lleg + Larc:
            a = math.pi - (d - Lleg) / r
            P.append((r * math.cos(a), 0, hl + r * math.sin(a)))
        else:
            P.append((r, 0, hl - (d - Lleg - Larc)))
    P = np.array(P)
    prof = superellipse(.22 * s + .06, .34, 8, 28)
    mi = 2 if k == N - 1 else (1 if k % 2 else 0)
    ob, upd = sweep(f'Arch{k}', NP, prof, M[mi], closed=False)
    upd(P, up=(0, 1, 0))
    arches.append((ob, k, r, hl))
Y0 = -(N - 1) * SP / 2


@on_pose
def pose(t):
    w = .5 - .5 * math.cos(2 * math.pi * t / LOOP)      # 0 aligned at the ends, 1 wound at mid-loop
    w = 1 - w
    for ob, k, r, hl in arches:
        ang = TW * k * w
        zc = hl * .6
        Rm = Matrix.Rotation(ang, 4, "Y") @ Matrix.Rotation(ang * .6, 4, "Z")
        feet = [(Rm @ Vector((sx * r, 0, -zc))).z + zc for sx in (-1, 1)]
        lift = -min(feet)
        ob.matrix_world = Matrix.Translation((0, Y0 + k * SP, zc + lift)) @ Rm @ Matrix.Translation((0, 0, -zc))


pose(0)
ground()
cam(sc, (0, 0, 1.25), 20, 12, float(A.get('az', -72)), 100)
go(sc, 'portals', '1,45', LOOP)
