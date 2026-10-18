"""Onboarding loops. Same light, camera, render settings and motion grammar as the
landing (looklib + solutions.py): sun + low fill, 100mm lens at -58 deg, Cycles with
motion blur, smootherstep everywhere, staggered pieces, a slow turn underneath, and a
late piece that seats exactly on the loop seam. The substance is onboardlib's:
black clay, cream paper, one glossy green object.

Stage loops (the onboarding canvas):
  welcome    the pile opens like the hero column; the green piece in it comes home last
  business   loose records file themselves onto the pile, bottom first
  tools      green traces run in and plug into the pile's paper layers
  how        three beats in thirds: a flag lands, the pages fan, the coin turns over
  data       three places in thirds: your device, Reclaim, the AI service
  finale_in  one shot: the pile parts and the green piece rises out of it
  finale     the green piece hovers over the pile (continues finale_in's last frame)
Card icons:
  ic_unpaid ic_duplicate ic_credit ic_unsure ic_show ic_draft ic_approve
Ledger choice cards (Launch, the screen after onboarding):
  card_upload  your ledger on your device; pages thumbed through, two green tabs turn up
  card_sample  the pile eases open and the green piece comes forward, turns, goes home

Run: blender -b --factory-startup --python onboarding.py -- scene=NAME out=DIR
     [scale=1 spp=96 frames=1,40,80|all bg=000000]"""
import bpy, math, random, os, sys
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K
import onboardlib as O

A = K.args()
OUT = A['out']
SCENE = A.get('scene', 'welcome')
TAU = 2 * math.pi
ZAX, XAX, YAX = Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0))
IDENT = Quaternion()

# name: (frames, width, height) at scale=1
SPECS = {
    'welcome': (240, 960, 960), 'business': (150, 960, 960), 'tools': (150, 960, 960),
    'how': (240, 1440, 640), 'data': (180, 1440, 640),
    'finale_in': (75, 1280, 800), 'finale': (180, 1280, 800),
    'ic_unpaid': (120, 400, 400), 'ic_duplicate': (120, 400, 400), 'ic_credit': (120, 400, 400),
    'ic_unsure': (120, 400, 400), 'ic_show': (120, 400, 400), 'ic_draft': (120, 400, 400),
    'ic_approve': (120, 400, 400),
    'card_upload': (150, 640, 480), 'card_sample': (150, 640, 480),
}
LOOP, W, H = SPECS[SCENE]
LOOP = int(A.get('loop', LOOP))
S = float(A.get('scale', 1))
K.reset()
sc = K.setup_render(int(W * S), int(A.get('spp', 96)), LOOP, A)
O.set_res(sc, int(W * S), int(H * S))
K.lights(sc, sun_from=tuple(float(x) for x in A.get('sun', '.5,-.55,.7').split(',')),
         strength=float(A.get('sunE', 5.0)), angle=float(A.get('sunA', 2.0)), fill=float(A.get('fill', .12)))
M = O.library()
rnd = random.Random(7)
moving = []
shapekeyed = []
curves = []


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    O.link(e)
    e.parent = parent
    moving.append(e)
    return e


def mv(ob, parent=None):
    ob.parent = parent
    ob.rotation_mode = 'QUATERNION'
    moving.append(ob)
    return ob


def keyall(fr):
    for o in moving:
        o.keyframe_insert('location', frame=fr)
        o.keyframe_insert('rotation_quaternion', frame=fr)
        o.keyframe_insert('scale', frame=fr)
    for kb in shapekeyed:
        kb.keyframe_insert('value', frame=fr)
    for cu in curves:
        cu.keyframe_insert('bevel_factor_end', frame=fr)


def cycle(t, t_open, t_close, dur):
    """0 -> 1 -> 0 with smootherstep edges (solutions.py)."""
    return K.sstep((t - t_open) / dur) * (1 - K.sstep((t - t_close) / dur))


def arc(a, b, e, lift):
    """a -> b along a raised arc (a record hopping between places)."""
    p = a.lerp(b, e)
    return p + Vector((0, 0, lift * 4 * e * (1 - e)))


# ------------------------------------------------------------------ shared pieces
B, HB, G, RH = .8, .58, .028, .12       # block width, block height, gap, ream height
SLOT = (1, -1)                          # the green piece's slot: front corner, toward camera


def build_pile(parent, gem=True):
    """Three tiers of 2x2 clay blocks with a ream of paper between tiers, loose sheets
    overhanging the visible sides. The middle tier's front block is the green piece.
    Returns (parts, top_z, gem_part)."""
    parts, gem_part = [], None
    z = 0.0
    pr = random.Random(3)
    for t in range(3):
        for ix, iy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            cx, cy = ix * (B + G) / 2, iy * (B + G) / 2
            radial = Vector((ix, iy, 0)).normalized()
            if t == 1 and (ix, iy) == SLOT and gem:
                g = mv(O.gem_obj('gem', M['gem'], size=(.6, .48, .19)), parent)
                base = Vector((cx * 1.13, cy * 1.13, z + HB / 2 + .03))
                # stood on edge, leaning into the pile, its broad face to the camera
                rot = Quaternion(ZAX, math.radians(-58 + 90)) @ Quaternion(XAX, math.radians(78)) @ Quaternion(ZAX, math.radians(12))
                gem_part = dict(ob=g, base=base, rot=rot, tier=t, radial=radial, kind='gem')
                parts.append(gem_part)
                continue
            mat = M['clay'] if (t + (ix > 0) + (iy > 0)) % 2 else M['clay2']
            h = HB * pr.uniform(.93, 1.0)
            ob = mv(O.clay_block(f'b{t}{ix}{iy}', B * pr.uniform(.97, 1.0), B * pr.uniform(.97, 1.0), h, mat), parent)
            base = Vector((cx, cy, z + h / 2))
            rot = Quaternion(ZAX, math.radians(pr.uniform(-2.5, 2.5)))
            parts.append(dict(ob=ob, base=base, rot=rot, tier=t, radial=radial, kind='block'))
        z += HB + G
        if t < 2:
            r = mv(O.ream_block(f'ream{t}', 2 * B + G + .05, 2 * B + G + .05, RH, M), parent)
            parts.append(dict(ob=r, base=Vector((0, 0, z + RH / 2)), rot=Quaternion(ZAX, math.radians(3 * (1 if t else -1))),
                              tier=t + .5, radial=Vector(), kind='ream'))
            # loose sheets overhanging the camera sides, drooping, one edge lifting
            for s, (mat, dx, dy, ang, cu, sg) in enumerate([('manila', .1, -.1, -7, .18, .1), ('ruled', .16, -.14, 4, .3, .14), ('paper', -.12, .1, 10, .14, .08)]):
                sh = O.sheet(f'sh{t}{s}', 2.1, 1.66, M[mat], curl=cu, sag=sg, curl_from=.45)
                sh.parent = r
                sh.location = (dx, dy, RH / 2 + .006 + s * .01)
                sh.rotation_quaternion = Quaternion(ZAX, math.radians(ang))
            z += RH + G
    return parts, z - G


def pile_pose(parts, e, f, open_scale=1.0, gem_e=None):
    """Hero grammar for the pile: tiers lift apart (middle tier stays), blocks slide out
    and tilt their tops outward, tiers twist alternately. e is a per-part openness
    function of the part; gem_e overrides the green piece's openness."""
    for p in parts:
        ee = e(p)
        if p['kind'] == 'gem' and gem_e is not None:
            ee = gem_e
        tier = p['tier']
        dz = (tier - 1) * .34 * ee * open_scale
        sign = 1 if int(tier) % 2 else -1
        tw = Quaternion(ZAX, math.radians(12 * sign * (.5 if p['kind'] == 'ream' else 1)) * ee * open_scale)
        pos = tw @ Vector((p['base'].x, p['base'].y, 0)) + tw @ p['radial'] * .62 * ee * open_scale
        if p['kind'] == 'gem':
            pos += tw @ p['radial'] * .35 * ee      # the green piece comes further forward
            dz += .18 * ee
        p['ob'].location = Vector((pos.x, pos.y, p['base'].z + dz))
        q = tw @ p['rot']
        if p['kind'] == 'block':
            tang = ZAX.cross(p['radial'])
            q = Quaternion(tw @ tang, -math.radians(11) * ee * open_scale) @ q
        p['ob'].rotation_quaternion = q


def coin(name, M, r=.42, h=.09, parent=None):
    """A green coin: milled edge, raised rim, the Reclaim mark struck on both faces."""
    if 'gem_r' not in M:
        M['gem_r'] = K.reeded('GemReeded', M['gem'], freq=150, depth=.35)
    ob = mv(O.disc(name, r, h, M, 'gem_r', top='gem'), parent)
    for side in (1, -1):
        rim = K.ring(f'{name}_rim{side}', r, r - .045, .022, M['gem'])
        rim.parent = ob
        rim.location = (0, 0, side * (h / 2 + .009))
        for i, mk in enumerate(O.mark(f'{name}_mk{side}', r * 1.05, .024, (M['gem'], M['gem']))):
            mk.parent = ob
            mk.location = (.0, 0, side * (h / 2 + .01))
            if side < 0:
                mk.rotation_mode = 'XYZ'
                mk.rotation_euler = (math.pi, 0, 0)
    return ob


def flag(name, M, parent=None, pole_h=.95, fw=.5, fh=.32):
    """A paper flag on a green pole. The cloth waves by two shape keys driven 90 deg out
    of phase, which is a travelling wave that loops seamlessly."""
    root = empty(name, parent)
    pole = O.disc(name + '_pole', .02, pole_h, M, 'gem', bevel=.004, n=24)
    pole.parent = root
    pole.location = (0, 0, pole_h / 2)
    knob = O.disc(name + '_knob', .035, .05, M, 'gem', bevel=.012, n=24)
    knob.parent = root
    knob.location = (0, 0, pole_h + .02)
    nx, ny = 18, 10
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            verts.append((fw * i / nx, 0, pole_h - .03 - fh * j / ny))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    cl = O.mesh_obj(name + '_cloth', verts, faces, M['paper'], smooth=True)
    cl.parent = root
    cl.location = (.02, 0, 0)
    so = cl.modifiers.new('solid', 'SOLIDIFY')
    so.thickness = .006
    cl.shape_key_add(name='Basis', from_mix=False)
    k = TAU * 1.6 / fw
    keys = []
    for nm, fn in (('A', math.sin), ('B', math.cos)):
        kb = cl.shape_key_add(name=nm, from_mix=False)
        kb.slider_min, kb.slider_max = -1, 1
        for i, v in enumerate(verts):
            x = v[0]
            amp = .07 * (x / fw) ** 1.2
            kb.data[i].co = Vector((v[0], amp * fn(k * x), v[2] + .015 * (x / fw) * fn(k * x * .5)))
        keys.append(kb)
        shapekeyed.append(kb)
    return root, keys


def wave(keys, t, cycles=2):
    w = TAU * cycles * t
    keys[0].value = math.cos(w)
    keys[1].value = -math.sin(w)


def stand_sheets(parent, M, n, w, d, mats, z0=0.0, jitter=.03, seed=1):
    r = random.Random(seed)
    out = []
    for k in range(n):
        sh = O.sheet(f'ss{seed}_{k}', w, d, M[mats[k % len(mats)]], curl=.05 * r.random(), t=.007)
        sh.parent = parent
        sh.location = (r.uniform(-jitter, jitter), r.uniform(-jitter, jitter), z0 + .004 + k * .009)
        sh.rotation_quaternion = Quaternion(ZAX, math.radians(r.uniform(-4, 4)))
        out.append(sh)
    return out


def hinge_sheet(name, w, d, mat, parent):
    """A sheet whose origin is its left edge, so it turns like a page."""
    sh = O.sheet(name, w, d, mat, t=.006, curl=.02)
    for v in sh.data.vertices:
        v.co.x += w / 2
    return mv(sh, parent)


# ------------------------------------------------------------------ scenes
cam = dict(target=(0, 0, 1.2), el=30, az=-58, dist=12.0)

if SCENE == 'welcome':
    rig = empty('rig')
    parts, top = build_pile(rig)
    for p in parts:
        p['dout'] = (2 - p['tier']) * 4 + rnd.uniform(0, 9)
        p['din'] = p['tier'] * 4 + rnd.uniform(0, 9)
    for f in range(LOOP + 1):
        t = f / LOOP

        def e(p):
            return K.sstep((f - 16 - p['dout']) / 50) * (1 - K.sstep((f - 130 - p['din']) / 54))
        # the green piece opens with the rest but comes home last, seating on the seam
        ge = K.sstep((f - 22) / 50) * (1 - K.sstep((f - 168) / 72))
        pile_pose(parts, e, f, gem_e=ge)
        gp = next(p for p in parts if p['kind'] == 'gem')
        # it rises out of its slot to the pile's axis, above the top tier, so it stays in
        # view while the column turns; it bows outward on the way so it clears the blocks
        up = Vector((0, 0, top + .34 + .62))
        gp['ob'].location = gp['base'].lerp(up, ge) + gp['radial'] * .75 * math.sin(math.pi * ge)
        # and turns once on the axis while it is out, so its facets catch the sun
        q_up = Quaternion(XAX, math.radians(62))
        gp['ob'].rotation_quaternion = Quaternion(ZAX, TAU * K.sstep((f - 40) / 150)) @ gp['rot'].slerp(q_up, ge)
        rig.rotation_quaternion = Quaternion(ZAX, TAU * (.15 * t + .85 * K.sstep((f - 12) / 210)))
        keyall(f + 1)
    cam = dict(target=(0, 0, top / 2 - .05), el=28, az=-58, dist=float(A.get('dist', 15.5)))

elif SCENE in ('business', 'tools', 'finale_in', 'finale'):
    rig = empty('rig')
    parts, top = build_pile(rig)
    gp = next(p for p in parts if p['kind'] == 'gem')
    rest = lambda p: 0.0

    if SCENE == 'business':
        # records drift in loose and tilted, file themselves bottom first, hold, lift off top first
        spec = ['ruled', 'manila', 'paper2', 'ruled', 'paper']
        recs = []
        for k, mat in enumerate(spec):
            sh = mv(O.sheet(f'rec{k}', 1.5, 1.12, M[mat], curl=.06, t=.008))
            stack = Vector((.05, -.04, top + .006 + k * .011))
            loose = stack + Vector((rnd.uniform(-.5, .5), rnd.uniform(-.4, .4), .55 + k * .3))
            axis = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized()
            q = Quaternion(ZAX, math.radians(rnd.uniform(-40, 40))) @ Quaternion(axis, math.radians(rnd.uniform(10, 22)))
            recs.append((sh, stack, loose, q, Quaternion(ZAX, math.radians(rnd.uniform(-3, 3))), k))
        n = len(recs)
        for f in range(LOOP + 1):
            t = f / LOOP
            pile_pose(parts, rest, f)
            for sh, stack, loose, q, qs, k in recs:
                ee = min(1.0, max(0.0, cycle(t, .06 + k * .06, .6 + (n - 1 - k) * .045, .2)))
                sh.location = loose.lerp(stack, ee)
                sh.rotation_quaternion = q.slerp(qs, ee)
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(9) * math.sin(TAU * t))
            for sh, *_ in recs:
                sh.rotation_quaternion = rig.rotation_quaternion @ sh.rotation_quaternion
                sh.location = rig.rotation_quaternion @ sh.location
            keyall(f + 1)
        cam = dict(target=(0, 0, top / 2 + .55), el=28, az=-58, dist=float(A.get('dist', 17.5)))

    elif SCENE == 'tools':
        # three bundles of green trace run in from off frame and plug into the paper layers
        z0 = HB + G + RH / 2
        z1 = 2 * (HB + G) + RH + G + RH / 2
        face_y = -(B + G / 2 + .025)
        face_x = (B + G / 2 + .025)
        routes = [
            [(-2.8, -6.5, z0), (-2.8, -1.9, z0), (-.45, -1.9, z0), (-.45, face_y, z0)],
            [(-1.2, -6.5, z1), (-1.2, -2.6, z1), (.35, -2.6, z1), (.35, face_y, z1)],
            [(6.5, 1.6, z0), (2.2, 1.6, z0), (2.2, .3, z0), (face_x, .3, z0)],
        ]
        wires = []
        for wi, route in enumerate(routes):
            for lane in (-1, 0, 1):
                pts = []
                for (x, y, z) in route:
                    pts.append((x, y, z + lane * .032))
                # parallel lanes keep their spacing through the bends
                path = O.rounded_path(pts, r=.22 + lane * .03)
                ob = O.tube(f'w{wi}{lane}', [tuple(p) for p in path], .015, M['wire'])
                ob.parent = rig
                ob.data.bevel_factor_mapping_end = 'SPLINE'
                ob.data.bevel_factor_end = 0
                curves.append(ob.data)
                wires.append((ob.data, wi, lane))
            # a plug where the bundle meets the paper
            end = Vector(route[-1])
            prev = Vector(route[-2])
            d = (end - prev).normalized()
            plug = mv(O.clay_block(f'plug{wi}', .2 if abs(d.y) > .5 else .09, .09 if abs(d.y) > .5 else .2, .17, M['clay2'], round_=.02), rig)
            wires.append((plug, wi, 'plug', end - d * .03))
        for f in range(LOOP + 1):
            t = f / LOOP
            pile_pose(parts, rest, f)
            for item in wires:
                wi = item[1]
                grow = cycle(t, .05 + wi * .09, .6 + (2 - wi) * .05, .26)
                if item[2] == 'plug':
                    plug, _, _, at = item
                    s = K.sstep((grow - .86) / .14)
                    plug.location = at
                    plug.scale = (max(s, .001),) * 3
                else:
                    cu, _, lane = item
                    cu.bevel_factor_end = max(0.0, min(1.0, grow * (1 + .02 * (1 - lane))))
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(5) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(.25, -.6, top / 2 - .1), el=30, az=-58, dist=float(A.get('dist', 19)))

    else:
        # finale: the pile parts a little and the green piece rises out to hover above it
        hover = Vector((0, 0, top + .95))
        n_in = SPECS['finale_in'][0]

        def gem_at(u, f_abs):
            """u: 0 in the slot -> 1 hovering. f_abs: frames since the intro began."""
            p0 = gp['base']
            mid = Vector((p0.x * 1.4, p0.y * 1.4, top * .75))
            a = p0.lerp(mid, min(1, u * 1.6))
            pos = a.lerp(hover, K.sstep((u - .3) / .7))
            q_slot = gp['rot']
            q_hover = Quaternion(XAX, math.radians(64)) @ Quaternion(YAX, math.radians(-18))
            return pos, q_slot.slerp(q_hover, K.sstep((u - .1) / .8))
        for f in range(LOOP + 1):
            t = f / LOOP
            if SCENE == 'finale_in':
                u = K.sstep(f / (LOOP - 4))
                breath = .22 * K.sstep(f / (LOOP * .55))
                pile_pose(parts, lambda p: breath, f)
                pos, q = gem_at(u, f)
                spin = TAU * .25 * u
            else:
                breath = .22 + .07 * math.sin(TAU * t)
                pile_pose(parts, lambda p: breath, f)
                pos, q = gem_at(1, f)
                pos = pos + Vector((0, 0, .06 * math.sin(TAU * t)))
                spin = TAU * (.25 + t)
            gp['ob'].location = pos
            gp['ob'].rotation_quaternion = Quaternion(ZAX, spin) @ q
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(-8))
            keyall(f + 1)
        right, up = O.cam_axes(-58, 22)
        tgt = Vector((0, 0, top / 2 + .7)) - right * float(A.get('shift', 1.05))
        cam = dict(target=tuple(tgt), el=22, az=-58, dist=float(A.get('dist', 19)))

elif SCENE in ('how', 'data'):
    EL = 26
    right, up = O.cam_axes(-58, EL)
    SP = float(A.get('spread', 2.55))
    slots = [right * -SP, Vector((0, 0, 0)), right * SP]

    if SCENE == 'how':
        # 1. find: a flag drops in and plants itself in a ream of records
        r1 = empty('find')
        r1.location = slots[0]
        base1 = O.ream_block('find_ream', 1.15, .85, .46, M, top='ruled')
        base1.parent = r1
        base1.location = (0, 0, .23)
        stand_sheets(r1, M, 2, 1.2, .9, ['ruled', 'paper'], z0=.46, seed=2)
        fl, fkeys = flag('flag', M, r1, pole_h=1.15, fw=.62, fh=.4)
        # 2. review: pages turn over one after another, then settle back
        r2 = empty('review')
        r2.location = slots[1]
        base2 = O.ream_block('rev_ream', 1.15, .85, .4, M, top='paper')
        base2.parent = r2
        base2.location = (0, 0, .2)
        pages = []
        for k in range(6):
            pg = hinge_sheet(f'page{k}', 1.12, .82, M['ruled' if k % 2 else 'paper2'], r2)
            pages.append((pg, Vector((-.56, 0, .405 + k * .008)), k))
        # 3. recover: the green coin, on a clay plinth, turns over and lands face up
        r3 = empty('recover')
        r3.location = slots[2]
        pl = O.clay_block('plinth', .8, .8, .3, M['clay'], round_=.05)
        pl.parent = r3
        pl.location = (0, 0, .15)
        cn = coin('coin', M, r=.42, parent=r3)
        for f in range(LOOP + 1):
            t = f / LOOP
            # beat 1 (find): drop from above, plant, hold the whole loop, lift out at the end
            e1 = cycle(t, .02, .88, .12)
            fl.location = Vector((.12, .05, .5 + (1 - e1) * 2.6))
            fl.rotation_quaternion = Quaternion(YAX, math.radians(6) * (1 - e1)) @ Quaternion(ZAX, math.radians(32))
            wave(fkeys, t, 3)
            # beat 2 (review): pages turn left to right, staggered, and fall back
            for pg, at, k in pages:
                ee = cycle(t, .22 + k * .035, .74 + (5 - k) * .02, .14)
                pg.location = at
                pg.rotation_quaternion = Quaternion(YAX, -math.radians(165 - k * 9) * ee)
            # beat 3 (recover): the coin stands, turns slowly, then flips and lands flat
            e3 = cycle(t, .5, .82, .16)
            stand = Quaternion(XAX, math.radians(90) * (1 - e3))
            hop = .55 * math.sin(math.pi * min(1, max(0, (t - .5) / .16)))
            cn.location = Vector((0, 0, .3 + .42 + .1 + hop * (1 - K.sstep((t - .62) / .1)) - (.42 - .07) * e3))
            cn.rotation_quaternion = Quaternion(ZAX, TAU * t) @ stand @ Quaternion(ZAX, math.radians(20))
            keyall(f + 1)
        cam = dict(target=(0, 0, .62), el=EL, az=-58, dist=float(A.get('dist', 19.5)))

    else:
        # 1. your device: a slab carrying the ledger; its top sheets lift and settle as the
        #    checks run, and the ledger itself never leaves
        r1 = empty('device')
        r1.location = slots[0]
        slab = O.clay_block('slab', 1.5, 1.05, .12, M['clay'], round_=.05)
        slab.parent = r1
        slab.location = (0, 0, .06)
        led = O.ream_block('ledger', 1.1, .8, .34, M, top='ruled')
        led.parent = r1
        led.location = (0, 0, .12 + .17)
        checks = []
        for k in range(3):
            sh = mv(O.sheet(f'chk{k}', 1.1, .8, M['ruled' if k != 1 else 'paper'], curl=.03, t=.006), r1)
            checks.append((sh, Vector((0, 0, .12 + .34 + .004 + k * .008)), k))
        # 2. Reclaim: one clay block, the mark struck on top in green
        r2 = empty('reclaim')
        r2.location = slots[1]
        blk = O.clay_block('reclaim_blk', 1.0, 1.0, .8, M['clay2'], round_=.08)
        blk.parent = r2
        blk.location = (0, 0, .4)
        for mk in O.mark('rmark', .62, .03, (M['gem'], M['gem'])):
            mk.parent = r2
            mk.location = (0, 0, .8 + .012)
            mk.rotation_mode = 'XYZ'
            mk.rotation_euler = (0, 0, math.radians(-58 + 90))
        # 3. the AI service: a pale, separate object (not clay: not ours)
        r3 = empty('ai')
        r3.location = slots[2]
        svc = O.clay_block('ai_blk', .85, .85, .55, M['paper2'], round_=.09)
        svc.parent = r3
        svc.location = (0, 0, .275)
        knob = O.disc('ai_knob', .17, .04, M, 'brass', bevel=.012, n=64)
        knob.parent = r3
        knob.location = (0, 0, .55 + .012)
        # records that travel: findings device -> Reclaim (two cards so the loop closes),
        # and one case card Reclaim -> AI -> Reclaim, only for part of the loop
        cardA = mv(O.sheet('cardA', .62, .44, M['manila'], t=.01))
        cardB = mv(O.sheet('cardB', .62, .44, M['manila'], t=.01))
        case = mv(O.sheet('case', .5, .36, M['paper2'], t=.01))
        dev_top = slots[0] + Vector((0, 0, .12 + .34 + .04))
        dev_in = slots[0] + Vector((0, 0, .12 + .2))
        rec_top = slots[1] + Vector((0, 0, .8 + .06))
        rec_in = slots[1] + Vector((0, 0, .45))
        ai_top = slots[2] + Vector((0, 0, .55 + .07))
        q_card = Quaternion(ZAX, math.radians(-58 + 90 + 8))
        for f in range(LOOP + 1):
            t = f / LOOP
            for sh, at, k in checks:
                ph = (t * 3 - k * .22) % 1
                lift = .16 * math.sin(math.pi * ph / .45) if ph < .45 else 0.0
                sh.location = at + Vector((0, 0, lift * (k + 1) * .6))
                sh.rotation_quaternion = Quaternion(XAX, math.radians(6) * lift)
            # card A: device top -> Reclaim top (t .12-.34), then sinks into the block (.42-.52)
            a = K.sstep((t - .12) / .22)
            s = K.sstep((t - .42) / .1)
            pa = arc(dev_top, rec_top, a, 1.1).lerp(rec_in, s)
            cardA.location = pa
            cardA.rotation_quaternion = q_card @ Quaternion(XAX, math.radians(14) * math.sin(math.pi * a))
            # card B rises out of the ledger to take A's place (.8-.97): the next finding
            b = K.sstep((t - .8) / .17)
            cardB.location = dev_in.lerp(dev_top, b)
            cardB.rotation_quaternion = q_card
            # the case card: up out of Reclaim (.48-.56), across to AI (.56-.7), back (.76-.9), down (.9-.98)
            u1 = K.sstep((t - .48) / .08)
            u2 = K.sstep((t - .56) / .14)
            u3 = K.sstep((t - .76) / .14)
            u4 = K.sstep((t - .9) / .08)
            pc = rec_in.lerp(rec_top + Vector((0, 0, .02)), u1)
            pc = arc(pc, ai_top, u2, .9)
            pc = arc(pc, rec_top + Vector((0, 0, .02)), u3, .9)
            pc = pc.lerp(rec_in, u4)
            case.location = pc
            case.rotation_quaternion = q_card @ Quaternion(XAX, math.radians(12) * (math.sin(math.pi * u2) + math.sin(math.pi * u3)))
            keyall(f + 1)
        cam = dict(target=(0, 0, .5), el=EL, az=-58, dist=float(A.get('dist', 19.5)))

else:
    # ------------------------------------------------------------------ card icons
    rig = empty('rig')
    if SCENE == 'ic_unpaid':
        base = O.ream_block('inv', 1.1, .8, .3, M, top='ruled')
        base.parent = rig
        base.location = (0, 0, .15)
        cn = coin('coin', M, r=.26, h=.06, parent=rig)
        top = hinge_sheet('lid', 1.12, .82, M['ruled'], rig)
        unders = stand_sheets(rig, M, 1, 1.12, .82, ['paper'], z0=.3, seed=4)
        for f in range(LOOP + 1):
            t = f / LOOP
            e = cycle(t, .1, .62, .2)
            top.location = Vector((-.56, 0, .32))
            top.rotation_quaternion = Quaternion(YAX, -math.radians(58) * e)
            # the coin starts inside the stack, rises once the page lifts, sinks before it closes
            e2 = cycle(t, .2, .52, .2)
            cn.location = Vector((.14, 0, .18 + .5 * e2))
            cn.rotation_quaternion = Quaternion(ZAX, TAU * t) @ Quaternion(XAX, math.radians(70) * e2)
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(8) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .45), el=32, az=-58, dist=5.3)

    elif SCENE == 'ic_duplicate':
        # two records cut from the same stock drift together and land exactly aligned
        a = mv(O.sheet('dupA', .95, .7, M['ruled'], curl=.03, t=.012), rig)
        b = mv(O.sheet('dupB', .95, .7, M['ruled'], curl=.03, t=.012), rig)
        tabs = []
        for nm, par in (('ta', a), ('tb', b)):
            tb = O.clay_block(nm, .16, .12, .03, M['clay'], round_=.012)
            tb.parent = par
            tb.location = (.3, .28, .02)
        for f in range(LOOP + 1):
            t = f / LOOP
            e = cycle(t, .12, .64, .22)
            a.location = Vector((-.38, -.2, .25)).lerp(Vector((0, 0, .02)), e)
            b.location = Vector((.42, .25, .85)).lerp(Vector((0, 0, .04)), e)
            a.rotation_quaternion = Quaternion(XAX, math.radians(16) * (1 - e)) @ Quaternion(ZAX, math.radians(-14) * (1 - e))
            b.rotation_quaternion = Quaternion(YAX, math.radians(-18) * (1 - e)) @ Quaternion(ZAX, math.radians(17) * (1 - e))
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(12) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .4), el=34, az=-58, dist=6.2)

    elif SCENE == 'ic_credit':
        card = mv(O.clay_block('memo', 1.0, .64, .05, M['manila'], round_=.03), rig)
        card.location = (0, 0, .2)
        card.rotation_quaternion = Quaternion(XAX, math.radians(-14))
        for k, y in enumerate((.12, 0, -.1)):
            ln = O.clay_block(f'ln{k}', .5 - k * .1, .025, .01, M['ink'], round_=.004)
            ln.parent = card
            ln.location = (-.15, y, .03)
        cn = coin('coin', M, r=.27, h=.065, parent=rig)
        for f in range(LOOP + 1):
            t = f / LOOP
            hop = math.sin(math.pi * min(1, max(0, (t - .28) / .36)))
            flip = K.sstep((t - .28) / .36)
            cn.location = Vector((.3, -.28, .32 + .55 * hop))
            cn.rotation_quaternion = Quaternion(ZAX, math.radians(-40)) @ Quaternion(XAX, math.radians(80) + TAU * flip)
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(10) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .5), el=30, az=-58, dist=5.0)

    elif SCENE == 'ic_unsure':
        bx = O.clay_block('box', .72, .72, .42, M['clay'], round_=.06)
        bx.parent = rig
        bx.location = (0, 0, .21)
        q = mv(O.text('q', '?', .95, .16, M['paper']), rig)
        cn = coin('coin', M, r=.17, h=.045, parent=rig)
        cn.location = (.42, -.36, .17)
        cn.rotation_quaternion = Quaternion(ZAX, math.radians(-30)) @ Quaternion(XAX, math.radians(78))
        for f in range(LOOP + 1):
            t = f / LOOP
            q.location = Vector((0, 0, .42 + .48 + .07 * math.sin(TAU * t)))
            q.rotation_quaternion = Quaternion(ZAX, math.radians(-58 + 90) + math.radians(28) * math.sin(TAU * t)) @ Quaternion(XAX, math.radians(90))
            keyall(f + 1)
        cam = dict(target=(0, 0, .62), el=26, az=-58, dist=5.6)

    elif SCENE == 'ic_show':
        bx = O.clay_block('blk', .7, .7, .5, M['clay'], round_=.06)
        bx.parent = rig
        bx.location = (0, 0, .25)
        fl, fkeys = flag('flag', M, rig, pole_h=.95, fw=.62, fh=.42)
        fl.location = (-.18, .1, .48)
        fl.rotation_quaternion = Quaternion(ZAX, math.radians(32))
        for f in range(LOOP + 1):
            t = f / LOOP
            wave(fkeys, t, 2)
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(14) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .7), el=24, az=-58, dist=5.8)

    elif SCENE == 'ic_draft':
        base = O.ream_block('drafts', 1.0, .74, .34, M, top='paper')
        base.parent = rig
        base.location = (0, 0, .17)
        stand_sheets(rig, M, 2, 1.0, .74, ['paper2', 'paper'], z0=.34, seed=6)
        sh = mv(O.sheet('new', 1.0, .74, M['ruled'], t=.008, curl=.03), rig)
        tab = O.clay_block('tab', .2, .1, .035, M['gem'], round_=.012)
        tab.parent = sh
        tab.location = (.32, .26, .02)
        for f in range(LOOP + 1):
            t = f / LOOP
            e_in = K.sstep((t - .08) / .34)
            e_out = K.sstep((t - .78) / .2)
            p = Vector((-2.2, -1.2, 1.0)).lerp(Vector((0, 0, .34 + .03)), e_in)
            p = p.lerp(Vector((.4, .6, 2.6)), e_out)
            sh.location = p
            sh.rotation_quaternion = Quaternion(XAX, math.radians(24) * (1 - e_in) + math.radians(-20) * e_out) @ Quaternion(ZAX, math.radians(-20) * (1 - e_in))
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(8) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .42), el=32, az=-58, dist=5.2)

    elif SCENE == 'ic_approve':
        sheets = []
        for k in range(2):
            sh = mv(O.sheet(f'doc{k}', .95, .7, M['paper2'], t=.01), rig)
            mk = K.ring(f'ok{k}', .2, .15, .004, M['pad'], n=64)
            mk.parent = sh
            mk.location = (.08, -.02, .007)
            mk.rotation_mode = 'QUATERNION'
            moving.append(mk)
            sheets.append((sh, mk))
        stamp = empty('stamp', rig)
        for nm, r, h, z, mat in (('pad', .2, .04, .02, 'pad'), ('foot', .23, .1, .09, 'brass'), ('neck', .07, .26, .27, 'brass')):
            o = O.disc(f'st_{nm}', r, h, M, mat, bevel=.012, n=64)
            o.parent = stamp
            o.location = (0, 0, z)
        knob = O.gem_obj('knob', M['brass'], size=(.13, .13, .12), subdiv=3)
        knob.parent = stamp
        knob.location = (0, 0, .46)
        knob.modifiers.clear()
        for p in knob.data.polygons:
            p.use_smooth = True
        for f in range(LOOP + 1):
            t = f / LOOP
            down = cycle(t, .2, .42, .1)
            stamp.location = Vector((.08, -.02, .02 + .62 * (1 - down)))
            stamp.rotation_quaternion = Quaternion(XAX, math.radians(8) * (1 - down))
            inked = 1.0 if t > .25 else 0.0
            # the stamped sheet slides off, a clean one slides in from the other side
            sw = K.sstep((t - .72) / .24)
            (s0, m0), (s1, m1) = sheets
            s0.location = Vector((0, 0, 0)).lerp(Vector((3.2, 1.6, 0)), sw)
            s1.location = Vector((-3.2, -1.6, 0)).lerp(Vector((0, 0, 0)), sw)
            m0.scale = (max(inked, .001),) * 3
            m1.scale = (.001,) * 3
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(6) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .36), el=32, az=-58, dist=5.2)

    elif SCENE == 'card_upload':
        # your ledger, on your device (the slab from `data`): its pages are thumbed
        # through one after another, and two green tabs slide out of the stack where
        # something turned up, then tuck back in before the seam
        slab = O.clay_block('slab', 1.9, 1.3, .14, M['clay'], round_=.05)
        slab.parent = rig
        slab.location = (0, 0, .07)
        LW, LD, LH = 1.25, .9, .38
        cx, cy = -.05, .02
        led = O.ream_block('ledger', LW, LD, LH, M, top='ruled')
        led.parent = rig
        led.location = (cx, cy, .14 + LH / 2)
        z_top = .14 + LH
        pages = []
        for k in range(5):
            pg = hinge_sheet(f'pg{k}', LW - .03, LD - .03, M['ruled' if k % 2 == 0 else 'paper2'], rig)
            pages.append((pg, Vector((cx - (LW - .03) / 2, cy, z_top + .004 + k * .007)), k))
        tabs = []
        for k, (x, z) in enumerate(((.3, .14 + .27), (-.24, .14 + .12))):
            tb = mv(O.clay_block(f'tab{k}', .32, .07, .105, M['gem'], round_=.02), rig)
            tabs.append((tb, Vector((cx + x, cy - LD / 2 + .035, z)), k))
        for f in range(LOOP + 1):
            t = f / LOOP
            # the thumb runs through the pages top-down, each lifting a little less
            for pg, at, k in pages:
                kk = 4 - k
                ee = cycle(t, .08 + kk * .05, .2 + kk * .05, .1)
                pg.location = at
                pg.rotation_quaternion = Quaternion(YAX, -math.radians(36 - kk * 4) * ee)
            for tb, at, k in tabs:
                out = cycle(t, .44 + k * .07, .78 + k * .05, .1)
                tb.location = at + Vector((0, -.15 * out, 0))
                tb.rotation_quaternion = IDENT
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(7) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, .5), el=30, az=-58, dist=8.1)

    elif SCENE == 'card_sample':
        # the onboarding pile, ready to look into: the tiers ease apart, the green piece
        # comes forward and turns once in the light, and it is the last thing home
        parts, top = build_pile(rig)
        gp = next(p for p in parts if p['kind'] == 'gem')
        for f in range(LOOP + 1):
            t = f / LOOP
            e_all = cycle(t, .06, .6, .22) * .45
            e_gem = cycle(t, .12, .76, .24)
            pile_pose(parts, lambda p: e_all, f, gem_e=e_gem)
            spin = Quaternion(ZAX, TAU * K.sstep((t - .3) / .36))
            gp['ob'].rotation_quaternion = spin @ gp['ob'].rotation_quaternion
            gp['ob'].location += Vector((0, 0, .22 * e_gem))
            rig.rotation_quaternion = Quaternion(ZAX, math.radians(9) * math.sin(TAU * t))
            keyall(f + 1)
        cam = dict(target=(0, 0, top / 2 + .02), el=28, az=-58, dist=15.5)

K.camera(sc, cam['target'], float(A.get('dist', cam['dist'])), float(A.get('el', cam['el'])), float(A.get('az', cam['az'])),
         lens=float(A.get('lens', 100)))
K.render(sc, OUT, SCENE, A.get('frames', '1,40,80'), A.get('bg'))
