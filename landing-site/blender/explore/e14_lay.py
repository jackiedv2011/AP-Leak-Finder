"""E14 lay: a heavy cable of seven strands, laid tight at the waist and splayed at both ends.

Walk: payments -> rails -> cables -> the lay of a rope (many strands carrying one load).
Shape: thick strands twisted into one bundle that opens into two fans; a bow-tie
silhouette with deep grooves where the strands press together. Motion: the lay tightens
and relaxes, the twist running along the bundle and the fans breathing open and shut.

knobs: ns=7|..  L= half length  r= strand radius  mats=main,alt,accent
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
L = float(A.get('L', 2.3))
RS = float(A.get('r', .15))
M = mats_arg('stone:bone,rubber:g6,lacquer:green')
NP = 300
x = np.linspace(-L, L, NP)
# strand slots: centre + a ring of six
slots = [(0.0, 0.0)] + [(2 * RS * 1.02, 2 * math.pi * k / 6) for k in range(6)]
kinds = [1, 0, 0, 2, 0, 1, 0]
strands = []
for i, (rr, a0) in enumerate(slots):
    ob, upd = sweep(f'Lay{i}', NP, circle(RS, 28), M[kinds[i]], closed=False)
    strands.append((ob, upd, rr, a0, i))
rig = bpy.data.objects.new('Rig', None)
bpy.context.scene.collection.objects.link(rig)
for ob, *_ in strands:
    ob.parent = rig
rig.location = (0, 0, float(A.get('z', 1.2)))
rig.rotation_euler = (math.radians(float(A.get('rx', 0))), math.radians(float(A.get('ry', -14))), math.radians(float(A.get('rz', 30))))


@on_pose
def pose(t):
    ph = 2 * math.pi * t / LOOP
    tight = .55 + .45 * (.5 - .5 * math.cos(ph))          # 0.55 loose .. 1 tight
    s = x / L
    flare = 1 + 2.6 * np.abs(s) ** 2.4 * (1.25 - .45 * tight)
    twist = 2.4 * tight * np.sin(s * np.pi / 2) * 2.2 + .6 * math.sin(ph)
    for ob, upd, rr, a0, i in strands:
        if rr == 0:
            P = np.c_[x, np.zeros(NP), np.zeros(NP)]
            # the core strand bends a little so it is not a rod
            P[:, 2] += .05 * np.sin(s * np.pi)
        else:
            a = a0 + twist
            rad = rr * flare
            P = np.c_[x, rad * np.cos(a), rad * np.sin(a)]
        upd(P, up=(0, 0, 1))


pose(0)
ground()
cam(sc, (0, 0, 1.0), 20, 20, -64, 100)
go(sc, 'lay', '1,45', LOOP)
