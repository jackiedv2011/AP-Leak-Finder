"""D10 comb — strands flow through a comb: tangled in, straight out. One snag gets caught,
traced, and worked free.

A bundle of cords flows left to right through a comb (never shown; it is where the
tangle stops). Upstream they are a mess, downstream they lie straight in their lanes.
A knot comes along one strand and catches at the comb — everything on that strand
stops. A light runs along the strand, tracing it back to the knot; the knot works loose,
the strand straightens into its lane, and the light follows it out, green.
The flow never stops, so the loop is seamless: each cycle a new knot arrives.
Behaviours: tracing, untangling, getting stuck and freed, chaos to clean.
"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab import *
import numpy as np

LOOP = 240
sc = scene(LOOP)
NS = int(A.get('ns', 9))
NP = 240
L = 3.6
PER = 2 * L                 # the mess pattern repeats every PER along the strand
V = PER / LOOP              # so after one loop the flow has moved exactly one period
rng = np.random.default_rng(int(A.get('seed', 5)))
KEYS = ['g5', 'bone', 'g3', 'cream', 'SNAG', 't_blue', 'g4', 'bone', 't_purple', 'cream', 'g2'][:NS]
SNAG = KEYS.index('SNAG')
xs = np.linspace(-L, L, NP)
LANE = float(A.get('lane', .2))
lanes = (np.arange(NS) - (NS - 1) / 2) * LANE
# integer harmonics of the period so the mess is periodic in the flow coordinate
HY = rng.integers(1, 4, (NS, 3)); HZ = rng.integers(1, 4, (NS, 3))
PY = rng.uniform(0, 2 * math.pi, (NS, 3)); PZ = rng.uniform(0, 2 * math.pi, (NS, 3))
COMB = -.6
XC = .55                   # where the knot catches: just downstream of the comb, in the clean lanes
RAD = float(A.get('rad', .07))


def trace_mat(name):
    """Pink cord with a travelling light: emission = gaussian around x = XT (object space),
    colour mixes pink -> green downstream of XG."""
    m, nt, b = lab_base(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    xt = nt.nodes.new('ShaderNodeValue'); xt.name = 'XT'
    xg = nt.nodes.new('ShaderNodeValue'); xg.name = 'XG'
    d = nt.nodes.new('ShaderNodeMath'); d.operation = 'SUBTRACT'
    nt.links.new(sep.outputs['X'], d.inputs[0]); nt.links.new(xt.outputs[0], d.inputs[1])
    sq = nt.nodes.new('ShaderNodeMath'); sq.operation = 'MULTIPLY'
    nt.links.new(d.outputs[0], sq.inputs[0]); nt.links.new(d.outputs[0], sq.inputs[1])
    ex = nt.nodes.new('ShaderNodeMath'); ex.operation = 'MULTIPLY'; ex.inputs[1].default_value = -6.0
    nt.links.new(sq.outputs[0], ex.inputs[0])
    e2 = nt.nodes.new('ShaderNodeMath'); e2.operation = 'EXPONENT'
    nt.links.new(ex.outputs[0], e2.inputs[0])
    st = nt.nodes.new('ShaderNodeValue'); st.name = 'EST'
    em = nt.nodes.new('ShaderNodeMath'); em.operation = 'MULTIPLY'
    nt.links.new(e2.outputs[0], em.inputs[0]); nt.links.new(st.outputs[0], em.inputs[1])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'LESS_THAN'
    nt.links.new(sep.outputs['X'], gt.inputs[0]); nt.links.new(xg.outputs[0], gt.inputs[1])
    xp = nt.nodes.new("ShaderNodeValue"); xp.name = "XP"
    g2_ = nt.nodes.new("ShaderNodeMath"); g2_.operation = "GREATER_THAN"
    nt.links.new(sep.outputs["X"], g2_.inputs[0]); nt.links.new(xp.outputs[0], g2_.inputs[1])
    both = nt.nodes.new("ShaderNodeMath"); both.operation = "MULTIPLY"
    nt.links.new(gt.outputs[0], both.inputs[0]); nt.links.new(g2_.outputs[0], both.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    ins = {s.identifier: s for s in mix.inputs}
    ins["A_Color"].default_value = col("pink")
    ins["B_Color"].default_value = col("green")
    nt.links.new(both.outputs[0], ins["Factor_Float"])
    out = next(s for s in mix.outputs if s.identifier == 'Result_Color')
    nt.links.new(out, b.inputs['Base Color'])
    nt.links.new(out, b.inputs['Emission Color'])
    nt.links.new(em.outputs[0], b.inputs['Emission Strength'])
    b.inputs['Roughness'].default_value = .35
    b.inputs['Coat Weight'].default_value = .3
    return m, nt.nodes["XT"].outputs[0], nt.nodes["XG"].outputs[0], nt.nodes["EST"].outputs[0], nt.nodes["XP"].outputs[0]


def lab_base(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes['Principled BSDF']


strands = []
for s in range(NS):
    if s == SNAG:
        mat, XT, XG, EST, XP = trace_mat('Snag')
    else:
        mat = rich(KEYS[s], .42, .2, var=.04)
    ob = tube(f'S{s}', [(0, 0, 0)] * NP, RAD, mat)
    ob.data.resolution_u = 2
    strands.append(ob)


def mess(s, xi):
    w = 2 * math.pi / PER
    y = sum(.5 / (q + 1) * np.sin(HY[s, q] * w * xi + PY[s, q]) for q in range(3))
    z = sum(.42 / (q + 1) * np.sin(HZ[s, q] * w * xi * 1.0 + PZ[s, q]) for q in range(3))
    return y, z


K0 = 20.0     # frame at which the knot enters at the left edge


@on_pose
def pose(t):
    # the knot rides the flow from the left edge; caught at the comb 70..150, then released
    x_free = -L - .4 + V * 3.2 * (t - K0)        # it arrives a bit faster than the flow, to be seen coming
    caught = x_free >= XC and t < 150
    xk = min(x_free, XC) if t < 150 else (XC) + V * 6 * (t - 150)
    undo = ramp(t, 150, 178)
    for s, ob in enumerate(strands):
        xi = xs - V * t
        y0, z0 = mess(s, xi)
        k = np.clip((xs - COMB) / .9 + .5, 0, 1)
        k = k * k * (3 - 2 * k)
        y = y0 * (1 - k) + lanes[s] * k
        z = z0 * (1 - k) * .9
        x = xs.copy()
        if s == SNAG:
            # the knot: one full curl, x doubling back so it is a real loop
            w = .42 * (1 - undo)
            if w > .01 and -L - .5 < xk < L:
                u = np.clip((xs - xk) / (2 * w) + .5, 0, 1)
                inside = (u > 0) & (u < 1)
                th = 2 * math.pi * u
                amp = .3 * (1 - undo)
                x = np.where(inside, xs - amp * np.sin(th) * 1.6, xs)
                y = np.where(inside, y + amp * np.sin(th), y)
                z = np.where(inside, z + amp * (1 - np.cos(th)), z)
                # downstream of a caught knot the strand hangs slack in its lane rather than flowing
        sp = ob.data.splines[0]
        co = np.c_[x, y, z + 1.0, np.ones(NP)].astype(np.float32)
        sp.points.foreach_set('co', co.ravel())
        ob.data.update_tag()
    # tracing light: runs from the right end back to the knot 95..140, then follows the strand out green
    if t < 95:
        XT.default_value, EST.default_value = 10, 0
    elif t < 140:
        XT.default_value = lerp(L, xk, ramp(t, 95, 138))
        EST.default_value = 6 * ramp(t, 95, 105)
    else:
        XT.default_value = lerp(xk, L + 1, ramp(t, 150, 200))
        EST.default_value = 6 * (1 - ramp(t, 195, 210))
    XG.default_value = lerp(xk if t >= 150 else -L - 1, L + 1, ramp(t, 150, 200)) if t >= 150 else -L - 1
    XP.default_value = lerp(-L - 1, L + 1, ramp(t, 206, 238)) if t >= 150 else -L - 1


rig = strands
for ob in strands:
    ob.rotation_euler.z = math.radians(float(A.get('rot', 0)))
cam(sc, (0, 0, 1.0), 24, 34, -66)
go(sc, 'comb', '1,60,120,170', LOOP)
