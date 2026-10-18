"""Shared set for the "what Reclaim finds" exhibits (exhibit_*.py).

The look is the landing's own, from looklib, unchanged: one sun with a low warm fill, the 100 mm lens,
Cycles with motion blur, the satin `plain` materials with their fine grain, small angle-limited bevels.
The film is transparent; a shadow catcher under the objects keeps only the sun's shadow on the floor, and
the encoder lays the frames on the exhibit's colour (meta.json), which is also the page's colour round them.

The motion is the apple-style-motion skill's, ported: cubic-bezier eases by role (`out` for arrivals,
`inOut` for A to B, `swoop` for the camera, `in` for exits), SwiftUI springs, the After Effects inertial
settle for things that seat, arcs, staggers, a slow camera push so no frame is frozen. Every animated
object is keyed on every frame (linear between), like hero.py, so motion blur sees the true motion.
Films run at 60 fps; times in the scripts are in seconds.
"""
import bpy, json, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K

A = K.args()
FPS = int(A.get('fps', 60))

# page colour (floor) and object stock, each exhibit in its own hue. The stocks are the old loops' bright
# accents: picked so a face square to the sun renders as the site's colour (lit = stock x 5 x .69 / pi, then
# Khronos PBR Neutral): green #00fd74, orange #ff6838, violet #7a5cff, cyan #00d1ff.
PALETTES = {
    'mint':    ('c4e9d3', '#2fee76'),
    'apricot': ('f6cfb2', '#f66535'),
    'lilac':   ('d8d0f3', '#7558f6'),
    'sky':     ('c2dff2', '#00c9f6'),
}


# ---------------------------------------------------------------- curves (apple-style-motion, motion.js)
def bezier(x1, y1, x2, y2):
    cx, bx = 3 * x1, 3 * (x2 - x1) - 3 * x1
    ax = 1 - cx - bx
    cy, by = 3 * y1, 3 * (y2 - y1) - 3 * y1
    ay = 1 - cy - by
    sx = lambda t: ((ax * t + bx) * t + cx) * t
    sy = lambda t: ((ay * t + by) * t + cy) * t
    dsx = lambda t: (3 * ax * t + 2 * bx) * t + cx

    def solve(x):
        t = x
        for _ in range(8):
            e = sx(t) - x
            if abs(e) < 1e-7:
                return t
            d = dsx(t)
            if abs(d) < 1e-6:
                break
            t -= e / d
        lo, hi, t = 0.0, 1.0, x
        for _ in range(50):
            v = sx(t)
            if abs(v - x) < 1e-7:
                break
            lo, hi = (t, hi) if x > v else (lo, t)
            t = (lo + hi) / 2
        return t
    return lambda p: 0.0 if p <= 0 else 1.0 if p >= 1 else sy(solve(p))


EASES = {
    'linear': lambda p: min(1.0, max(0.0, p)),
    'out': bezier(.16, 1, .3, 1),         # expo-out: arrivals, a fast start and a long settle
    'outSoft': bezier(.25, 1, .5, 1),     # quart-out: gentler arrivals, big objects
    'in': bezier(.7, 0, .84, 0),          # expo-in: exits
    'inSoft': bezier(.5, 0, .75, 0),
    'inOut': bezier(.65, 0, .35, 1),      # cubic in-out: A to B, both ends at rest
    'morph': bezier(.9, .01, .06, 1),     # the editors' "tight" curve
    'swoop': bezier(.83, 0, .17, 1),      # quint in-out: big camera moves
    'apple': bezier(.4, 0, .6, 1),
}


def tw(t, t0, dur, ease='out'):
    """Progress 0..1 of a move that starts at t0 and takes dur seconds, on a named curve."""
    return EASES[ease]((t - t0) / dur) if dur > 0 else float(t >= t0)


def spring(t, t0, duration=.5, bounce=0.0):
    """SwiftUI spring from 0 to 1 started at rest at t0 (duration is the perceptual one, bounce 0..1)."""
    tau = t - t0
    if tau <= 0:
        return 0.0
    w0 = 2 * math.pi / max(.05, duration)
    z = max(.02, 1 - bounce)
    if z < .9999:
        wd = w0 * math.sqrt(1 - z * z)
        x = math.exp(-z * w0 * tau) * (math.cos(wd * tau) + (z * w0 / wd) * math.sin(wd * tau))
    else:
        x = (1 + w0 * tau) * math.exp(-w0 * tau)
    return 1 - x


def inertia(t, t1, v, amp=.06, freq=1.8, decay=5.0):
    """The After Effects inertial bounce: an arrival at speed v (units/s) at t1 rings on past its mark."""
    tau = t - t1
    return 0.0 if tau <= 0 else v * amp * math.sin(freq * tau * 2 * math.pi) / math.exp(decay * tau)


def lerp(p, q, e):
    if isinstance(p, (int, float)):
        return p + (q - p) * e
    return tuple(a + (b - a) * e for a, b in zip(p, q))


def arc(e, height):
    """A lift that rises and falls over a move (0 at both ends)."""
    return height * math.sin(math.pi * min(1.0, max(0.0, e)))


# ---------------------------------------------------------------- the set
def stage(palette, dur, glass=False):
    """The landing's render settings and light, a shadow-catching floor, 16:9 at 60 fps for dur seconds.
    Returns (scene, object material)."""
    K.reset()
    for w in list(bpy.data.worlds):
        bpy.data.worlds.remove(w)
    res = int(A.get('res', 1280))
    n = frames_in(dur)
    sc = K.setup_render(res, int(A.get('spp', 64)), n, A)
    sc.render.resolution_y = round(res * 9 / 16)
    sc.render.fps = FPS
    sc.render.use_overwrite = True
    sc.render.use_placeholder = False
    if glass:   # clear glass: the film behind it stays transparent, so the page colour shows through
        sc.cycles.film_transparent_glass = True
        sc.cycles.max_bounces, sc.cycles.transmission_bounces, sc.cycles.transparent_max_bounces = 12, 10, 8
    K.lights(sc, sun_from=tuple(float(x) for x in A.get('sun', '.5,-.55,.7').split(',')),
             strength=float(A.get('sunE', 5.0)), angle=float(A.get('sunA', 2.0)), fill=float(A.get('fill', .12)))
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = 'floor'
    floor.is_shadow_catcher = True
    # how dark the floor shadow is (0..1). The catcher keeps the ratio of light with and without the objects,
    # and under one hard sun that is near black; a shadowless light that reaches only the floor lifts it
    # without touching how the objects are lit.
    shade = float(A.get('shade', .38))
    sun_dir = Vector(tuple(float(x) for x in A.get('sun', '.5,-.55,.7').split(','))).normalized()
    lift = bpy.data.lights.new('floor_lift', 'SUN')
    lift.energy = float(A.get('sunE', 5.0)) * sun_dir.z * (1 - shade) / shade
    lift.use_shadow = False
    lo = bpy.data.objects.new('floor_lift', lift)
    sc.collection.objects.link(lo)
    only = bpy.data.collections.new('floor_only')
    only.objects.link(floor)
    lo.light_linking.receiver_collection = only
    floor_hex, stock = PALETTES[palette]
    sc['bg'] = floor_hex
    return sc, floor, K.plain(palette.title(), stock, float(A.get('rough', .45)))


def frames_in(dur):
    return round(dur * FPS) + 1


def ftime(f):
    return (f - 1) / FPS


def camera(sc):
    cd = bpy.data.cameras.new('Cam')
    cd.lens = float(A.get('lens', 100))
    cd.clip_start, cd.clip_end = .1, 300
    cam = bpy.data.objects.new('Cam', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.rotation_mode = 'QUATERNION'
    return cam


def aim(cam, target, el_deg, dist, az_deg=0.0):
    """Camera on a sphere round target: el above the floor, az round from the front (-y)."""
    el, az = math.radians(el_deg), math.radians(az_deg)
    t = Vector(target)
    cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
    q = (t - cam.location).to_track_quat('-Z', 'Y')
    if cam.rotation_quaternion.dot(q) < 0:   # the same turn, the near way round (no flips between keys)
        q.negate()
    cam.rotation_quaternion = q


def bevel(o, width=.02, angle=30):
    """looklib's bevel: one segment, on the angled edges only."""
    bv = o.modifiers.new('bevel', 'BEVEL')
    bv.width, bv.segments, bv.limit_method, bv.angle_limit = width, 1, 'ANGLE', math.radians(angle)
    return bv


# ---------------------------------------------------------------- keys and output
def bake(sc, objs, pose, dur):
    """Pose every frame and key what moves (location, rotation, scale), linear between, for motion blur."""
    for f in range(1, frames_in(dur) + 1):
        pose(ftime(f))
        for o in objs:
            o.keyframe_insert('location', frame=f)
            o.keyframe_insert('rotation_quaternion' if o.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
            o.keyframe_insert('scale', frame=f)
    for o in objs:
        if o.animation_data and o.animation_data.action:
            for fc in fcurves(o.animation_data.action):
                for k in fc.keyframe_points:
                    k.interpolation = 'LINEAR'


def fcurves(action):
    """An action's F-curves (Blender 5 keeps them in layers / strips / channelbags)."""
    if hasattr(action, 'fcurves') and len(getattr(action, 'fcurves', [])):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                out.extend(bag.fcurves)
    return out


def out_dir(default):
    d = os.path.abspath(A.get('out', default))
    os.makedirs(d, exist_ok=True)
    return d


def render(sc, out, prefix, dur, pose_last=None):
    """frames=1,40,80: those frames as <prefix>_<f>.png for a look. Otherwise every frame as f_NNNN.png,
    meta.json (page colour, fps) for the encoder, and with still=1 the resting pose large as still.png."""
    with open(os.path.join(out, 'meta.json'), 'w') as fh:
        json.dump({'bg': sc['bg'], 'fps': FPS, 'frames': frames_in(dur)}, fh)
    if 'frames' in A:
        for f in [int(x) for x in A['frames'].split(',')]:
            sc.frame_set(f)
            sc.render.filepath = os.path.join(out, f'{prefix}_{f:03d}.png')
            bpy.ops.render.render(write_still=True)
            print('WROTE', sc.render.filepath)
        return
    sc.frame_start, sc.frame_end = 1, frames_in(dur)
    sc.render.filepath = os.path.join(out, 'f_')
    bpy.ops.render.render(animation=True)
    if A.get('still') == '1':
        sc.frame_set(frames_in(dur))
        sc.render.use_motion_blur = False
        r, aspect = int(A.get('stillres', 2560)), sc.render.resolution_y / sc.render.resolution_x
        sc.render.resolution_x, sc.render.resolution_y = r, round(r * aspect)
        sc.render.filepath = os.path.join(out, 'still.png')
        bpy.ops.render.render(write_still=True)
        print('WROTE', sc.render.filepath)
