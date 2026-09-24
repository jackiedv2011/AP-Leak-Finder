"""E02 interchange: stacked ramps that sweep over and under each other, drawn in as they grow.

Walk: transactions -> routes -> highway interchange (many flows crossing without colliding).
Shape: wide, thin decks on slim piers; a straight low deck, a crossing high deck, four
270-degree loops climbing between them and one long flyover banking across the top.
Sectioned at a square like an architect's model. Motion: the decks extend along their
routes one after another, threading over and under, then the model rests.

knobs: plinth=1|0  piers=1|0  mats=deck,deck2,accent,pier,plinth
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
M = mats_arg('stone:bone,stone:#d9d4ca,lacquer:green,rubber:g6,stone:#efebe4')
DW, DH = float(A.get('dw', .5)), float(A.get('dh', .09))
prof = superellipse(DW, DH, 8, 40)
EDGE = float(A.get('edge', 2.7))
NP = 260


def seg_line(a, b):
    s = np.linspace(0, 1, NP)[:, None]
    return np.asarray(a) * (1 - s) + np.asarray(b) * s


def seg_loop(cx, cy, r, a0, sweep_deg, z0, z1):
    s = np.linspace(0, 1, NP)
    a = a0 + np.radians(sweep_deg) * s
    z = z0 + (z1 - z0) * (s * s * (3 - 2 * s))
    return np.c_[cx + r * np.cos(a), cy + r * np.sin(a), z]


def seg_fly():
    s = np.linspace(0, 1, NP)
    x = -EDGE + 2 * EDGE * s
    y = 1.4 * np.sin(np.pi * (s - .5)) * -1
    z = .5 + 1.25 * np.sin(np.pi * s) ** 1.4
    return np.c_[x, y, z]


ZL, ZH = .38, 1.0
C, RL = 1.02, .72
routes = [
    # (path, material index, start frame, bank)
    (seg_line((-EDGE, 0, ZL), (EDGE, 0, ZL)), 0, 0, 0),
    (seg_line((0, -EDGE, ZH), (0, EDGE, ZH)), 1, 8, 0),
    (seg_loop(C, C, RL, np.radians(-90), 270, ZL, ZH), 0, 18, .12),
    (seg_loop(-C, -C, RL, np.radians(90), 270, ZL, ZH), 0, 24, .12),
    (seg_loop(-C, C, RL, np.radians(0), 270, ZH, ZL), 1, 30, -.12),
    (seg_loop(C, -C, RL, np.radians(180), 270, ZH, ZL), 1, 36, -.12),
    (seg_fly(), 2, 44, .0),
]
decks = []
for i, (P, mi, st, bank) in enumerate(routes):
    ob, upd = sweep(f'Deck{i}', NP, prof, M[mi], closed=False)
    decks.append((ob, upd, P, st, bank))

# slim piers where a deck is high enough to need one
PIERS = A.get('piers', '1') == '1'
pier_list = []
if PIERS:
    for i, (ob, upd, P, st, bank) in enumerate(decks):
        for s in np.linspace(.08, .92, 5 if i != 6 else 7):
            p = P[int(s * (NP - 1))]
            if p[2] < .3 or max(abs(p[0]), abs(p[1])) > EDGE - .2:
                continue
            h = p[2] - DH / 2
            c = cyl(f'Pier{i}_{s:.2f}', .035, h, (p[0], p[1], h / 2), M[3], n=20, bev=0)
            pier_list.append((c, i, s))

if A.get('plinth', '1') == '1':
    box('Plinth', (2 * EDGE + .2, 2 * EDGE + .2, .12), (0, 0, -.06), M[4], bev=.012)


def grow(P, g):
    """Resample the first g of the path onto NP points (g in 0..1)."""
    g = max(g, 1e-3)
    s = np.linspace(0, g * (NP - 1), NP)
    i0 = np.floor(s).astype(int).clip(0, NP - 2)
    f = (s - i0)[:, None]
    return P[i0] * (1 - f) + P[i0 + 1] * f


@on_pose
def pose(t):
    for i, (ob, upd, P, st, bank) in enumerate(decks):
        g = ramp(t, st, st + 34)
        ob.hide_render = bool(g < .01)
        Q = grow(P, g)
        tw = np.full(NP, bank)
        upd(Q, twist=tw, flat=True)
    for c, i, s in pier_list:
        g = ramp(t, routes[i][2], routes[i][2] + 34)
        c.hide_render = bool(g < s)


pose(LOOP - 1)
ground()
cam(sc, (0, 0, .55), 24, 34, -58, 100)
go(sc, 'interchange', str(LOOP), LOOP)
