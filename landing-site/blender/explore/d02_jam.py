"""D02 jam — a mechanism where one jammed part stops everything, and freeing it restores motion.

A flat train of gears at several heights, like a movement with its case off. A small
orange wedge sits in one mesh; nothing turns (it strains). The wedge is found and lifted
clear; the whole train spins up. Behaviours: getting stuck, getting found, restored motion.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *

LOOP = 240
sc = scene(LOOP)
MOD = .12        # gear module: radius = MOD * teeth / 2


def gear(name, n, th, mat, hole=0.0):
    r = MOD * n / 2
    ro, ri = r + MOD * .9, r - MOD * 1.1
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        p = 2 * math.pi / n
        for da, rr in ((-.5, ri), (-.28, ri), (-.16, ro), (.16, ro), (.28, ri)):
            pts.append((rr * math.cos(a + da * p), rr * math.sin(a + da * p)))
    m = len(pts)
    v = [(x, y, -th / 2) for x, y in pts] + [(x, y, th / 2) for x, y in pts]
    f = [tuple(range(m))[::-1], tuple(range(m, 2 * m))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    ob = mesh_obj(name, v, f, mat)
    bevel(ob, .012, 2, 40)
    hub = cyl(name + 'hub', max(.08, r * .22), th + .08, (0, 0, 0), clay('g5', .5), 32, .01)
    hub.parent = ob
    return ob, r


# (teeth, height z, material)
SPEC = [(28, 0.0, 'bone'), (14, .12, 'blue'), (22, .0, 'g4'), (12, .12, 'cream'), (32, 0.0, 'pink'), (16, .12, 'g2')]
gears = []
pos = Vector((0, 0, 0))
ang = [0, -.5, .35, -.9, .2, 0]
prev = None
for i, (n, z, m) in enumerate(SPEC):
    ob, r = gear(f'G{i}', n, .16, satin(m, .38, .2))
    if prev:
        pn, pr, pp = prev
        a = ang[i]
        pos = pp + Vector((math.cos(a), math.sin(a), 0)) * (pr + r)
        gears.append(dict(ob=ob, n=n, r=r, pos=pos.copy(), a=a, parent=len(gears) - 1))
    else:
        gears.append(dict(ob=ob, n=n, r=r, pos=pos.copy(), a=0, parent=None))
    ob.location = (pos.x, pos.y, z)
    prev = (n, r, pos.copy())

# centre the train
cen = sum((g['pos'] for g in gears), Vector()) / len(gears)
for g in gears:
    g['ob'].location.x -= cen.x
    g['ob'].location.y -= cen.y

# the wedge sits in the mesh between gear 2 and 3
g2, g3 = gears[2], gears[3]
contact = g2['ob'].location.lerp(g3['ob'].location, g2['r'] / (g2['r'] + g3['r']))
wedge = box('Wedge', (.1, .22, .34), (contact.x, contact.y, .12), satin('orange', .3, .4), bev=.02)
wedge.rotation_euler.z = g3['a'] + math.pi / 2
W0 = wedge.location.copy()

N0 = gears[0]['n']
TURN = 2 * math.pi * 7 / N0          # a whole number of gear-0 teeth over the run, so the loop closes


def drive(t):
    # stuck until 96, free 96..210 (spin up / hold / spin down), stuck again after
    s = ramp(t, 96, 130) * (1 - ramp(t, 196, 226))
    return s


RUN = [drive(f) for f in range(LOOP + 1)]
CUM = [0.0]
for f in range(LOOP):
    CUM.append(CUM[-1] + (RUN[f] + RUN[f + 1]) / 2)
TOTAL = CUM[-1]


@on_pose
def pose(t):
    k, tt = divmod(t, LOOP)
    f = int(tt)
    u = tt - f
    c = CUM[f] + (CUM[f + 1] - CUM[f]) * u + k * TOTAL
    rot0 = TURN * c / TOTAL
    strain = .02 * math.sin(t * 1.9) * (1 - ramp(t, 80, 100)) * ramp(t, 20, 40)
    rots = []
    for i, g in enumerate(gears):
        if g['parent'] is None:
            r = rot0 + strain
        else:
            p = gears[g['parent']]
            pr = rots[g['parent']]
            a = g['a']
            r = a + math.pi - (math.pi - p['n'] * (a - pr)) / g['n']
        rots.append(r)
        g['ob'].rotation_euler.z = r
    lift = pulse(t, 70, 100, 205, 232)
    wedge.location = W0 + Vector((.5 * lift, -.3 * lift, 1.1 * lift))
    wedge.rotation_euler.x = .6 * lift


cam(sc, (0, 0, 0), 24, 50, -70)
go(sc, 'jam', '1,150', LOOP)
