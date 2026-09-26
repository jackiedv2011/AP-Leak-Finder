"""D06 sync — two separate objects moving in sync give away an invisible link.

A field of columns, each rising and falling on its own slow rhythm, like a city
breathing. Two of them, far apart, move identically — same height at the same instant,
always. Nothing marks them; only the behaviour does. Then they are noticed: both light
orange (paid twice), a thread draws itself between their tops, and one of them sinks
back into the ground as the other turns green. Then everything fades back to ordinary
and the pair is breathing in step again. Behaviours: correlating unexpectedly,
connecting, resolving.

knobs: n=9 sp=.5 pal=stone|tint cam=... ground=1
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
NG = int(A.get('n', 9))
SP = float(A.get('sp', .5))
W = SP * .84
rng = np.random.default_rng(int(A.get('seed', 7)))
PALS = {
    'stone': ['bone', 'cream', 'g2', 'g3', 'g4', 'g5', 't_blue', 't_orange'],
    'tint': ['bone', 't_purple', 'g2', 't_blue', 'g4', 'g5', 'cream', 'purple'],
}
KEYS = PALS[A.get('pal', 'stone')]
pm = bevelled_mesh('col', (W, W, 1.0), .03, 2)
for k in KEYS:
    pm.materials.append(rich(k, .5, .15, var=.05))
gx, gy = np.meshgrid(np.arange(NG), np.arange(NG))
P = np.c_[(gx.ravel() - (NG - 1) / 2) * SP, (gy.ravel() - (NG - 1) / 2) * SP, np.zeros(N := NG * NG)]
patch = np.sin(P[:, 0] * .9 + .3) + np.cos(P[:, 1] * .8 - P[:, 0] * .4) + rng.normal(0, .5, N)
MI = np.clip(((patch + 2) / 4 * 6).astype(int), 0, 5)
MI[rng.random(N) < .12] = 6
MI[rng.random(N) < .06] = 7
TW = [1 * NG + 2, (NG - 2) * NG + (NG - 3)]        # the pair: far apart, both visible
F = rng.integers(1, 4, (N, 3))
PH = rng.uniform(0, 2 * math.pi, (N, 3))
AM = rng.uniform(.12, .38, (N, 3))
F[TW[1]], PH[TW[1]], AM[TW[1]] = F[TW[0]], PH[TW[0]], AM[TW[0]]
# give the pair a strong, clear rhythm (so the sync is visible)
F[TW[0]] = F[TW[1]] = [2, 1, 3]
AM[TW[0]] = AM[TW[1]] = [.55, .25, .1]
BASE = 1.05 + rng.uniform(-.25, .35, N)
BASE[TW[1]] = BASE[TW[0]] = 1.5
REST = [i for i in range(N) if i not in TW]
ground(0)
ob, upd = point_instancer('Cols', pm, len(REST))
twins = []
for j, i in enumerate(TW):
    m, mix, em = anim_mat(f'Twin{j}', KEYS[MI[i]], 'orange', 'satin', .45, 0)
    tb = box(f'Tw{j}', (W, W, 1.0), (P[i, 0], P[i, 1], .5), m, bev=.03)
    twins.append((tb, mix, em, m))
gm = twins[0][3].node_tree.nodes['Mix']
thread = tube('Thread', [(0, 0, 0)] * 48, .03, glow('orange', 3.0))


def heights(t):
    ph = 2 * math.pi * t / LOOP
    return BASE + (AM * np.sin(F * ph + PH)).sum(1)


@on_pose
def pose(t):
    h = heights(t)
    pos = P[REST].copy()
    pos[:, 2] = h[REST] / 2
    scl = np.ones((len(REST), 3))
    scl[:, 2] = h[REST]
    upd(pos, np.zeros((len(REST), 3)), scl, MI[REST])
    lit = pulse(t, 70, 90, 205, 232)
    sink = pulse(t, 140, 172, 208, 238)
    for j, (tb, mix, em, m) in enumerate(twins):
        hh = h[TW[j]]
        if j == 1:
            hh = hh * (1 - sink) + .12 * sink
        tb.location.z = hh / 2
        tb.scale.z = hh
        mix.default_value = lit
        em.default_value = .25 * lit
    # the survivor turns green while the other is down
    ins = {s.identifier: s for s in twins[0][3].node_tree.nodes['Mix'].inputs}
    ins['B_Color'].default_value = col('orange') if sink < .5 else col('green')
    a = Vector((P[TW[0], 0], P[TW[0], 1], h[TW[0]] + .02))
    b = Vector((P[TW[1], 0], P[TW[1], 1], (h[TW[1]] * (1 - sink) + .12 * sink) + .02))
    draw = ramp(t, 92, 128)
    fade = ramp(t, 145, 165)
    sp = thread.data.splines[0]
    n = len(sp.points)
    for i, p in enumerate(sp.points):
        u = i / (n - 1) * draw
        q = a.lerp(b, u) + Vector((0, 0, math.sin(math.pi * u) * 1.4))
        p.co = (q.x, q.y, q.z, 1)
    thread.data.bevel_depth = .03 * (1 - fade) if draw > .001 else 0.0
    thread.hide_render = draw < .001 or fade > .999


cam(sc, (0, 0, .7), 20, 36, -58)
go(sc, 'sync', '1,110,130,180', LOOP)
