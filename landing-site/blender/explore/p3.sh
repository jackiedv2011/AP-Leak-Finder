#!/usr/bin/env bash
# Pass 3 battery: rest, key, closeup stills; a 3 s motion test over grey and over black; a sizes sheet.
# usage (from landing-site/blender): explore/p3.sh script.py dir rest_frame key_frame "detail args" [key=val ...]
#   env: SR (still px, 960) SS (still spp, 64) MR (motion px, 600) MS (motion spp, 32) ONLY=stills|motion
set -e
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
S=$1; D=$2; RF=$3; KF=$4; DET=$5; shift 5
O=out/explore/p3/$D; mkdir -p $O
SR=${SR:-960}; SS=${SS:-64}; MR=${MR:-600}; MS=${MS:-32}
st() { # name frame args...
  local n=$1 f=$2; shift 2
  TAILN=3 explore/run.sh $S out=$O prefix=_$n frames=$f res=$SR spp=$SS overwrite=1 "$@" | grep -E "Error|line|FRAME" || true
  mv -f $O/_${n}_test_$(printf %04d $f).png $O/$n.png
}
if [ "$ONLY" != "motion" ]; then
  st rest $RF "$@"
  st key $KF "$@"
  st detail $KF $DET "$@"
  "$B" -b --factory-startup --python explore/sheet.py -- mode=sizes src=$O/key.png sizes=317,425,1015 out=$O/sizes.png 2>&1 | grep WROTE || true
fi
if [ "$ONLY" != "stills" ]; then
  rm -rf $O/seq
  TAILN=2 explore/run.sh $S out=$O seq=1 seqdir=seq res=$MR spp=$MS overwrite=1 "$@" | grep -E "DONE|Error|line" || true
  PF=$(ls $O/seq | head -1 | sed 's/_0001.png//')
  "$B" -b --factory-startup --python encode.py -- src=$O/seq prefix=$PF out=$O/motion.mp4 crf=20 bg=e5e5e5 2>&1 | grep ENCODED || true
  "$B" -b --factory-startup --python encode.py -- src=$O/seq prefix=$PF out=$O/motion_black.mp4 crf=20 bg=000000 2>&1 | grep ENCODED || true
  n=$(ls $O/seq | wc -l); stp=$(( n / 12 )); [ $stp -lt 1 ] && stp=1
  "$B" -b --factory-startup --python explore/sheet.py -- mode=strip srcs=$O/seq/${PF}@1:$((n+1)):$stp size=220 cols=6 bg=e5e5e5 out=$O/film.png 2>&1 | grep WROTE || true
fi
