"""D06b kinetic — a kinetic wall of turning panels; two far apart turn in perfect step.

A facade of panels, each pivoting on its own slow rhythm, catching the light and showing
its coloured back as it turns — a surface that never sits still. Two panels, nowhere
near each other, turn identically. Once noticed they light orange (paid twice), a thread
draws between them, and one stops dead, flat and quiet, while the other turns green.
Then they fade back into the crowd, turning in step again.
Behaviours: correlating unexpectedly, connecting, resolving; a business as a living surface.

knobs: nx=12 nz=8 back=tint|sat cam el/az ground=1
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np
import bmesh

LOOP = 240
sc = scene(LOOP)
NX, NZ = int(A.get('nx', 12)), int(A.get('nz', 8))
PW, PH, PT, GAP = .34, .44, .05, .06
rng = np.random.default_rng(int(A.get('seed', 3)))
FRONT = ['bone', 'cream', 'g2', 'g3', 'g4', 'g5']
BACKS = {'tint': ['t_blue', 't_purple', 't_orange', 'purple', 'blue', 't_pink'],
         'sat': ['blue', 'purple', 'orange', 'pink', 't_blue', 't_purple']}[A.get('back', 'tint')]
KEYS = FRONT + BACKS


def panel_mesh():
    me = box_mesh('panel', (PW, PT, PH))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=.012, segments=2, affect='EDGES', profile=.5)
    bm.to_mesh(me)
    bm.free()
    at = me.attributes.new('side', 'FLOAT', 'FACE')
    for p in me.polygons:
        at.data[p.index].value = 1.0 if p.center.y > .001 else 0.0
        p.use_smooth = True
    return me


pm = panel_mesh()
for k in KEYS:
    pm.materials.append(rich(k, .38, .3, var=.05))
gx, gz = np.meshgrid(np.arange(NX), np.arange(NZ))
N = NX * NZ
P = np.c_[(gx.ravel() - (NX - 1) / 2) * (PW + GAP), np.zeros(N), gz.ravel() * (PH + GAP) + PH / 2 + .03]
patch = np.sin(P[:, 0] * 1.1) + np.cos(P[:, 2] * 1.3 + P[:, 0] * .5) + rng.normal(0, .6, N)
MI = np.clip(((patch + 2.2) / 4.4 * 6).astype(int), 0, 5)
MB = 6 + rng.integers(0, 6, N)
TURN = rng.choice([0, 0, 1, -1], N)
F = rng.integers(1, 4, (N, 2))
PHs = rng.uniform(0, 2 * math.pi, (N, 2))
AMP = rng.uniform(.2, .9, (N, 2))
TW = [2 * NX + 1, 6 * NX + (NX - 3)]
for i in TW:
    TURN[i] = 1
    F[i] = [2, 3]
    PHs[i] = [.3, 1.9]
    AMP[i] = [.5, .25]
REST = [i for i in range(N) if i not in TW]
ground(0)
ob, upd = point_instancer('Wall', pm, len(REST), two_sided=True)
twins = []
for j, i in enumerate(TW):
    m, mix, em = anim_mat(f'Twin{j}', 'bone', 'orange', 'satin', .4, 0)
    tb = box(f'Tw{j}', (PW, PT, PH), tuple(P[i]), m, bev=.012, seg=2)
    twins.append((tb, mix, em, m))
thread = tube('Thread', [(0, 0, 0)] * 48, .022, glow('orange', 3.0))


def angles(t):
    ph = 2 * math.pi * t / LOOP
    return TURN * ph + (AMP * np.sin(F * ph + PHs)).sum(1)


@on_pose
def pose(t):
    th = angles(t)
    rot = np.zeros((len(REST), 3))
    rot[:, 2] = th[REST]
    upd(P[REST], rot, np.ones((len(REST), 3)), MI[REST], MB[REST])
    lit = pulse(t, 70, 90, 205, 232)
    stop = pulse(t, 140, 165, 205, 236)
    for j, (tb, mix, em, m) in enumerate(twins):
        a = th[TW[j]]
        if j == 1:
            # ease to flat (nearest multiple of pi) while stopped
            flat = round(a / math.pi) * math.pi
            a = a * (1 - stop) + flat * stop
        tb.rotation_euler.z = a
        mix.default_value = lit
        em.default_value = .3 * lit
    ins = {s.identifier: s for s in twins[0][3].node_tree.nodes['Mix'].inputs}
    ins['B_Color'].default_value = col('orange') if stop < .5 else col('green')
    a3 = Vector(P[TW[0]]) + Vector((0, -.05, PH / 2))
    b3 = Vector(P[TW[1]]) + Vector((0, -.05, PH / 2))
    draw = ramp(t, 92, 128)
    fade = ramp(t, 150, 170)
    sp = thread.data.splines[0]
    n = len(sp.points)
    for i, p in enumerate(sp.points):
        u = i / (n - 1) * draw
        q = a3.lerp(b3, u) + Vector((0, -math.sin(math.pi * u) * 1.1, math.sin(math.pi * u) * .3))
        p.co = (q.x, q.y, q.z, 1)
    thread.data.bevel_depth = .022 * (1 - fade) if draw > .001 else 0.0
    thread.hide_render = draw < .001 or fade > .999


cam(sc, (0, 0, NZ * (PH + GAP) / 2), 21, 12, -72)
go(sc, 'kinetic', '1,110,160', LOOP)
