"""D17 surface — something buried deep in a heap works its way up to the top.

A soft mound of hundreds of pebbles, all the ordinary colours of a business. Deep
inside, one is green. The heap stirs, pebbles roll aside, and the green one rises
through them until it sits on the very top. Behaviours: buried, surfacing, getting found.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
rng = np.random.default_rng(31)
KEYS = ['bone', 'cream', 'g2', 'g3', 'g4', 'g5', 't_orange', 't_blue', 'green']
# pebble: a squashed sphere
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1)
peb = bpy.context.active_object
pm = peb.data
for v in pm.vertices:
    v.co.z *= .62
    v.co.x *= 1.12
for p in pm.polygons:
    p.use_smooth = True
bpy.data.objects.remove(peb)
for k in KEYS:
    pm.materials.append(clay(k, .5, .4))

# pack a mound by rejection: pebbles of radius r placed on a dome, several shells
pts, rad = [], []
RM = 2.0
for shell in range(9):
    for _ in range(4000):
        if len(pts) > 520:
            break
        r = rng.uniform(.13, .24)
        a = rng.uniform(0, 2 * math.pi)
        u = math.sqrt(rng.uniform(0, 1)) * RM
        h = 1.25 * (1 - (u / RM) ** 2) ** .9
        z = max(0.0, h - shell * .14) * rng.uniform(.2, 1.0) if shell else h
        p = np.array([u * math.cos(a), u * math.sin(a), z + r * .6])
        if all(np.linalg.norm(p - q) > (r + s) * .92 for q, s in zip(pts[-160:], rad[-160:])):
            pts.append(p)
            rad.append(r)
P = np.array(pts)
R = np.array(rad)
N = len(P)
MI = rng.choice(8, N, p=[.22, .2, .16, .13, .1, .07, .06, .06])
# the buried one: near the base, off centre toward camera
G = int(np.argmin(np.linalg.norm(P - np.array([.3, -.4, .15]), axis=1)))
MI[G] = 8
R[G] = .22
TOPP = np.array([0, 0, 1.25 + .3])
ROT = rng.uniform(0, 2 * math.pi, (N, 3)) * np.array([.2, .2, 1])
ob, upd = point_instancer('Heap', pm, N)
print('NOTE pebbles', N)


@on_pose
def pose(t):
    k = ramp(t, 40, 170) * (1 - ramp(t, 205, 238))
    g = P[G] * (1 - k) + TOPP * k
    g[2] += .35 * math.sin(math.pi * k) * 0
    pos = P.copy()
    # neighbours make way: push radially away from the rising pebble, then settle back
    d = pos - g
    dist = np.linalg.norm(d, axis=1) + 1e-6
    push = np.clip(1 - dist / .75, 0, 1) ** 2 * .28 * math.sin(math.pi * min(1, k * 1.15))
    pos += d / dist[:, None] * push[:, None]
    pos[G] = g
    rot = ROT.copy()
    rot[G] = ROT[G] + np.array([0, 0, 2.5 * k])
    scl = np.repeat(R[:, None], 3, 1)
    upd(pos, rot, scl, MI)


cam(sc, (0, 0, .75), 17, 22, -70)
go(sc, 'surface', '1,110,180', LOOP)
