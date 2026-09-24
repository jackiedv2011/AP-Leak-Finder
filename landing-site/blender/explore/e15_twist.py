"""E15 twist: a thick ring of triangular section, turned once along its length, faces rolling round.

Walk: money leaving and coming back -> circulation -> a loop where every face travels the
whole way round and comes back to where it started.
Shape: a heavy torus with a rounded-triangle section, twisted one full turn, standing
on edge; each face is its own material, so the twist draws three interleaved spirals.
Motion: the section rolls along the ring, so the faces flow round it like a belt.

knobs: R= ring radius  s= section size  tw= twists  mats=a,b,c  conc= face concavity
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
R = float(A.get('R', 1.35))
S = float(A.get('s', .78))
TW = float(A.get('tw', 1.0))
CONC = float(A.get('conc', .12))
M = mats_arg('stone:bone,rubber:g6,lacquer:green')
NP = 480


def tri_profile(size, k_side=24, conc=.1, round_=.28):
    """Rounded triangle; sides bowed in by conc. Returns points and the side index of each segment."""
    P, side = [], []
    corners = [np.array((math.cos(a), math.sin(a))) * size / math.sqrt(3) for a in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)]
    for i in range(3):
        a, b = corners[i], corners[(i + 1) % 3]
        mid = (a + b) / 2
        inward = -mid / np.linalg.norm(mid)
        for j in range(k_side):
            u = j / k_side
            p = a * (1 - u) + b * u + inward * conc * size * 4 * u * (1 - u)
            P.append(p)
            side.append(i)
    P = np.array(P)
    # round the corners: a few passes of neighbour averaging, weighted to the corners
    for _ in range(int(round_ * 20)):
        P = .5 * P + .25 * (np.roll(P, 1, 0) + np.roll(P, -1, 0))
    return P, np.array(side)


prof, side = tri_profile(S, conc=CONC)
ob, upd = sweep('Twist', NP, prof, [M[0], M[1], M[2]], closed=True, seg_mi=side)
u = np.linspace(0, 2 * np.pi, NP, endpoint=False)
ob.rotation_euler = (math.radians(float(A.get('lean', 84))), 0, math.radians(float(A.get('rz', 24))))
ob.location = (0, 0, R + S * .62)


@on_pose
def pose(t):
    ph = 2 * math.pi / 3 * t / LOOP
    P = np.c_[R * np.cos(u), R * np.sin(u), np.zeros(NP)]
    upd(P, twist=TW * u + ph, up=(0, 0, 1))


pose(0)
ground()
cam(sc, (0, 0, R + .5), 18, 14, -62, 100)
go(sc, 'twist', '1,45', LOOP)
