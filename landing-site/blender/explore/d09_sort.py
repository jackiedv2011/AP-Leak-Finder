"""D09 sort — a scattered cloud of pieces assembles itself into one clean block.

Loose cubes drift in a cloud, every tone mixed up. They fly home bottom-first into a
block whose layers run in order, dark to light, like strata. When everything has landed
the block is complete but for one empty corner — and one cube still sits wrong, perched
crooked on a face where it does not belong (pink: in the wrong place). It is found,
lifted, turns green on the way, and drops into the empty corner. Then the block breathes
apart into the cloud again. Behaviours: chaos to clean, building a structure, something
in the wrong place, returning.

knobs: n=5 pal=strata|tint ground=1
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
n = int(A.get('n', 5))
SP, SZ = .5, .45
rng = np.random.default_rng(12)
PALS = {
    'strata': ['g5', 'g4', 'g3', 't_blue', 'g2', 'bone', 't_orange', 'cream'],
    'tint': ['g5', 'purple', 't_purple', 'blue', 't_blue', 'bone', 't_orange', 'cream'],
}
LAY = PALS[A.get('pal', 'strata')]
cells = [(i, j, k) for k in range(n) for i in range(n) for j in range(n)]
N = len(cells)
KEYS = LAY + ['pink', 'green']
pm = bevelled_mesh('cube', SZ, .045, 3)
for kk in KEYS:
    pm.materials.append(rich(kk, .4, .25, var=.05))
SLOT = np.array([((i - (n - 1) / 2) * SP, (j - (n - 1) / 2) * SP, k * SP + SZ / 2) for i, j, k in cells])
# strata: layer k maps across the palette, with a little mixing at the boundaries
MI = np.array([min(len(LAY) - 1, max(0, int(round(k / (n - 1) * (len(LAY) - 1) + rng.normal(0, .35))))) for i, j, k in cells])
CLOUD = SLOT * .6 + rng.normal(0, 1, (N, 3)) * np.array([1.5, 1.5, 1.1]) + np.array([0, 0, 1.3])
ROT0 = rng.uniform(-math.pi, math.pi, (N, 3))
ORDER = np.array([k * 9 + rng.uniform(0, 24) for i, j, k in cells])
# the empty corner (top, front-right as seen) and the misfit
EMPTY = cells.index((n - 1, 0, n - 1))
MIS = EMPTY
PERCH = SLOT[cells.index((0, 0, n - 1))] + np.array([-.05, -.02, SP * .98])   # crooked, on top of the far-left front
PERCH_R = np.array([.12, -.22, .5])
ground(0)
ob, upd = point_instancer('Block', pm, N)


@on_pose
def pose(t):
    k = np.array([ramp(t, 8 + o, 52 + o) for o in ORDER])
    back = ramp(t, 204, 238)
    kk = k * (1 - back)
    pos = CLOUD * (1 - kk)[:, None] + SLOT * kk[:, None]
    rot = ROT0 * (1 - kk)[:, None]
    mi = MI.copy()
    # the misfit: lands on its perch (wrong place), found 120..135, lifted & carried 135..175 into the empty corner
    land = ramp(t, 60, 100)
    carry = ramp(t, 136, 176)
    p_land = CLOUD[MIS] * (1 - land) + PERCH * land
    lift = math.sin(math.pi * carry) * .7
    p = p_land * (1 - carry) + SLOT[MIS] * carry + np.array([0, 0, lift])
    r = ROT0[MIS] * (1 - land) + PERCH_R * land * (1 - carry)
    pos[MIS] = p * (1 - back) + CLOUD[MIS] * back
    rot[MIS] = r * (1 - back) + ROT0[MIS] * back
    mi[MIS] = KEYS.index('green') if 150 <= t < 226 else KEYS.index('pink')
    upd(pos, rot, np.ones((N, 3)), mi)


cam(sc, (0, 0, 1.15), 21, 26, -52)
go(sc, 'sort', '1,70,125,180', LOOP)
