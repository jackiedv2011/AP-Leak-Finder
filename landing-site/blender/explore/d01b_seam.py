"""D01b seam — one quiet mass with a sealed interior; a seam opens and light gets in.

A single monolith, plain and heavy, the colour of stone. A hairline seam runs across it
on a slant. The seam opens a hand's width, and the inside is all colour — lit from within
by something green that was sealed in there. It rises into the gap, then the mass closes
round it again. Behaviours: hidden inside, revealing, surfacing, something in your
business you are not seeing yet.

knobs: open=.42 outer=stone|dark|bone inner=warm|cool tilt=28
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import bmesh
import numpy as np

LOOP = 240
sc = scene(LOOP)
OPEN = float(A.get('open', .55))
TILT = math.radians(float(A.get('tilt', 26)))
SX, SY, SZ = 1.7, 1.5, 2.1
OUTER = {'stone': '#b0aaa1', 'dark': '#444444', 'bone': '#eae5da', 'cream': '#f3e6cc'}[A.get('outer', 'stone')]
INNER = A.get('inner', 'warm')


def inner_mat():
    """The cut faces: a warm field of the palette's colours, lit from the core."""
    m = bpy.data.materials.new('Inner')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.55, .55, .55)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs[0], grad.inputs['Vector'])
    rp = nt.nodes.new('ShaderNodeValToRGB')
    stops = {'warm': ['#ff6838', '#ff7ef2', '#b874fc', '#ffd5f8'], 'cool': ['#00d1ff', '#b874fc', '#ff7ef2', '#bef3ff']}[INNER]
    els = rp.color_ramp.elements
    els[0].position, els[0].color = 0, hexrgb(stops[0])
    els[1].position, els[1].color = .35, hexrgb(stops[1])
    e = els.new(.65); e.color = hexrgb(stops[2])
    e = els.new(1.0); e.color = hexrgb(stops[3])
    nt.links.new(grad.outputs['Fac'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(rp.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = float(A.get('inglow', .35))
    b.inputs['Roughness'].default_value = .45
    return m


def half(name, sign):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= SX; v.co.y *= SY; v.co.z *= SZ
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=.09, segments=4, affect='EDGES', profile=.5)
    n = Vector((math.sin(TILT), 0, math.cos(TILT)))
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=n * sign, clear_outer=True)
    cut_edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    f = bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(rich(OUTER, .55, .12, var=.06, scale=1.4))
    me.materials.append(inner_mat())
    for p in me.polygons:
        p.use_smooth = abs(p.normal.dot(n)) < .99
        if abs(abs(p.normal.dot(n)) - 1) < 1e-3 and abs(Vector(p.center).dot(n)) < 1e-3:
            p.material_index = 1
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob, n


top, n = half('Top', -1)      # keeps the part above the plane
bot, _ = half('Bot', 1)
for o in (top, bot):
    o.location.z = SZ / 2
core = sphere('Core', .22, (0, 0, SZ / 2), glow('green', 2.5, 'green'), 48)
lamp = bpy.data.lights.new('CoreLight', 'POINT')
lamp.color = hexrgb('#00fd74')[:3]
lamp.shadow_soft_size = .2
lo = bpy.data.objects.new('CoreLight', lamp)
sc.collection.objects.link(lo)
ground(0)


@on_pose
def pose(t):
    e = pulse(t, 40, 95, 175, 232)
    top.location = Vector((0, 0, SZ / 2)) + n * (OPEN * e + .004)   # a hair of gap at rest: no coplanar flicker
    top.rotation_euler.y = -.06 * e
    rise = pulse(t, 88, 130, 158, 200)
    camdir = Vector((math.cos(math.radians(-58)), math.sin(math.radians(-58)), 0))
    core.location = Vector((0, 0, SZ / 2)) + n * OPEN * e * .5 + camdir * 1.05 * rise
    core.scale = [.6 + .4 * e] * 3
    lo.location = core.location
    lamp.energy = 25 * e


cam(sc, (0, 0, SZ * .55), 18, 18, -58)
go(sc, 'seam', '1,70,130', LOOP)
