"""How It Works steps 1 and 2 (plan 003 §2): the Connect and Find pieces, drawn with piecekit.
Run from the repo root:  python3 docs/mockups/003-pieces/kit/build_connect_find.py
  -> pieces/connect.svg  (sky)      blue blocks filing in a short row into a white tray
  -> pieces/find.svg     (apricot)  a white bowl of coral beads, one bead lifted clear above it

Both keep the objects inside the middle 40 % of the tile (33-40 % wide, centred), so a 1:1.3 portrait crop from the
centre keeps them whole. Sizes stay in KIT.md §9's range (blocks near the key piece, beads r .12, a bowl r .7)."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piecekit as K
from piecekit import Scene, SH

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pieces')


# ------------------------------------------------------------------ 1. Connect (sky)
def connect():
    """A white tray with one row of three slots. Two blocks are in, the third drops into the last slot, and the
    next waits on the floor beside the tray: the exported records going in, one after another."""
    sc = Scene('sky', el=34)                      # a little higher than 30, so the slots read (the piece still: 36)
    N, P, B, BH = 3, .62, .46, .46                # slots, pitch, block footprint, block height
    TH, DEP, M = .36, .22, .16                    # tray height, slot depth, margin round the slots
    S = B + .04                                   # slot opening: a .02 m gap round each block
    w, d = (N - 1) * P + S + 2 * M, S + 2 * M
    xs = [(i - (N - 1) / 2) * P for i in range(N)]
    tray = sc.box(0, 0, 0, w=w, d=d, h=TH, mat='sec', bevel=.03, wells=[(x, 0, S, S, DEP, .03) for x in xs])
    zf = TH - DEP + .004                          # a block standing on a slot's floor
    for x in xs[:2]:
        sc.box(x, 0, zf, B, B, BH, inside=tray)
    sc.box(xs[2], 0, TH + .4, B, B, BH)           # dropping in: clear of the rim, square over its slot
    sc.box(w / 2 + .24 + B / 2, 0, 0, B, B, BH)   # next in line, on the floor
    return sc.frame(width=.40, cy=.60)


# ------------------------------------------------------------------ 2. Find (apricot)
class HeapScene(Scene):
    """piecekit throws every solid's shadow onto a top below it, so a bowl would shade the whole heap inside it
    (its hull covers the opening). Here the heap's mass takes the beads' shadows and the rim's own shadow (the
    opening minus the opening thrown along the sun, as piecekit does for a hole's floor), not the bowl's hull."""

    def _receive(self, s, g, defs, nid, zt, clips, exclude=()):
        if getattr(s, 'heap', False):
            c = s.inside if isinstance(s.inside, K.Solid) else self.solids[s.inside]
            exclude = tuple(exclude) + (c,)
            r_in, _ = c.hole
            dz = c.origin[2] + c.h - zt
            ring = [(c.origin[0] + r_in * math.cos(2 * math.pi * k / 96), c.origin[1] + r_in * math.sin(2 * math.pi * k / 96))
                    for k in range(96)]
            top = [(x, y, zt) for x, y in ring]
            lit = [(x + dz * SH[0], y + dz * SH[1], zt) for x, y in ring]
            cid = nid('rim')
            defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (cid, self._path(top)))
            g.append('<g clip-path="url(#%s)"><path fill-rule="evenodd" filter="url(#%s)" fill="%s" d="%s %s"/></g>' % (
                cid, self._blur(1.2), self.col('cast', s.mat), self._path(top), self._path(lit)))
        return Scene._receive(self, s, g, defs, nid, zt, clips, exclude)


def find():
    """The overflow's vocabulary, calm: a low white bowl full of coral beads, level just under the rim with a
    gentle dome (nothing spills), and one bead lifted clear above it: picked out."""
    R = .12                                       # bead (KIT §9)
    RV, H, WALL = .85, .42, .05                   # bowl: lower and wider than the overflow's cup (r .78, 1.25 tall)
    sc = HeapScene('apricot', el=27)              # the overflow still's camera is 26
    bowl = sc.cup(0, 0, 0, r=RV, h=H, wall=WALL, floor=.05, bevel=.015)
    rin = RV - WALL
    zt = H - .02                                  # the top layer's centres, a hair under the rim
    zl = zt - 2 * R * math.sqrt(2 / 3)            # the layer under it sits in its hollows
    heap = sc.cylinder(0, 0, .05, rin - .002, zl - .05, bevel=0, inside=bowl, cast=False, bias=-10)
    heap.heap = True                              # the mass under the beads: its top shows between them, in their shadows

    def layer(rmax, off=(0, 0)):
        n = int(rmax / (2 * R)) + 3
        for j in range(-n, n + 1):
            for i in range(-n, n + 1):
                x, y = (i + (j % 2) * .5) * 2 * R + off[0], j * R * math.sqrt(3) + off[1]
                if math.hypot(x, y) <= rmax:
                    yield x, y

    rmax = rin - R - .004
    for x, y in layer(rmax, off=(R, R / math.sqrt(3))):
        sc.sphere(x, y, zl, R, inside=bowl)
    for x, y in layer(rmax):
        sc.sphere(x, y, zt + .03 * (1 - (x * x + y * y) / rmax ** 2), R, inside=bowl)
    sc.sphere(.26, -.08, zt + .66 + R, R)         # the one picked out: clear of the heap and the rim on screen
    return sc.frame(width=.34, cy=.56)            # s ~ 515 px/m: the stills' own scale


if __name__ == '__main__':
    for slug, f, title in (('connect', connect, 'Connect: blue blocks filing into a white tray'),
                           ('find', find, 'Find: one coral bead lifted from a white bowl')):
        sc = f()
        path = sc.save(os.path.join(OUT, slug + '.svg'), title=title)
        print(slug, os.path.getsize(path), 'bytes;', sc.report())
