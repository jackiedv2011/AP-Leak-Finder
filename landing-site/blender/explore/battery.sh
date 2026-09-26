#!/usr/bin/env bash
# Full test battery for a surviving direction.
# usage: explore/battery.sh script.py dir rest_frame key_frame "detail args" "move args" [extra key=val...]
#   writes out/explore/<dir>/{rest,key,detail}.png, motion tests locked.mp4 / move.mp4 (+ _x2, seam files,
#   filmstrips), locked_black.mp4, sizes.png (317/425/1015 on e5e5e5, fff, 000)
set -e
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
S=$1; D=$2; RF=$3; KF=$4; DET=$5; MOVE=$6; shift 6
O=out/explore/$D; mkdir -p $O
MR=${MR:-480}; MS=${MS:-24}; SR=${SR:-960}; SS=${SS:-48}
st() { # name frame args...
  local n=$1 f=$2; shift 2
  TAILN=3 explore/run.sh $S out=$O prefix=_$n frames=$f res=$SR spp=$SS "$@" | grep -E "Error|line" || true
  mv -f $O/_${n}_test_$(printf %04d $f).png $O/$n.png
}
st rest $RF "$@"
st key $KF "$@"
st detail $KF $DET "$@"
explore/motion.sh $S locked $O 240 $MR $MS e5e5e5 "$@"
"$B" -b --factory-startup --python encode.py -- src=$O/seq_locked prefix=$(ls $O/seq_locked | head -1 | sed 's/_0001.png//') out=$O/locked_black.mp4 crf=22 bg=000000 2>&1 | grep ENCODED
"$B" -b --factory-startup --python encode.py -- src=$O/seq_locked prefix=$(ls $O/seq_locked | head -1 | sed 's/_0001.png//') out=$O/locked_white.mp4 crf=22 bg=ffffff 2>&1 | grep ENCODED
if [ -n "$MOVE" ]; then explore/motion.sh $S move $O 240 $MR $MS e5e5e5 $MOVE "$@"; fi
"$B" -b --factory-startup --python explore/sheet.py -- mode=sizes src=$O/key.png sizes=317,425,1015 out=$O/sizes.png 2>&1 | grep WROTE
