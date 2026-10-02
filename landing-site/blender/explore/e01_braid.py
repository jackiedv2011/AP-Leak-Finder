"""E01 braid: three heavy strands plaited into a closed ring, flowing through each other.

Walk: vendors -> relationships -> cables -> braided rope -> a ring that never ends (circulation).
Shape: a thick plaited torus leaning on the ground; flattened, soft-square strands in three
materials, so every crossing is a material change. Motion: the plait travels around the ring,
the strands sliding along themselves while the ring stays put.

knobs: rep= (plait repeats around the ring)  R= (ring radius)  w=,h= (strand section)
       lean= (degrees)  mats=a,b,c  (see p3lib.mat)
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
REP = int(A.get('rep', 3))
R = float(A.get('R', 1.25))
AMP = float(A.get('amp', .52))
W, H = float(A.get('w', .6)), float(A.get('h', .47))
NP = 720
M = mats_arg('stone:bone,brushed:#b9b9b9,rubber:g6')
u = np.linspace(0, 2 * np.pi, NP, endpoint=False)
prof = superellipse(W, H, float(A.get('sq', 2.6)), 36)

strands = []
for k in range(3):
    ob, upd = sweep(f'Strand{k}', NP, prof, M[k % len(M)], closed=True)
    strands.append((ob, upd))

LEAN = math.radians(float(A.get('lean', 80)))
rig = bpy.data.objects.new('Rig', None)
bpy.context.scene.collection.objects.link(rig)
for ob, _ in strands:
    ob.parent = rig
rig.rotation_euler = (LEAN, 0, math.radians(float(A.get('spin', 0))))
rig.location = (0, 0, float(A.get('z', 1.95)))


@on_pose
def pose(t):
    ph = 2 * np.pi * t / LOOP          # one plait period per loop: seamless
    for k, (ob, upd) in enumerate(strands):
        a = REP * u - ph + 2 * np.pi * k / 3
        rad = R + AMP * np.sin(a)                   # in/out of the ring
        z = AMP * .55 * np.sin(2 * a)               # over/under
        P = np.c_[rad * np.cos(u), rad * np.sin(u), z]
        # strands lie flat to the ring plane where they cross, and bank as they climb
        twist = .35 * np.cos(2 * a)
        upd(P, twist=twist)


pose(0)
ground()
cam(sc, (0, 0, 1.75), 17.5, 13, -62, 100)
go(sc, 'braid', '1', LOOP)
