"""Every primitive in piecekit, one per hue, as a reference for the drawing agents (not proposed pieces).
Run from the repo root:  python3 docs/mockups/003-pieces/kit/examples.py   ->  kit/examples/*.svg"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piecekit import Scene

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'examples')
os.makedirs(OUT, exist_ok=True)


def boxes_and_wells():                      # box, wells, contents clipped to their well, yaw
    sc = Scene('sky', el=30)
    tray = sc.box(0, 0, 0, w=2.2, d=1.0, h=.32, mat='sec', bevel=.03,
                  wells=[(-.75, 0, .5, .62, .26), (0, 0, .5, .62, .26), (.75, 0, .5, .62, .26)])
    sc.box(-.75, 0, .06, .44, .56, .5, inside=tray)          # stands in the left well (bottom hidden by the rim)
    sc.box(0, 0, .06, .44, .56, .5, inside=tray)
    sc.box(1.6, -.1, 0, .44, .56, .5, yaw=-12)               # the next one, waiting on the floor
    return sc.frame(width=.5)


def cup_and_spheres():                      # cup, spheres inside it and one lifted out
    sc = Scene('apricot', el=28)
    bowl = sc.cup(0, 0, 0, r=.7, h=.55, wall=.06, floor=.06)
    for i in range(6):
        a = i * math.tau / 6
        sc.sphere(.32 * math.cos(a), .32 * math.sin(a), .5, .16, inside=bowl)
    sc.sphere(0, 0, .62, .16, inside=bowl)
    sc.sphere(1.0, -.25, 1.0, .16)                           # lifted: its shadow lands on the floor, far left-back
    return sc.frame(width=.42)


def dish_and_coins():                       # shallow cup (dish), a coin stack in it, a tilted coin
    sc = Scene('mint', el=32)
    dish = sc.cup(0, 0, 0, r=1.0, h=.16, wall=.08, floor=.04)
    for i in range(3):
        sc.cylinder(-.15 + i * .015, .05, .04 + i * .09, .5, .078, inside=dish)
    sc.cylinder(1.05, -.45, .5, .5, .078, tilt=(25, -10))
    return sc.frame(width=.5)


def slabs():                                # a stack of near-white slabs and one hue slab drawn off it
    sc = Scene('lilac', el=34)
    for i in range(5):
        sc.box(0, 0, i * .14, 1.2, .8, .12, mat='sec', bevel=.02)
    sc.box(.75, -.25, .78, .9, .55, .1, yaw=18, tilt=(0, -10))
    return sc.frame(width=.45)


if __name__ == '__main__':
    for f in (boxes_and_wells, cup_and_spheres, dish_and_coins, slabs):
        sc = f()
        p = sc.save(os.path.join(OUT, f.__name__.replace('_', '-') + '.svg'), title=f.__name__)
        print(os.path.basename(p), sc.report())
