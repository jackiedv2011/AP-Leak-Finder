"""Recover (How It Works step 4, "Followed through to the money"): green coins settled in a shallow near-white
dish, one more coin just landing on top. Mint (green = duplicate payment; the coins are the echo exhibit's).

Run from the repo root:  python3 docs/mockups/003-pieces/kit/build_recover.py   ->  pieces/recover.svg"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piecekit import Scene, _rot, _apply, add, hull, inside2d

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pieces', 'recover.svg')

# the echo coin, a little smaller so the dish shows round it: .078 thick, .012 apart, raised ring at .72 r
RC, HC, GAP, RING_W, RING_H = .64, .078, .012, .03, .012
DISH_R, DISH_H, DISH_WALL, DISH_FLOOR = 1.06, .2, .07, .05
NC = 3                                       # settled in the dish
LAND_GAP = .42                               # the falling coin's height above the stack
LAND_OFF = (.14, -.05)                       # and its offset (it isn't centred yet)
LAND_TILT = (5, -8)                          # front dipping a little, left edge lower: falling in
EL = 30


class RecoverScene(Scene):
    """Two local fixes on top of piecekit, which throws shadows onto tops only:
    - the raised ring on the settled stack's top coin would keep its lit walls inside the falling coin's
      shadow, so after that ring is drawn the falling coin's shadow on the coin face is painted over the ring
      too (shade, blur 1.2), masked to the ring;
    - a cup's rim receives shadows clipped to its whole top disc, which paints the rim-height shadow across
      the dish's inside as well; here it is clipped to the rim ring (outer circle minus the opening);
    - the coins' shadows on the dish floor stop at its inner wall, so they are carried up that wall: the wall
      is sampled (every .5 deg, 24 rows), each point tested against every coin's shadow on its own height (the
      same construction piecekit uses for tops), and the shaded runs painted sec_cast, masked to the visible
      inner wall (the opening minus the floor)."""
    shaded_ring = None
    casters = ()
    dish = None

    def _wall_shadow(self, s, g, defs, nid):
        r_in, fz = s.hole
        z0, z1 = s.origin[2] + fz, s.origin[2] + s.h
        others = [o for o in self.solids if o is not s and o.cast]
        rows = 24
        zs = [z0 + (z1 - z0) * (j + .5) / rows for j in range(rows)]
        hulls = [[self._caster2d(o, z) for o in others if max(p[2] for p in o.verts()) > z] for z in zs]
        quads = []
        step = .5
        for i in range(int(360 / step)):
            a0, a1 = math.radians(i * step - .05), math.radians((i + 1) * step + .05)
            am = (a0 + a1) / 2
            px, py = s.origin[0] + r_in * math.cos(am), s.origin[1] + r_in * math.sin(am)
            shaded = [any(len(h) > 2 and inside2d((px, py), h) for h in hulls[j]) for j in range(rows)]
            j = 0
            while j < rows:
                if not shaded[j]:
                    j += 1
                    continue
                k = j
                while k < rows and shaded[k]:
                    k += 1
                za = z0 + (z1 - z0) * j / rows - (.004 if j == 0 else 0)
                zb = z0 + (z1 - z0) * k / rows + (.004 if k == rows else 0)
                c = [(s.origin[0] + r_in * math.cos(a), s.origin[1] + r_in * math.sin(a)) for a in (a0, a1)]
                quads.append(self._path([(c[0][0], c[0][1], za), (c[1][0], c[1][1], za), (c[1][0], c[1][1], zb),
                                         (c[0][0], c[0][1], zb)]))
                j = k
        if not quads:
            return
        ring = [(r_in * math.cos(2 * math.pi * k / 96), r_in * math.sin(2 * math.pi * k / 96)) for k in range(96)]
        top = self._path([s.w((x, y, s.h)) for x, y in ring])
        flo = self._path([s.w((x, y, fz)) for x, y in ring])
        mid = nid('iw')
        defs.append('<mask id="%s" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><path d="%s" fill="#fff"/>'
                    '<path d="%s" fill="#000"/></mask>' % (mid, self.wpx, self.hpx, top, flo))
        g.append('<g mask="url(#%s)"><path filter="url(#%s)" fill="%s" d="%s"/></g>' % (
            mid, self._blur(1.2), self.col('cast', s.mat), ' '.join(quads)))

    def _receive(self, s, g, defs, nid, zt, clips, exclude=()):
        n0 = len(defs)
        super()._receive(s, g, defs, nid, zt, clips, exclude)
        if not s.hole or abs(zt - (s.origin[2] + s.h)) > 1e-9:
            return
        r_in = s.hole[0]
        ring_in = self._path([s.w((r_in * math.cos(2 * math.pi * k / 96), r_in * math.sin(2 * math.pi * k / 96), s.h))
                              for k in range(96)])
        for i in range(n0, len(defs)):
            if defs[i].startswith('<clipPath'):
                defs[i] = defs[i].replace('"/></clipPath>', ' %s" clip-rule="evenodd"/></clipPath>' % ring_in)

    def _draw(self, s, g, defs, nid):
        super()._draw(s, g, defs, nid)
        if s is self.dish:
            self._wall_shadow(s, g, defs, nid)
        if s is not self.shaded_ring:
            return
        zt = s.origin[2]
        paths = [self._path([(x, y, zt) for x, y in self._caster2d(o, zt)]) for o in self.casters]
        mid = nid('rs')
        sil = hull([self.cam.project(p) for p in s.verts()])
        d = 'M' + ' L'.join('%.1f %.1f' % p for p in sil) + 'Z'
        defs.append('<mask id="%s" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><path d="%s" fill="#fff" '
                    'stroke="#fff" stroke-width="1.6"/></mask>' % (mid, self.wpx, self.hpx, d))
        g.append('<g mask="url(#%s)"><path filter="url(#%s)" fill="%s" d="%s"/></g>' % (
            mid, self._blur(1.2), self.col('cast', s.mat), ' '.join(paths)))


def ring(sc, x, y, z, tilt=(0, 0), origin=None):
    """The echo coin's raised ring on a coin whose bottom centre is (x, y, z)."""
    if tilt == (0, 0):
        return sc.cup(x, y, z + HC - .002, RC * .72, RING_H, wall=RING_W, floor=.002, bevel=.004, mat='hue')
    c = add((x, y, z), _apply(_rot(0, *tilt), (0, 0, HC - .002)))
    return sc.cup(c[0], c[1], c[2], RC * .72, RING_H, wall=RING_W, floor=.002, bevel=.004, mat='hue', tilt=tilt)


def build(el=EL, width=.38, cy=.56):
    sc = RecoverScene('mint', el=el)
    dish = sc.dish = sc.cup(0, 0, 0, DISH_R, DISH_H, wall=DISH_WALL, floor=DISH_FLOOR, bevel=.02)
    rnd = random.Random(5)
    for i in range(NC):                                       # settled: each a hair off square, as in echo
        x, y = rnd.uniform(-.02, .02), rnd.uniform(-.02, .02)
        z = DISH_FLOOR + i * (HC + GAP)
        sc.cylinder(x, y, z, RC, HC, bevel=.01, n=128, inside=dish)
    sc.shaded_ring = ring(sc, x, y, z)
    zt = z + HC + LAND_GAP                                     # the one landing
    lx, ly = x + LAND_OFF[0], y + LAND_OFF[1]
    sc.casters = (sc.cylinder(lx, ly, zt, RC, HC, bevel=.01, n=128, tilt=LAND_TILT), ring(sc, lx, ly, zt, LAND_TILT))
    return sc.frame(width=width, cy=cy)


if __name__ == '__main__':
    sc = build()
    sc.save(OUT, title='Recover: green coins settled in a white dish, one more just landing on top')
    print(sc.report())
