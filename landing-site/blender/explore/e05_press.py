"""E05 press: soft cushions squeezed between rigid plates; the pressure runs down the stack.

Walk: cash flow -> pressure / balance -> weight on a system -> a press and its give.
Shape: three hard plates (metal, stone) with two soft, inflated cushions between them.
The contrast is the point: machined edges against a body that bulges. Motion: the top
plate settles, the upper cushion gives, then the lower one, then everything springs back.

knobs: mats=plate,plate2,cushion1,cushion2  squeeze=0..1
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
M = mats_arg('brushed:#c7c7c7,stone:bone,glaze:green,glaze:#f1ece2')
SQ = float(A.get('squeeze', .42))
PW, PT = float(A.get('pw', 2.3)), float(A.get('pt', .14))
CW, CH = float(A.get('cw', 1.75)), float(A.get('ch', .72))
plates = [prism(f'Plate{i}', superellipse(PW, PW, 12, 64), PT, M[0 if i != 1 else 1], bev=.018) for i in range(3)]
cush = []
for j in range(2):
    ob, V0 = superellipsoid(f'Cushion{j}', (CW, CW, CH), n=float(A.get('cn', 3.2)), seg=96, mat=M[2 + j])
    cush.append((ob, V0))


def squash(V0, c):
    """c = 1 relaxed, < 1 pressed. Height scales by c; the waist bulges to keep volume."""
    V = V0.copy()
    zn = V0[:, 2] / (CH / 2)
    V[:, 2] *= c
    bulge = (1 / math.sqrt(c) - 1) * 1.25 * (1 - zn ** 2) + (1 / math.sqrt(c) - 1) * .35
    V[:, 0] *= 1 + bulge
    V[:, 1] *= 1 + bulge
    return V


def press(t, a, b, c_, d):
    """0 -> 1 -> 0 with a small overshoot on release (springs back past rest, settles)."""
    down = ramp(t, a, b)
    up = ramp(t, c_, d)
    over = .12 * math.sin(math.pi * min(1, max(0, (t - d) / 10))) if t > d else 0
    return down * (1 - up) - over


@on_pose
def pose(t):
    c1 = 1 - SQ * press(t, 6, 26, 50, 66)
    c2 = 1 - SQ * .8 * press(t, 14, 34, 56, 72)
    z = PT / 2
    plates[0].location.z = z
    z += PT / 2
    for (ob, V0), c in ((cush[1], c2), (cush[0], c1)):
        h = CH * c
        set_verts(ob, squash(V0, c))
        ob.location.z = z + h / 2 - .01
        z += h - .02
        idx = 1 if ob is cush[1][0] else 2
        plates[idx].location.z = z + PT / 2
        z += PT
    # the top plate rocks a hair as it bears down
    plates[2].rotation_euler.x = .03 * math.sin(math.pi * ramp(t, 6, 40))


pose(0)
ground()
cam(sc, (0, 0, .85), 18, 22, -58, 100)
go(sc, 'press', '1,30', LOOP)
