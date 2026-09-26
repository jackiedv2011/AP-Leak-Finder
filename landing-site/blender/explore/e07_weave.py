"""E07 weave: a woven vessel of flat bands with a slow wave travelling up through it.

Walk: vendors, payments, people -> relationships -> a fabric -> a woven vessel.
Shape: an open cylinder woven from wide flat bands, vertical warps over-and-under
horizontal hoops, with open cells between so light passes through. Motion: a peristaltic
wave rises through the weave, the vessel swelling and narrowing as if something moves
through it (circulation), while the weave holds.

knobs: nw= warps (even)  nh= hoops  R=  H=  amp= wave  mats=warp,hoop,accent
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
NW = int(A.get('nw', 16))
NH = int(A.get('nh', 9))
R = float(A.get('R', 1.15))
H = float(A.get('H', 2.9))
AMP = float(A.get('amp', .16))
D = float(A.get('d', .045))            # over/under offset
M = mats_arg('stone:bone,rubber:g6,lacquer:green')
sz = H / NH
BWW = float(A.get('bw', .62)) * (2 * math.pi * R / NW)
BWH = float(A.get('bh', .62)) * sz
TH = float(A.get('th', .035))
NPW, NPH = 160, 240
zs = (np.arange(NH) + .5) * sz
phis = 2 * np.pi * np.arange(NW) / NW
ACC_W = int(A.get('accw', 3))           # one green warp


def radius(z, t, phi=0.0):
    return R + AMP * np.sin(2 * np.pi * (z / H * 1.0) - 2 * np.pi * t / LOOP) * np.clip(np.sin(np.pi * z / H) * 1.6, 0, 1) \
        + .08 * np.cos(2 * phi)


warps, hoops = [], []
for i, phi in enumerate(phis):
    ob, upd = sweep(f'Warp{i}', NPW, superellipse(TH, BWW, 8, 20), M[2] if i == ACC_W else M[0], closed=False)
    warps.append((ob, upd, phi, i))
for j, z in enumerate(zs):
    ob, upd = sweep(f'Hoop{j}', NPH, superellipse(TH, BWH, 8, 20), M[1], closed=True)
    hoops.append((ob, upd, z, j))


@on_pose
def pose(t):
    zw = np.linspace(0, H, NPW)
    for ob, upd, phi, i in warps:
        r = radius(zw, t, phi) + D * np.cos(np.pi * (zw / sz - .5) + np.pi * i)
        P = np.c_[r * np.cos(phi), r * np.sin(phi), zw]
        upd(P, up=(-math.sin(phi), math.cos(phi), 0))
    a = np.linspace(0, 2 * np.pi, NPH, endpoint=False)
    for ob, upd, z, j in hoops:
        r = radius(np.full(NPH, z), t, a) - D * np.cos(np.pi * (a / (2 * np.pi / NW)) + np.pi * j)
        P = np.c_[r * np.cos(a), r * np.sin(a), np.full(NPH, z)]
        upd(P, up=(0, 0, 1))


pose(0)
ground()
cam(sc, (0, 0, H * .46), 19, 18, -62, 100)
go(sc, 'weave', '1,45', LOOP)
