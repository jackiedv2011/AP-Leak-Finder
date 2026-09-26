import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
LOOP = 60
sc = scene(LOOP, 320, 16)
b = box('B', 1.0, (0, 0, .5), satin('orange'), bev=.06)
pm = bevelled_mesh('piece', (.2, .2, .05), .01, 1)
pm.materials.append(clay('bone')); pm.materials.append(clay('green'))
N = 400
ob, upd = point_instancer('F', pm, N)
import numpy as np
rng = np.random.default_rng(1)
P0 = np.c_[rng.uniform(-3, 3, (N, 2)), np.zeros(N)]
MI = (rng.random(N) < .05).astype(int)
@on_pose
def pose(t):
    b.location.x = math.sin(2 * math.pi * t / LOOP) * 1.5
    rot = np.zeros((N, 3)); rot[:, 2] = t * .05
    upd(P0, rot, np.ones((N, 3)), MI)
cam(sc, (0, 0, 0), 14, 35)
go(sc, 'smoke', '1,15', LOOP)
