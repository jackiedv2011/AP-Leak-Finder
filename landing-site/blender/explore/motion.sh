#!/usr/bin/env bash
# Motion test: render a low-res sequence, encode MP4 over a flat ground, a 2x back-to-back loop MP4,
# a seam filmstrip, and a seam diff (frame LOOP+1 must equal frame 1).
# usage: explore/motion.sh script.py name outdir loop res spp bg [extra key=val...]
set -e
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
S=$1; N=$2; O=$3; L=$4; R=$5; P=$6; BG=$7; shift 7
SEQ=$O/seq_$N
TAILN=4 explore/run.sh $S out=$O seq=1 seqdir=seq_$N res=$R spp=$P "$@" | grep -E "DONE|Error|line" || true
# seam: render frame L+1 as a still and diff against frame 1
TAILN=4 explore/run.sh $S out=$O prefix=seam_$N frames=$((L+1)) res=$R spp=$P "$@" >/dev/null || true
PF=$(ls $SEQ | head -1 | sed 's/_0001.png//')
"$B" -b --factory-startup --python explore/sheet.py -- mode=diff a=$SEQ/${PF}_0001.png b=$O/seam_${N}_test_$(printf %04d $((L+1))).png 2>&1 | grep DIFF | tee $O/seam_$N.txt
"$B" -b --factory-startup --python encode.py -- src=$SEQ prefix=$PF out=$O/$N.mp4 crf=22 bg=$BG 2>&1 | grep ENCODED
# 2x loop
D2=$O/_x2_$N; rm -rf $D2; mkdir -p $D2
n=$(ls $SEQ/${PF}_*.png | wc -l)
i=1; for rep in 1 2; do for f in $(ls $SEQ/${PF}_*.png); do cp $f $D2/${PF}_$(printf %04d $i).png; i=$((i+1)); done; done
"$B" -b --factory-startup --python encode.py -- src=$D2 prefix=$PF out=$O/${N}_x2.mp4 crf=24 bg=$BG 2>&1 | grep ENCODED
rm -rf $D2
# seam filmstrip: last 3 frames then first 3
a=$((n-2)); "$B" -b --factory-startup --python explore/sheet.py -- mode=strip srcs=$SEQ/${PF}@$a:$((n+1)):1,$SEQ/${PF}@1:4:1 size=200 cols=6 bg=$BG out=$O/seamstrip_$N.png 2>&1 | grep WROTE
# overview filmstrip: 12 frames across the loop
st=$(( n / 12 )); "$B" -b --factory-startup --python explore/sheet.py -- mode=strip srcs=$SEQ/${PF}@1:$((n+1)):$st size=220 cols=6 bg=$BG out=$O/film_$N.png 2>&1 | grep WROTE
