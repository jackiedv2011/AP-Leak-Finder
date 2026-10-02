"""E08 fins: a crown of tall two-faced blades that turn in a wave, opening and closing the drum.

Walk: buildings -> facades -> louvres -> many parts moving in concert.
Shape: forty blades on a circle with a rising-and-falling crown line; one face bone,
the other colour. Closed, it is a solid drum; open, it is a cage you can see through.
Motion: a wave of turning runs around the ring, so an opening travels round and the
colour of the back faces flickers across the front.

knobs: n= blades  R=  mats=front,back,base
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
N = int(A.get('n', 64))
R = float(A.get('R', 1.35))
M = mats_arg('stone:bone,rubber:g5,lacquer:green')
FW = 2 * math.pi * R / N * float(A.get('fw', 1.02))
FT = float(A.get('ft', .026))
blades = []
for i in range(N):
    phi = 2 * math.pi * i / N
    h = 1.35 + 1.1 * (.5 + .5 * math.cos(phi + .9)) ** 1.6
    piv = bpy.data.objects.new(f'Piv{i}', None)
    bpy.context.scene.collection.objects.link(piv)
    piv.location = (R * math.cos(phi), R * math.sin(phi), 0)
    # two plates back to back: front faces out (bone), back faces in (colour)
    front = M[2] if i % 16 == 5 else M[0]
    for k, (m, off) in enumerate(((front, FT / 2), (M[1], -FT / 2))):
        ob = box(f'B{i}_{k}', (FT, FW, h), (off, 0, h / 2 + .03), m, bev=.006, seg=2)
        ob.parent = piv
    blades.append((piv, phi))
if A.get('base', '0') == '1':
    ring_prof = superellipse(.34, .06, 8, 24)
    a = np.linspace(0, 2 * np.pi, 200, endpoint=False)
    ob, upd = sweep('Base', 200, ring_prof, M[2], closed=True)
    upd(np.c_[R * np.cos(a), R * np.sin(a), np.full(200, .03)])


@on_pose
def pose(t):
    ph = 2 * math.pi * t / LOOP
    for piv, phi in blades:
        w = .5 + .5 * math.sin(phi * 2 - ph)
        w = w ** 2.2
        piv.rotation_euler.z = phi + math.radians(88) * w


pose(0)
ground()
cam(sc, (0, 0, 1.15), 19, 22, -62, 100)
go(sc, 'fins', '1,30', LOOP)
