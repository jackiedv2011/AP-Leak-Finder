#!/usr/bin/env bash
# Final onboarding loops: render every frame, then ship each as
#   <scene>.webm        VP9 with alpha (Chrome, Firefox, Edge)
#   <scene>-dark.mp4    H.264 over the dark canvas  (Safari drops WebM alpha)
#   <scene>-light.mp4   H.264 over the light canvas
#   <scene>.webp        first frame, transparent (poster + reduced motion)
# Stage loops sit on the canvas (#000 / #f3f3f3); card icons sit on a card (#111 / #fff).
# Renders resume: frames already on disk are skipped, so rerunning finishes a stopped run.
set -u
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
cd "$(dirname "$0")"
DEST=../../public/onboarding
mkdir -p "$DEST"
SCENES=${SCENES:-"welcome ic_unpaid ic_duplicate ic_credit ic_unsure ic_show ic_draft ic_approve business tools how data finale_in finale card_upload card_sample"}
for s in $SCENES; do
  case $s in
    ic_*) spp=64; size=400; dark=111111; light=ffffff ;;
    card_*) spp=64; size=640; dark=111111; light=ffffff ;;
    how|data) spp=96; size=1440; dark=000000; light=f3f3f3 ;;
    finale*) spp=96; size=1280; dark=000000; light=f3f3f3 ;;
    *) spp=96; size=960; dark=000000; light=f3f3f3 ;;
  esac
  dir=out/onb_final/$s
  t0=$(date +%s)
  "$B" -b --factory-startup --python onboarding.py -- scene=$s out=$dir spp=$spp frames=all 2>&1 | grep -E "Traceback|Error:|ANIM DONE" | sed "s/^/[$s] /"
  "$B" -b --factory-startup --python encode.py -- src=$dir prefix=$s out=$DEST/$s.webm crf=31 size=$size 2>&1 | grep -E "ENCODED|Error" | sed "s/^/[$s] /"
  "$B" -b --factory-startup --python encode.py -- src=$dir prefix=$s out=$DEST/$s-dark.mp4 crf=21 size=$size bg=$dark 2>&1 | grep -E "ENCODED|Error" | sed "s/^/[$s] /"
  "$B" -b --factory-startup --python encode.py -- src=$dir prefix=$s out=$DEST/$s-light.mp4 crf=21 size=$size bg=$light 2>&1 | grep -E "ENCODED|Error" | sed "s/^/[$s] /"
  "$B" -b --factory-startup --python poster.py -- src=$dir/${s}_0001.png out=$DEST/$s.webp 2>&1 | grep -E "POSTER|Error" | sed "s/^/[$s] /"
  echo "[$s] done in $(( $(date +%s) - t0 ))s"
done
echo ALL DONE
