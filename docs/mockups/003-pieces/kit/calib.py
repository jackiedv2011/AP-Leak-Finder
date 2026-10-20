"""The two calibration pieces, rebuilt from the Blender scripts' own numbers (end poses of exhibit_shadow.py and
exhibit_echo.py). Run from the repo root:  python3 docs/mockups/003-pieces/kit/calib.py"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piecekit import Scene, rrect

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pieces')


def shadow():
    # exhibit_shadow.py, last frame: camera straight down (el 89.5) on (0, .42, 0), dist 14.0 x .97
    sc = Scene('sky', el=89.5, dist=14.0 * .97, target=(0, .42, 0))
    S, LIFT, GAP, PH, PG = .82, .1, 1.0, .13, .028
    for k in range(6):
        z = LIFT + k * (PH + PG)
        sc.prism(-GAP, 0, z, rrect(S, S, .02, n=1), PH, .02)                         # six plates squared up: a cube
        w = S * (1 - k * .15)
        sc.prism(GAP, 0, z, rrect(w, w, .02, n=1), PH, .02)                          # the same six, stepped
    return sc


def echo():
    # exhibit_echo.py, last frame: el 30 on (0, 0, .62), dist 14.4 x .965; seven coins r .82, h .078, gap .012
    sc = Scene('mint', el=30, dist=14.4 * .965, target=(0, 0, .62))
    RC, HC, GAP, NC = .82, .078, .012, 7
    rnd = random.Random(3)
    for i in range(NC):
        x, y = rnd.uniform(-.018, .018), rnd.uniform(-.018, .018)
        rnd.uniform(0, math.tau)
        z = i * (HC + GAP)
        sc.cylinder(x, y, z, RC, HC, bevel=.01, n=128)
    # the raised ring on the top coin's face: r .72 RC, .03 wide, standing .01 proud
    sc.cup(x, y, z + HC - .002, RC * .72, .012, wall=.03, floor=.002, bevel=.004, mat='hue')
    return sc


if __name__ == '__main__':
    for name, f in (('shadow', shadow), ('echo', echo)):
        sc = f()
        path = os.path.join(OUT, '_calib-%s.svg' % name)
        sc.save(path, title='Calibration: %s' % name)
        print(name, os.path.getsize(path), 'bytes;', sc.report())
