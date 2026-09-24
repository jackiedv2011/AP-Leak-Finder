#!/usr/bin/env bash
# Pass 3: full battery for every surviving direction. ONLY=stills|motion to split the work; PICK="a b" to run some.
cd "$(dirname "$0")/.."
run() { case " ${PICK:-all} " in *" all "*|*" $1 "*) shift; explore/p3.sh "$@";; esac; }
run 12a explore/e12_gyroid.py 12a_labyrinth 1 45 "zoom=2.6" shape=sphere surf=gyroid
run 12b explore/e12_gyroid.py 12b_lattice 1 45 "zoom=2.4 tgt=0,0,2.6" shape=column surf=schwarzd cells=1.6 th=.5 a=bone b=bone rim=green rough=.45 dist=17 el=14
run 01 explore/e01_braid.py 01_braid 1 45 "zoom=2.6 tgt=.55,0,3.0"
run 10 explore/e10_portals.py 10_portals 45 1 "zoom=2.2 tgt=0,.6,1.4" az=-30 el=14 dist=18
run 06 explore/e06_burr.py 06_burr 1 45 "zoom=2.5"
run 03 explore/e03_tumblers.py 03_tumblers 1 40 "zoom=2.4"
run 08 explore/e08_fins.py 08_fins 1 30 "zoom=2.4 tgt=.9,0,1.9" el=32 dist=17
run 11 explore/e11_helix.py 11_helix 1 45 "zoom=2.4 tgt=0,0,2.2"
echo P3 ALL DONE
