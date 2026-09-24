"""E13 node: arms of different reach grown into one smooth joint, like a cast structural node.

Walk: infrastructure -> where members meet -> the cast steel nodes of long-span roofs
(many loads resolved into one piece).
Shape: six capsule arms at different angles and lengths, fused with soft fillets into a
single body; reads as engineered and organic at once. Motion: the arms articulate slowly
about the joint, one reaching out and drawing back, the fillets flowing as they move.

knobs: mat=spec  thr= metaball threshold  res= metaball resolution
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *
from mathutils import Quaternion

LOOP = 90
sc = scene(LOOP)
MAT = mat(A.get('mat', 'stone:bone'))
ACC = mat(A.get('acc', 'lacquer:green'))
mb = bpy.data.metaballs.new('Node')
mb.resolution = float(A.get('mres', .05))
mb.render_resolution = float(A.get('rres', .03))
mb.threshold = float(A.get('thr', .6))
ob = bpy.data.objects.new('Node', mb)
bpy.context.scene.collection.objects.link(ob)
mb.materials.append(MAT)
Z0 = float(A.get('z', 1.55))
ob.location = (0, 0, Z0)
rng = np.random.default_rng(int(A.get('seed', 7)))
# arm directions (unit), lengths, radii: hand-set so the silhouette is asymmetric
ARMS = [((1, .15, .35), 1.7, .30), ((-.8, .5, .25), 1.35, .27), ((-.35, -.9, .3), 1.2, .25),
        ((.3, .6, -.75), 1.05, .26), ((-.4, -.2, -.9), 1.15, .28), ((.2, -.4, .9), 1.0, .22)]
els = []
core = mb.elements.new(type='BALL')
core.radius = .55
core.stiffness = 2.0
for d, ln, r in ARMS:
    e = mb.elements.new(type='CAPSULE')
    e.radius = r
    e.stiffness = 2.0
    els.append((e, Vector(d).normalized(), ln, r))


def place(e, d, ln):
    # a capsule's axis is its local X; size_x is the half length of the straight part
    e.size_x = ln / 2
    e.co = d * (ln / 2 + .1)
    e.rotation = Vector((1, 0, 0)).rotation_difference(d)


@on_pose
def pose(t):
    ph = 2 * math.pi * t / LOOP
    for i, (e, d, ln, r) in enumerate(els):
        wob = Quaternion(Vector((0, 0, 1)), .18 * math.sin(ph + i * 1.3)) @ Quaternion(Vector((1, 0, 0)), .12 * math.cos(ph + i * .7))
        dd = wob @ d
        reach = ln * (1 + (.28 * math.sin(ph) if i == 0 else 0))
        place(e, dd, reach)
    ob.rotation_euler.z = math.radians(float(A.get('rz', 25))) + .15 * math.sin(ph)
    ob.update_tag()


pose(0)
ground()
cam(sc, (0, 0, Z0 - .05), 19, 16, -62, 100)
go(sc, 'node', '1,45', LOOP)
