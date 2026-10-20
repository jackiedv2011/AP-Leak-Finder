"""piecekit: flat SVG stand-ins for the landing's section pieces (plan 003, mockups only).

Python 3, standard library only. It reproduces the Blender set in landing-site/blender/exhibit_common.py:
the 100 mm camera on a sphere round a target, one sun from (.5, -.55, .7) (front right, 43 deg up), a floor
shadow 1.06x the height falling back left, and the render audit's three tones per hue. Solids are convex
prisms (boxes, slabs, discs, cylinders, any convex footprint) with a one-segment chamfer, spheres, and
hollow ones (cups, dishes, trays with wells). Faces are culled and painted back to front.

    import sys; sys.path.insert(0, 'docs/mockups/003-pieces/kit')
    from piecekit import Scene
    sc = Scene('sky', el=30)
    sc.box(0, 0, 0, w=1.6, d=1.0, h=.5, mat='sec', wells=[(-.4, 0, .5, .6, .3), (.4, 0, .5, .6, .3)])
    sc.box(.4, 0, .2, w=.46, d=.56, h=.45, inside=0)          # a block standing in the right well
    sc.frame(width=.45)                                          # 45 % of the tile wide, sitting a little low
    sc.save('docs/mockups/003-pieces/pieces/connect.svg')
    print(sc.report())

Units are Blender metres (the stills' coins are r .82, the cubes .82 wide). x right, y back (away from the
camera), z up. The floor is z = 0. See ../KIT.md for the rules this encodes.
"""
import math

W, H = 2560, 1440
_s = (.5, -.55, .7)
_n = math.sqrt(sum(c * c for c in _s))
SUN = tuple(c / _n for c in _s)                      # towards the sun
SH = (-SUN[0] / SUN[2], -SUN[1] / SUN[2])            # floor offset of a shadow per unit of height: (-.714, +.786)
_hn = math.hypot(SUN[0], SUN[1])
SUN_H = (SUN[0] / _hn, SUN[1] / _hn)                 # the sun's direction on the floor

# The render audit (floor, lit, mid, shade) plus tones sampled from the four stills with PIL:
#   shadow  the floor shadow (floor x ~.72), measured in each still
#   bev     a top chamfer facing away from the sun (sky still: #2aa4c6 ~ mid 40 % to shade)
#   deep    a crevice: the gap between stacked coins, a slot's edge (echo: #00a222)
#   sec_*   the near-white second material: lit = walls facing the sun, mid = tops, shade = walls away
#           (lilac measured on the piece tray: front #f0eefc, top #e8e3f3, left end #cdcad9)
HUES = {
    'mint': dict(floor='#c4e9d3', lit='#63fa8e', mid='#28ee75', shade='#22cb57', bev='#25d466', deep='#00a224',
                 shadow='#8ba495', sec_lit='#eefbf3', sec_mid='#e5f2ea', sec_shade='#c9d8cf', sec_deep='#a9bdb1', sec_cast='#b7c6bd',
                 ink='#0c3a23'),
    'apricot': dict(floor='#f6cfb2', lit='#fb7b60', mid='#f66d4b', shade='#a92509', bev='#d2502f', deep='#6e1200',
                    shadow='#b1957f', sec_lit='#fbf1e9', sec_mid='#f3e7de', sec_shade='#dccbbf', sec_deep='#c2ab9b', sec_cast='#d2bfb2',
                    ink='#4a1d0c'),
    'lilac': dict(floor='#d8d0f3', lit='#795ef8', mid='#7153f1', shade='#3e23b8', bev='#5a3dd8', deep='#2a148c',
                  shadow='#9e9ab2', sec_lit='#f0eefc', sec_mid='#e8e3f3', sec_shade='#cdcad9', sec_deep='#aaa4bf', sec_cast='#bdb7cf',
                  ink='#241858'),
    'sky': dict(floor='#c2dff2', lit='#53cbf9', mid='#2bc8f3', shade='#016693', bev='#2aa4c6', deep='#00557f',
                shadow='#8ea3b0', sec_lit='#ecf6fd', sec_mid='#e2edf4', sec_shade='#c6d4de', sec_deep='#a6b7c3', sec_cast='#b4c3ce',
                ink='#0b2e48'),
}


# ---------------------------------------------------------------- vectors
def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, k): return tuple(x * k for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))
def unit(a):
    n = length(a)
    return mul(a, 1 / n) if n > 1e-12 else (0.0, 0.0, 0.0)


def newell(poly):
    n = [0.0, 0.0, 0.0]
    for i, p in enumerate(poly):
        q = poly[(i + 1) % len(poly)]
        n[0] += (p[1] - q[1]) * (p[2] + q[2])
        n[1] += (p[2] - q[2]) * (p[0] + q[0])
        n[2] += (p[0] - q[0]) * (p[1] + q[1])
    return tuple(n)


def hull(pts):
    """Convex hull of 2D points (Andrew's monotone chain), CCW."""
    p = sorted(set((round(x, 6), round(y, 6)) for x, y in pts))
    if len(p) < 3:
        return p
    def turn(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in p:
        while len(lo) >= 2 and turn(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) >= 2 and turn(up[-2], up[-1], q) <= 0:
            up.pop()
        up.append(q)
    return lo[:-1] + up[:-1]


def inside2d(p, poly):
    """Is 2D point p inside the CCW convex polygon poly?"""
    n = len(poly)
    return n > 2 and all((poly[(i + 1) % n][0] - poly[i][0]) * (p[1] - poly[i][1]) -
                         (poly[(i + 1) % n][1] - poly[i][1]) * (p[0] - poly[i][0]) >= 0 for i in range(n))


def hexmix(a, b, t):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(x + (y - x) * t) for x, y in zip(ca, cb))


# ---------------------------------------------------------------- camera
class Camera:
    """Blender's camera: on a sphere round `target`, `el` degrees above the floor, `az` round from the front
    (-y), `dist` away, a `lens` mm lens on a 36 mm sensor fitted to the width. -Z looks at the target, Y is up."""

    def __init__(self, target=(0, 0, 0), el=30.0, dist=14.0, az=0.0, lens=100.0, sensor=36.0, w=W, h=H):
        self.target, self.el, self.dist, self.az = tuple(target), el, dist, az
        self.w, self.h, self.k = w, h, lens / sensor * w
        e, a = math.radians(el), math.radians(az)
        self.loc = add(self.target, mul((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)), dist))
        self.fwd = unit(sub(self.target, self.loc))
        r = cross(self.fwd, (0, 0, 1))
        self.right = unit(r) if length(r) > 1e-9 else (1.0, 0.0, 0.0)
        self.up = cross(self.right, self.fwd)

    def depth(self, p):
        return dot(sub(p, self.loc), self.fwd)

    def project(self, p):
        v = sub(p, self.loc)
        z = dot(v, self.fwd)
        return (self.w / 2 + self.k * dot(v, self.right) / z, self.h / 2 - self.k * dot(v, self.up) / z)

    def scale(self, p):
        """Pixels per metre at p's depth."""
        return self.k / self.depth(p)

    def sees(self, poly, normal):
        c = mul(tuple(map(sum, zip(*poly))), 1 / len(poly))
        return dot(normal, sub(c, self.loc)) < 0


# ---------------------------------------------------------------- footprints (fn(inset) -> CCW 2D points)
def rrect(w, d, r=0.0, n=5):
    def f(i):
        hw, hd, rr = w / 2 - i, d / 2 - i, max(0.0, min(r - i, w / 2 - i, d / 2 - i))
        pts = []
        for cx, cy, a0 in ((hw - rr, hd - rr, 0), (-hw + rr, hd - rr, 90), (-hw + rr, -hd + rr, 180), (hw - rr, -hd + rr, 270)):
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n)
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        return pts
    return f


def circle(r, n=96):
    return lambda i: [((r - i) * math.cos(2 * math.pi * k / n), (r - i) * math.sin(2 * math.pi * k / n)) for k in range(n)]


def convex(pts, n_round=0):
    """Any convex CCW polygon; insets by offsetting its edges."""
    def f(i):
        if i <= 0:
            return list(pts)
        m = len(pts)
        lines = []
        for k in range(m):
            p, q = pts[k], pts[(k + 1) % m]
            dx, dy = q[0] - p[0], q[1] - p[1]
            L = math.hypot(dx, dy)
            nx, ny = -dy / L, dx / L                      # inward normal of a CCW polygon
            lines.append(((p[0] + nx * i, p[1] + ny * i), (dx, dy)))
        out = []
        for k in range(m):
            (p1, d1), (p2, d2) = lines[k - 1], lines[k]
            den = d1[0] * d2[1] - d1[1] * d2[0]
            if abs(den) < 1e-12:
                out.append(p2)
                continue
            t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
            out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
        return out
    return f


# ---------------------------------------------------------------- solids
def _rot(yaw, tx, ty):
    """World matrix: tilt round x, then round y, then yaw round z (degrees)."""
    def rx(a): c, s = math.cos(a), math.sin(a); return ((1, 0, 0), (0, c, -s), (0, s, c))
    def ry(a): c, s = math.cos(a), math.sin(a); return ((c, 0, s), (0, 1, 0), (-s, 0, c))
    def rz(a): c, s = math.cos(a), math.sin(a); return ((c, -s, 0), (s, c, 0), (0, 0, 1))
    def mm(A, B): return tuple(tuple(sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)) for i in range(3))
    return mm(rz(math.radians(yaw)), mm(ry(math.radians(ty)), rx(math.radians(tx))))


def _apply(M, p): return tuple(sum(M[i][k] * p[k] for k in range(3)) for i in range(3))


class Solid:
    def __init__(self, scene, kind, mat, origin, M, **kw):
        self.sc, self.kind, self.mat, self.origin, self.M = scene, kind, mat, origin, M
        self.upright = abs(M[2][2] - 1) < 1e-9
        self.__dict__.update(kw)
        self.idx = len(scene.solids)

    def w(self, p):
        return add(self.origin, _apply(self.M, p))

    def verts(self):
        if self.kind == 'sphere':
            u = unit(cross(SUN, (0, 0, 1)))
            v = cross(SUN, u)
            out = [add(self.c, add(mul(u, self.r * math.cos(t)), mul(v, self.r * math.sin(t))))
                   for t in [2 * math.pi * k / 48 for k in range(48)]]
            return out + [add(self.c, (0, 0, self.r)), add(self.c, (0, 0, -self.r))]
        return [p for L in self.layers for p in L]

    def centroid(self):
        if self.kind == 'sphere':
            return self.c
        vs = self.verts()
        return mul(tuple(map(sum, zip(*vs))), 1 / len(vs))

    def zmin(self):
        return min(p[2] for p in self.verts())


class Scene:
    """One tile: a hue, a camera and solids. el = camera elevation in degrees (the stills use 26-36; 89.5 is
    the shadow still's top-down end pose)."""

    def __init__(self, hue, el=30.0, dist=14.0, target=(0, 0, .5), az=0.0, w=W, h=H, soft=.021, glow=.5):
        self.hue, self.P = hue, dict(HUES[hue])
        self.el, self.dist, self.target, self.az, self.wpx, self.hpx = el, dist, target, az, w, h
        # soft: floor-shadow blur (stdDeviation) per pixel of the caster's height (contact hardening: a low
        # thing's shadow is crisp, a tall thing's soft). glow: the light the object throws back into its own
        # shadow near its foot (the stills' shadows are lighter close to the object); 0 turns it off.
        self.solids, self.soft, self.glow, self.extra = [], soft, glow, []
        self._cam()

    def _cam(self):
        self.cam = Camera(self.target, self.el, self.dist, self.az, w=self.wpx, h=self.hpx)

    # ------------------------------------------------ primitives
    def prism(self, x, y, z, foot, h, bevel=.02, mat='hue', yaw=0.0, tilt=(0.0, 0.0), smooth=False,
              wells=(), hole=None, inside=None, bias=0.0, cast=True, name=None):
        """A convex footprint `foot` (fn(inset) -> CCW points) extruded h up from z, chamfered by `bevel`.
        wells: [(x, y, w, d, depth[, r])] rectangular holes in the top (local coordinates).
        hole: (r_in, floor_z_local) for a round hole (cups, dishes, a coin's raised ring).
        inside: a solid (or its index) this sits in: drawn after it and clipped to the opening's column."""
        M = _rot(yaw, *tilt)
        b = max(0.0, min(bevel, h / 2 - 1e-4))
        L = [[(px, py, 0.0) for px, py in foot(b)], [(px, py, b) for px, py in foot(0)],
             [(px, py, h - b) for px, py in foot(0)], [(px, py, h) for px, py in foot(b)]] if b > 0 else \
            [[(px, py, 0.0) for px, py in foot(0)], [(px, py, h) for px, py in foot(0)]]
        s = Solid(self, 'prism', mat, (x, y, z), M, foot=foot, h=h, b=b, smooth=smooth, wells=list(wells),
                  hole=hole, inside=inside, bias=bias, cast=cast, name=name)
        s.layers = [[s.w(p) for p in Lk] for Lk in L]
        self.solids.append(s)
        return s

    def box(self, x, y, z, w, d, h, bevel=.02, r=None, mat='hue', **kw):
        """A box w wide (x), d deep (y), h tall, its bottom centre at (x, y, z). Vertical edges rounded by r
        (default = bevel), all top and bottom edges chamfered by bevel."""
        return self.prism(x, y, z, rrect(w, d, bevel if r is None else r), h, bevel, mat, **kw)

    def cylinder(self, x, y, z, r, h, bevel=.01, mat='hue', n=96, **kw):
        """A disc / coin / cylinder of radius r and height h standing on z. Smooth walls."""
        kw.setdefault('smooth', True)
        return self.prism(x, y, z, circle(r, n), h, bevel, mat, **kw)

    def cup(self, x, y, z, r, h, wall=.06, floor=.05, bevel=.02, mat='sec', **kw):
        """A hollow cylinder: a bowl, cup or dish (floor = thickness of its bottom)."""
        kw.setdefault('smooth', True)
        return self.prism(x, y, z, circle(r), h, bevel, mat, hole=(r - wall, floor), **kw)

    def sphere(self, x, y, z, r, mat='hue', inside=None, bias=0.0, cast=True):
        """A ball whose centre is at (x, y, z) (so z = r sits on the floor)."""
        s = Solid(self, 'sphere', mat, (x, y, z), _rot(0, 0, 0), c=(x, y, z), r=r, inside=inside, bias=bias,
                  cast=cast, wells=[], hole=None, layers=[], name=None)
        self.solids.append(s)
        return s

    # ------------------------------------------------ framing
    def bounds(self, shadows=False):
        pts = [self.cam.project(p) for s in self.solids for p in s.verts()]
        if shadows:
            for s in self.solids:
                if s.cast:
                    pts += [self.cam.project((px, py, 0.0)) for px, py in self._shadow2d(s, 0.0)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def frame(self, width=.45, cy=.58, cx=.5):
        """Set dist and target so the objects span `width` of the tile, centred at cx, their middle at cy of the
        height (the stills: width .33-.58, cy .55-.62: low, air above)."""
        vs = [p for s in self.solids for p in s.verts()]
        c = tuple((min(p[i] for p in vs) + max(p[i] for p in vs)) / 2 for i in range(3))
        self.target = c
        for _ in range(8):
            self._cam()
            x0, y0, x1, y1 = self.bounds()
            self.dist *= (x1 - x0) / (width * self.wpx)
            self._cam()
            x0, y0, x1, y1 = self.bounds()
            s = self.cam.scale(self.target)
            dx = ((x0 + x1) / 2 - cx * self.wpx) / s
            dy = ((y0 + y1) / 2 - cy * self.hpx) / s
            self.target = sub(add(self.target, mul(self.cam.right, dx)), mul(self.cam.up, dy))
        self._cam()
        return self

    def report(self):
        x0, y0, x1, y1 = self.bounds()
        a0, b0, a1, b1 = self.bounds(shadows=True)
        ok = a0 >= 0 and b0 >= 0 and a1 <= self.wpx and b1 <= self.hpx
        return ('objects x %.0f-%.0f (%.0f%% wide, centre %.0f%%), y %.0f-%.0f (middle at %.0f%%, bottom at %.0f%%); '
                'with shadow x %.0f-%.0f y %.0f-%.0f: %s; camera el %.1f dist %.2f target (%.2f, %.2f, %.2f)' % (
                    x0, x1, 100 * (x1 - x0) / self.wpx, 100 * (x0 + x1) / 2 / self.wpx, y0, y1,
                    100 * (y0 + y1) / 2 / self.hpx, 100 * y1 / self.hpx, a0, a1, b0, b1,
                    'inside the frame' if ok else 'OUTSIDE THE FRAME', self.el, self.dist, *self.target))

    # ------------------------------------------------ shading
    def tone(self, n, smooth, mat, c=None, gap=False):
        """A face's tone from its normal. Tops: mid. Walls facing the sun's side (front, right): lit; walls
        facing away (left, back): shade (smooth walls stay lit round the front, as the coins do). Chamfers:
        lit towards the sun, bev away. Undersides: shade."""
        n = unit(n)
        h = math.hypot(n[0], n[1])
        facing = (n[0] * SUN_H[0] + n[1] * SUN_H[1]) / h if h > 1e-9 else 0.0
        grazing = abs(dot(n, self.cam.fwd)) < .2 if c is None else abs(dot(n, unit(sub(c, self.cam.loc)))) < .2
        if n[2] > .85:
            t = 'mid'
        elif n[2] < -.3:                    # undersides catch the floor's bounce (the bottom coin's edge is light),
            t = 'deep' if gap else 'mid'    # unless they face a crevice (a coin above another)
        elif n[2] > .3:
            t = 'lit' if facing > -.15 else 'bev'
        elif smooth or grazing:             # round walls, and walls seen edge-on, read light (the stills' sheen)
            t = 'lit' if (facing > -.8 or grazing) else 'shade'
        else:
            t = 'lit' if facing > -.05 else 'shade'
        return self.col(t, mat)

    def col(self, t, mat):
        if mat == 'sec':
            return self.P[{'lit': 'sec_lit', 'mid': 'sec_mid', 'shade': 'sec_shade', 'bev': 'sec_shade',
                           'deep': 'sec_deep', 'cast': 'sec_cast'}[t]]
        return self.P['shade' if t == 'cast' else t]

    # ------------------------------------------------ shadows
    def _shadow2d(self, s, zt):
        """Hull of solid s's shadow on the plane z = zt (2D points)."""
        return hull([(p[0] + (p[2] - zt) * SH[0], p[1] + (p[2] - zt) * SH[1]) for p in s.verts() if p[2] >= zt - 1e-6])

    def _poly(self, pts3):
        return ' '.join('%.1f,%.1f' % self.cam.project(p) for p in pts3)

    def _path(self, pts3):
        return 'M' + ' L'.join('%.1f %.1f' % self.cam.project(p) for p in pts3) + 'Z'

    # ------------------------------------------------ output
    def svg(self, title=None):
        P, cam = self.P, self.cam
        out, defs = [], []
        self._id = 0
        for s_ in self.solids:
            s_.__dict__.pop('openings', None)

        def nid(p):
            self._id += 1
            return '%s%d' % (p, self._id)

        def blur(px):
            fid = 'b%d' % round(px * 2)
            if fid not in self._filters:
                self._filters.add(fid)
                defs.append('<filter id="%s" filterUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d">'
                            '<feGaussianBlur stdDeviation="%.1f"/></filter>' % (fid, self.wpx, self.hpx, round(px * 2) / 2))
            return fid
        self._filters = set()
        self._blur = blur
        out.append('<rect width="%d" height="%d" fill="%s"/>' % (self.wpx, self.hpx, P['floor']))
        # floor shadow: one hull per solid, all in one opaque colour (overlaps never darken twice), each blurred
        # by its own height: soft x (pixels per metre) x (its top's height), 2-16 px
        groups = {}
        for s in self.solids:
            if not s.cast:
                continue
            top = max(p[2] for p in s.verts())
            fid = blur(max(2.0, min(16.0, self.soft * cam.scale(s.centroid()) * top)))
            groups.setdefault(fid, []).append(self._path([(x, y, 0.0) for x, y in self._shadow2d(s, 0.0)]))
        # drawn as a mask over one shadow-coloured rect, so the glow lifts the shadow and never touches the floor
        mask = ['<path filter="url(#%s)" fill="#fff" d="%s"/>' % (fid, ' '.join(paths)) for fid, paths in sorted(groups.items())]
        if self.glow and self.solids:
            x0, y0, x1, y1 = self.bounds()
            foot = [self._path([(x, y, 0.0) for x, y in hull([(p[0], p[1]) for p in s.verts()])])
                    for s in self.solids if s.cast]
            mask.append('<path filter="url(#%s)" fill="#000" opacity="%.2f" d="%s"/>' % (
                blur(.12 * (x1 - x0)), self.glow, ' '.join(foot)))
        defs.append('<mask id="shd" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d">%s</mask>' % (
            self.wpx, self.hpx, ''.join(mask)))
        out.append('<rect width="%d" height="%d" fill="%s" mask="url(#shd)"/>' % (self.wpx, self.hpx, P['shadow']))
        # which solids sit a hair above another (their undersides face a crevice, not the floor)
        for s in self.solids:
            s.gap_below = []
            if s.kind == 'sphere':
                continue
            z0 = s.zmin()
            bx = [p[0] for p in s.verts()]; by = [p[1] for p in s.verts()]
            for o in self.solids:
                if o is s or o.kind == 'sphere':
                    continue
                zt = max(p[2] for p in o.verts())
                if z0 - .03 <= zt <= z0 + .006:
                    ox = [p[0] for p in o.verts()]; oy = [p[1] for p in o.verts()]
                    if max(ox) > min(bx) and min(ox) < max(bx) and max(oy) > min(by) and min(oy) < max(by):
                        s.gap_below.append(hull([(p[0], p[1]) for p in o.verts()]))
        # painter's order: back to front by depth; contents straight after their container
        def key(s): return -cam.depth(s.centroid()) + s.bias
        roots = [s for s in self.solids if s.inside is None]
        kids = {}
        for s in self.solids:
            if s.inside is not None:
                c = s.inside if isinstance(s.inside, Solid) else self.solids[s.inside]
                kids.setdefault(c.idx, []).append(s)
        order = []

        def emit(s):
            order.append(s)
            for k in sorted(kids.get(s.idx, []), key=key):
                emit(k)
        for s in sorted(roots, key=key):
            emit(s)
        for s in order:
            g = []
            self._draw(s, g, defs, nid)
            if s.inside is not None:
                c = s.inside if isinstance(s.inside, Solid) else self.solids[s.inside]
                cid = nid('in')
                defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (cid, self._column(c)))
                out.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(g)))
            else:
                out.append(''.join(g))
        out += self.extra
        head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (
            self.wpx, self.hpx, self.wpx, self.hpx)
        t = '<title>%s</title>' % title if title else ''
        return head + t + '<defs>' + ''.join(defs) + '</defs>' + ''.join(out) + '</svg>\n'

    def _face(self, g, pts3, fill):
        g.append('<path d="%s" fill="%s" stroke="%s" stroke-width="1.2" stroke-linejoin="round"/>' % (
            self._path(pts3), fill, fill))

    def _draw(self, s, g, defs, nid):
        P, cam = self.P, self.cam
        if s.kind == 'sphere':
            C = cam.project(s.c)
            R = s.r * cam.scale(s.c)
            cid = nid('sp')
            defs.append('<clipPath id="%s"><circle cx="%.1f" cy="%.1f" r="%.1f"/></clipPath>' % (cid, C[0], C[1], R))
            lx, ly = .62, -.78                                  # the sun on screen: right and up
            g.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (C[0], C[1], R, self.col('bev', s.mat)))
            g.append('<g clip-path="url(#%s)"><circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                     '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/></g>' % (
                         cid, C[0] + lx * .2 * R, C[1] + ly * .2 * R, R * 1.02, self.col('mid', s.mat),
                         C[0] + lx * .34 * R, C[1] + ly * .34 * R, R * .56, self.col('lit', s.mat)))
            return
        L = s.layers
        rings = list(zip(L[:-1], L[1:]))
        for A, B in rings:
            n = len(A)
            info = []
            for i in range(n):
                j = (i + 1) % n
                q = [A[i], A[j], B[j], B[i]]
                nn = newell(q)
                if length(nn) < 1e-10:
                    info.append(None)
                    continue
                cq = mul(add(add(q[0], q[1]), add(q[2], q[3])), .25)
                info.append(self.tone(nn, s.smooth, s.mat, cq, any(inside2d(cq, hh) for hh in s.gap_below))
                            if cam.sees(q, nn) else None)
            # merge runs of the same tone
            if all(t == info[0] for t in info):
                runs = [(0, n - 1, info[0])] if info[0] else []
                if info[0]:
                    pts = [A[k] for k in range(n)] + [A[0]] + [B[0]] + [B[k] for k in range(n - 1, -1, -1)]
                    self._face(g, pts, info[0])
                continue
            start = next(k for k in range(n) if info[k] != info[k - 1])
            k = 0
            while k < n:
                i0 = (start + k) % n
                t = info[i0]
                m = 1
                while m < n - k and info[(i0 + m) % n] == t:
                    m += 1
                if t:
                    idx = [(i0 + q) % n for q in range(m + 1)]
                    self._face(g, [A[q] for q in idx] + [B[q] for q in reversed(idx)], t)
                k += m
        top, bot = L[-1], L[0]
        if cam.sees(list(reversed(bot)), newell(list(reversed(bot)))):
            self._face(g, list(reversed(bot)), self.col('deep' if s.gap_below else 'mid', s.mat))
        if not cam.sees(top, newell(top)):
            return
        if s.hole:
            r_in, fz = s.hole
            ring_in = [s.w((r_in * math.cos(2 * math.pi * k / 96), r_in * math.sin(2 * math.pi * k / 96), s.h)) for k in range(96)]
            g.append('<path d="%s %s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="1.2"/>' % (
                self._path(top), self._path(ring_in), self.col('mid', s.mat), self.col('mid', s.mat)))
            self._opening(s, g, defs, nid, [(r_in * math.cos(2 * math.pi * k / 96), r_in * math.sin(2 * math.pi * k / 96)) for k in range(96)], fz)
        else:
            self._face(g, top, self.col('mid', s.mat))
        for wl in s.wells:
            wx, wy, ww, wd, wdep = wl[:5]
            wr = wl[5] if len(wl) > 5 else .02
            self._opening(s, g, defs, nid, [(wx + px, wy + py) for px, py in rrect(ww, wd, wr)(0)], s.h - wdep)
        # shadows of what stands above, on this top
        if s.upright:
            self._receive(s, g, defs, nid, s.origin[2] + s.h, [top])

    def _caster2d(self, o, zt):
        """Shadow of o on the plane z = zt: the part above the plane thrown along the sun, the part below
        taken straight up (its cross-section, exact for upright prisms)."""
        pts = [(p[0] + (p[2] - zt) * SH[0], p[1] + (p[2] - zt) * SH[1]) if p[2] >= zt else (p[0], p[1]) for p in o.verts()]
        return hull(pts)

    def _receive(self, s, g, defs, nid, zt, clips, exclude=()):
        """Shadows of everything that rises above the plane z = zt, painted on s, clipped to the nested
        screen polygons `clips` (lists of 3D points). Resting things leave a crevice (deep) when they are thin
        or cover the surface (a coin on a coin, a raised ring); anything else casts shade."""
        cl = clips[0]
        fx = [p[0] for p in cl]; fy = [p[1] for p in cl]
        area = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(cl, cl[1:] + cl[:1]))) / 2
        polys = {}
        for o in self.solids:
            if o is s or o in exclude or not o.cast:
                continue
            zs = [p[2] for p in o.verts()]
            if max(zs) <= zt + .003:
                continue
            sh = self._caster2d(o, zt)
            if len(sh) < 3 or max(p[0] for p in sh) < min(fx) or min(p[0] for p in sh) > max(fx) or \
                    max(p[1] for p in sh) < min(fy) or min(p[1] for p in sh) > max(fy):
                continue
            rest = -.006 <= min(zs) - zt < .02
            foot = hull([(p[0], p[1]) for p in o.verts()])
            fa = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(foot, foot[1:] + foot[:1]))) / 2
            tone = 'deep' if rest and (max(zs) - min(zs) < .03 or fa > .8 * area) else 'cast'
            polys.setdefault(tone, []).append(self._path([(x, y, zt) for x, y in sh]))
        if not polys:
            return
        body = ''.join('<path filter="url(#%s)" fill="%s" d="%s"/>' % (
            self._blur(.5 if t == 'deep' else 1.2), self.col(t, s.mat), ' '.join(ps)) for t, ps in sorted(polys.items(), reverse=True))
        for c in reversed(clips):
            cid = nid('rc')
            defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (cid, self._path(c)))
            body = '<g clip-path="url(#%s)">%s</g>' % (cid, body)
        g.append(body)

    def _opening(self, s, g, defs, nid, pts2, fz):
        """A hole in s's top: inner walls (lit where the sun reaches past the rim, shade below), the floor
        (mid) with the rim's shadow, and the shadows of whatever stands in it."""
        top = [s.w((x, y, s.h)) for x, y in pts2]
        flo = [s.w((x, y, fz)) for x, y in pts2]
        dz = s.h - fz
        lit = [s.w((x + dz * SH[0], y + dz * SH[1], fz)) for x, y in pts2]   # the floor the sun reaches
        oid, fid = nid('op'), nid('fl')
        defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (oid, self._path(top)))
        defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (fid, self._path(flo)))
        walls = []
        if s.upright:
            # inner walls: a point d below the rim is lit while its ray to the sun, p + d(.714, -.786), stays
            # inside the opening; so each wall is lit to a depth and in shade below it
            o2 = [(p[0], p[1]) for p in top]
            u = (-SH[0], -SH[1])
            n = len(o2)
            for i in range(n):
                a, b = o2[i], o2[(i + 1) % n]
                inward = (-(b[1] - a[1]), b[0] - a[0])            # CCW polygon: left of the edge is inside
                mid3 = (((a[0] + b[0]) / 2), ((a[1] + b[1]) / 2), s.origin[2] + s.h - dz / 2)
                if dot((inward[0], inward[1], 0), sub(mid3, self.cam.loc)) >= 0:
                    continue                                      # this inner wall faces away from the camera
                k = 1 if n > 24 else 6
                samp = [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for j in range(k + 1)]
                edge = []
                for q in samp:
                    t_exit = 1e9
                    for m in range(n):
                        e0, e1 = o2[m], o2[(m + 1) % n]
                        ex, ey = e1[0] - e0[0], e1[1] - e0[1]
                        den = u[0] * ey - u[1] * ex
                        if abs(den) < 1e-12:
                            continue
                        t = ((e0[0] - q[0]) * ey - (e0[1] - q[1]) * ex) / den
                        w_ = ((e0[0] - q[0]) * u[1] - (e0[1] - q[1]) * u[0]) / den
                        if t > 1e-6 and -1e-6 <= w_ <= 1 + 1e-6 and (u[0] * (-ey) + u[1] * ex) < 0 and t < t_exit:
                            t_exit = t
                    inside_dir = (u[0] * inward[0] + u[1] * inward[1]) > 0
                    d = min(dz, t_exit) if inside_dir else 0.0
                    edge.append((q, d))
                zt = s.origin[2] + s.h
                walls.append([(q[0], q[1], zt - d) for q, d in edge] + [(q[0], q[1], zt - dz) for q, d in reversed(edge)])
        dark = self.col('deep' if dz < .03 else 'shade', s.mat)      # a shallow lip leaves a crevice line
        g.append('<path d="%s" fill="%s"/>' % (self._path(top), self.col('lit', s.mat)))
        inner = ''.join('<path d="%s" fill="%s" stroke="%s" stroke-width="1"/>' % (self._path(w), dark, dark) for w in walls)
        g.append('<g clip-path="url(#%s)">%s<path d="%s" fill="%s"/><g clip-path="url(#%s)"><path d="%s" fill="%s"/></g></g>' % (
            oid, inner, self._path(flo), dark, fid, self._path(lit), self.col('mid', s.mat)))
        if s.upright:
            self._receive(s, g, defs, nid, s.origin[2] + fz, [top, flo])
        s.__dict__.setdefault('openings', []).append(top)

    def _column(self, c):
        """The opening(s) of container c and everything straight above them on screen (contents show above
        the rim, hide below it)."""
        ps = []
        for top in getattr(c, 'openings', []) or [c.layers[-1]]:
            pts = [self.cam.project(p) for p in top]
            hh = hull(pts + [(x, -4000) for x, y in pts])
            ps.append('M' + ' L'.join('%.1f %.1f' % p for p in hh) + 'Z')
        return ' '.join(ps)

    def save(self, path, title=None):
        with open(path, 'w') as fh:
            fh.write(self.svg(title))
        return path
