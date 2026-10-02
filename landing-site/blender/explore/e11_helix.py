"""E11 helix: two ramps wound around one axis that never meet, a double-helix stair.

Walk: money out, money back -> circulation -> the double-helix stair (two routes sharing
one tower without crossing).
Shape: two wide ramps, one bone and one dark, spiralling round an open core; you see
through the gaps of one turn to the other ramp. Motion: the helix breathes like a
spring, the turns opening and closing, with a slow partial turn.

knobs: turns=  R=  pitch=  mats=a,b,column
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
TURNS = float(A.get('turns', 2.2))
R = float(A.get('R', 1.0))
PITCH = float(A.get('pitch', 1.3))
RW = float(A.get('rw', .95))
M = mats_arg('stone:bone,rubber:g6,brushed:#c3c3c3')
NP = 420
prof = superellipse(RW, float(A.get('rt', .1)), 8, 32)
ramps = []
for k in range(2):
    ob, upd = sweep(f'Ramp{k}', NP, prof, M[k], closed=False)
    ramps.append((ob, upd, k))
if A.get('column', '1') == '1':
    cyl('Core', .09, PITCH * TURNS + .6, (0, 0, (PITCH * TURNS + .6) / 2), M[2], n=40)


@on_pose
def pose(t):
    ph = 2 * math.pi * t / LOOP
    p = PITCH * (1 + .22 * math.sin(ph))
    rot = .35 * math.sin(ph - .6)
    s = np.linspace(0, 1, NP)
    for ob, upd, k in ramps:
        a = 2 * np.pi * TURNS * s + np.pi * k + rot
        z = .1 + p * TURNS * s
        P = np.c_[R * np.cos(a), R * np.sin(a), z]
        upd(P, flat=True)


pose(0)
ground()
cam(sc, (0, 0, 1.45), 21, 16, -60, 100)
go(sc, 'helix', '1,45', LOOP)
