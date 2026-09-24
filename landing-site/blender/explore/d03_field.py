"""D03 field — thousands of pieces organise themselves; the outliers show by not conforming.

A loose field of short bars lies at random. A front sweeps across and every bar it
passes swings into line with its neighbours, so the field combs itself clean. A handful
refuse — they stay crossways, and in a combed field a crossways bar is the loudest
thing there. Those lift out of the field. Behaviours: chaos to clean, surfacing, outliers.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
NX, NY = int(A.get('nx', 24)), int(A.get('ny', 24))
SP = .28
rng = np.random.default_rng(4)
N = NX * NY
gx, gy = np.meshgrid(np.arange(NX), np.arange(NY))
P0 = np.c_[(gx.ravel() - (NX - 1) / 2) * SP, (gy.ravel() - (NY - 1) / 2) * SP, np.zeros(N)]
P0[:, :2] += rng.normal(0, .012, (N, 2))

# base colour by slow patches of value (never one white): bone, cream, g2, g3, g4
KEYS = ['bone', 'cream', 'g2', 'g3', 'g4', 'orange', 'blue', 'pink', 'green']
pm = bevelled_mesh('bar', (.22, .06, .055), .018, 2)
for k in KEYS:
    pm.materials.append(satin(k, .4, .15))
patch = (np.sin(P0[:, 0] * 1.3 + 1) + np.sin(P0[:, 1] * 1.1 - P0[:, 0] * .6)) * .5
MI = np.digitize(patch + rng.normal(0, .18, N), [-.55, -.1, .3, .7])
MI = np.array([[0, 1, 2, 3, 4][min(4, m)] for m in MI])
OUT = rng.choice(N, 11, replace=False)
MI[OUT] = rng.choice([5, 6, 7], len(OUT))
A0 = rng.uniform(-math.pi, math.pi, N)                  # the mess
ANG = .35 + .12 * np.sin(P0[:, 1] * 2.2)                # the combed direction (a gentle flow)
ANG[OUT] = ANG[OUT] + math.pi / 2
R = np.hypot(P0[:, 0], P0[:, 1])
ob, upd = point_instancer('Field', pm, N)


@on_pose
def pose(t):
    # the front travels diagonally across 20..120; everything combed by 130
    front = -5 + 10.5 * ramp(t, 15, 125)
    d = (P0[:, 0] * .7 + P0[:, 1] * .7)
    k = np.clip((front - d) / 1.2, 0, 1)
    k = k * k * (3 - 2 * k)
    # unwind the loop: from 200..240 the field shakes loose again
    back = ramp(t, 196, 238)
    k = k * (1 - back)
    ang = A0 * (1 - k) + ANG * k
    z = np.zeros(N)
    lift = pulse(t, 130, 160, 185, 215)
    z[OUT] = .5 * lift
    pos = P0.copy()
    pos[:, 2] = z + .02 * np.sin(P0[:, 0] * 2 + t * 2 * math.pi / LOOP * 2) * k
    rot = np.zeros((N, 3))
    rot[:, 2] = ang
    rot[OUT, 0] = .4 * lift
    upd(pos, rot, np.ones((N, 3)), MI)


cam(sc, (0, 0, 0), 22, 48, -70)
go(sc, 'field', '1,60,150', LOOP)
