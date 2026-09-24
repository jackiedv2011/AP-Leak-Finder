"""Shared look for every render: paper-and-ink materials, sun + fill lighting,
Cycles/OptiX settings, motion blur, transparent film.

Every object on the site is built out of one substance — a block of ledger
sheets. Seen edge-on it shows its leaves; seen face-on it is plain card. The
only other surfaces are the ink boards it is filed between and Reclaim's own
accents, which are the site's palette verbatim (styles.css): green #00fd74,
blue #00d1ff, orange #ff6838, pink #ff7ef2, purple #b874fc, over the pale
tints #d1ffca #bef3ff #ffe0c4 #ffd5f8.

The chrome around these renders is monochrome on purpose, so the colour a
viewer sees on the page is the colour in here. Spend it where it means
something: on the site, green is money actually back, orange is paid twice,
blue is paid too much, pink is paid to the wrong place."""
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


def _coords(nt, stretch=(1, 1, 1), jitter=True):
    """Object coords, offset per object so sibling pieces never share a pattern.

    `jitter=False` drops that offset, which is what printed rules want: pieces
    cut from one ring keep their local axes, so the rules run straight across
    the cuts and the ring reads as a single page someone has divided up."""
    tc = _n(nt, 'ShaderNodeTexCoord')
    if not jitter:
        if stretch == (1, 1, 1):
            return tc.outputs['Object']
        mp0 = _n(nt, 'ShaderNodeMapping')
        mp0.inputs['Scale'].default_value = stretch
        _l(nt, tc.outputs['Object'], mp0.inputs['Vector'])
        return mp0.outputs[0]
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
def paper(name, base, rough=.78, tone=.055, grain=.05, sheen=.0):
    """Matte card stock. Two frequencies do all the work: a slow drift so a wide
    face is never dead flat under a hard sun, and fibre grain fine enough to
    live in the bump only. No gloss — paper's whole character is that it
    refuses to reflect."""
    m, nt, b = _base(name)
    dr = _n(nt, 'ShaderNodeTexNoise')
    dr.inputs['Scale'].default_value = 3.2
    dr.inputs['Detail'].default_value = 2
    _l(nt, _coords(nt), dr.inputs['Vector'])
    mr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, dr.outputs['Fac'], mr.inputs['Value'])
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = .25, .75
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1 - tone, 1 + tone * .6
    _l(nt, _mix(nt, 1.0, hexrgb(base), mr.outputs['Result'], 'MULTIPLY'), b.inputs['Base Color'])
    fb = _n(nt, 'ShaderNodeTexNoise')
    fb.inputs['Scale'].default_value = 420
    fb.inputs['Detail'].default_value = 2
    _l(nt, _coords(nt, (1, 1, 2.6)), fb.inputs['Vector'])
    _bump(nt, b, fb.outputs['Fac'], grain, .0015)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .22
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
        b.inputs['Sheen Roughness'].default_value = .4
    return m


def ream(name, sheet='#f7f5f1', edge='#bdb6ad', leaves=23.0, rough=.76, cut=.42):
    """A block of ledger sheets seen edge-on: pale leaves split by the hairline
    shadow between them. `leaves` is a wave scale, ~3.1 bands per unit of it,
    so 23 lands near 70 sheets per unit — dense enough to read as paper at a
    glance, wide enough to survive the encoder.

    `cut` biases the ramp: low values give a crisp guillotined edge, high values
    a softer, thumbed one."""
    m, nt, b = _base(name)
    v = _coords(nt)
    wv = _n(nt, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', wave_profile='SIN')
    wv.inputs['Scale'].default_value = leaves
    wv.inputs['Distortion'].default_value = .35
    wv.inputs['Detail'].default_value = 1
    _l(nt, v, wv.inputs['Vector'])
    col = _ramp(nt, wv.outputs['Fac'], [(0.0, sheet), (.62 + cut * .3, sheet), (.99, edge)])
    # a slow swell across the block, so the stack looks pressed rather than printed
    sw = _n(nt, 'ShaderNodeTexNoise')
    sw.inputs['Scale'].default_value = 1.4
    sw.inputs['Detail'].default_value = 4
    sw.inputs['Distortion'].default_value = .8
    _l(nt, _coords(nt, (2.4, 2.4, 40)), sw.inputs['Vector'])
    sr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, sw.outputs['Fac'], sr.inputs['Value'])
    sr.inputs['From Min'].default_value, sr.inputs['From Max'].default_value = .3, .7
    sr.inputs['To Min'].default_value, sr.inputs['To Max'].default_value = .93, 1.03
    _l(nt, _mix(nt, 1.0, col, sr.outputs['Result'], 'MULTIPLY'), b.inputs['Base Color'])
    _bump(nt, b, _math(nt, 'ADD', wv.outputs['Fac'], _math(nt, 'MULTIPLY', sw.outputs['Fac'], .35)), .09, .0025)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .24
    return m


def ruled(name, base='#f7f5f1', line='#9aa6ad', pitch=46.0, rough=.78):
    """The face of a ledger sheet: fine printed rules, pressed very slightly in.
    Bands run along local X, so a card's rules follow its long edge."""
    m, nt, b = _base(name)
    v = _coords(nt, jitter=False)
    wv = _n(nt, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Y', wave_profile='SIN')
    wv.inputs['Scale'].default_value = pitch
    wv.inputs['Distortion'].default_value = 0
    _l(nt, v, wv.inputs['Vector'])
    rules = _ramp(nt, wv.outputs['Fac'], [(0.0, base), (.88, base), (.985, line)])
    dr = _n(nt, 'ShaderNodeTexNoise')
    dr.inputs['Scale'].default_value = 3.2
    _l(nt, v, dr.inputs['Vector'])
    mr = _n(nt, 'ShaderNodeMapRange')
    _l(nt, dr.outputs['Fac'], mr.inputs['Value'])
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = .25, .75
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = .96, 1.03
    _l(nt, _mix(nt, 1.0, rules, mr.outputs['Result'], 'MULTIPLY'), b.inputs['Base Color'])
    fb = _n(nt, 'ShaderNodeTexNoise')
    fb.inputs['Scale'].default_value = 420
    _l(nt, v, fb.inputs['Vector'])
    _bump(nt, b, _math(nt, 'ADD', _math(nt, 'MULTIPLY', wv.outputs['Fac'], .5), _math(nt, 'MULTIPLY', fb.outputs['Fac'], .12)), .05, .0015)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = .22
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


# Coloured stock, the way a filing system actually buys paper: the same card in
# several colours so a drawer can be read at a glance. (sheet, cut edge).
#
# These are saturated, not pastel. A pale wash over every card reads as sticky
# notes and throws away the one thing that makes these objects paper — the
# leaves in the cut edge, which need a dark enough edge colour to survive. The
# two greys are what actually stops a frame going white: colour alone gives a
# picture variety, but only value gives it depth, and on a black section the
# darks have to come from the stock because they cannot come from the ground.
STOCKS = {
    # neutrals, warm to cool and light to dark. Paper is never one white — a
    # real drawer has bond, manila and board in it — and these carry most of the
    # variety in a frame without spending any saturation to get it.
    'cream': ('#f7ead0', '#c3a87e'),
    'bone': ('#eee9df', '#b2a897'),
    'mid': ('#bab4ab', '#6f6a62'),
    'dark': ('#6b6762', '#3b3833'),
    'green': ('#4dfe97', '#13a75a'),
    'blue': ('#4ddcff', '#1f88a8'),
    'orange': ('#ff8452', '#b34a22'),
    'pink': ('#ff9cf5', '#b854ab'),
    'purple': ('#c98ffd', '#7b4bb0'),
}


def library():
    """Paper first, ink second, and colour in two strengths.

    The pale half is stock — it can cover a whole card, and several cards at
    once, without any of them claiming to be the point. The saturated half is
    reserved for the one event a loop is about. Keeping those two jobs apart is
    what lets a frame be full of colour and still have a subject.

    Accent bases are the site's hexes as written; this sun and view transform
    land them a shade under, which is what you want — a face reading exactly
    #00fd74 under a key light would be lighting itself."""
    lib = {
        # stock
        'ream': ream('Ream'),
        'ream_w': ream('ReamBright', sheet='#fdfcfa', edge='#c8c2ba', leaves=27.0, cut=.2),
        'paper': paper('Paper', '#f6f4f0'),
        'card': paper('Card', '#e6e2db', tone=.045),
        'ruled': ruled('Ruled'),
        'ink': paper('Ink', '#3b3b3e', rough=.7, tone=.035, grain=.04, sheen=.12),
        'carbon': paper('Carbon', '#212124', rough=.66, tone=.03, grain=.04, sheen=.16),
        # Reclaim accents — money back, paid twice, paid too much, wrong place
        'green': plain('Green', '#00fd74', .44),
        'orange': plain('Orange', '#ff6838', .44),
        'blue': plain('Blue', '#00d1ff', .44),
        'pink': plain('Pink', '#ff7ef2', .44),
        'purple': plain('Purple', '#b874fc', .44),
        # the hero's well: a painted inner wall, not stock, and pale because a
        # saturated colour down there would only turn to mud
        't_green': plain('TintGreen', '#d1ffca', .5),
        'card_cream': paper('CardCream', '#f3e6cc', tone=.05),
        'card_bone': paper('CardBone', '#eae5da', tone=.045),
        'card_mid': paper('CardMid', '#b0aaa1', tone=.04),
        'card_dark': paper('CardDark', '#5f5b56', rough=.72, tone=.035, sheen=.1),
    }
    for k, (sheet, edge) in STOCKS.items():
        lib[f'ream_{k}'] = ream(f'Ream{k.title()}', sheet=sheet, edge=edge)
    return lib


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
    # absolute: Blender on Windows resolves a bare relative output path against the
    # drive root (out/x -> C:\out\x), not the working directory Python uses
    out_dir = os.path.abspath(out_dir)
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
