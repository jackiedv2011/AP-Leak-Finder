"""Onboarding look: the landing's light, camera, render and motion (looklib), with a
different substance. Where the landing builds from terrazzo and oak, onboarding is
built from three things only:

  clay   matte black, hand-pressed blocks: the weight of the paperwork
  paper  cream sheets and reams, some ruled: the records themselves
  green  one glossy object per scene: the money that is still yours

Brass (a stamp) and green wire (a connection) are the only extras, each used once.
"""
import bpy, bmesh, math, re
from mathutils import Vector
import looklib as K
from looklib import _n, _l, _math, _mix, _base, _coords, _ramp, _bump, hexrgb


# ---------------------------------------------------------------- materials
def clay(name, base='#3b3a39', rough=.8, dent=.9):
    """Matte modelling clay: a slow value drift, thumb-pressed dents, fine grain."""
    m, nt, b = _base(name)
    v = _coords(nt)
    drift = _n(nt, 'ShaderNodeTexNoise')
    drift.inputs['Scale'].default_value = 2.2
    drift.inputs['Detail'].default_value = 3
    _l(nt, v, drift.inputs['Vector'])
    dr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, drift.outputs['Fac'], dr.inputs['Value'])
    dr.inputs['From Min'].default_value, dr.inputs['From Max'].default_value = .3, .7
    dr.inputs['To Min'].default_value, dr.inputs['To Max'].default_value = .84, 1.12
    col = _mix(nt, 1.0, hexrgb(base), dr.outputs['Result'], 'MULTIPLY')
    _l(nt, col, b.inputs['Base Color'])
    # dents: smooth voronoi cells read as shallow presses, not a pattern
    vo = _n(nt, 'ShaderNodeTexVoronoi', feature='SMOOTH_F1')
    vo.inputs['Scale'].default_value = 7
    vo.inputs['Smoothness'].default_value = 1
    _l(nt, v, vo.inputs['Vector'])
    gr = _n(nt, 'ShaderNodeTexNoise')
    gr.inputs['Scale'].default_value = 85
    gr.inputs['Detail'].default_value = 4
    _l(nt, v, gr.inputs['Vector'])
    h = _math(nt, 'ADD', _math(nt, 'MULTIPLY', vo.outputs['Distance'], dent), _math(nt, 'MULTIPLY', gr.outputs['Fac'], .35))
    _bump(nt, b, h, .5, .006)
    # roughness breathes a little with the grain, so the key light breaks up on it
    rr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, gr.outputs['Fac'], rr.inputs['Value'])
    rr.inputs['To Min'].default_value, rr.inputs['To Max'].default_value = rough - .1, rough + .08
    _l(nt, rr.outputs['Result'], b.inputs['Roughness'])
    b.inputs['Specular IOR Level'].default_value = .38
    return m


def paper(name, base='#efe4cf', rough=.74):
    """Uncoated stock: faint fibre streaks and tooth."""
    m = K.plain(name, base, rough, streak=.06, spec=.32)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Sheen Weight'].default_value = .2
    return m


def ream(name, light='#efe4cf', dark='#b9a587', leaves=11.0):
    """A cut edge of stacked sheets: pale leaves split by thin shadow lines."""
    return K.plywood(name, light, dark, layers=leaves, rough=.76)


def ruled(name, base='#efe4cf', line='#8fbf86', rows=34.0, cols=(.16, .5)):
    """Ledger stock: faint green rows and two column rules, in object space."""
    m, nt, b = _base(name)
    tc = _n(nt, 'ShaderNodeTexCoord')
    sep = _n(nt, 'ShaderNodeSeparateXYZ')
    _l(nt, tc.outputs['Object'], sep.inputs[0])
    # rows along Y: frac(y * rows) < .07
    fr = _math(nt, 'FRACT', _math(nt, 'MULTIPLY', sep.outputs['Y'], rows))
    row = _math(nt, 'LESS_THAN', fr, .075)
    mask = row
    for cx in cols:
        d = _math(nt, 'ABSOLUTE', _math(nt, 'SUBTRACT', sep.outputs['X'], cx))
        mask = _math(nt, 'MAXIMUM', mask, _math(nt, 'LESS_THAN', d, .006))
    col = _mix(nt, _math(nt, 'MULTIPLY', mask, .55), hexrgb(base), hexrgb(line))
    _l(nt, col, b.inputs['Base Color'])
    gn = _n(nt, 'ShaderNodeTexNoise')
    gn.inputs['Scale'].default_value = 240
    _l(nt, _coords(nt), gn.inputs['Vector'])
    _bump(nt, b, gn.outputs['Fac'], .05, .002)
    b.inputs['Roughness'].default_value = .74
    b.inputs['Specular IOR Level'].default_value = .32
    b.inputs['Sheen Weight'].default_value = .2
    return m


def gem(name, base='#3cec6e', rough=.2):
    """The one saturated thing in frame: lacquered, glossy, a clear coat over colour."""
    m, nt, b = _base(name)
    b.inputs['Base Color'].default_value = hexrgb(base)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .6
    b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Coat Roughness'].default_value = .06
    gn = _n(nt, 'ShaderNodeTexNoise')
    gn.inputs['Scale'].default_value = 60
    _l(nt, _coords(nt), gn.inputs['Vector'])
    _bump(nt, b, gn.outputs['Fac'], .03, .002)
    return m


def brass(name, base='#c49a4e', rough=.3):
    m, nt, b = _base(name)
    b.inputs['Base Color'].default_value = hexrgb(base)
    b.inputs['Metallic'].default_value = 1.0
    nz = _n(nt, 'ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 18
    nz.inputs['Detail'].default_value = 5
    _l(nt, _coords(nt), nz.inputs['Vector'])
    rr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, nz.outputs['Fac'], rr.inputs['Value'])
    rr.inputs['To Min'].default_value, rr.inputs['To Max'].default_value = rough - .1, rough + .14
    _l(nt, rr.outputs['Result'], b.inputs['Roughness'])
    _bump(nt, b, nz.outputs['Fac'], .06, .003)
    return m


def library():
    return {
        'clay': clay('Clay'),
        'clay2': clay('ClayLight', '#474543'),           # a second black so a pile has value steps
        'paper': paper('Paper'),
        'paper2': paper('Bond', '#f4eee2'),             # whiter bond for contrast against cream
        'manila': paper('Manila', '#e6d3ad'),
        'ream': ream('Ream'),
        'ruled': ruled('Ruled'),
        'gem': gem('Gem'),
        'brass': brass('Brass'),
        'wire': K.plain('Wire', '#2fd866', .32, spec=.55, coat=.6),
        'ink': K.plain('Ink', '#24211f', .6),
        'pad': K.plain('StampPad', '#2fd866', .55),
    }


# ---------------------------------------------------------------- geometry
def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.rotation_mode = 'QUATERNION'
    return ob


def mesh_obj(name, verts, faces, mat, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if isinstance(mat, (list, tuple)):
        for mm in mat:
            me.materials.append(mm)
    else:
        me.materials.append(mat)
    return link(bpy.data.objects.new(name, me))


def clay_block(name, w, d, h, mat, round_=.07, seed=0):
    """A pillowy block: a box, bevelled, then subdivided so it reads as pressed clay."""
    x, y, z = w / 2, d / 2, h / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mesh_obj(name, v, f, mat, smooth=True)
    bv = ob.modifiers.new('bevel', 'BEVEL')
    bv.width = round_
    bv.segments = 2
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    return ob


def rrect(w, d, r, seg=5):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append(Vector((cx + r * math.cos(a), cy + r * math.sin(a))))
    return pts


def ream_block(name, w, d, h, M, top='paper', side='ream'):
    """A ream: cut leaves on the sides, a plain sheet on top."""
    ob, _ = K.prism(name, rrect(w, d, .02, 3), h, M, side, top=top, bevel=.004)
    ob.rotation_mode = 'QUATERNION'
    return ob


def sheet(name, w, d, mat, curl=0.0, curl_from=.55, sag=0.0, t=.006, nx=28, ny=18, edge='x'):
    """A single sheet. curl lifts the far edge (x > curl_from*w/2) like a page drying;
    sag droops both ends (a sheet overhanging a block). Solidified to `t`."""
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = -w / 2 + w * i / nx
            y = -d / 2 + d * j / ny
            u = (x if edge == 'x' else y) / ((w if edge == 'x' else d) / 2)   # -1..1 across the curl axis
            z = 0.0
            if curl:
                k = max(0.0, (u - curl_from) / (1 - curl_from))
                z += curl * k * k
            if sag:
                z -= sag * u * u
            verts.append((x, y, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    ob = mesh_obj(name, verts, faces, mat, smooth=True)
    so = ob.modifiers.new('solid', 'SOLIDIFY')
    so.thickness = t
    so.offset = 0
    return ob


def gem_obj(name, mat, size=(.62, .46, .2), subdiv=1, seed=3):
    """Low-poly faceted lozenge: an icosphere, flattened, flat shaded, edges just softened."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    import random
    r = random.Random(seed)
    for vtx in bm.verts:
        vtx.co.x *= size[0] * r.uniform(.94, 1.04)
        vtx.co.y *= size[1] * r.uniform(.94, 1.04)
        vtx.co.z *= size[2]
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    bv = ob.modifiers.new('bevel', 'BEVEL')
    bv.width = .012
    bv.segments = 2
    bv.limit_method = 'ANGLE'
    bv.angle_limit = math.radians(10)
    return ob


def disc(name, r, h, M, side, top=None, bevel=.01, n=96):
    pts = [Vector((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n))) for k in range(n)]
    ob, _ = K.prism(name, pts, h, M, side, top=top, bevel=bevel, smooth=True)
    ob.rotation_mode = 'QUATERNION'
    return ob


def tube(name, pts, radius, mat, res=4):
    """A wire along a polyline with rounded corners (bezier with auto handles on a poly)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1)
    cu.materials.append(mat)
    return link(bpy.data.objects.new(name, cu))


def rounded_path(pts, r=.12, seg=6):
    """Fillet a right-angle polyline so a wire bends like a trace, not a kink."""
    out = [Vector(pts[0])]
    for i in range(1, len(pts) - 1):
        a, b, c = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1])
        d0, d1 = (b - a).normalized(), (c - b).normalized()
        rr = min(r, (b - a).length / 2, (c - b).length / 2)
        p0, p1 = b - d0 * rr, b + d1 * rr
        for k in range(seg + 1):
            t = k / seg
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1)
    out.append(Vector(pts[-1]))
    return out


# ---------------------------------------------------------------- the Reclaim mark, as geometry
MARK_PATHS = [
    'M13 39V9h11.3c6.7 0 10.7 3.4 10.7 9.2 0 4.25-2.15 7.15-5.85 8.42l3.42 4.95-5.25 3.67-4.37-6.33H19.4V39H13Zm6.4-16.42h4.25c3.15 0 4.95-1.5 4.95-4.12 0-2.68-1.8-4.12-4.95-4.12H19.4v8.24Z',
    'M31.75 32.36 38 41.35h-7.15l-2.67-3.85Z',
]


def _svg_polys(d, steps=10):
    toks = re.findall(r'[MmVvHhCcLlZz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    polys, cur, pos, start, cmd, i = [], [], Vector((0, 0)), Vector((0, 0)), None, 0

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in 'Zz':
                if cur:
                    polys.append(cur)
                cur, pos = [], start.copy()
                continue
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'M':
            p = Vector((num(), num()))
            pos = pos + p if rel else p
            start = pos.copy()
            if cur:
                polys.append(cur)
            cur = [pos.copy()]
            cmd = 'l' if rel else 'L'
        elif c == 'L':
            p = Vector((num(), num()))
            pos = pos + p if rel else p
            cur.append(pos.copy())
        elif c == 'H':
            x = num()
            pos = Vector((pos.x + x if rel else x, pos.y))
            cur.append(pos.copy())
        elif c == 'V':
            y = num()
            pos = Vector((pos.x, pos.y + y if rel else y))
            cur.append(pos.copy())
        elif c == 'C':
            c1, c2, e = Vector((num(), num())), Vector((num(), num())), Vector((num(), num()))
            if rel:
                c1, c2, e = pos + c1, pos + c2, pos + e
            for k in range(1, steps + 1):
                s = k / steps
                cur.append((1 - s) ** 3 * pos + 3 * (1 - s) ** 2 * s * c1 + 3 * (1 - s) * s * s * c2 + s ** 3 * e)
            pos = e
    if cur:
        polys.append(cur)
    return polys


def mark(name, size, depth, mats):
    """The Reclaim mark as a filled, extruded curve, `size` units tall, lying in XY,
    centred, facing +Z. mats = (body, leg)."""
    objs = []
    for k, d in enumerate(MARK_PATHS):
        cu = bpy.data.curves.new(f'{name}{k}', 'CURVE')
        cu.dimensions = '2D'
        cu.fill_mode = 'BOTH'
        cu.extrude = depth / 2
        cu.bevel_depth = min(.004, depth / 4)
        cu.bevel_resolution = 1
        for poly in _svg_polys(d):
            if len(poly) > 1 and (poly[0] - poly[-1]).length < 1e-4:
                poly = poly[:-1]
            sp = cu.splines.new('POLY')
            sp.points.add(len(poly) - 1)
            for p, c in zip(sp.points, poly):
                x = (c.x - 25.5) / 32.4 * size
                y = -(c.y - 25.2) / 32.4 * size
                p.co = (x, y, 0, 1)
            sp.use_cyclic_u = True
        cu.materials.append(mats[k])
        objs.append(link(bpy.data.objects.new(f'{name}{k}', cu)))
    return objs


def text(name, body, size, depth, mat, font='C:/Windows/Fonts/arialbd.ttf', bevel=.01):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    try:
        cu.font = bpy.data.fonts.load(font, check_existing=True)
    except Exception:
        pass
    cu.size = size
    cu.extrude = depth / 2
    cu.bevel_depth = bevel
    cu.bevel_resolution = 2
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    cu.materials.append(mat)
    return link(bpy.data.objects.new(name, cu))


# ---------------------------------------------------------------- render framing
def set_res(sc, w, h):
    sc.render.resolution_x, sc.render.resolution_y = w, h


def cam_axes(az_deg, el_deg):
    """Camera right and up vectors (world) for a camera at azimuth/elevation looking at
    a target, so objects can be laid out in screen thirds."""
    el, az = math.radians(el_deg), math.radians(az_deg)
    fwd = -Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd).normalized()
    return right, up
