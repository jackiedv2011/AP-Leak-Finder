"""Shared look for every render: DayOS-matched materials, sun + fill lighting,
Cycles/OptiX settings, motion blur, transparent film.
Reference values sampled from dayos.com renders (display sRGB, lit faces):
white terrazzo #e9e1de, pale oak #e2c09e, yellow #f5d836, green #0d6e2b,
dark wood #3a302c, pink #c33e9a, accent caps: green #9bff7a, pink #f379e7,
cyan #71edef, orange #f17806."""
import bpy, math, os, sys
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return dict(a.split('=', 1) for a in argv)


def hexrgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ---------------------------------------------------------------- scene / render
def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            coll.remove(d)
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'


def setup_render(res, spp, loop, A):
    sc = bpy.context.scene
    cp = bpy.context.preferences.addons['cycles'].preferences
    cp.compute_device_type = 'OPTIX'
    cp.get_devices()
    for d in cp.devices:
        d.use = d.type == 'OPTIX'
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = spp
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = .012
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    if hasattr(sc.cycles, 'denoising_use_gpu'):
        sc.cycles.denoising_use_gpu = True
    sc.cycles.filter_width = 1.0          # crisper than the 1.5px default
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 3
    sc.cycles.transparent_max_bounces = 4
    sc.render.film_transparent = True
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = float(A.get('shutter', .5))
    sc.render.use_persistent_data = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.fps = 30
    sc.frame_start, sc.frame_end = 1, loop
    vs = sc.view_settings
    # these enums are dynamic (OCIO), so bl_rna lists nothing useful — just try
    try:
        vs.view_transform = A.get('view', 'Khronos PBR Neutral')
    except TypeError as e:
        print('VIEW FALLBACK', e)
        vs.view_transform = 'AgX'
    try:
        vs.look = A.get('look', 'None')
    except TypeError as e:
        print('LOOK FALLBACK', e)
        vs.look = 'None'
    vs.exposure = float(A.get('exp', 0))
    print('VIEW', vs.view_transform, '| look', vs.look)
    ims = sc.render.image_settings
    ims.file_format = 'PNG'
    ims.color_mode = 'RGBA'
    ims.color_depth = '8'
    ims.compression = 30
    sc.render.use_overwrite = A.get('overwrite', '0') == '1'
    sc.render.use_placeholder = True
    return sc


def lights(sc, sun_from=(.55, -.4, .73), strength=3.2, angle=2.0, fill=.25, rig_z=0.0):
    w = bpy.data.worlds.new('World') if not sc.world else sc.world
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background') or w.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = hexrgb('#f1eeea')
    bg.inputs['Strength'].default_value = fill
    ld = bpy.data.lights.new('Sun', 'SUN')
    ld.energy = strength
    ld.angle = math.radians(angle)
    sun = bpy.data.objects.new('Sun', ld)
    sc.collection.objects.link(sun)
    sun.rotation_euler = (-Vector(sun_from)).to_track_quat('-Z', 'Y').to_euler()
    return sun


def camera(sc, target, dist, el_deg, az_deg=-90, lens=100):
    cd = bpy.data.cameras.new('Cam')
    cd.lens = lens
    cd.clip_start, cd.clip_end = .1, 200
    cam = bpy.data.objects.new('Cam', cd)
    sc.collection.objects.link(cam)
    el, az = math.radians(el_deg), math.radians(az_deg)
    t = Vector(target)
    cam.location = t + Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return cam


# ---------------------------------------------------------------- node helpers
def _n(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def _l(nt, a, b):
    nt.links.new(a, b)


def _sock(node, ident, out=False):
    return next(s for s in (node.outputs if out else node.inputs) if s.identifier == ident)


def _mix(nt, fac, a, b, blend='MIX'):
    m = _n(nt, 'ShaderNodeMix', data_type='RGBA', blend_type=blend)
    for ident, v in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
        s = _sock(m, ident)
        if isinstance(v, (float, int)):
            s.default_value = v
        elif isinstance(v, tuple):
            s.default_value = v
        else:
            _l(nt, v, s)
    return _sock(m, 'Result_Color', out=True)


def _math(nt, op, a, b=None, c=None):
    m = _n(nt, 'ShaderNodeMath', operation=op)
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (float, int)):
            m.inputs[i].default_value = v
        else:
            _l(nt, v, m.inputs[i])
    return m.outputs[0]


def _base(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']


def _coords(nt, stretch=(1, 1, 1)):
    """Object coords, offset per object so sibling pieces never share a pattern."""
    tc = _n(nt, 'ShaderNodeTexCoord')
    oi = _n(nt, 'ShaderNodeObjectInfo')
    off = _n(nt, 'ShaderNodeVectorMath', operation='SCALE')
    off.inputs[0].default_value = (37.13, 53.71, 71.37)
    _l(nt, oi.outputs['Random'], off.inputs['Scale'])
    add = _n(nt, 'ShaderNodeVectorMath', operation='ADD')
    _l(nt, tc.outputs['Object'], add.inputs[0])
    _l(nt, off.outputs[0], add.inputs[1])
    if stretch == (1, 1, 1):
        return add.outputs[0]
    mp = _n(nt, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch
    _l(nt, add.outputs[0], mp.inputs['Vector'])
    return mp.outputs[0]


def _ramp(nt, fac, stops, interp='LINEAR'):
    r = _n(nt, 'ShaderNodeValToRGB')
    r.color_ramp.interpolation = interp
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], hexrgb(stops[0][1])
    els[1].position, els[1].color = stops[1][0], hexrgb(stops[1][1])
    for p, c in stops[2:]:
        e = els.new(p)
        e.color = hexrgb(c)
    _l(nt, fac, r.inputs['Fac'])
    return r.outputs['Color']


def _bump(nt, b, height, strength, dist=.004):
    bp = _n(nt, 'ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    bp.inputs['Distance'].default_value = dist
    _l(nt, height, bp.inputs['Height'])
    _l(nt, bp.outputs['Normal'], b.inputs['Normal'])


# ---------------------------------------------------------------- materials
PAL_WHITE = ['#26221f', '#26221f', '#3b3633', '#77706b', '#a39c95', '#c9a23c', '#b4523d', '#5e8b4e', '#cfc6bb', '#8f6f55']
PAL_YELLOW = ['#26221f', '#a88f1d', '#d9b92a', '#fff39a', '#b4523d', '#77706b']


def terrazzo(name, base, pal, big=.30, small=.34, rough=.64, pits=.55, bump=.32):
    m, nt, b = _base(name)
    v0 = _coords(nt)
    # warp so chips come out irregular, not round
    wn = _n(nt, 'ShaderNodeTexNoise')
    wn.inputs['Scale'].default_value = 14
    wn.inputs['Detail'].default_value = 2
    _l(nt, v0, wn.inputs['Vector'])
    sub = _n(nt, 'ShaderNodeVectorMath', operation='SUBTRACT')
    _l(nt, wn.outputs['Color'], sub.inputs[0])
    sub.inputs[1].default_value = (.5, .5, .5)
    sc = _n(nt, 'ShaderNodeVectorMath', operation='SCALE')
    _l(nt, sub.outputs[0], sc.inputs[0])
    sc.inputs['Scale'].default_value = .022
    add = _n(nt, 'ShaderNodeVectorMath', operation='ADD')
    _l(nt, v0, add.inputs[0])
    _l(nt, sc.outputs[0], add.inputs[1])
    vec = add.outputs[0]

    col = hexrgb(base)
    masks = []
    # checked 1:1 against DayOS crops: theirs is finer; this is a touch grainier on purpose
    for scale, dens, thr in ((34, big, .26), (82, small, .30)):
        vo = _n(nt, 'ShaderNodeTexVoronoi', feature='F1')
        vo.inputs['Scale'].default_value = scale
        vo.inputs['Randomness'].default_value = 1
        _l(nt, vec, vo.inputs['Vector'])
        sep = _n(nt, 'ShaderNodeSeparateColor')
        _l(nt, vo.outputs['Color'], sep.inputs['Color'])
        radius = _math(nt, 'MULTIPLY_ADD', sep.outputs['Red'], thr * .9, thr * .45)
        inside = _math(nt, 'LESS_THAN', vo.outputs['Distance'], radius)
        present = _math(nt, 'LESS_THAN', sep.outputs['Blue'], dens)
        mask = _math(nt, 'MULTIPLY', inside, present)
        chip = _ramp(nt, sep.outputs['Green'], [(i / len(pal), c) for i, c in enumerate(pal)], 'CONSTANT')
        col = _mix(nt, mask, col, chip)
        masks.append(mask)
    _l(nt, col, b.inputs['Base Color'])

    # foam-like pitting + fine grain, as on the DayOS terrazzo
    pv = _n(nt, 'ShaderNodeTexVoronoi', feature='F1')
    pv.inputs['Scale'].default_value = 60
    _l(nt, vec, pv.inputs['Vector'])
    psep = _n(nt, 'ShaderNodeSeparateColor')
    _l(nt, pv.outputs['Color'], psep.inputs['Color'])
    pr = _n(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
    _l(nt, pv.outputs['Distance'], pr.inputs['Value'])
    pr.inputs['From Min'].default_value, pr.inputs['From Max'].default_value = .0, .26
    pr.inputs['To Min'].default_value, pr.inputs['To Max'].default_value = 1, 0
    pit = _math(nt, 'MULTIPLY', pr.outputs['Result'], _math(nt, 'LESS_THAN', psep.outputs['Blue'], pits))
    gn = _n(nt, 'ShaderNodeTexNoise')
    gn.inputs['Scale'].default_value = 190
    gn.inputs['Detail'].default_value = 3
    _l(nt, vec, gn.inputs['Vector'])
    h = _math(nt, 'SUBTRACT', _math(nt, 'MULTIPLY', gn.outputs['Fac'], .55), _math(nt, 'MULTIPLY', pit, .9))
    _bump(nt, b, h, bump, .003)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .45
    return m


def wood(name, light, dark, rough=.55, stretch=(1.5, 1.5, 22), fine=(.86, 1.04), sheen=0.0):
    m, nt, b = _base(name)
    v = _coords(nt, stretch)
    nz = _n(nt, 'ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.25
    nz.inputs['Detail'].default_value = 8
    nz.inputs['Roughness'].default_value = .62
    nz.inputs['Distortion'].default_value = 2.4
    _l(nt, v, nz.inputs['Vector'])
    col = _ramp(nt, nz.outputs['Fac'], [(.36, light), (.5, light), (.64, dark)])
    vf = _coords(nt, (6, 6, 230))
    fz = _n(nt, 'ShaderNodeTexNoise')
    fz.inputs['Scale'].default_value = 1
    fz.inputs['Detail'].default_value = 3
    _l(nt, vf, fz.inputs['Vector'])
    fr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, fz.outputs['Fac'], fr.inputs['Value'])
    fr.inputs['From Min'].default_value, fr.inputs['From Max'].default_value = .3, .7
    fr.inputs['To Min'].default_value, fr.inputs['To Max'].default_value = fine
    col = _mix(nt, 1.0, col, fr.outputs['Result'], 'MULTIPLY')
    _l(nt, col, b.inputs['Base Color'])
    _bump(nt, b, _math(nt, 'ADD', nz.outputs['Fac'], _math(nt, 'MULTIPLY', fz.outputs['Fac'], .6)), .06, .004)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .42
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
    return m


def plywood(name, light='#f0d6ab', dark='#b48554', layers=7.0, rough=.55):
    """Laminated edge: pale plies split by thin dark glue lines (DayOS stacks/discs).
    layers=7 gives ~22 plies per unit — wide enough not to alias at 1080px."""
    m, nt, b = _base(name)
    v = _coords(nt)
    wv = _n(nt, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', wave_profile='SIN')
    wv.inputs['Scale'].default_value = layers
    wv.inputs['Distortion'].default_value = .6
    wv.inputs['Detail'].default_value = 1
    _l(nt, v, wv.inputs['Vector'])
    col = _ramp(nt, wv.outputs['Fac'], [(0.0, light), (.80, light), (.97, dark)])
    fz = _n(nt, 'ShaderNodeTexNoise')
    fz.inputs['Scale'].default_value = 1
    fz.inputs['Detail'].default_value = 5
    fz.inputs['Distortion'].default_value = 1.2
    _l(nt, _coords(nt, (3, 3, 90)), fz.inputs['Vector'])
    fr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, fz.outputs['Fac'], fr.inputs['Value'])
    fr.inputs['From Min'].default_value, fr.inputs['From Max'].default_value = .3, .7
    fr.inputs['To Min'].default_value, fr.inputs['To Max'].default_value = .84, 1.05
    col = _mix(nt, 1.0, col, fr.outputs['Result'], 'MULTIPLY')
    _l(nt, col, b.inputs['Base Color'])
    _bump(nt, b, wv.outputs['Fac'], .08, .003)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .42
    return m


def plain(name, base, rough=.5, streak=0.0, spec=.45, coat=0.0):
    m, nt, b = _base(name)
    col = hexrgb(base)
    if streak:
        v = _coords(nt, (4, 4, 140))
        nz = _n(nt, 'ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 1
        nz.inputs['Detail'].default_value = 4
        _l(nt, v, nz.inputs['Vector'])
        mr = _n(nt, 'ShaderNodeMapRange')
        _l(nt, nz.outputs['Fac'], mr.inputs['Value'])
        mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = .3, .7
        mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1 - streak, 1 + streak * .4
        col = _mix(nt, 1.0, col, mr.outputs['Result'], 'MULTIPLY')
        _l(nt, col, b.inputs['Base Color'])
        gn = _n(nt, 'ShaderNodeTexNoise')
        gn.inputs['Scale'].default_value = 260
        _l(nt, _coords(nt), gn.inputs['Vector'])
        _bump(nt, b, gn.outputs['Fac'], .08, .002)
    else:
        b.inputs['Base Color'].default_value = col
        gn = _n(nt, 'ShaderNodeTexNoise')
        gn.inputs['Scale'].default_value = 240
        _l(nt, _coords(nt), gn.inputs['Vector'])
        _bump(nt, b, gn.outputs['Fac'], .05, .002)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = .25
    return m


def library():
    return {
        'terr': terrazzo('Terrazzo', '#f0ebe7', PAL_WHITE, big=.22, small=.40),
        'yel': terrazzo('YellowTerrazzo', '#ffe13a', PAL_YELLOW, big=.14, small=.26, rough=.56, pits=.4, bump=.26),
        'oak': wood('Oak', '#f4dbb8', '#cf9e6a'),
        'ply': plywood('Ply'),
        'dark': wood('DarkWood', '#5b4d44', '#3d332d', rough=.44, fine=(.8, 1.08), sheen=.15),
        'green': plain('Green', '#127536', .5, streak=.10),
        'pink': plain('Pink', '#e24aa8', .4),
        'blue': plain('Blue', '#3aa5d9', .4),
        'white': plain('WhiteLacquer', '#f5f0ec', .42),
        'taupe': plain('Taupe', '#8c8078', .55, streak=.06),
        # flat, near-emissive accent caps (the solution loops)
        'c_green': plain('CapGreen', '#8dff6a', .45),
        'c_pink': plain('CapPink', '#f472e6', .45),
        'c_cyan': plain('CapCyan', '#62ecef', .45),
        'c_orange': plain('CapOrange', '#f47208', .45),
    }


# ---------------------------------------------------------------- geometry
def prism(name, pts, h, mats, side, top=None, bevel=.022, coll=None, smooth=False):
    """Extruded polygon (CCW 2D points) centred on its centroid. Returns (obj, centroid).
    smooth=True shades the side walls smooth (for discs / cylinders)."""
    c = sum(pts, Vector((0, 0))) / len(pts)
    n = len(pts)
    verts = [(p.x - c.x, p.y - c.y, -h / 2) for p in pts] + [(p.x - c.x, p.y - c.y, h / 2) for p in pts]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        for p in me.polygons[2:]:
            p.use_smooth = True
    me.materials.append(mats[side])
    if top and top != side:
        me.materials.append(mats[top])
        me.polygons[1].material_index = 1
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL')
        bv.width = bevel
        bv.segments = 1
        bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(30)
    return ob, c


def sstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (x * 6 - 15) + 10)


# ---------------------------------------------------------------- output
def composite_preview(path, bg_hex):
    """Straight-alpha PNG over a flat page colour (what the browser will show)."""
    import numpy as np
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
    bg = np.array([int(bg_hex[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    rgb = px[..., :3] * px[..., 3:4] + bg * (1 - px[..., 3:4])
    out = bpy.data.images.new('cmp', w, h, alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    out.pixels[:] = np.dstack([rgb, np.ones((h, w, 1), np.float32)]).ravel()
    out.filepath_raw = path.replace('.png', '_bg.png')
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)


def render(sc, out_dir, prefix, frames, bg_hex=None):
    import time
    os.makedirs(out_dir, exist_ok=True)
    if frames == 'all':
        sc.render.filepath = os.path.join(out_dir, prefix + '_')
        t = time.time()
        bpy.ops.render.render(animation=True)
        print(f'ANIM DONE {time.time() - t:.1f}s')
        return
    for fr in [int(x) for x in frames.split(',')]:
        sc.frame_set(fr)
        p = os.path.join(out_dir, f'{prefix}_test_{fr:04d}.png')
        sc.render.filepath = p
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'FRAME {fr} {time.time() - t:.1f}s -> {p}')
        if bg_hex:
            composite_preview(p, bg_hex)
