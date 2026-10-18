"""Exhibit 3, credit never used: the missing piece. A pale tray of eight slots; seven hold a piece,
one is empty, and its piece lies on its side nearby, untouched. Then it lifts, turns upright and drops into
its slot: the set is whole.

  B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b --factory-startup --python exhibit_piece.py -- out=out/piece_t frames=1,40,62,80,114 spp=32

1.9 s at 60 fps. 0-0.15 the tray and the stray piece. 0.15-1.0 it travels over on an arc (`inOut`), turning
upright a beat behind. From 0.82, overlapping the end of the travel, it drops into the slot on a snappy
spring (a hair of settle). Rests from about 1.2. The camera pushes in slowly the whole time and follows the
piece over, so the whole set ends square in frame. Light tray, violet pieces: value before hue, as in the loops.
"""
import bpy, math, os, sys
from mathutils import Euler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K
from exhibit_common import A, stage, camera, aim, bevel, tw, spring, arc, lerp, bake, out_dir, render

DUR = 1.9
T_GO, D_GO, T_DROP, D_DROP = .15, .85, .82, .38
OUT = out_dir('out/piece_t')

sc, floor, m = stage(A.get('palette', 'lilac'), DUR)
m_tray = K.plain('Tray', '#f1edff', .5)


def box(name, size, bev, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new('soft', 'BEVEL')
    bv.width, bv.segments = bev, 1                 # looklib's chamfer: one segment, crisp
    bpy.ops.object.modifier_apply(modifier='soft')
    return o


def cut(target, cutter):
    bo = target.modifiers.new('cut', 'BOOLEAN')
    bo.object, bo.operation, bo.solver = cutter, 'DIFFERENCE', 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier='cut')
    bpy.data.objects.remove(cutter)


def finish(o, mat):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))   # the cuts leave long thin faces: smooth edges only
    o.data.materials.clear()
    o.data.materials.append(mat)
    for poly in o.data.polygons:
        poly.material_index = 0


PS, PH, P = .5, .26, .66                     # piece size, piece height (= slot depth), slot pitch
COLS, ROWS, EMPTY = 4, 2, (2, 0)             # the empty slot: third along, front row
BW, BD, BH = COLS * P + .3, ROWS * P + .3, .46
TX = -.45                                    # the tray sits left, the stray piece lies to its right
slot = lambda c, r: (TX + (c - (COLS - 1) / 2) * P, (r - (ROWS - 1) / 2) * P)

tray = box('tray', (BW, BD, BH), .03, (TX, 0, BH / 2))
for c in range(COLS):
    for r in range(ROWS):
        x, y = slot(c, r)
        cut(tray, box('c', (PS + .02, PS + .02, PH * 2), .03, (x, y, BH)))
finish(tray, m_tray)

# one piece, shared by all eight: a rounded square with five shallow grooves across its top
proto = box('proto', (PS, PS, PH), .022, (0, 0, 0))
for k in range(5):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.02, depth=PS + .2, location=((k - 2) * .075, 0, PH / 2 + .007), rotation=(math.radians(90), 0, 0))
    cut(proto, bpy.context.object)
finish(proto, m)
mesh = proto.data
bpy.data.objects.remove(proto)


def piece(name, loc):
    o = bpy.data.objects.new(name, mesh)
    sc.collection.objects.link(o)
    o.location = loc
    return o


for c in range(COLS):
    for r in range(ROWS):
        if (c, r) != EMPTY:
            x, y = slot(c, r)
            piece('set', (x, y, BH - PH / 2 + .002))
stray = piece('stray', (0, 0, 0))
stray.rotation_mode = 'QUATERNION'

hx, hy = slot(*EMPTY)
HOME = (hx, hy, BH - PH / 2 + .002)
HOVER = (hx, hy, HOME[2] + .26)
REST = (2.05, -.75, PS / 2)                                        # on its side, on the floor
Q_REST, Q_HOME = Euler((0, math.radians(90), math.radians(28))).to_quaternion(), Euler((0, 0, 0)).to_quaternion()

cam = camera(sc)
T_FROM, T_TO = (.45, 0, .64), (TX, 0, .5)   # framed on the tray and the piece, then on the whole set
EL, DIST = float(A.get('el', 36)), float(A.get('dist', 16.8))


def pose(t):
    e = tw(t, T_GO, D_GO, 'inOut')
    x, y, z = lerp(REST, HOVER, e)
    z += arc(e, .9)                                                 # up and over
    z += (HOME[2] - HOVER[2]) * spring(t, T_DROP, D_DROP, .12)     # and down into the slot
    stray.location = (x, y, z)
    stray.rotation_quaternion = Q_REST.slerp(Q_HOME, tw(t, T_GO + .08, D_GO - .1, 'inOut'))
    aim(cam, lerp(T_FROM, T_TO, tw(t, T_GO + .1, D_GO + .25, 'inOut')), EL, DIST * (1 - .06 * tw(t, 0, DUR, 'inOut')))


bake(sc, [stray, cam], pose, DUR)
render(sc, OUT, 'piece', DUR)
