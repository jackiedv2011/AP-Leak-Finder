"""Exhibit 2, overpaid: the overflow. A cup fills with spheres (the payment) past its rim and the spill rolls
across the floor (the overpayment). Then the money comes back: the spilled spheres lift and stack into a
neat pile beside the cup. The pour is a rigid-body simulation; the return is animated.

  B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b --factory-startup --python exhibit_overflow.py -- out=out/overflow_t frames=1,30,60,100,140 spp=32

2.65 s at 60 fps. The simulation runs in real time at 60 fps, a sphere every other frame from eight drop
points (each clear of its last sphere before it is used again: closer points spawn spheres into each other),
and is rolled on off camera until the cup is nearly full (`pre` frames), so the film opens on the last of
the pour: the heap crests the rim and spills. From 1.25 the spill goes home one sphere after another
(0.02 s apart), each on a short arc (`inOut`), into a pyramid sized to hold it exactly.
The cup is a pale solid, the spheres the orange stock: value before hue, as in the loops.
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K
from exhibit_common import A, FPS, stage, camera, aim, tw, arc, lerp, frames_in, ftime, out_dir, render

DUR = 2.65
T_RET, EACH, D_EACH = 1.25, .02, .5
OUT = out_dir('out/overflow_t')
NS, R = int(A.get('n', 265)), float(A.get('r', .12))
EVERY = 2                                       # frames between spheres
PRE = int(A.get('pre', 466))                    # simulation frames before the film starts
NF = frames_in(DUR)
SIM = PRE + NF                                  # simulated to the end of the film (spheres not going home stay live)
random.seed(7)

sc, floor, m_ball = stage(A.get('palette', 'apricot'), DUR)
m_cup = K.plain('Cup', '#fff3ea', .5)

# ---------- the cup: an open cylinder with a wall, a chamfered rim ----------
RV, HV, TV = .78, 1.25, .05
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=RV, depth=HV, location=(0, 0, HV / 2))
cup = bpy.context.object
bm = bmesh.new()
bm.from_mesh(cup.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > .9], context='FACES')
bm.to_mesh(cup.data)
bm.free()
so = cup.modifiers.new('wall', 'SOLIDIFY')
so.thickness, so.offset = TV, 1
bpy.ops.object.modifier_apply(modifier='wall')
bv = cup.modifiers.new('rim', 'BEVEL')
bv.width, bv.segments, bv.limit_method, bv.angle_limit = .015, 1, 'ANGLE', math.radians(30)
bpy.ops.object.modifier_apply(modifier='rim')
for p in cup.data.polygons:
    p.use_smooth = abs(p.normal.z) < .5
cup.data.materials.append(m_cup)

# ---------- physics: real time at 60 fps ----------
bpy.ops.rigidbody.world_add()
rw = sc.rigidbody_world
rw.substeps_per_frame, rw.solver_iterations = 12, 30
rw.point_cache.frame_start, rw.point_cache.frame_end = 1, SIM
sc.frame_start, sc.frame_end = 1, SIM               # the simulation only steps inside the scene's range


def body(o, kind, shape, friction=.5, bounce=.15):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.rigidbody.object_add(type=kind)
    rb = o.rigid_body
    rb.collision_shape, rb.friction, rb.restitution, rb.collision_margin = shape, friction, bounce, .002
    o.select_set(False)
    return rb


# the ground the spheres land on: a modest box, unseen (one huge plane makes the solver jitter); the
# catcher plane is only for the shadow
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -.25))
ground = bpy.context.object
ground.scale = (14, 14, .5)
ground.hide_render = True
body(ground, 'PASSIVE', 'BOX', friction=.95)
body(cup, 'PASSIVE', 'MESH', friction=.3)

bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=R)
proto = bpy.context.object
bpy.ops.object.shade_smooth()
proto.data.materials.append(m_ball)
mesh = proto.data
bpy.data.objects.remove(proto)
DROPS = 8
DROP_Z = HV + float(A.get('dropz', 1.7))      # well above the crest: a sphere born inside the heap is flung out of it
balls = []
for i in range(NS):
    o = bpy.data.objects.new(f'b{i}', mesh)
    sc.collection.objects.link(o)
    balls.append(o)
    rb = body(o, 'ACTIVE', 'SPHERE', friction=.9, bounce=.03)
    rb.mass, rb.angular_damping, rb.linear_damping = .2, .95, .6
    go = 2 + EVERY * i
    o.location = (60 + (i % 20) * .5, 60 + (i // 20) * .5, 1)        # parked, out of shot
    rb.kinematic = True
    o.keyframe_insert('location', frame=1)
    o.keyframe_insert('location', frame=go - 1)
    o.rigid_body.keyframe_insert('kinematic', frame=go + 1)
    a = (i % DROPS) / DROPS * math.tau + random.uniform(-.08, .08)
    o.location = (.18 + math.cos(a) * .36, math.sin(a) * .36, DROP_Z)
    o.keyframe_insert('location', frame=go)
    o.keyframe_insert('location', frame=go + 1)                      # moved there, held a frame (no speed)
    rb.kinematic = False
    o.rigid_body.keyframe_insert('kinematic', frame=go + 2)         # then let go

# ---------- run it, keeping the film's frames ----------
track = {o: [] for o in balls}
for f in range(1, SIM + 1):
    sc.frame_set(f)
    if f >= PRE:
        for o in balls:
            mw = o.matrix_world
            q = mw.to_quaternion()
            if track[o] and track[o][-1][1].dot(q) < 0:   # the same turn the near way round: no spins between keys
                q.negate()
            track[o].append((mw.translation.copy(), q))
print('SIMULATED', SIM)

# the simulation off; from here every sphere is keyed from what it did
bpy.ops.rigidbody.world_remove()
for o in balls:
    o.animation_data_clear()
    o.rotation_mode = 'QUATERNION'

# who spilled: outside the cup by the end (a late one may still roll off after the return has begun)
k_ret = round(T_RET * FPS)
spill = [o for o in balls if Vector(track[o][-1][0].xy).length > RV + TV + R * .5]
print('SPILLED', len(spill))
fast = [o.name for o in balls if any((track[o][i + 1][0] - track[o][i][0]).xy.length * FPS > 4 for i in range(len(track[o]) - 1))]
print('FAST', len(fast), fast[:8])

# a square pyramid, n x n, (n-1) x (n-1), ... each sphere in the hollow of four below, the smallest that holds
# the spill; the last layer it reaches is filled from its middle out
PX, PY = RV + 1.25, -.15
n = 1
while sum(k * k for k in range(1, n + 1)) < len(spill):
    n += 1
slots = []
for k in range(n):
    s = n - k
    layer = [Vector((PX + (ix - (s - 1) / 2) * 2 * R, PY + (iy - (s - 1) / 2) * 2 * R, R + k * R * math.sqrt(2)))
             for ix in range(s) for iy in range(s)]
    layer.sort(key=lambda v: (v.x - PX) ** 2 + (v.y - PY) ** 2)
    slots += layer[:len(spill) - len(slots)]
print('PILE', n, len(slots))
# the nearest go first, to the bottom slots: the pile builds from the floor up
spill.sort(key=lambda o: (track[o][k_ret][0] - Vector((PX, PY, 0))).length)
start = {o: T_RET + i * EACH for i, o in enumerate(spill)}
home = {o: slots[i] for i, o in enumerate(spill)}

cam = camera(sc)
TARGET, EL, DIST = (.75, 0, .95), float(A.get('el', 26)), float(A.get('dist', 19.2))


def place(o, t):
    k = min(len(track[o]) - 1, round(t * FPS))
    if o in start and t >= start[o]:
        k0 = round(start[o] * FPS)
        a, q = track[o][min(k0, len(track[o]) - 1)]
        e = tw(t, start[o], D_EACH, 'inOut')
        b = home[o]
        o.location = lerp(a, b, e)
        o.location.z += arc(e, .35 + .12 * (a - b).length)
        o.rotation_quaternion = q
    else:
        o.location, o.rotation_quaternion = track[o][k]


moving = [o for o in balls if o in start or (track[o][0][0] - track[o][-1][0]).length > 1e-4]
for o in balls:
    if o not in moving:
        place(o, 0)
for f in range(1, NF + 1):
    t = ftime(f)
    for o in moving:
        place(o, t)
        o.keyframe_insert('location', frame=f)
        o.keyframe_insert('rotation_quaternion', frame=f)
    aim(cam, TARGET, EL, DIST * (1 - .035 * tw(t, 0, DUR, 'inOut')))
    cam.keyframe_insert('location', frame=f)
    cam.keyframe_insert('rotation_quaternion', frame=f)
print('KEYED', len(moving))
render(sc, OUT, 'overflow', DUR)
