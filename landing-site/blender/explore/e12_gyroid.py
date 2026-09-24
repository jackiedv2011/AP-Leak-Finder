"""E12 gyroid: one continuous surface whose two sides are two labyrinths that never meet.

Walk: money out, money back -> two circulations sharing one body -> a triply periodic
minimal surface: one sheet, two interwoven networks of tunnels.
Shape: a thickened minimal-surface sheet cut to an outline (sphere, block, column, disc).
One side of the sheet is one material, the other side another, and the cut edge a thin
line of colour, so the two networks read as two bodies wound through each other.
Motion: the pattern drifts through the fixed outline, tunnels opening and closing at the
rim; one period per loop, so it is seamless.

knobs: surf=gyroid|schwarzp|schwarzd|neovius  shape=sphere|block|column|disc
       cells= periods across  th= sheet thickness  vox= voxel size  rad= outline size
       a=,b=,rim= side and edge colours  rough= coat=  drift=0|1  axis=x|z (drift direction)
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p3lib import *

LOOP = 90
sc = scene(LOOP)
SURF = A.get('surf', 'gyroid')
SHAPE = A.get('shape', 'sphere')
CELLS = float(A.get('cells', 2.2))
TH = float(A.get('th', .42))
RAD = float(A.get('rad', 1.45))
VOX = float(A.get('vox', .014))
K = 2 * math.pi * CELLS / (2 * RAD)
HALF = {'sphere': (RAD, RAD, RAD), 'block': (RAD * .86,) * 3, 'column': (RAD * .62, RAD * .62, RAD * 1.45),
        'disc': (RAD * 1.2, RAD * 1.2, RAD * .42)}[SHAPE]
Z0 = HALF[2] + .02


def expr(nt, vec, ph):
    """g(p*K + ph) for the chosen surface, built from math nodes in any node tree."""
    N, L = nt.nodes.new, nt.links.new
    s = N('ShaderNodeVectorMath'); s.operation = 'SCALE'; s.inputs['Scale'].default_value = K
    L(vec, s.inputs[0])
    ad = N('ShaderNodeVectorMath'); ad.operation = 'ADD'
    L(s.outputs[0], ad.inputs[0]); L(ph, ad.inputs[1])
    sp = N('ShaderNodeSeparateXYZ'); L(ad.outputs[0], sp.inputs[0])

    def m(op, a, b=None):
        n = N('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]
    x, y, z = sp.outputs['X'], sp.outputs['Y'], sp.outputs['Z']
    sx, sy, sz = m('SINE', x), m('SINE', y), m('SINE', z)
    cx, cy, cz = m('COSINE', x), m('COSINE', y), m('COSINE', z)
    mul, add = (lambda a, b: m('MULTIPLY', a, b)), (lambda a, b: m('ADD', a, b))
    if SURF == 'gyroid':
        g = add(add(mul(sx, cy), mul(sy, cz)), mul(sz, cx))
    elif SURF == 'schwarzp':
        g = add(add(cx, cy), cz)
    elif SURF == 'schwarzd':
        g = add(add(mul(mul(sx, sy), sz), mul(mul(sx, cy), cz)), add(mul(mul(cx, sy), cz), mul(mul(cx, cy), sz)))
    else:  # neovius
        g = add(mul(add(add(cx, cy), cz), .75), mul(mul(mul(cx, cy), cz), 1.0))
    return g, m


# ---------------------------------------------------------------- geometry: volume -> mesh
ob = bpy.data.objects.new('TPMS', bpy.data.meshes.new('TPMSm'))
bpy.context.scene.collection.objects.link(ob)
ng = bpy.data.node_groups.new('TPMSgn', 'GeometryNodeTree')
ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
N, L = ng.nodes.new, ng.links.new
out = N('NodeGroupOutput')
vc = N('GeometryNodeVolumeCube')
ext = Vector(HALF) + Vector((.05, .05, .05))
vc.inputs['Min'].default_value = -ext
vc.inputs['Max'].default_value = ext
vc.inputs['Background'].default_value = -1.0       # outside the grid is empty, not solid
for i, nm in enumerate(('Resolution X', 'Resolution Y', 'Resolution Z')):
    vc.inputs[nm].default_value = int(2 * ext[i] / VOX)
pos = N('GeometryNodeInputPosition')
PH = N('FunctionNodeInputVector')
g, m = expr(ng, pos.outputs[0], PH.outputs[0])
den = m('SUBTRACT', TH / 2, m('ABSOLUTE', g))       # > 0 inside the thickened sheet
if SHAPE == 'sphere':
    ln = N('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L(pos.outputs[0], ln.inputs[0])
    shp = m('SUBTRACT', RAD, ln.outputs['Value'])
else:
    # rounded box / column / disc: superellipsoid-ish distance so the corners are eased
    sp = N('ShaderNodeSeparateXYZ'); L(pos.outputs[0], sp.inputs[0])
    q = [m('POWER', m('DIVIDE', m('ABSOLUTE', sp.outputs[i]), HALF[i]), 6.0) for i in range(3)]
    if SHAPE in ('column', 'disc'):
        q[0] = m('POWER', m('ADD', m('POWER', m('DIVIDE', m('ABSOLUTE', sp.outputs[0]), HALF[0]), 2.0),
                            m('POWER', m('DIVIDE', m('ABSOLUTE', sp.outputs[1]), HALF[1]), 2.0)), 3.0)
        q[1] = 0.0
    tot = m('ADD', m('ADD', q[0], q[1]), q[2])
    shp = m('MULTIPLY', m('SUBTRACT', 1.0, m('POWER', tot, 1 / 6)), min(HALF))
# den is in field units; / K brings it close to a distance, so a smooth minimum can round the
# crease where the outline cuts the sheet (a soft bevel instead of a voxel-stepped edge)
smin = N('ShaderNodeMath'); smin.operation = 'SMOOTH_MIN'
L(m('DIVIDE', den, K), smin.inputs[0]); L(shp, smin.inputs[1])
smin.inputs[2].default_value = float(A.get('soft', .05))
mn = m('MULTIPLY', smin.outputs[0], 10.0)
L(mn, vc.inputs['Density'])
v2m = N('GeometryNodeVolumeToMesh')
v2m.inputs['Threshold'].default_value = 0.0
L(vc.outputs[0], v2m.inputs['Volume'])
ssm = N('GeometryNodeSetShadeSmooth'); L(v2m.outputs[0], ssm.inputs['Geometry'])
smt = N('GeometryNodeSetMaterial'); L(ssm.outputs[0], smt.inputs['Geometry'])
L(smt.outputs[0], out.inputs[0])
ob.modifiers.new('g', 'NODES').node_group = ng


# ---------------------------------------------------------------- material: side of the sheet by the sign of g
def two_side(a, b, rim):
    mt = bpy.data.materials.new('TPMSmat')
    mt.use_nodes = True
    nt = mt.node_tree
    bs = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    phs = nt.nodes.new('ShaderNodeCombineXYZ')
    gg, mm = expr(nt, tc.outputs['Object'], phs.outputs[0])
    f = mm('ADD', mm('MULTIPLY', gg, 1 / TH), .5)
    rp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(f, rp.inputs[0])
    cr = rp.color_ramp
    cr.interpolation = 'EASE'
    cr.elements[0].position, cr.elements[0].color = .22, col(a)
    cr.elements[1].position, cr.elements[1].color = .78, col(b)
    e = cr.elements.new(.5); e.color = col(rim)
    nt.links.new(rp.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = float(A.get('rough', .3))
    bs.inputs['Coat Weight'].default_value = float(A.get('coat', .5))
    bs.inputs['Coat Roughness'].default_value = .06
    return mt, phs


MT, PHS = two_side(A.get('a', 'bone'), A.get('b', 'g6'), A.get('rim', 'green'))
smt.inputs['Material'].default_value = MT
DRIFT = A.get('drift', '1') == '1'
AXIS = {'x': 0, 'y': 1, 'z': 2}[A.get('axis', 'x')]


@on_pose
def pose(t):
    s = 2 * math.pi * t / LOOP if DRIFT else 0.0
    v = [0.0, 0.0, 0.0]
    v[AXIS] = s
    PH.vector = v
    for i, c in enumerate(v):
        PHS.inputs[i].default_value = c
    ob.rotation_euler.z = math.radians(float(A.get('rz', 20))) + (.12 * math.sin(2 * math.pi * t / LOOP) if DRIFT else 0)


ob.location = (0, 0, Z0)
pose(0)
ground()
cam(sc, (0, 0, Z0), 19 * max(1, HALF[2] / RAD * .9), 18, -62, 100)
go(sc, 'tpms', '1,45', LOOP)
