"""Pass 3 helpers: shape first, meaning second.

On top of lab.py (house lights, camera, render loop) this adds what sculptural forms need:
- sweep(): a mesh swept along a path with a custom cross-section (superellipse, ribbon,
  rounded rect), rotation-minimising frames, optional twist, open or closed; returns an
  updater so pose(t) can move the path every frame
- a harder material set: glazed ceramic, travertine, brushed/polished metal, lacquer,
  rubber, tinted glass
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *   # noqa: F401,F403
import numpy as np


# ---------------------------------------------------------------- profiles (2D, counter-clockwise)
def superellipse(w, h, n=4.0, k=32):
    a = np.linspace(0, 2 * np.pi, k, endpoint=False)
    c, s = np.cos(a), np.sin(a)
    x = w / 2 * np.sign(c) * np.abs(c) ** (2 / n)
    y = h / 2 * np.sign(s) * np.abs(s) ** (2 / n)
    return np.c_[x, y]


def circle(r, k=28):
    return superellipse(2 * r, 2 * r, 2.0, k)


# ---------------------------------------------------------------- frames
def rmf(P, closed, up=(0, 0, 1)):
    """Rotation-minimising frames (double reflection) along polyline P (N,3).
    Returns T, N, B arrays. For closed paths the residual twist is spread evenly."""
    n = len(P)
    if closed:
        T = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    else:
        T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    u = np.array(up, float)
    r0 = np.cross(T[0], u)
    if np.linalg.norm(r0) < 1e-4:
        r0 = np.cross(T[0], (1, 0, 0))
    r0 /= np.linalg.norm(r0)
    R = np.zeros_like(P)
    R[0] = r0
    for i in range(n - 1):
        v1 = P[i + 1] - P[i]
        c1 = v1 @ v1
        rL = R[i] - (2 / c1) * (v1 @ R[i]) * v1
        tL = T[i] - (2 / c1) * (v1 @ T[i]) * v1
        v2 = T[i + 1] - tL
        c2 = v2 @ v2
        R[i + 1] = rL - (2 / c2) * (v2 @ rL) * v2 if c2 > 1e-12 else rL
    if closed:
        # angle between the propagated frame at the end and the start frame, spread over the loop
        v1 = P[0] - P[-1]
        c1 = v1 @ v1
        rL = R[-1] - (2 / c1) * (v1 @ R[-1]) * v1
        tL = T[-1] - (2 / c1) * (v1 @ T[-1]) * v1
        v2 = T[0] - tL
        c2 = v2 @ v2
        rE = rL - (2 / c2) * (v2 @ rL) * v2 if c2 > 1e-12 else rL
        ang = math.atan2(np.cross(rE, R[0]) @ T[0], rE @ R[0])
        for i in range(n):
            a = -ang * i / n
            R[i] = R[i] * math.cos(a) + np.cross(T[i], R[i]) * math.sin(a)
    B = np.cross(T, R)
    return T, R, B


# ---------------------------------------------------------------- sweep
def sweep(name, n_path, profile, mat=None, closed=True, caps=True, smooth_shade=True, seg_mi=None):
    """Build a swept mesh with n_path rings of len(profile) verts. Returns (obj, update)
    where update(P, twist=None, scale=None) moves it: P (n_path,3) path points,
    twist (n_path,) radians about the tangent, scale (n_path,) or (n_path,2) profile scale."""
    prof = np.asarray(profile, float)
    k = len(prof)
    faces = []
    rings = n_path if closed else n_path - 1
    for i in range(rings):
        j = (i + 1) % n_path
        for q in range(k):
            q2 = (q + 1) % k
            faces.append((i * k + q, i * k + q2, j * k + q2, j * k + q))
    verts = [(0, 0, 0)] * (n_path * k)
    if not closed and caps:
        faces.append(tuple(range(k))[::-1])
        faces.append(tuple((n_path - 1) * k + q for q in range(k)))
    ob = mesh_obj(name, verts, faces, mat if not isinstance(mat, (list, tuple)) else mat[0])
    if isinstance(mat, (list, tuple)):
        # one material per profile segment: mat=[m0, m1, ...], seg_mi=(k,) indices into it
        for m_ in mat[1:]:
            ob.data.materials.append(m_)
        seg_mi = np.asarray(seg_mi if seg_mi is not None else np.zeros(k, int))
        mi = [int(seg_mi[q]) for i in range(rings) for q in range(k)]
        mi += [0] * (len(faces) - len(mi))
        ob.data.polygons.foreach_set('material_index', mi)
    if smooth_shade:
        smooth(ob)
    me = ob.data

    def update(P, twist=None, scale=None, up=(0, 0, 1), flat=False):
        P = np.asarray(P, float)
        if flat:
            # road frames: width stays horizontal whatever the path does (for ramps, decks)
            T = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) if closed else np.gradient(P, axis=0)
            T /= np.linalg.norm(T, axis=1, keepdims=True)
            R = np.cross(T, np.array(up, float))
            R /= np.maximum(np.linalg.norm(R, axis=1, keepdims=True), 1e-9)
            B = np.cross(R, T)
        else:
            T, R, B = rmf(P, closed, up)
        if twist is not None:
            c, s = np.cos(twist)[:, None], np.sin(twist)[:, None]
            R, B = R * c + B * s, B * c - R * s
        px = np.broadcast_to(prof[:, 0], (n_path, k)).copy()
        py = np.broadcast_to(prof[:, 1], (n_path, k)).copy()
        if scale is not None:
            sc_ = np.asarray(scale, float)
            if sc_.ndim == 1:
                px *= sc_[:, None]; py *= sc_[:, None]
            else:
                px *= sc_[:, 0:1]; py *= sc_[:, 1:2]
        V = P[:, None, :] + R[:, None, :] * px[..., None] + B[:, None, :] * py[..., None]
        me.vertices.foreach_set('co', V.astype(np.float32).ravel())
        me.update()
    return ob, update


# ---------------------------------------------------------------- materials (pass 3)
_M3 = {}


def _mk(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']


def glaze(base, rough=.12, coat=.8, var=.03, name=None):
    """Glazed ceramic: deep colour under a glassy coat, faint pooling variation."""
    key = ('glaze', base, rough, coat, var)
    if key in _M3:
        return _M3[key]
    m = rich(base, rough=rough, coat=coat, var=var, rvar=.04, scale=1.6, name=name or f'Glaze{base}')
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Coat Roughness'].default_value = .03
    b.inputs['Coat IOR'].default_value = 1.5
    _M3[key] = m
    return m


def stone(base='#ece6da', rough=.7, pits=.35, name=None):
    """Travertine / cast stone: soft value mottling, fine pits, matte."""
    key = ('stone', base, rough, pits)
    if key in _M3:
        return _M3[key]
    m, nt, b = _mk(name or f'Stone{base}')
    N, L = nt.nodes.new, nt.links.new
    tc = N('ShaderNodeTexCoord')
    nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 6
    L(tc.outputs['Object'], nz.inputs['Vector'])
    mr = N('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .9; mr.inputs['To Max'].default_value = 1.04
    L(nz.outputs['Fac'], mr.inputs['Value'])
    mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    ins = {s.identifier: s for s in mx.inputs}
    ins['Factor_Float'].default_value = 1
    ins['A_Color'].default_value = col(base)
    L(mr.outputs[0], ins['B_Color'])
    L(next(s for s in mx.outputs if s.identifier == 'Result_Color'), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    # pits: voronoi distance thresholded
    vo = N('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 90
    L(tc.outputs['Object'], vo.inputs['Vector'])
    cr = N('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0; cr.inputs['From Max'].default_value = .18
    L(vo.outputs['Distance'], cr.inputs['Value'])
    bp = N('ShaderNodeBump'); bp.inputs['Strength'].default_value = pits; bp.inputs['Distance'].default_value = .003
    L(cr.outputs[0], bp.inputs['Height'])
    L(bp.outputs['Normal'], b.inputs['Normal'])
    _M3[key] = m
    return m


def brushed(base='#c9c9c9', rough=.3, aniso=.8, name=None):
    """Brushed metal: anisotropic, streaked along object X."""
    key = ('brushed', base, rough, aniso)
    if key in _M3:
        return _M3[key]
    m, nt, b = _mk(name or f'Brushed{base}')
    N, L = nt.nodes.new, nt.links.new
    b.inputs['Base Color'].default_value = col(base)
    b.inputs['Metallic'].default_value = 1
    b.inputs['Roughness'].default_value = rough
    b.inputs['Anisotropic'].default_value = aniso
    tc = N('ShaderNodeTexCoord')
    mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 300, 300)
    L(tc.outputs['Object'], mp.inputs['Vector'])
    nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2; nz.inputs['Detail'].default_value = 4
    L(mp.outputs['Vector'], nz.inputs['Vector'])
    rr = N('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough * .8; rr.inputs['To Max'].default_value = rough * 1.25
    L(nz.outputs['Fac'], rr.inputs['Value'])
    L(rr.outputs[0], b.inputs['Roughness'])
    _M3[key] = m
    return m


def chrome(base='#e8e8e8', rough=.06, name=None):
    key = ('chrome', base, rough)
    if key in _M3:
        return _M3[key]
    m, nt, b = _mk(name or f'Chrome{base}')
    b.inputs['Base Color'].default_value = col(base)
    b.inputs['Metallic'].default_value = 1
    b.inputs['Roughness'].default_value = rough
    _M3[key] = m
    return m


def lacquer(base, rough=.22, coat=1.0, name=None):
    key = ('lacquer', base, rough, coat)
    if key in _M3:
        return _M3[key]
    m = satin(base, rough=rough, coat=coat, name=name or f'Lacq{base}')
    _M3[key] = m
    return m


def rubber(base, rough=.8, name=None):
    key = ('rubber', base, rough)
    if key in _M3:
        return _M3[key]
    m = clay(base, rough=rough, spec=.2, grain=.02, name=name or f'Rubber{base}')
    _M3[key] = m
    return m


def tinted(base, rough=.04, ior=1.5, density=1.0, name=None):
    """Thick coloured glass (transmission + absorption-ish via base colour)."""
    key = ('tint', base, rough, ior, density)
    if key in _M3:
        return _M3[key]
    m, nt, b = _mk(name or f'Tint{base}')
    b.inputs['Base Color'].default_value = col(base)
    b.inputs['Transmission Weight'].default_value = 1
    b.inputs['Roughness'].default_value = rough
    b.inputs['IOR'].default_value = ior
    _M3[key] = m
    return m


MATS = {'glaze': glaze, 'stone': stone, 'brushed': brushed, 'chrome': chrome, 'lacquer': lacquer,
        'rubber': rubber, 'tinted': tinted, 'rich': rich, 'clay': clay, 'frosted': frosted}


def mat(spec):
    """'kind:colour' -> material, e.g. 'glaze:bone', 'brushed:#b8b8b8', 'lacquer:green'."""
    kind, _, c = spec.partition(':')
    fn = MATS[kind]
    return fn(c) if c else fn()


def mats_arg(default):
    """mats=glaze:bone,lacquer:g6,glaze:green  (comma list) with a per-direction default."""
    return [mat(s) for s in A.get('mats', default).split(',')]


# ---------------------------------------------------------------- solids
def prism(name, plan, h, mat=None, bev=.02, loc=(0, 0, 0)):
    """Extrude a 2D plan (k,2) by h (centred on z). Sides smooth, caps flat, bevelled edges."""
    k = len(plan)
    v = [(x, y, -h / 2) for x, y in plan] + [(x, y, h / 2) for x, y in plan]
    f = [tuple(range(k))[::-1], tuple(range(k, 2 * k))]
    f += [(i, (i + 1) % k, k + (i + 1) % k, k + i) for i in range(k)]
    ob = mesh_obj(name, v, f, mat)
    for p in ob.data.polygons[2:]:
        p.use_smooth = True
    ob.location = loc
    if bev:
        bevel(ob, bev, 3, 50)
    return ob


def superellipsoid(name, dims, n=4.0, seg=64, mat=None):
    """Rounded-box blob: a UV sphere pushed out by a signed power. Returns obj and the
    undeformed vertex array (for pose-time deformation)."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=seg, ring_count=seg // 2)
    ob = bpy.context.active_object
    ob.name = name
    me = ob.data
    V = np.zeros(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', V)
    V = V.reshape(-1, 3)
    e = 2.0 / n
    W = np.sign(V) * np.abs(V) ** e * (np.asarray(dims, np.float32) / 2)
    me.vertices.foreach_set('co', W.astype(np.float32).ravel())
    me.update()
    if mat:
        me.materials.append(mat)
    smooth(ob)
    return ob, W.copy()


def set_verts(ob, V):
    ob.data.vertices.foreach_set('co', np.asarray(V, np.float32).ravel())
    ob.data.update()


def bake(ob):
    """Apply modifiers into a new plain mesh (for booleans)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    nob = bpy.data.objects.new(ob.name + 'B', me)
    bpy.context.scene.collection.objects.link(nob)
    nob.matrix_world = ob.matrix_world.copy()
    return nob
