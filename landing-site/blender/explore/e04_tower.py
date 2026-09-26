"""E04 tower: stacked floor plates that twist through each other like a spine.

Walk: businesses -> buildings -> a stack of floors -> accumulation over time.
Shape: sixteen thick rounded slabs of different sizes, stacked with shadow gaps, so the
stack reads as architecture (cantilevers, overhangs), not as a pile of paper. A wave of
rotation runs up through the floors and the silhouette winds and unwinds.

knobs: n= floors  amp= twist degrees  mats=main,dark,accent
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
N = int(A.get('n', 16))
AMP = math.radians(float(A.get('amp', 38)))
M = mats_arg('stone:bone,rubber:g6,lacquer:green,stone:#d8d2c6')
TH, GP = float(A.get('th', .13)), float(A.get('gp', .05))
rng = np.random.default_rng(int(A.get('seed', 3)))
slabs = []
z = TH / 2
for i in range(N):
    w = rng.uniform(1.5, 2.5)
    d = rng.uniform(.62, .95)
    if i % 5 == 3:
        mi = 1
    elif i == N - 4:
        mi = 2
    else:
        mi = 0 if i % 2 == 0 else 3
    plan = superellipse(w, d, float(A.get('sq', 5)), 64)
    ob = prism(f'Floor{i}', plan, TH, M[mi], bev=.02, loc=(0, 0, z))
    slabs.append((ob, rng.uniform(-.25, .25), rng.uniform(-.12, .12)))
    z += TH + GP
H = z


@on_pose
def pose(t):
    ph = 2 * math.pi * t / LOOP
    for i, (ob, off, dx) in enumerate(slabs):
        f = i / (N - 1)
        ob.rotation_euler.z = off + AMP * math.sin(ph - f * 2.4) * (.35 + .65 * f)
        ob.location.x = dx * math.cos(ph - f * 2.4)


pose(0)
ground()
cam(sc, (0, 0, H * .47), 20, 16, -60, 100)
go(sc, 'tower', '1,30', LOOP)
