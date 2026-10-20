"""Evidence (How It Works step 3, "Proof behind every finding"): a neat stack of near-white cards with one
violet card drawn halfway out to the front. Lilac (violet = unused credit; it echoes the piece exhibit's keys).

Run from the repo root:  python3 docs/mockups/003-pieces/kit/build_evidence.py   ->  pieces/evidence.svg

piecekit throws shadows onto tops only. Here the card that sticks out also shades the front walls of the cards
under it (the sun is in front, so the overhang's shadow drops down their faces and slides left). EvidenceScene
adds that: after each white card below the violet one is drawn, the violet card's shadow on the plane of that
card's front wall is painted over it in sec_cast, clipped to the card. The next card up is drawn afterwards, so
the crevice lines stay on top."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piecekit import Scene, SH, hull

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pieces', 'evidence.svg')

N, W, D, T, GAP, B = 10, 1.8, 1.1, .09, .012, .02    # ten cards 1.8 x 1.1 m, .09 thick, .012 apart, .02 bevel
VI = 6                                                # the violet one, counted from the bottom (0): three above it
PULL, SHIFT, YAW = .55, .06, -4                       # drawn out half its depth, a touch right, turned 4 deg
EL = 32


def clip_y(poly, yw):
    """The part of a 3D polygon (one z) in front of the plane y = yw (Sutherland-Hodgman on one edge)."""
    out = []
    for i, p in enumerate(poly):
        q = poly[(i + 1) % len(poly)]
        pin, qin = p[1] <= yw, q[1] <= yw
        if pin:
            out.append(p)
        if pin != qin:
            t = (yw - p[1]) / (q[1] - p[1])
            out.append((p[0] + (q[0] - p[0]) * t, yw, p[2] + (q[2] - p[2]) * t))
    return out


class EvidenceScene(Scene):
    caster = None          # the violet card
    receivers = ()         # the white cards under it

    def _draw(self, s, g, defs, nid):
        super()._draw(s, g, defs, nid)
        if s not in self.receivers or self.caster is None:
            return
        yw = s.origin[1] - D / 2                                   # this card's front wall
        pts = []
        for layer in self.caster.layers:
            for p in clip_y(layer, yw):
                dz = (yw - p[1]) / SH[1]                           # drop along the sun until the ray meets the wall
                pts.append((p[0] + SH[0] * dz, p[2] - dz))
        sh = hull(pts)
        if len(sh) < 3:
            return
        # masked to the card from its bottom chamfer up (the chamfer is the crevice under it and stays sec_deep;
        # the bottom card has no crevice, so its foot is shaded too), with a stroke so the faces' own 1.2 px
        # seam strokes are covered as well
        mid = nid('ws')
        sil = hull([self.cam.project(p) for L in (s.layers if s.zmin() < 1e-6 else s.layers[1:]) for p in L])
        d = 'M' + ' L'.join('%.1f %.1f' % p for p in sil) + 'Z'
        defs.append('<mask id="%s" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><path d="%s" fill="#fff" '
                    'stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></mask>' % (mid, self.wpx, self.hpx, d))
        g.append('<g mask="url(#%s)"><path filter="url(#%s)" fill="%s" d="%s"/></g>' % (
            mid, self._blur(1.2), self.col('cast', s.mat), self._path([(x, yw, z) for x, z in sh])))


def build(el=EL, width=.38, cy=.57):
    sc = EvidenceScene('lilac', el=el)
    cards = []
    for i in range(N):
        z = i * (T + GAP)
        if i == VI:
            cards.append(sc.box(SHIFT, -PULL, z, W, D, T, bevel=B, yaw=YAW))
        else:
            cards.append(sc.box(0, 0, z, W, D, T, bevel=B, mat='sec'))
    sc.caster, sc.receivers = cards[VI], cards[:VI]
    return sc.frame(width=width, cy=cy)


if __name__ == '__main__':
    sc = build()
    sc.save(OUT, title='Evidence: a neat stack of white cards with one violet card drawn halfway out')
    print(sc.report())
