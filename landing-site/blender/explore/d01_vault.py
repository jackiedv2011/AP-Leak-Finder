"""D01 vault — an architectural mass with a sealed interior that light reaches.

A solid, quiet block of stacked courses, neutral outside. Along one seam it parts;
the sun gets into the slot and the inside turns out to be colour — and holds
something green. Behaviours: hidden inside, revealing, surfacing.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *

LOOP = 240
sc = scene(LOOP)
OPEN = float(A.get('open', .55))

# courses of the mass, bottom up: (height, outer, inner seam colour)
COURSES = [(.34, 'g5', 'orange'), (.62, 'bone', 'pink'), (.18, 'g3', 'orange'),
           (.72, 'cream', 'blue'), (.22, 'g4', 'purple'), (.52, 'bone', 'blue')]
W, D = 2.2, 1.7
halves = []
z = 0
for i, (h, m, inner) in enumerate(COURSES):
    off = .07 if i % 2 else -.07          # the seam steps a little course to course
    for s in (-1, 1):
        w = W / 2 - s * off
        ob = box(f'C{i}{s}', (w - .01, D, h - .012), (0, 0, z + h / 2), clay(m, .7), bev=.018)
        ob.location.x = off + s * (w / 2 + .005)
        me = ob.data
        me.materials.append(clay(inner, .6))
        me.polygons[3 if s < 0 else 5].material_index = 1
        halves.append((ob, s, ob.location.copy(), i))
    z += h
TOP = z
CZ = 1.45
core = box('Core', (.22, .5, .22), (0, 0, CZ), glow('green', 1.2, 'green'), bev=.03)


@on_pose
def pose(t):
    e = pulse(t, 50, 100, 180, 228)
    for ob, s, p0, i in halves:
        ob.location.x = p0.x + s * OPEN * e * (1 + .12 * math.sin(i * 1.7))
    core.location.z = CZ + 1.2 * pulse(t, 105, 150, 165, 215)
    core.rotation_euler.z = 2 * math.pi * ramp(t, 100, 220) * .25


cam(sc, (0, 0, TOP * .55), 16, 22, -62)
go(sc, 'vault', '1,140', LOOP)
