"""D04 balance — suspended counterweights go out of balance and settle back.

A hanging mobile: fine dark rods, coloured weights. Every arm level. A second orange
weight drops onto the orange one (paid twice) and the arm it hangs from tips, taking
its parent arm with it. The extra weight is found, lifted off — turning green as it
goes, money coming back — and the whole mobile swings, overshoots, and settles level.
Behaviours: imbalance, resolving, returning, settling.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *

LOOP = 240
sc = scene(LOOP)
ROD = metal('#1a1a1a', .35)
WIRE_R = .016


def rod(name, x0, x1, parent=None, z=0):
    ob = cyl(name, .04, x1 - x0, ((x0 + x1) / 2, 0, z), ROD, 12, 0, axis='X')
    ob.parent = parent
    return ob


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    sc.collection.objects.link(e)
    e.location = loc
    e.parent = parent
    return e


def hang(name, parent, x, drop, r, mat, th=.12):
    """wire down from parent's local x, disc weight at the end (faces the camera)."""
    w = cyl(name + 'w', WIRE_R, drop, (x, 0, -drop / 2), ROD, 8, 0)
    w.parent = parent
    d = sphere(name, r, (x, 0, -drop - r * .95), mat, 48)
    d.parent = parent
    return d


top = empty('P0', (0, 0, 3.0))
cyl('topwire', WIRE_R, 2.0, (0, 0, 4.0), ROD, 8, 0)
b0 = empty('B0', (0, 0, 0), top)
rod('R0', -1.9, 1.5, b0)
hang('W0', b0, -1.9, .5, .55, satin('g5', .4))                   # big dark counterweight

p1 = empty('P1', (1.5, 0, -.7), b0)                                 # right: a sub-arm
cyl('w1', WIRE_R, .7, (1.5, 0, -.35), ROD, 8, 0).parent = b0
b1 = empty('B1', (0, 0, 0), p1)
rod('R1', -1.2, 1.1, b1)
hang('W1', b1, -1.2, .45, .34, satin('blue', .35))
p2 = empty('P2', (1.1, 0, -.55), b1)
cyl('w2', WIRE_R, .55, (1.1, 0, -.27), ROD, 8, 0).parent = b1
b2 = empty('B2', (0, 0, 0), p2)
rod('R2', -.7, .9, b2)
hang('W2', b2, -.7, .35, .22, satin('cream', .45))
hang('W3', b2, .9, .8, .28, satin('orange', .35))                 # the orange one
hang('W4', b1, .2, 1.3, .18, satin('pink', .35))

p3 = empty('P3', (-.6, 0, -.9), b0)                                 # left: a second sub-arm
cyl('w3', WIRE_R, .9, (-.6, 0, -.45), ROD, 8, 0).parent = b0
b3 = empty('B3', (0, 0, 0), p3)
rod('R3', -.8, .7, b3)
hang('W5', b3, -.8, .4, .2, satin('purple', .35))
hang('W6', b3, .7, .6, .26, satin('bone', .45))

# the duplicate: a second orange disc that lands against W3, then leaves green
dup_m, dup_mix, dup_em = anim_mat('Dup', 'orange', 'green', 'satin', .35, 0.0)
dup = sphere('Dup', .28, (0, 0, 0), dup_m, 48)
arms = [(b0, .18), (b1, -.35), (b2, -.7), (b3, .1)]


def wobble(t, t0, amp, freq=.07, damp=.035):
    if t < t0:
        return 0.0
    u = t - t0
    return amp * math.exp(-damp * u) * math.cos(freq * u * 2 * math.pi / 2.2)


@on_pose
def pose(t):
    on = ramp(t, 40, 62) * (1 - ramp(t, 118, 140))
    for b, k in arms:
        tip = on * k * .22
        sway = .025 * math.sin(2 * math.pi * (t / LOOP * 2 + k))
        settle = wobble(t, 140, -k * .16) * (1 - ramp(t, 200, 238))
        b.rotation_euler.y = tip + sway + settle
    # duplicate path: from above -> next to W3 -> up and away
    bpy.context.view_layer.update()
    w3 = bpy.data.objects['W3'].matrix_world.translation
    arrive = ramp(t, 20, 60)
    leave = ramp(t, 118, 170)
    hold = w3 + Vector((0, -.14, 0))
    start = w3 + Vector((0, -.14, 2.2))
    gone = w3 + Vector((-.4, -.3, 2.6))
    p = start.lerp(hold, arrive) if leave <= 0 else hold.lerp(gone, leave)
    dup.location = p
    dup_mix.default_value = ramp(t, 100, 125)
    dup_em.default_value = .6 * ramp(t, 100, 125)
    s = 1 - ramp(t, 175, 200) + ramp(t, 0, 18) * (1 - ramp(t, 175, 200)) * 0
    s = max(0.0, min(1.0, ramp(t, 4, 22) * (1 - ramp(t, 172, 196))))
    dup.scale = (s, s, s)


cam(sc, (0, 0, 1.5), 21, 14, -72)
go(sc, 'balance', '1,90,160', LOOP)
