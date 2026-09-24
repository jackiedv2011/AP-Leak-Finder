#!/usr/bin/env bash
# The eight pass-3 survivors side by side: key frames at card size on grey, then on black.
cd "$(dirname "$0")/.."
P=out/explore/p3
L=""; for d in 12a_labyrinth 12b_lattice 01_braid 10_portals 06_burr 03_tumblers 08_fins 11_helix; do L="$L $P/$d/key.png"; done
explore/peek.sh $P/overview_grey.png 317 4 $L
BG=000000 explore/peek.sh $P/overview_black.png 317 4 $L
BG=ffffff explore/peek.sh $P/overview_white.png 317 4 $L
