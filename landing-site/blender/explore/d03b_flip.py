"""D03b flip — a field of tiles turned over by a passing wave; a few are a different colour underneath.

Rows of thick tiles, quiet and alike. A wave runs across and every tile turns over
as it passes — most are the same underneath, a handful are not, and those stay up,
standing proud of the field once the wave has gone by. Behaviours: scanning every
single piece, surfacing, outliers showing by not matching.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
NX = NY = int(A.get('n', 13))
SP, TS, TH = .36, .31, .08
rng = np.random.default_rng(21)
N = NX * NY
gx, gy = np.meshgrid(np.arange(NX), np.arange(NY))
P0 = np.c_[(gx.ravel() - (NX - 1) / 2) * SP, (gy.ravel() - (NY - 1) / 2) * SP, np.zeros(N)]
# two-faced tile: top half material 0 (face A), bottom half material 1 (face B); pieces are two slabs
KEYS = ['bone', 'cream', 'g2', 'g3', 'g4', 'g5', 'orange', 'blue', 'pink', 'green']
import bmesh
def two_face(face_a, face_b):
    me = bpy.data.meshes.new('tile')
    bm = bmesh.new()
    for zc, mi in ((TH / 4, 0), (-TH / 4, 1)):
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']:
            v.co.x *= TS; v.co.y *= TS; v.co.z = v.co.z * TH / 2 + zc
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=.02, segments=2, affect='EDGES', profile=.5)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
        p.material_index = 0 if p.center.z > 0 else 1
    return me


# one mesh per (top, bottom) combo would multiply meshes; instead: one mesh, 2 slots, and a
# per-instance material *offset*: mi = 2*combo, top uses slot mi, bottom mi+1
combos = []
def combo(a, b):
    if (a, b) not in combos:
        combos.append((a, b))
    return combos.index((a, b))


# the field's visible face: value patches; the other face: same as the top, except outliers
patch = (np.sin(P0[:, 0] * 1.4 + .5) + np.sin(P0[:, 1] * 1.2 - P0[:, 0] * .7)) * .5 + rng.normal(0, .25, N)
TOP = np.array([['bone', 'cream', 'g2', 'g3', 'g4'][min(4, max(0, int((p + 1) * 2.3)))] for p in patch])
BOT = np.array(['g5'] * N, dtype=object)
OUT = rng.choice(N, 7, replace=False)
for i, o in enumerate(OUT):
    BOT[o] = ['orange', 'blue', 'pink', 'orange', 'blue', 'pink', 'orange'][i]
me = two_face(0, 1)
me.materials.clear()
CI = np.array([combo(TOP[i], BOT[i]) for i in range(N)])
for a, b in combos:
    me.materials.append(satin(a, .4, .2))
    me.materials.append(satin(b, .35, .3))
# instancer can only choose one base index per instance -> build per-combo meshes instead
ob_list = []
meshes = {}
for ci, (a, b) in enumerate(combos):
    m2 = two_face(0, 1)
    m2.materials.clear()
    m2.materials.append(rich(a, .4, .2))
    m2.materials.append(rich(b, .35, .3))
    for p in m2.polygons:
        p.material_index = 0 if p.center.z > 0 else 1
    meshes[ci] = m2
tiles = []
for i in range(N):
    o = bpy.data.objects.new(f'T{i}', meshes[CI[i]])
    sc.collection.objects.link(o)
    o.location = P0[i]
    tiles.append(o)
OUTS = set(OUT.tolist())


@on_pose
def pose(t):
    # wave front travels along +x+y from 20 to 130
    front = -3.6 + 7.4 * ramp(t, 18, 128)
    d = (P0[:, 0] + P0[:, 1] * .55) / 1.2
    for i, o in enumerate(tiles):
        k = np.clip((front - d[i]) / .9, 0, 1)
        k = k * k * (3 - 2 * k)
        lift = math.sin(math.pi * k) * .28
        if i in OUTS:
            # outliers keep their coloured face up and rise, then settle back face-down late
            stay = 1 - ramp(t, 196, 232)
            flip = k * stay
            o.location.z = lift + .38 * ramp(t, 120, 150) * stay
            o.rotation_euler.x = math.pi * flip
        else:
            # everyone else turns over and back (a full turn), so the field is unchanged
            o.location.z = lift
            o.rotation_euler.x = 2 * math.pi * k * (1 - ramp(t, 250, 260))
    return


cam(sc, (0, 0, 0), 19, 44, -64)
go(sc, 'flip', '1,70,160', LOOP)
