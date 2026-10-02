"""D05 basin — terrain where value pools in the wrong basin and gets redirected.

A cut block of land, like a cast model: warm stone on top, its strata showing in the cut
sides. Value runs off a spring on the high ground and pools, pink, in the wrong hollow.
The ridge between the hollows sinks into a pass, and the pink pool drains over it into the
right basin, which is already green — the value turns green as it arrives. The pass closes
and the spring starts filling the wrong hollow again: it keeps happening, and it keeps
being caught. Behaviours: pooling, getting stuck, redirecting, returning, terrain
reorganising itself.

knobs: terr=0|1  mat=stone|bands  liquid=1|0 (0 = beads)  grid=
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
S = 2.6
G = int(A.get('grid', 200))
BOT = float(A.get('bot', -.55))
TERR = A.get('terr', '0') == '1'
STEP = float(A.get('step', .16))
xs = np.linspace(-S, S, G)
X, Y = np.meshgrid(xs, xs)
BA = np.array([-1.15, .55])      # wrong basin
BB = np.array([1.05, -.55])      # right basin
SRC = np.array([-1.7, 1.75])     # the spring
PASS = np.array([.0, -.05])


def g2(x, y, c, s):
    return np.exp(-((x - c[0]) ** 2 + (y - c[1]) ** 2) / (2 * s * s))


def height(x, y, gate):
    h = .72 + .16 * np.sin(x * 1.1 + 1) * np.cos(y * .9)
    h -= .8 * g2(x, y, BA, .6) + .95 * g2(x, y, BB, .75)
    d = (x - PASS[0]) * .92 + (y - PASS[1]) * .38
    h += .5 * np.exp(-d * d / .12) * (1 - .9 * gate * np.exp(-((y - PASS[1]) ** 2) / .3))
    h += .55 * g2(x, y, SRC, .85) + .35 * g2(x, y, (1.8, 1.7), .8) + .3 * g2(x, y, (-.6, -2.0), .8)
    if TERR:
        n = np.floor(h / STEP)
        f = np.clip((h / STEP - n - .78) / .22, 0, 1)
        h = STEP * (n + f * f * (3 - 2 * f))
    return h


def build(gate):
    z = height(X, Y, gate)
    top = np.c_[X.ravel(), Y.ravel(), z.ravel()]
    bot = top[RING].copy()
    bot[:, 2] = BOT
    return np.vstack([top, bot])


ring = [(0, i) for i in range(G)] + [(j, G - 1) for j in range(1, G)] + \
       [(G - 1, i) for i in range(G - 2, -1, -1)] + [(j, 0) for j in range(G - 2, 0, -1)]
RING = [j * G + i for j, i in ring]
faces = [(j * G + i, j * G + i + 1, (j + 1) * G + i + 1, (j + 1) * G + i) for j in range(G - 1) for i in range(G - 1)]
NR = len(RING)
for k in range(NR):
    a, b = RING[k], RING[(k + 1) % NR]
    faces.append((b, a, G * G + k, G * G + (k + 1) % NR))
faces.append(tuple(G * G + k for k in range(NR)))


def terrain_mat():
    """Top: warm cast stone, darker and cooler down in the hollows (a smooth height gradient,
    not bands), with grain. Cut sides: strata in the house neutrals."""
    m = bpy.data.materials.new('Terrain')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    N = nt.nodes.new
    L = nt.links.new
    tc = N('ShaderNodeTexCoord')
    sep = N('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    # height gradient on top
    mr = N('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = -.1, 1.25
    L(sep.outputs['Z'], mr.inputs['Value'])
    rp = N('ShaderNodeValToRGB')
    els = rp.color_ramp.elements
    top_stops = {
        'stone': [(0, '#444444'), (.22, '#6b6762'), (.38, '#979797'), (.52, '#c6c6c6'), (.7, '#eae5da'), (1, '#f3e6cc')],
        'dusk': [(0, '#2f2f2f'), (.2, '#5a3f7a'), (.36, '#b874fc'), (.52, '#e7cfff'), (.72, '#eae5da'), (1, '#f3e6cc')],
        'sea': [(0, '#1a1a1a'), (.2, '#1f5f73'), (.36, '#00d1ff'), (.55, '#bef3ff'), (.75, '#eae5da'), (1, '#f3e6cc')],
    }[A.get('pal', 'stone')]
    if A.get('mat') == 'bands':
        rp.color_ramp.interpolation = 'CONSTANT'
    els[0].position, els[0].color = top_stops[0][0], hexrgb(top_stops[0][1])
    els[1].position, els[1].color = top_stops[1][0], hexrgb(top_stops[1][1])
    for p_, c_ in top_stops[2:]:
        e = els.new(p_); e.color = hexrgb(c_)
    L(mr.outputs[0], rp.inputs['Fac'])
    # strata on the cut sides
    wv = N('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'
    wv.inputs['Scale'].default_value = .55; wv.inputs['Distortion'].default_value = 1.2
    wv.inputs['Detail Scale'].default_value = .6
    L(tc.outputs['Object'], wv.inputs['Vector'])
    srp = N('ShaderNodeValToRGB')
    srp.color_ramp.interpolation = 'CONSTANT'
    se = srp.color_ramp.elements
    strata = [(0, A.get('side', '#5f5b56')), (.5, A.get('side', '#5f5b56'))]
    se[0].position, se[0].color = strata[0][0], hexrgb(strata[0][1])
    se[1].position, se[1].color = strata[1][0], hexrgb(strata[1][1])
    for p_, c_ in strata[2:]:
        e = se.new(p_); e.color = hexrgb(c_)
    L(wv.outputs['Fac'], srp.inputs['Fac'])
    geo = N('ShaderNodeNewGeometry')
    nsep = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], nsep.inputs[0])
    isup = N('ShaderNodeMath'); isup.operation = 'GREATER_THAN'; isup.inputs[1].default_value = .2
    L(nsep.outputs['Z'], isup.inputs[0])
    mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'
    ins = {s.identifier: s for s in mx.inputs}
    L(isup.outputs[0], ins['Factor_Float']); L(srp.outputs['Color'], ins['A_Color']); L(rp.outputs['Color'], ins['B_Color'])
    # grain
    nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9; nz.inputs['Detail'].default_value = 6
    L(tc.outputs['Object'], nz.inputs['Vector'])
    gr = N('ShaderNodeMapRange'); gr.inputs['To Min'].default_value, gr.inputs['To Max'].default_value = .92, 1.05
    L(nz.outputs['Fac'], gr.inputs['Value'])
    mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mins = {s.identifier: s for s in mul.inputs}
    mins['Factor_Float'].default_value = 1
    L(next(s for s in mx.outputs if s.identifier == 'Result_Color'), mins['A_Color']); L(gr.outputs[0], mins['B_Color'])
    L(next(s for s in mul.outputs if s.identifier == 'Result_Color'), b.inputs['Base Color'])
    fn = N('ShaderNodeTexNoise'); fn.inputs['Scale'].default_value = 140
    L(tc.outputs['Object'], fn.inputs['Vector'])
    bp = N('ShaderNodeBump'); bp.inputs['Strength'].default_value = .12; bp.inputs['Distance'].default_value = .003
    L(fn.outputs['Fac'], bp.inputs['Height']); L(bp.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = .78
    b.inputs['Specular IOR Level'].default_value = .3
    return m


V0 = build(0)
land = mesh_obj('Land', V0.tolist(), faces, terrain_mat())
for p in land.data.polygons[: (G - 1) * (G - 1)]:
    p.use_smooth = True
me = land.data
ground(BOT)


def liquid(name, colour, centre, rad):
    """A disc of liquid at a settable level, clipped by the terrain around its basin."""
    m, nt, b = lab_base(name)
    b.inputs['Base Color'].default_value = col(colour)
    b.inputs['Roughness'].default_value = .06
    b.inputs['Coat Weight'].default_value = .6
    b.inputs['Coat Roughness'].default_value = .02
    b.inputs['Emission Color'].default_value = col(colour)
    b.inputs['Emission Strength'].default_value = .25
    ob = cyl(name, rad, .002, (centre[0], centre[1], 0), m, 96, 0)
    return ob


def lab_base(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes['Principled BSDF']


def grad_mat(name, a, b, x0, x1):
    m, nt, bs = lab_base(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = x0, x1
    nt.links.new(sep.outputs['X'], mr.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    ins = {s.identifier: s for s in mx.inputs}
    ins['A_Color'].default_value = col(a); ins['B_Color'].default_value = col(b)
    nt.links.new(mr.outputs[0], ins['Factor_Float'])
    out = next(s for s in mx.outputs if s.identifier == 'Result_Color')
    nt.links.new(out, bs.inputs['Base Color']); nt.links.new(out, bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = .25
    bs.inputs['Roughness'].default_value = .06
    bs.inputs['Coat Weight'].default_value = .6
    return m


poolA = liquid('PoolA', 'pink', BA, 1.05)
poolB = liquid('PoolB', 'green', BB, 1.25)
ZA_FULL, ZA_EMPTY = float(height(np.array(BA[0]), np.array(BA[1]), 0)) + .42, None
ZB = float(height(np.array(BB[0]), np.array(BB[1]), 0)) + .36
ZA_EMPTY = float(height(np.array(BA[0]), np.array(BA[1]), 0)) - .02
# streams: spring -> A (refill) and A -> pass -> B (redirect)
st_m = grad_mat('Stream', 'pink', 'green', BA[0] + .3, BB[0] - .4)
stream = tube('Stream', [(0, 0, 0)] * 40, .05, st_m)


def along(p0, p1, p2, n, gate, lift=.03):
    out = []
    for i in range(n):
        k = i / (n - 1)
        p = p0 * (1 - k) ** 2 + p1 * 2 * k * (1 - k) + p2 * k * k
        out.append((p[0], p[1], float(height(np.array(p[0]), np.array(p[1]), gate)) + lift))
    return out


@on_pose
def pose(t):
    gate = pulse(t, 40, 80, 165, 205)
    V = build(gate)
    me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.update()
    drain = ramp(t, 78, 150)
    refill = ramp(t, 165, 238)
    lvl = 1 - drain + refill if t > 150 else 1 - drain
    lvl = min(1.0, max(0.0, lvl))
    poolA.location.z = ZA_EMPTY + (ZA_FULL - ZA_EMPTY) * lvl
    poolA.hide_render = lvl < .02
    poolB.location.z = ZB + .05 * ramp(t, 90, 160) * (1 - ramp(t, 170, 238))
    # redirect stream: A rim -> pass -> B, flowing 80..152
    flow = pulse(t, 78, 92, 138, 154)
    pts = along(BA + np.array([.45, -.2]), PASS, BB + np.array([-.5, .25]), 40, gate, .04)
    sp = stream.data.splines[0]
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1)
    stream.data.bevel_depth = .045 * flow
    stream.hide_render = flow < .01


cam(sc, (0, -.1, -.05), 21, 40, -58)
go(sc, 'basin', '1,110,150,200', LOOP)
