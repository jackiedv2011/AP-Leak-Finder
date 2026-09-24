"""Find / Build / Recover loops for the black 'how it works' band.
Same materials and light as the hero; floating objects, transparent film, motion blur.

These sit on black, so they bottom out at `dark` rather than carbon — anything
nearer to black stops being an object and becomes a hole in the section. Each
scene runs the full range of stock, white through grey to dark and through
colour, because the chrome around these loops is monochrome and this is where
all of the page's colour has to come from.

What each loop is about, and the colour that event is in:

  find     orange   two records that turn out to be the same record
  build    blue     nothing is filed until the mark goes on it
  recover  green    a promise is an empty outline; money is the thing that fills it

The subject is kept legible by contrast rather than by being the only colour —
the blue mark lands on a plain white record, and the green card drops into a
file that has no other green in it.

Run: blender -b --factory-startup --python solutions.py -- scene=find|build|recover out=DIR
     [res=720 spp=64 frames=1,40,80|all bg=000000 loop=150]"""
import bpy, math, random, os, sys
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looklib as K

A = K.args()
OUT = A['out']
SCENE = A.get('scene', 'find')
LOOP = int(A.get('loop', 150))
TAU = 2 * math.pi
ZAX = Vector((0, 0, 1))
K.reset()
sc = K.setup_render(int(A.get('res', 720)), int(A.get('spp', 64)), LOOP, A)
K.lights(sc, sun_from=tuple(float(x) for x in A.get('sun', '.5,-.55,.7').split(',')),
         strength=float(A.get('sunE', 5.0)), angle=float(A.get('sunA', 2.0)), fill=float(A.get('fill', .12)))
M = K.library()
rnd = random.Random(5)
moving = []

# the tab rides the near edge: at this azimuth the camera reads the -Y and +X
# faces, and a tab on the back would be a detail nobody ever sees. Its width is
# a fraction of the card, so a bigger record does not get a proportionally
# smaller tab.
TAB_W, TAB_D, TAB_T, TAB_IN = .32, .15, .036, .05


def rect(w, d):
    """Hard-cut card outline, CCW. The bevel on the prism is the only softening
    these get — paper has an edge, and a rounded corner would read as vinyl."""
    return [Vector((-w / 2, -d / 2)), Vector((w / 2, -d / 2)), Vector((w / 2, d / 2)), Vector((-w / 2, d / 2))]


def bundle(name, w, d, t, body='ream', top='ruled', tab=None, tab_u=.68):
    """A bundle of ledger sheets: ream on the cut edges, a face on top, and one
    index tab standing off the near edge, offset the way a filed tab is.
    Returns the bundle; the tab rides it."""
    ob, _ = K.prism(name, rect(w, d), t, M, body, top=top, bevel=.012)
    ob.rotation_mode = 'QUATERNION'
    if tab:
        x, tw = -w / 2 + w * tab_u, TAB_W * w
        pts = [Vector((x - tw / 2, -d / 2 + TAB_IN)), Vector((x - tw / 2, -d / 2 - TAB_D)),
               Vector((x + tw / 2, -d / 2 - TAB_D)), Vector((x + tw / 2, -d / 2 + TAB_IN))]
        tb, tc = K.prism(name + '_tab', pts, TAB_T, M, tab, bevel=.006)
        tb.parent = ob
        tb.location = (tc.x, tc.y, 0)
    moving.append(ob)
    return ob


def slot(name, w, d, t, mat):
    """The promised refund: a card-shaped outline with nothing in it. A wireframe
    rather than a translucent solid, because a promise is a drawn boundary — it
    has a shape and no substance."""
    ob, _ = K.prism(name, rect(w, d), t, M, mat, bevel=0)
    wf = ob.modifiers.new('wire', 'WIREFRAME')
    wf.thickness = .028         # heavy enough to still be a line at 317px
    wf.use_even_offset = True
    ob.rotation_mode = 'QUATERNION'
    moving.append(ob)
    return ob


# Reclaim's mark, traced off assets/favicon.svg — the same six kites the nav
# logo uses, with SVG's y-down flipped. It appears once on the site as a solid,
# and this is it: the thing that gets pressed onto an approved record.
HEX_KITES = [
    [(-2.056, 4.6), (-5.751, 11), (5.751, 11), (2.056, 4.6)],
    [(2.956, 4.081), (6.651, 10.481), (12.402, .520), (5.012, .520)],
    [(5.012, -.520), (12.402, -.520), (6.651, -10.481), (2.956, -4.081)],
    [(2.056, -4.6), (5.751, -11), (-5.751, -11), (-2.056, -4.6)],
    [(-2.956, -4.081), (-6.651, -10.481), (-12.402, -.520), (-5.012, -.520)],
    [(-5.012, .520), (-12.402, .520), (-6.651, 10.481), (-2.956, 4.081)],
]
HEX_SPAN = 24.804          # the mark's own width, so `width` below is literal


def seal(name, width, thick, mat):
    """The mark as a solid, on an empty so it moves as one piece."""
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    root.rotation_mode = 'QUATERNION'
    s = width / HEX_SPAN
    for i, kite in enumerate(HEX_KITES):
        pts = [Vector((x * s, y * s)) for x, y in kite]
        if sum((pts[j].x - pts[j - 1].x) * (pts[j].y + pts[j - 1].y) for j in range(len(pts))) > 0:
            pts.reverse()          # prism wants CCW; the traced order alternates
        ob, c = K.prism(f'{name}{i}', pts, thick, M, mat, bevel=.004)
        ob.parent = root
        ob.location = (c.x, c.y, 0)
    moving.append(root)
    return root


def keyall(fr):
    for o in moving:
        o.keyframe_insert('location', frame=fr)
        o.keyframe_insert('rotation_quaternion', frame=fr)


def cycle(t, t_open, t_close, dur):
    """0 -> 1 -> 0 with smootherstep edges; 0 at t=0 and t=1 (loop seam)."""
    return K.sstep((t - t_open) / dur) * (1 - K.sstep((t - t_close) / dur))


# ------------------------------------------------------------------ FIND
# Seven records adrift. Two of them carry the same invoice number, and over the
# loop they cross the pile, find each other and come to rest face to face —
# which is the whole of what a duplicate is. Everything else keeps breathing and
# stays out of it; the only colour in the frame is on the two that match, and it
# doubles when they meet.
if SCENE == 'find':
    W, D, T = 1.34, .98, .17
    # three others, low and close in, so the pair meets in clear air above them.
    # Few and large rather than many and small: at card size a seventh record is
    # not more evidence, it is just less of everything.
    # (x, y, z, yaw, stock, face, tab)
    REST = [(-1.16, .70, -.50, 22, 'ream_dark', 'card_dark', 'blue'),
            (1.12, .74, -.34, -15, 'ream_purple', 'purple', 'card'),
            (.04, -1.16, -.58, 9, 'ream_cream', 'card_cream', 'pink')]
    quiet = []
    for i, (x, y, z, yaw, stock, face, tab) in enumerate(REST):
        ob = bundle(f'q{i}', W, D, T, body=stock, top=face, tab=tab, tab_u=.32 + .16 * i)
        quiet.append((ob, Vector((x, y, z)), math.radians(yaw), rnd.uniform(0, TAU)))
    MEET = Vector((0, -.06, .56))
    pair = []
    # the duplicates are cut from the same stock, so they read as a pair from the
    # first frame — before they have gone anywhere near each other
    for i, (fx, fy, fz, fyaw, dz) in enumerate([(-1.52, .26, .92, 15, .0), (1.56, -.30, .10, -19, T + .028)]):
        ob = bundle(f'm{i}', W, D, T, body='ream_orange', top='orange', tab='card', tab_u=.68)
        pair.append((ob, Vector((fx, fy, fz)), math.radians(fyaw), MEET + Vector((0, 0, dz))))
    for f in range(LOOP + 1):
        t = f / LOOP
        for ob, home, yaw, ph in quiet:
            ob.location = home + Vector((0, 0, .085 * math.sin(TAU * t + ph)))
            ob.rotation_quaternion = Quaternion(ZAX, yaw + math.radians(3.5) * math.sin(TAU * t + ph * .7))
        e = cycle(t, .16, .66, .26)
        for ob, loose, yaw, met in pair:
            ob.location = loose.lerp(met, e)
            ob.rotation_quaternion = Quaternion(ZAX, yaw * (1 - e))
        keyall(f + 1)
    target, el, az, dist = (0, .02, .06), 30, -58, float(A.get('dist', 10.2))

# ------------------------------------------------------------------ BUILD
# Records arrive loose and file themselves into a stack, bottom first. The last
# one does not land. It waits, a little proud of the pile, until the mark comes
# down onto it — and only then do the two of them seat together. That is the
# order of operations the product actually keeps: nothing goes out until it has
# been approved, and the approval is a thing you can see sitting on the record.
elif SCENE == 'build':
    W, D, T, g = 1.16, .86, .14, .034
    HOVER = .30
    # a drawer's worth of stock, and the record waiting for approval left plain
    # on top — a blue mark coming down onto a blue card would be a mark nobody
    # sees land
    STOCK = [('ream_purple', 'purple', 'card'), ('ream_mid', 'card_mid', 'orange'),
             ('ream_cream', 'card_cream', 'pink'), ('ream_dark', 'card_dark', 'card'),
             ('ream_bone', 'card_bone', 'blue')]
    cards, z = [], 0.0
    for k, (stock, face, tab) in enumerate(STOCK):
        ob = bundle(f's{k}', W, D, T, body=stock, top=face, tab=tab, tab_u=.24 + .13 * k)
        home = Vector((0, 0, z + T / 2))
        z += T + g
        loose = home + Vector((rnd.uniform(-.40, .40), rnd.uniform(-.34, .34), .55 + k * .40))
        axis = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized()
        q = Quaternion(ZAX, math.radians(rnd.uniform(-36, 36))) @ Quaternion(axis, math.radians(rnd.uniform(9, 17)))
        cards.append((ob, home, loose, q))
    mark = seal('Seal', .68, .085, 'blue')
    top_ob, top_home, top_loose, top_q = cards[4]
    for f in range(LOOP + 1):
        t = f / LOOP
        for k, (ob, home, loose, q) in enumerate(cards[:4]):
            e = cycle(t, .07 + k * .055, .62 + (3 - k) * .045, .20)
            ob.location = loose.lerp(home, e)
            ob.rotation_quaternion = q.slerp(Quaternion(), e)
        # the top record: in position early, seated late
        a = cycle(t, .10, .70, .20)
        s = cycle(t, .45, .61, .075)
        hover = top_home + Vector((0, 0, HOVER))
        top_ob.location = top_loose.lerp(hover, a).lerp(top_home, s)
        top_ob.rotation_quaternion = top_q.slerp(Quaternion(), a)
        # the mark rides down onto it and stays for as long as the record is filed
        d = cycle(t, .34, .585, .10)
        rest = top_ob.location + Vector((0, 0, T / 2 + .085 / 2 + .004))
        mark.location = rest + Vector((0, 0, 1.55 * (1 - d)))
        mark.rotation_quaternion = Quaternion(ZAX, math.radians(26) * (1 - d))
        keyall(f + 1)
    target, el, az, dist = (0, 0, .40), 32, -58, float(A.get('dist', 8.3))

# ------------------------------------------------------------------ RECOVER
# The file fans open and one place in it is empty — an outline with nothing in
# it, which is what a promised refund is. The card that fills it comes in from
# outside the pile and drops into that exact gap; the file closes around it and
# the outline is left as a frame around something real. The green arrives with
# the card, not with the promise.
elif SCENE == 'recover':
    W, D, T, g = 1.06, .78, .15, .026
    GAP = 3                         # which level in the file is still owed
    pin = Vector((-W / 2 + .08, 0, 0))
    levels = [Vector((0, 0, k * (T + g) + T / 2)) for k in range(6)]
    STOCK = {0: ('ream_orange', 'orange', 'card'), 1: ('ream_bone', 'card_bone', 'blue'),
             2: ('ream_mid', 'card_mid', 'pink'), 4: ('ream_dark', 'card_dark', 'card'),
             5: ('ream_cream', 'card_cream', 'purple')}
    solid = []
    for k, (stock, face, tab) in STOCK.items():
        ob = bundle(f'd{k}', W, D, T, body=stock, top=face, tab=tab, tab_u=.22 + .12 * k)
        solid.append((ob, k))
    # the outline is drawn in the same green the money arrives in: it is the
    # shape of what is owed, in the colour of what is owed, with nothing in it
    owed = slot('Owed', W, D, T, 'green')
    paid = bundle('Paid', W, D, T, body='ream_green', top='green', tab='card', tab_u=.68)
    away = Vector((1.35, -.95, 1.45))       # comes down into the gap, not in from off-stage

    def fanned(k, e, fan):
        """Where level k sits once the file has opened by e."""
        q = Quaternion(ZAX, fan * k * e)
        rel = levels[k] - Vector((pin.x, pin.y, 0))
        p = q @ Vector((rel.x, rel.y, 0))
        return Vector((pin.x + p.x, pin.y + p.y, levels[k].z + .085 * k * e)), q

    for f in range(LOOP + 1):
        t = f / LOOP
        e = cycle(t, .12, .64, .26)
        fan = math.radians(float(A.get('fan', 14)))
        for ob, k in solid:
            ob.location, ob.rotation_quaternion = fanned(k, e, fan)
        gp, gq = fanned(GAP, e, fan)
        owed.location, owed.rotation_quaternion = gp, gq
        # arrives while the file is still open, and is in place before it closes
        arr = cycle(t, .30, .72, .15)
        paid.location = away.lerp(gp, arr)
        paid.rotation_quaternion = Quaternion(ZAX, math.radians(-34)).slerp(gq, arr)
        keyall(f + 1)
    target, el, az, dist = (.22, .16, .62), 34, -58, float(A.get('dist', 9.4))

K.camera(sc, target, dist, float(A.get('el', el)), float(A.get('az', az)), lens=float(A.get('lens', 100)))
K.render(sc, OUT, SCENE, A.get('frames', '1,40,80'), A.get('bg'))
