"""E09 section: a smooth dark stone, sliced, that fans open to show banded agate inside.

Walk: a business from outside -> what it holds inside -> a cross-section -> a cut stone.
Shape: a heavy rounded pebble cut into parallel slices. Closed, it is one quiet dark
object; fanned, every cut face shows a different ring of the stone's banding (bone,
graphite, pale green, one vivid green seam). Motion: the slices fan out on a hinge like
a deck of cards, hold, and close back into the whole.

knobs: n= slices  spread= degrees  skin=spec  mats unused
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *
from mathutils import Matrix

LOOP = 90
sc = scene(LOOP)
NS = int(A.get('n', 9))
SPREAD = math.radians(float(A.get('spread', 5)))
DIMS = (float(A.get('lx', 2.9)), float(A.get('ly', 2.0)), float(A.get('lz', 1.35)))
SKIN = mat(A.get('skin', 'rubber:g5'))


def agate():
    """Concentric bands around the stone's centre, warped by noise so they read as mineral."""
    m = bpy.data.materials.new('Agate')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    N, L = nt.nodes.new, nt.links.new
    tc = N('ShaderNodeTexCoord')
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / DIMS[0] * 2, 1 / DIMS[1] * 2, 1 / DIMS[2] * 2)
    L(tc.outputs['Object'], mp.inputs['Vector'])
    nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.4; nz.inputs['Detail'].default_value = 3
    L(mp.outputs['Vector'], nz.inputs['Vector'])
    dist = N('ShaderNodeVectorMath'); dist.operation = 'LENGTH'
    L(mp.outputs['Vector'], dist.inputs[0])
    wob = N('ShaderNodeMath'); wob.operation = 'MULTIPLY_ADD'
    L(nz.outputs['Fac'], wob.inputs[0]); wob.inputs[1].default_value = .22
    L(dist.outputs['Value'], wob.inputs[2])
    rp = N('ShaderNodeValToRGB')
    L(wob.outputs[0], rp.inputs['Fac'])
    cr = rp.color_ramp
    cr.interpolation = 'EASE'
    stops = [(0.0, 't_green'), (.18, 'green'), (.22, 'g6'), (.27, 'bone'), (.40, 'bone'), (.43, 'g4'),
             (.47, 'cream'), (.60, '#dcd5c8'), (.63, 'g6'), (.66, 't_green'), (.72, 'bone'), (.8, 'g5'), (1.0, 'g6')]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], col(stops[0][1])
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], col(stops[-1][1])
    for p, c in stops[1:-1]:
        e = cr.elements.new(p)
        e.color = col(c)
    L(rp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .18
    b.inputs['Coat Weight'].default_value = .6
    b.inputs['Coat Roughness'].default_value = .04
    return m


AG = agate()
blob, _ = superellipsoid('Stone', DIMS, n=float(A.get('bn', 2.6)), seg=128, mat=SKIN)
# a gentle asymmetry so it reads as a found stone, not a pill
V = np.zeros(len(blob.data.vertices) * 3, np.float32); blob.data.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
V[:, 2] *= 1 + .12 * np.tanh(V[:, 0])
V[:, 1] *= 1 - .08 * V[:, 0] / DIMS[0]
set_verts(blob, V)
blob.data.materials.append(AG)

GAPW = .018
x0, x1 = -DIMS[0] / 2 - .05, DIMS[0] / 2 + .05
edges = np.linspace(x0, x1, NS + 1)
slices = []
for k in range(NS):
    a, bnd = edges[k] + GAPW / 2, edges[k + 1] - GAPW / 2
    cut = box(f'Cut{k}', (bnd - a, 6, 6), ((a + bnd) / 2, 0, 0), AG, bev=0)
    ob = blob.copy()
    ob.data = blob.data.copy()
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new('b', 'BOOLEAN')
    md.operation = 'INTERSECT'
    md.solver = 'EXACT'
    md.object = cut
    md.material_mode = 'TRANSFER'
    sl = bake(ob)
    sl.name = f'Slice{k}'
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.objects.remove(cut, do_unlink=True)
    slices.append((sl, (a + bnd) / 2))
bpy.data.objects.remove(blob, do_unlink=True)
Z0 = DIMS[2] / 2 + .02
HINGE = Vector((0, 0, -DIMS[2] / 2))


@on_pose
def pose(t):
    o = ramp(t, 8, 36) * (1 - ramp(t, 60, 86))
    for k, (sl, xc) in enumerate(slices):
        c = k - (NS - 1) / 2
        ang = SPREAD * c * o
        lift = .0
        hg = HINGE + Vector((xc, 0, 0))
        # each slice also turns on its own vertical axis, so its cut face comes round to the viewer
        turn = math.radians(float(A.get('turn', 0))) * o * c / max(1, (NS - 1) / 2)
        sl.matrix_world = Matrix.Translation((c * float(A.get('gap', .3)) * o, 0, Z0 + lift)) @ Matrix.Translation(hg) @ \
            Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(ang, 4, "Y") @ Matrix.Translation(-hg)


pose(0)
ground()
cam(sc, (0, 0, .75), 22, 22, float(A.get('az', -48)), 100)
go(sc, 'section', '1,45', LOOP)
