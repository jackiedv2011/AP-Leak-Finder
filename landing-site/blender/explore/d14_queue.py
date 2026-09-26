"""D14 queue — a steady flow jams on one crooked part, piles up, and is released.

A closed track carries an even stream of pieces round and round. One small part sits
crooked across it: everything behind piles up. The part is found and straightened; the
pile releases in a rush, and the pieces that were held turn green as they go through —
the money that was stuck, moving again. Behaviours: flow, getting stuck, accumulating,
freeing, returning.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
RS, LS = 1.15, 2.4            # stadium: semicircle radius, straight length
PER = 2 * LS + 2 * math.pi * RS
NP = int(A.get('np', 44))
SPC = PER / NP
V = PER / LOOP               # one lap per loop, so every piece is back where it started
GAP = .2
SB = .35 * LS                 # the block sits on the front straight, right of centre


def path(s):
    """point + tangent at arc length s (mod PER). Front straight y=-RS runs +x."""
    s = s % PER
    if s < LS:
        return Vector((-LS / 2 + s, -RS, 0)), Vector((1, 0, 0))
    s -= LS
    if s < math.pi * RS:
        a = -math.pi / 2 + s / RS
        return Vector((LS / 2 + RS * math.cos(a), RS * math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
    s -= math.pi * RS
    if s < LS:
        return Vector((LS / 2 - s, RS, 0)), Vector((-1, 0, 0))
    s -= LS
    a = math.pi / 2 + s / RS
    return Vector((-LS / 2 + RS * math.cos(a), RS * math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))


# the track: a flat band with low walls, swept along the path
prof = [(-.2, 0), (-.2, .07), (-.16, .07), (-.16, .015), (.16, .015), (.16, .07), (.2, .07), (.2, 0)]
M = 220
verts, faces = [], []
for i in range(M):
    p, tg = path(PER * i / M)
    nrm = Vector((-tg.y, tg.x, 0))
    for (u, h) in prof:
        q = p + nrm * u
        verts.append((q.x, q.y, h - .07))
K2 = len(prof)
for i in range(M):
    for j in range(K2 - 1):
        a, b = i * K2 + j, ((i + 1) % M) * K2 + j
        faces.append((a, b, b + 1, a + 1))
trk = mesh_obj('Track', verts, faces, clay('g5', .55))
# plinth under it
box('Plinth', (LS + 2 * RS + .9, 2 * RS + .9, .18), (0, 0, -.16), clay('bone', .7), bev=.03)

KEYS = ['bone', 'cream', 'g2', 'g3', 'g4', 't_blue', 't_purple', 'green']
pm = bevelled_mesh('puck', (.2, .13, .09), .03, 2)
for k in KEYS:
    pm.materials.append(satin(k, .4, .25))
rng = np.random.default_rng(2)
MI0 = rng.choice(7, NP, p=[.24, .22, .16, .12, .08, .1, .08])
S0 = np.arange(NP) * SPC
TJ0, TJ1 = 16, 122
VF = V * 3.2
SBU = SB + PER * 0     # block position; find each pellet's next crossing after TJ0
cross = []
for i in range(NP):
    e0 = S0[i] + V * TJ0
    nxt = SB + PER * math.ceil((e0 - SB) / PER)
    c = TJ0 + (nxt - e0) / V
    cross.append((c, i, nxt))
queued = sorted([x for x in cross if x[0] < TJ1])
HOLD = {}
for q, (c, i, nxt) in enumerate(queued):
    HOLD[i] = nxt - GAP - q * .21
ob, upd = point_instancer('Pucks', pm, NP)
blk = box('Block', (.44, .09, .2), (0, 0, 0), satin('orange', .3, .4), bev=.02)
P_B, T_B = path(SB)


@on_pose
def pose(t):
    pos = np.zeros((NP, 3))
    rot = np.zeros((NP, 3))
    mi = MI0.copy()
    for i in range(NP):
        e = S0[i] + V * t
        a = e
        if i in HOLD:
            h = HOLD[i]
            if t >= TJ0:
                a = min(e, h + max(0.0, t - TJ1) * VF)
            # held ones go green once they pass the block after the release, fade back later
            if t > TJ1 and a > h + GAP:
                mi[i] = 7 if t < 215 else MI0[i]
        p, tg = path(a)
        pos[i] = (p.x, p.y, .045 - .07 + .015)
        rot[i, 2] = math.atan2(tg.y, tg.x)
    upd(pos, rot, np.ones((NP, 3)), mi)
    crook = ramp(t, 2, 14) * (1 - ramp(t, 108, 122))
    blk.location = P_B + Vector((0, -.45 * (1 - crook), .06 + .05 * (1 - crook)))
    blk.rotation_euler = (0, 0, math.atan2(T_B.y, T_B.x) + math.pi / 2 * crook * .75 + (1 - crook) * 0)
    blk.scale = (1, 1, 1)


cam(sc, (0, 0, 0), 18, 40, -62)
go(sc, 'queue', '1,100,150', LOOP)
