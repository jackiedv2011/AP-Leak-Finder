"""Shared helpers for the exploration pass (Agent C, night of 2026-09-24).

Everything here sits on top of looklib (render settings, house lights, camera)
without modifying it. What this adds:

- a non-paper material vocabulary (clay, satin, metal, frosted glass, glow)
- a few primitives with bevels that hold up at 317px
- procedural animation: a scene defines pose(t) with t in frames (float, 0-based);
  a frame_change handler calls it, so Cycles motion blur sees sub-frame motion
  and a loop is seamless by construction when pose(t) == pose(t + LOOP)
- a render loop that writes frames + optional flat-bg composites

Run a direction:  "$B" -b --factory-startup --python explore/dNN_x.py -- out=out/explore/dNN_x res=640 spp=32 frames=1,60,120
"""
import bpy, math, os, sys, random, time
from mathutils import Vector, Quaternion, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import looklib as K  # noqa: E402

A = K.args()
hexrgb = K.hexrgb
sstep = K.sstep

# ---------------------------------------------------------------- palette
PAL = {
    'green': '#00fd74', 'blue': '#00d1ff', 'orange': '#ff6838', 'pink': '#ff7ef2', 'purple': '#b874fc',
    't_green': '#d1ffca', 't_blue': '#bef3ff', 't_orange': '#ffe0c4', 't_pink': '#ffd5f8', 't_purple': '#e7cfff',
    'g1': '#e5e5e5', 'g2': '#c6c6c6', 'g3': '#979797', 'g4': '#444444', 'g5': '#2f2f2f', 'g6': '#1a1a1a',
    'white': '#ffffff', 'black': '#000000', 'cream': '#f3e6cc', 'bone': '#eae5da',
}


def col(k):
    return hexrgb(PAL.get(k, k))


# ---------------------------------------------------------------- scene
def scene(loop=240, res=None, spp=None, lights=True, **light_kw):
    K.reset()
    for coll in (bpy.data.curves, bpy.data.node_groups):
        for d in list(coll):
            coll.remove(d)
    sc = K.setup_render(int(A.get('res', res or 640)), int(A.get('spp', spp or 32)), loop, A)
    # the brief asks for the OptiX denoiser; looklib uses OIDN-on-GPU. dn=oidn keeps looklib's.
    if A.get('dn', 'optix') == 'optix':
        sc.cycles.denoiser = 'OPTIX'
    if A.get('mb', '1') == '0':
        sc.render.use_motion_blur = False
    if lights:
        kw = dict(light_kw)
        if 'sun' in A:
            kw['sun_from'] = tuple(float(x) for x in A['sun'].split(','))
        if 'sunE' in A:
            kw['strength'] = float(A['sunE'])
        if 'fill' in A:
            kw['fill'] = float(A['fill'])
        K.lights(sc, **kw)
    return sc


def cam(sc, target, dist, el, az=-90, lens=100):
    """House camera with overrides: dist= el= az= lens= tgt=x,y,z zoom= (divides dist, for detail
    stills) camdrift=DEG (slow periodic orbit over the loop, for camera-move tests)."""
    if 'tgt' in A:
        target = tuple(float(v) for v in A['tgt'].split(','))
    d = float(A.get('dist', dist)) / float(A.get('zoom', 1))
    e0, a0 = float(A.get('el', el)), float(A.get('az', az))
    c = K.camera(sc, target, d, e0, a0, float(A.get('lens', lens)))
    drift = float(A.get('camdrift', 0))
    if drift:
        loop = sc.frame_end

        def h(scene, depsgraph=None):
            ph = 2 * math.pi * (scene.frame_current - 1 + scene.frame_subframe) / loop
            orbit_cam(c, target, d, e0 + drift * .15 * math.sin(2 * ph), a0 + drift * math.sin(ph))
        bpy.app.handlers.frame_change_pre.append(h)
    return c


def orbit_cam(camobj, target, dist, el, az):
    t = Vector(target)
    e, a = math.radians(el), math.radians(az)
    camobj.location = t + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * dist
    camobj.rotation_euler = (t - camobj.location).to_track_quat('-Z', 'Y').to_euler()


# ---------------------------------------------------------------- materials
def _base(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']


def _noise_bump(nt, b, scale=180, strength=.04, dist=.002):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 2
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    bp.inputs['Distance'].default_value = dist
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])


_MCACHE = {}


def clay(base, rough=.62, spec=.35, grain=.035, name=None):
    """Matte ceramic / powder-coat. The default non-paper solid."""
    key = ('clay', base, rough, spec, grain)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Clay{base}')
    b.inputs['Base Color'].default_value = col(base)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    if grain:
        _noise_bump(nt, b, 220, grain)
    _MCACHE[key] = m
    return m


def satin(base, rough=.34, coat=.35, name=None):
    """Lacquered / injection-moulded. Holds a soft highlight on the bevels."""
    key = ('satin', base, rough, coat)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Satin{base}')
    b.inputs['Base Color'].default_value = col(base)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .5
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = .12
    _MCACHE[key] = m
    return m


def metal(base, rough=.28, name=None, aniso=0.0):
    key = ('metal', base, rough, aniso)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Metal{base}')
    b.inputs['Base Color'].default_value = col(base)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = rough
    if aniso:
        b.inputs['Anisotropic'].default_value = aniso
    _noise_bump(nt, b, 300, .03)
    _MCACHE[key] = m
    return m


def glass(tint='#ffffff', rough=.08, ior=1.45, name=None):
    key = ('glass', tint, rough, ior)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Glass{tint}')
    b.inputs['Base Color'].default_value = col(tint)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['IOR'].default_value = ior
    _MCACHE[key] = m
    return m


def glow(base, strength=4.0, surface=None, name=None):
    """Emissive accent. `surface` mixes a clay body under it so it still has form."""
    key = ('glow', base, strength, surface)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Glow{base}')
    b.inputs['Base Color'].default_value = col(surface or base)
    b.inputs['Roughness'].default_value = .5
    b.inputs['Emission Color'].default_value = col(base)
    b.inputs['Emission Strength'].default_value = strength
    _MCACHE[key] = m
    return m


def anim_mat(name, a, b, kind='clay', rough=.55, emis=0.0):
    """A material whose colour is driven by a value node `Mix` (0 = a, 1 = b) that pose() can set,
    plus optional emission strength node `Em`. Returns (material, mixnode_input, em_input)."""
    m, nt, bs = _base(name)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    ins = {s.identifier: s for s in mix.inputs}
    ins['A_Color'].default_value = col(a)
    ins['B_Color'].default_value = col(b)
    ins['Factor_Float'].default_value = 0.0
    out = next(s for s in mix.outputs if s.identifier == 'Result_Color')
    nt.links.new(out, bs.inputs['Base Color'])
    nt.links.new(out, bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = emis
    bs.inputs['Roughness'].default_value = rough
    if kind == 'satin':
        bs.inputs['Coat Weight'].default_value = .35
        bs.inputs['Coat Roughness'].default_value = .12
    return m, ins['Factor_Float'], bs.inputs['Emission Strength']


def shadow_catcher(size=40, z=0.0, name='Catcher'):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    p = bpy.context.active_object
    p.name = name
    p.is_shadow_catcher = True
    return p


# ---------------------------------------------------------------- geometry
def _link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def bevel(ob, w=.02, seg=3, angle=35):
    bv = ob.modifiers.new('bevel', 'BEVEL')
    bv.width = w
    bv.segments = seg
    bv.limit_method = 'ANGLE'
    bv.angle_limit = math.radians(angle)
    bv.harden_normals = False
    return ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def mesh_obj(name, verts, faces, mat=None, coll=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    return _link(ob, coll)


def box(name, size, loc=(0, 0, 0), mat=None, bev=.02, seg=3, coll=None):
    sx, sy, sz = (size, size, size) if isinstance(size, (int, float)) else size
    x, y, z = sx / 2, sy / 2, sz / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mesh_obj(name, v, f, mat, coll)
    ob.location = loc
    if bev:
        bevel(ob, bev, seg)
    return ob


def box_mesh(name, size):
    """Shared mesh data for instancing many boxes (no modifier; bake bevel into the mesh)."""
    import bmesh
    sx, sy, sz = (size, size, size) if isinstance(size, (int, float)) else size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def bevelled_mesh(name, size, w=.02, seg=2):
    import bmesh
    me = box_mesh(name, size)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=w, segments=seg, affect='EDGES', profile=.5)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return me


def cyl(name, r, h, loc=(0, 0, 0), mat=None, n=48, bev=.01, coll=None, axis='Z'):
    v, f = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        v.append((r * math.cos(a), r * math.sin(a), -h / 2))
    for i in range(n):
        a = 2 * math.pi * i / n
        v.append((r * math.cos(a), r * math.sin(a), h / 2))
    f.append(tuple(range(n))[::-1])
    f.append(tuple(range(n, 2 * n)))
    for i in range(n):
        f.append((i, (i + 1) % n, n + (i + 1) % n, n + i))
    if axis == 'X':
        v = [(z, y, -x) for x, y, z in v]
    elif axis == 'Y':
        v = [(x, z, -y) for x, y, z in v]
    ob = mesh_obj(name, v, f, mat, coll)
    for p in ob.data.polygons[2:]:
        p.use_smooth = True
    ob.location = loc
    if bev:
        bevel(ob, bev, 2, 60)
    return ob


def sphere(name, r, loc=(0, 0, 0), mat=None, seg=48, coll=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    if mat:
        ob.data.materials.append(mat)
    smooth(ob)
    if coll:
        for c in ob.users_collection:
            c.objects.unlink(ob)
        coll.objects.link(ob)
    return ob


def tube(name, pts, r, mat=None, res=12, closed=False):
    """A curve tube through 3D points (poly spline)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1)
    sp.use_cyclic_u = closed
    if mat:
        cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    return _link(ob)


def text(name, body, size, mat, loc=(0, 0, 0), rot=(0, 0, 0), font='C:/Windows/Fonts/consola.ttf', align='CENTER', extrude=0.0):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    if os.path.exists(font):
        cu.font = bpy.data.fonts.load(font, check_existing=True)
    cu.size = size
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.extrude = extrude
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    ob.location, ob.rotation_euler = loc, rot
    return _link(ob)


# ---------------------------------------------------------------- instancing (many pieces)
def point_instancer(name, piece_mesh, n, two_sided=False):
    """A point mesh + geometry nodes that instances `piece_mesh` on every vertex,
    rotated by the float-vector attribute 'rot' (euler) and scaled by 'scl'.
    Material per instance comes from an int attribute 'mi' indexing piece_mesh's
    material slots: the instancer sets the instance material by 'mi' via Set Material Index.
    Returns (object, update(positions, rots, scales, mis))."""
    me = bpy.data.meshes.new(name + 'Pts')
    me.vertices.add(n)
    me.attributes.new('rot', 'FLOAT_VECTOR', 'POINT')
    me.attributes.new('scl', 'FLOAT_VECTOR', 'POINT')
    me.attributes.new('mi', 'INT', 'POINT')
    me.attributes.new('mb', 'INT', 'POINT')
    ob = bpy.data.objects.new(name, me)
    _link(ob)
    pob = bpy.data.objects.new(name + 'Piece', piece_mesh)   # not linked: referenced by GN
    ng = bpy.data.node_groups.new(name + 'GN', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    oi = N.new('GeometryNodeObjectInfo')
    oi.inputs['Object'].default_value = pob
    oi.transform_space = 'ORIGINAL'
    smi = N.new('GeometryNodeSetMaterialIndex')
    ga_mi = N.new('GeometryNodeInputNamedAttribute'); ga_mi.data_type = 'INT'; ga_mi.inputs['Name'].default_value = 'mi'
    ga_r = N.new('GeometryNodeInputNamedAttribute'); ga_r.data_type = 'FLOAT_VECTOR'; ga_r.inputs['Name'].default_value = 'rot'
    ga_s = N.new('GeometryNodeInputNamedAttribute'); ga_s.data_type = 'FLOAT_VECTOR'; ga_s.inputs['Name'].default_value = 'scl'
    iop = N.new('GeometryNodeInstanceOnPoints')
    real = N.new('GeometryNodeRealizeInstances')
    L = ng.links.new
    L(gi.outputs[0], iop.inputs['Points'])
    L(oi.outputs['Geometry'], iop.inputs['Instance'])
    L(ga_r.outputs['Attribute'], iop.inputs['Rotation'])
    L(ga_s.outputs['Attribute'], iop.inputs['Scale'])
    # instance attributes propagate through Realize Instances onto the faces
    L(iop.outputs['Instances'], real.inputs['Geometry'])
    L(real.outputs[0], smi.inputs['Geometry'])
    if two_sided:
        # piece faces carry a float face attribute 'side' (1 = back); back faces take 'mb'
        ga_mb = N.new('GeometryNodeInputNamedAttribute'); ga_mb.data_type = 'INT'; ga_mb.inputs['Name'].default_value = 'mb'
        ga_sd = N.new('GeometryNodeInputNamedAttribute'); ga_sd.data_type = 'FLOAT'; ga_sd.inputs['Name'].default_value = 'side'
        sub = N.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'
        L(ga_mb.outputs['Attribute'], sub.inputs[0]); L(ga_mi.outputs['Attribute'], sub.inputs[1])
        mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        L(sub.outputs[0], mul.inputs[0]); L(ga_sd.outputs['Attribute'], mul.inputs[1])
        ad = N.new('ShaderNodeMath'); ad.operation = 'ADD'
        L(mul.outputs[0], ad.inputs[0]); L(ga_mi.outputs['Attribute'], ad.inputs[1])
        L(ad.outputs[0], smi.inputs['Material Index'])
    else:
        L(ga_mi.outputs['Attribute'], smi.inputs['Material Index'])
    L(smi.outputs[0], go.inputs[0])
    mod = ob.modifiers.new('inst', 'NODES')
    mod.node_group = ng
    for m in piece_mesh.materials:
        me.materials.append(m)

    def update(pos, rot, scl, mi=None, mb=None):
        import numpy as np
        me.vertices.foreach_set('co', np.asarray(pos, np.float32).ravel())
        me.attributes['rot'].data.foreach_set('vector', np.asarray(rot, np.float32).ravel())
        me.attributes['scl'].data.foreach_set('vector', np.asarray(scl, np.float32).ravel())
        if mi is not None:
            me.attributes['mi'].data.foreach_set('value', np.asarray(mi, np.int32).ravel())
        if mb is not None:
            me.attributes['mb'].data.foreach_set('value', np.asarray(mb, np.int32).ravel())
        me.update()
    return ob, update


# ---------------------------------------------------------------- animation
_POSE = []


def on_pose(fn):
    """Register pose(t): t is the 0-based float frame (frame 1 -> t=0). Called on every
    frame change including Cycles' motion-blur sub-frames."""
    _POSE.append(fn)

    def h(scene, depsgraph=None):
        fn(scene.frame_current - 1 + scene.frame_subframe)
    bpy.app.handlers.frame_change_pre.append(h)
    return fn


def ramp(t, a, b):
    """0 before a, 1 after b, smootherstep between."""
    return sstep((t - a) / max(1e-6, b - a))


def pulse(t, a, b, c, d):
    """0 -> 1 over a..b, hold, 1 -> 0 over c..d."""
    return ramp(t, a, b) * (1 - ramp(t, c, d))


def lerp(a, b, t):
    return a + (b - a) * t


def vlerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


# ---------------------------------------------------------------- render
def frames_arg(default, loop):
    fr = A.get('frames', default)
    if fr == 'all':
        return list(range(1, loop + 1))
    if ':' in fr:   # a:b:step (1-based inclusive a, exclusive b)
        a, b, s = (int(x) for x in fr.split(':'))
        return list(range(a, b, s))
    return [int(x) for x in fr.split(',')]


def render(sc, out_dir, prefix, frames, bg=None, seq=False):
    """seq=True names frames prefix_0001.png (encode.py picks those up);
    otherwise prefix_test_NNNN.png stills (+ _bg composites if bg)."""
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    t0 = time.time()
    for i, fr in enumerate(frames):
        sc.frame_set(fr)
        p = os.path.join(out_dir, f'{prefix}_{i + 1:04d}.png' if seq else f'{prefix}_test_{fr:04d}.png')
        if seq and os.path.exists(p) and A.get('overwrite', '0') != '1':
            continue
        sc.render.filepath = p
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'FRAME {fr} {time.time() - t:.1f}s -> {p}', flush=True)
        if bg and not seq:
            K.composite_preview(p, bg)
    print(f'RENDER DONE {len(frames)} frames {time.time() - t0:.1f}s', flush=True)


def go(sc, name, default_frames, loop):
    """Standard entry: out=DIR, frames=..., seq=1 for a motion sequence, bg=RRGGBB for composites.
    step=N renders every Nth frame for a cheap motion test (encode at fps 30/N)."""
    out = A.get('out', f'out/explore/{name}')
    if A.get('seq') == '1':
        step = int(A.get('step', 1))
        frames = list(range(1, loop + 1, step))
        render(sc, os.path.join(out, A.get('seqdir', 'seq')), name, frames, seq=True)
    else:
        render(sc, out, A.get('prefix', name), frames_arg(default_frames, loop), A.get('bg'))


# ---------------------------------------------------------------- richer surfaces (pass 2)
def rich(base, rough=.38, coat=.25, var=.05, rvar=.12, scale=2.2, name=None, sss=0.0):
    """Satin with life in it: a slow value drift (+-var) and a roughness drift, so a
    broad face is never one flat CG colour, plus a fine orange-peel bump."""
    key = ('rich', base, rough, coat, var, rvar, scale, sss)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Rich{base}')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    add = nt.nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'
    sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'
    sc_.inputs[0].default_value = (37.1, 53.7, 71.3)
    nt.links.new(oi.outputs['Random'], sc_.inputs['Scale'])
    nt.links.new(tc.outputs['Object'], add.inputs[0]); nt.links.new(sc_.outputs[0], add.inputs[1])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 3
    nt.links.new(add.outputs[0], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = .3, .7
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1 - var, 1 + var * .6
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    ins = {s.identifier: s for s in mix.inputs}
    ins['Factor_Float'].default_value = 1.0
    ins['A_Color'].default_value = col(base)
    nt.links.new(mr.outputs[0], ins['B_Color'])
    nt.links.new(next(s for s in mix.outputs if s.identifier == 'Result_Color'), b.inputs['Base Color'])
    rr = nt.nodes.new('ShaderNodeMapRange')
    rr.inputs['From Min'].default_value, rr.inputs['From Max'].default_value = .3, .7
    rr.inputs['To Min'].default_value, rr.inputs['To Max'].default_value = rough - rvar, rough + rvar
    nt.links.new(nz.outputs['Fac'], rr.inputs['Value'])
    nt.links.new(rr.outputs[0], b.inputs['Roughness'])
    b.inputs['Specular IOR Level'].default_value = .5
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = .1
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (.1, .1, .1)
        b.inputs['Subsurface Scale'].default_value = .05
    fb = nt.nodes.new('ShaderNodeTexNoise')
    fb.inputs['Scale'].default_value = 160
    nt.links.new(add.outputs[0], fb.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = .025
    bp.inputs['Distance'].default_value = .002
    nt.links.new(fb.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    _MCACHE[key] = m
    return m


def frosted(tint, rough=.32, trans=1.0, name=None):
    """Translucent, frosted: reads as a lit solid rather than as clear glass."""
    key = ('frost', tint, rough, trans)
    if key in _MCACHE:
        return _MCACHE[key]
    m, nt, b = _base(name or f'Frost{tint}')
    b.inputs['Base Color'].default_value = col(tint)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = trans
    b.inputs['IOR'].default_value = 1.45
    b.inputs['Coat Weight'].default_value = .4
    b.inputs['Coat Roughness'].default_value = .05
    _MCACHE[key] = m
    return m


def ground(z=0.0, size=60):
    """Shadow catcher: grounds the objects on a transparent film; composites on any page colour."""
    if A.get('ground', '1') == '0':
        return None
    return shadow_catcher(size, z)
