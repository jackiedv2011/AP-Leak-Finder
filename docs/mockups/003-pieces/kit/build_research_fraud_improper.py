"""Two research-card thumbnails (plan 003 §2, /research and the /about carousel), drawn with piecekit.
Run from the repo root:  python3 docs/mockups/003-pieces/kit/build_research_fraud_improper.py
  -> pieces/research-occupational-fraud.svg  (apricot)  a white invoice slab standing up, an identical coral copy
                                                          sliding out from behind it: one bill, billed twice
  -> pieces/research-improper-payments.svg   (sky)      a tall blue column of flat bars on a white base, its long
                                                          shadow stepped at every bar: big money

The /research cards crop the tile to a portrait (about 1:1.3) from the centre, so both keep the objects inside the
middle 40 % of the width. Sizes stay in KIT.md §9's range (the slabs are near the tray's thickness, the bars near
the shadow still's plates)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piecekit import Scene, SUN, hull

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pieces')


# ------------------------------------------------------------------ 1. Occupational fraud (apricot)
class WallShadowScene(Scene):
    """piecekit throws shadows onto tops only. The invoice's line ridges stand out of a vertical face, so their
    shadows fall on that face (down and to the left: the sun is in front, high and to the right). After a slab is
    drawn, each of its ridges' shadows on the plane of its front wall is painted over it (shade, or sec_cast on
    the near-white, blur 1.2), clipped to the wall. The ridges are drawn afterwards, on top."""
    ridges = {}            # slab -> [ridge solids on its front wall]

    def _draw(self, s, g, defs, nid):
        super()._draw(s, g, defs, nid)
        rs = self.ridges.get(s)
        if not rs:
            return
        yw = min(p[1] for p in s.verts())                       # the slab's front wall (upright, az 0)
        d = (-SUN[0], -SUN[1], -SUN[2])                          # the light's travel
        paths = []
        for r in rs:
            pts = []
            for p in r.verts():
                t = (yw - p[1]) / d[1]                           # along the light until it meets the wall
                pts.append((p[0] + d[0] * t, p[2] + d[2] * t))
                pts.append((p[0], p[2]))                         # and its contact with the wall
            paths.append(self._path([(x, yw, z) for x, z in hull(pts)]))
        xs = [p[0] for p in s.verts()]
        zs = [p[2] for p in s.verts()]
        b = s.b
        wall = [(min(xs), yw, min(zs) + b), (max(xs), yw, min(zs) + b), (max(xs), yw, max(zs) - b), (min(xs), yw, max(zs) - b)]
        cid = nid('wc')
        defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (cid, self._path(wall)))
        g.append('<g clip-path="url(#%s)"><path filter="url(#%s)" fill="%s" d="%s"/></g>' % (
            cid, self._blur(1.2), self.col('cast', s.mat), ' '.join(paths)))


# an invoice, standing: 1.0 wide, 1.34 tall (about the crop's 1:1.3), .14 thick like the tray's rim
IW, IH, IT, IB = 1.0, 1.34, .14, .03
GAP = .05                     # between the bill and its copy (the copy's ridges stand .03 into it)
SLIDE = .44                   # how far the copy has slid out to the right
RP, RB = .03, .008            # ridges: .03 proud, .008 bevel
# (x0, x1, z0, z1) on the face, from the slab's left edge and its foot: a header block, three line items, the total
RIDGES = [(.12, .46, 1.06, 1.16), (.12, .88, .80, .86), (.12, .88, .64, .70), (.12, .88, .48, .54), (.54, .88, .22, .32)]


def invoice(sc, x, y, mat, bias):
    slab = sc.box(x, y, 0, IW, IT, IH, bevel=IB, mat=mat, bias=bias)
    yf = y - IT / 2
    rs = []
    for x0, x1, z0, z1 in RIDGES:
        rs.append(sc.box(x - IW / 2 + (x0 + x1) / 2, yf - RP / 2 + .002, z0, x1 - x0, RP + .004, z1 - z0,
                         bevel=RB, mat=mat, bias=bias + 50))
    sc.ridges[slab] = rs
    return slab


def occupational_fraud(el=30, width=.335, cy=.585):
    sc = WallShadowScene('apricot', el=el)
    sc.ridges = {}
    invoice(sc, SLIDE, IT + GAP, 'hue', -200)                 # the copy, behind: drawn first
    invoice(sc, 0, 0, 'sec', 0)                               # the bill
    return sc.frame(width=width, cy=cy)


# ------------------------------------------------------------------ 2. Improper payments (sky)
BW, BD, BT, BG, NB = 1.0, .58, .12, .022, 11             # bars: 1.0 x .58, .12 thick, .022 apart (a crevice), eleven
STAG = .05                                               # every other bar sits this far right: the stepped edge
PW, PD, PH = 1.62, 1.1, .2                               # the white base


def improper_payments(el=30, width=.33, cy=.575, stag=STAG):
    sc = Scene('sky', el=el)
    sc.box(0, 0, 0, PW, PD, PH, bevel=.03, mat='sec')
    for i in range(NB):
        dx = (stag / 2) * (1 if i % 2 else -1)
        sc.box(dx, .04, PH + .004 + i * (BT + BG), BW, BD, BT, bevel=.02)
    return sc.frame(width=width, cy=cy)


if __name__ == '__main__':
    for slug, f, title in (
            ('research-occupational-fraud', occupational_fraud,
             'Research, occupational fraud: a white invoice slab with an identical coral copy sliding out from behind it'),
            ('research-improper-payments', improper_payments,
             'Research, improper payments: a tall blue column of stacked bars on a white base with a long stepped shadow')):
        sc = f()
        path = sc.save(os.path.join(OUT, slug + '.svg'), title=title)
        print(slug, os.path.getsize(path), 'bytes;', sc.report())
