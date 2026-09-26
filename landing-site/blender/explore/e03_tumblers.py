"""E03 tumblers: nested open rings, like the dial of a vault turned inside out into a sphere.

Walk: bank -> vault door -> combination tumblers -> an armillary sphere of open bands.
Shape: five concentric bands, each a C with a gap, standing in different vertical planes
so together they make an open sphere; empty centre (negative space, no core). Motion:
each band spins inside its own plane at its own speed, so the gaps wander around the
sphere, then they all land together at the top and the crown of the sphere opens.

knobs: nr= rings  gap= degrees  bw=,bt= band width/thickness  mats=a,b,c,...
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *
from mathutils import Matrix

LOOP = 90
sc = scene(LOOP)
NR = int(A.get('nr', 6))
GAP = math.radians(float(A.get('gap', 56)))
BW, BT = float(A.get('bw', .42)), float(A.get('bt', .11))
M = mats_arg('stone:bone,rubber:g6,brushed:#c4c4c4,lacquer:green,stone:bone,rubber:g6')
R0 = float(A.get('R', 1.6))
Z0 = float(A.get('z', 1.95))
NP = 220
TURNS = [1, -2, 1, -1, 2, -1, 1][:NR]

rings = []
for i in range(NR):
    r = R0 * (1 - .145 * i)
    # the band: an arc in the local XZ plane, gap centred on local +Z
    a = np.linspace(GAP / 2, 2 * np.pi - GAP / 2, NP)
    P = np.c_[r * np.sin(a), np.zeros(NP), r * np.cos(a)]
    prof = superellipse(BT, BW, 6, 28)       # thin radially, wide across the plane
    ob, upd = sweep(f'Ring{i}', NP, prof, M[i % len(M)], closed=False)
    upd(P, up=(0, 1, 0))
    ob.location = (0, 0, Z0)
    rings.append((ob, math.radians(180 / NR * i + 12)))


@on_pose
def pose(t):
    e = ramp(t, 4, LOOP - 14)               # every band lands back at the top together
    for i, (ob, psi) in enumerate(rings):
        spin = 2 * math.pi * TURNS[i] * e
        ob.matrix_world = Matrix.Translation((0, 0, Z0)) @ Matrix.Rotation(psi, 4, 'Z') @ Matrix.Rotation(spin, 4, 'Y')


pose(0)
ground()
cam(sc, (0, 0, Z0 - .1), 18, 16, -64, 100)
go(sc, 'tumblers', '1,40', LOOP)
