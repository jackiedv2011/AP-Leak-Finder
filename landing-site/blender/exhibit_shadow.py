"""Exhibit 4, billed twice: the shadow. Two objects that look nothing alike float side by side: the same six
plates (the same line items), stacked square in one and stepped into a tower in the other. The camera rises
from a low side view to straight down, and from above they are the same square. Two bills, one purchase.

  B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b --factory-startup --python exhibit_shadow.py -- out=out/shadow_t frames=1,40,70,100,145 spp=32

2.4 s at 60 fps. 0-0.15 the side view. 0.15-1.65 the camera rises overhead in one move (`swoop`, the
skill's curve for big camera moves: a soft start, a long glide, a soft landing). Then it holds, still
pushing in a hair. The 100 mm lens keeps the two squares the same size from above.
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exhibit_common import A, stage, camera, aim, bevel, tw, lerp, bake, out_dir, render

DUR = 2.4
T_RISE, D_RISE = .15, 1.5
OUT = out_dir('out/shadow_t')

sc, floor, m = stage(A.get('palette', 'sky'), DUR)


def plate(w, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = (w, w, PH)
    bpy.ops.object.transform_apply(scale=True)
    bevel(o, .02)
    o.data.materials.append(m)
    return o


S, LIFT, GAP = .82, .1, 1.0           # footprint, a hair off the floor (short shadows under the angled sun), half the spacing
PH, PG = .13, .028                    # plate height, the gap between plates
for k in range(6):
    z = LIFT + k * (PH + PG) + PH / 2
    plate(S, (-GAP, 0, z))                         # six plates squared up: a cube
    plate(S * (1 - k * .15), (GAP, 0, z))          # the same six, stepped: a tower on the same footprint

cam = camera(sc)
D0, D1 = float(A.get('dist', 14.8)), float(A.get('dist1', 14.0))


def pose(t):
    e = tw(t, T_RISE, D_RISE, 'swoop')
    # objects low in frame as it rises: room above for the words
    aim(cam, (0, .42 * e, .6 * (1 - e)), lerp(10, 89.5, e), lerp(D0, D1, e) * (1 - .03 * tw(t, 0, DUR, 'inOut')))


bake(sc, [cam], pose, DUR)
render(sc, OUT, 'shadow', DUR)
