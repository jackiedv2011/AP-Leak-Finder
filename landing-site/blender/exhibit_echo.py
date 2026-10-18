"""Exhibit 1, paid twice: the echo. A short stack of coins; an identical stack slides out of it (the same
payment, made again), holds, then slides back in and there is one stack again.

  B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b --factory-startup --python exhibit_echo.py -- out=out/echo_t frames=1,30,80,120 spp=32

2.3 s at 60 fps. 0-0.12 one stack. 0.12-0.74 the twin comes out (`out`: a fast start, a long settle) on a
low arc, its turn trailing by a beat. Holds. 1.2-1.82 it goes home (`inOut`), the turn undone a touch
ahead so it lands square. Rests from 1.82. The camera pushes in slowly the whole time, and follows: on the
one stack, over to the pair as the twin comes out, back to the one as it goes home (`inOut`, a beat behind).
Coins are the hero's: a prism disc with looklib's milled edge (`reeded`) and a fine gap between coins.
"""
import bpy, math, os, sys, random
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K
from exhibit_common import A, stage, camera, aim, tw, arc, bake, out_dir, render

DUR = 2.3
T_OUT, D_OUT, T_BACK, D_BACK = .12, .62, 1.2, .62
OUT = out_dir('out/echo_t')

sc, floor, face = stage(A.get('palette', 'mint'), DUR)
M = {'face': face, 'edge': K.reeded('MintEdge', face, freq=float(A.get('cfreq', 120)), depth=.4)}

RC, HC, GAP, NC = .82, .078, .012, 7
pts = [Vector((RC * math.cos(math.tau * k / 128), RC * math.sin(math.tau * k / 128))) for k in range(128)]


def stack(name, seed, s=1.0):
    rnd = random.Random(seed)
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    root.rotation_mode = 'QUATERNION'
    for i in range(NC):
        c, _ = K.prism(f'{name}{i}', pts, HC, M, 'edge', top='face', bevel=.01, smooth=True)
        rim = K.ring(f'{name}{i}r', RC * .72, RC * .72 - .03, .012, face, bevel=.004)   # a raised ring on the face
        rim.parent = c
        rim.location = (0, 0, HC / 2 + .004)
        c.parent = root
        # not perfectly squared up: real coins sit a hair off each other
        c.location = (rnd.uniform(-.018, .018), rnd.uniform(-.018, .018), HC / 2 + i * (HC + GAP))
        c.rotation_euler = (0, 0, rnd.uniform(0, math.tau))
        c.scale = (s, s, s)
    return root


a = stack('stack', 3)
b = stack('twin', 3, .999)   # the same seed: the same stack, coin for coin (a hair smaller, so they never flicker)

cam = camera(sc)
PAN, EL, DIST = 1.05, float(A.get('el', 30)), float(A.get('dist', 14.4))


def pose(t):
    eo, eb = tw(t, T_OUT, D_OUT, 'out'), tw(t, T_BACK, D_BACK, 'inOut')
    b.location = (2.1 * (eo - eb), 0, arc(eo, .1) * (1 - eb) + arc(eb, .07))
    turn = tw(t, T_OUT + .1, D_OUT, 'out') - tw(t, T_BACK - .04, D_BACK, 'inOut')
    b.rotation_quaternion = Quaternion((0, 0, 1), math.radians(-20) * turn)
    pan = tw(t, T_OUT, D_OUT + .25, 'inOut') - tw(t, T_BACK + .05, D_BACK + .3, 'inOut')
    aim(cam, (PAN * pan, 0, .62), EL, DIST * (1 - .035 * tw(t, 0, DUR, 'inOut')))


bake(sc, [b, cam], pose, DUR)
render(sc, OUT, 'echo', DUR)
