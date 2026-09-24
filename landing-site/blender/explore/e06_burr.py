"""E06 burr: six bars interlocked through one another, a joint that holds itself together.

Walk: parties to a payment -> each depends on the others -> joinery -> a six-piece burr.
Shape: a three-axis star of thick bars in different materials, locked at the centre.
Motion: the bars slide out along their own length one after another, the knot loosens
and opens into a larger star, then they slide home and the joint closes.

knobs: L= bar length  s= bar section  slide= slide distance  mats=6 specs
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *
from mathutils import Euler

LOOP = 90
sc = scene(LOOP)
L = float(A.get('L', 3.0))
S = float(A.get('s', .5))
OUT = float(A.get('slide', .9))
M = mats_arg('stone:bone,brushed:#c3c3c3,rubber:g6,stone:bone,lacquer:green,brushed:#c3c3c3')
u = S / 2
Z0 = float(A.get('z', 1.9))
# (axis, offset vector, slide sign, start frame)
BARS = [
    ('X', (0, u, 0), 1, 4), ('X', (0, -u, 0), -1, 10),
    ('Y', (0, 0, u), 1, 16), ('Y', (0, 0, -u), -1, 22),
    ('Z', (u, 0, 0), 1, 28), ('Z', (-u, 0, 0), -1, 34),
]
AX = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}
rig = bpy.data.objects.new('Rig', None)
bpy.context.scene.collection.objects.link(rig)
rig.location = (0, 0, Z0)
rig.rotation_euler = Euler((math.radians(float(A.get('rx', 35))), math.radians(float(A.get('ry', -20))), math.radians(float(A.get('rz', 15)))))
bars = []
for i, (ax, off, sg, st) in enumerate(BARS):
    size = {'X': (L, S, S), 'Y': (S, L, S), 'Z': (S, S, L)}[ax]
    ob = box(f'Bar{i}', size, off, M[i % len(M)], bev=.035, seg=4)
    ob.parent = rig
    bars.append((ob, Vector(off), AX[ax] * sg, st))


@on_pose
def pose(t):
    for ob, off, d, st in bars:
        k = ramp(t, st, st + 18) * (1 - ramp(t, 54 + st * .5, 72 + st * .5))
        ob.location = off + d * OUT * k
    rig.rotation_euler.z = math.radians(float(A.get('rz', 15))) + .25 * math.sin(2 * math.pi * t / LOOP)


pose(0)
ground()
cam(sc, (0, 0, Z0 - .1), 20, 22, -62, 100)
go(sc, 'burr', '1,45', LOOP)
