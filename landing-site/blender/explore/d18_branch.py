"""D18 branch — a growing structure; one branch heads somewhere it shouldn't and is brought back.

A branching form grows up from a base, generation by generation, orderly and upright.
One branch strikes off sideways, out past the edge of everything else. It is found,
drawn back in, and regrows along the right line, green. Behaviours: branching,
a discrepancy going somewhere it shouldn't, redirecting, returning.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
rng = np.random.default_rng(8)
GEN_MAT = ['g5', 'g4', 'g3', 'bone', 'cream']
branches = []   # (obj, gen, t0, t1)


def grow(p, d, length, gen, t0):
    if gen > 4:
        return
    q = p + d * length
    pts = [tuple(p + (q - p) * u) for u in np.linspace(0, 1, 12)]
    r = .09 * (.72 ** gen)
    ob = tube(f'Br{len(branches)}', pts, r, clay(GEN_MAT[gen], .5))
    ob.data.bevel_factor_mapping_end = 'SPLINE'
    dur = 26
    branches.append((ob, gen, t0, t0 + dur))
    # tip knob
    k = sphere(f'Kn{len(branches)}', r * 1.25, tuple(q), clay(GEN_MAT[gen], .5), 16)
    branches.append((k, -1, t0 + dur - 4, t0 + dur))
    n = 2 if gen < 2 else rng.choice([1, 2, 2, 3])
    for i in range(n):
        ang = rng.uniform(0, 2 * math.pi)
        tilt = rng.uniform(.35, .6)
        nd = np.array([math.cos(ang) * math.sin(tilt), math.sin(ang) * math.sin(tilt), math.cos(tilt)])
        nd = nd * .7 + d * .3
        nd /= np.linalg.norm(nd)
        grow(q, nd, length * rng.uniform(.62, .8), gen + 1, t0 + dur - 6 + rng.uniform(0, 8))


grow(np.array([0., 0., 0.]), np.array([0., 0., 1.]), 1.3, 0, 0)
# the stray: from a mid branch, out sideways and down, past everything
host = next(b for b in branches if b[1] == 2)[0]
hp = Vector(host.data.splines[0].points[-1].co[:3])
wrong_end = hp + Vector((1.9, -.6, -.4))
right_end = hp + Vector((.2, -.1, 1.0))
stray = tube('Stray', [tuple(hp.lerp(wrong_end, u)) for u in np.linspace(0, 1, 16)], .045, clay('pink', .45))
fix_m, fix_mix, fix_em = anim_mat('Fix', 'pink', 'green', 'clay', .45, 0)
stray.data.materials[0] = fix_m
knob = sphere('StrayKnob', .065, tuple(wrong_end), fix_m, 16)
base = cyl('Base', .9, .12, (0, 0, -.06), clay('g2', .6), 64, .02)


@on_pose
def pose(t):
    # the whole tree grows 0..~150 and ungrows 205..238 (in reverse order)
    un = ramp(t, 205, 238)
    for ob, gen, t0, t1 in branches:
        g = ramp(t, t0 * .9, t1 * .9) * (1 - un)
        if gen >= 0:
            ob.data.bevel_factor_end = max(.001, g)
            ob.hide_render = g < .002
        else:
            s = g
            ob.scale = (s, s, s)
    # stray: grows out wrong 60..95, found & pulled back 120..140, regrows right 140..175
    out = ramp(t, 60, 95) * (1 - ramp(t, 120, 140))
    back = ramp(t, 140, 175) * (1 - un)
    tip = wrong_end if t < 140 else right_end
    sp = stray.data.splines[0]
    n = len(sp.points)
    for i, p in enumerate(sp.points):
        u = i / (n - 1)
        q = hp.lerp(tip, u)
        p.co = (q.x, q.y, q.z, 1)
    stray.data.bevel_factor_end = max(.001, out if t < 140 else back)
    knob.location = hp.lerp(tip, out if t < 140 else back)
    knob.scale = [max(.001, min(1, (out if t < 140 else back) * 3))] * 3
    fix_mix.default_value = 1.0 if t >= 140 else 0.0


cam(sc, (0.3, 0, 1.6), 18, 12, -70)
go(sc, 'branch', '1,110,190', LOOP)
