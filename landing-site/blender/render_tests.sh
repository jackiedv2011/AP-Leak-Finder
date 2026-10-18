#!/usr/bin/env bash
# Preview frames for every onboarding scene (half size, low samples), composited on black.
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
cd "$(dirname "$0")"
for spec in "$@"; do
  scene=${spec%%:*}; frames=${spec#*:}
  "$B" -b --factory-startup --python onboarding.py -- scene=$scene out=out/onb_t scale=${SCALE:-.5} spp=${SPP:-24} frames=$frames bg=${BG:-000000} overwrite=1 2>&1 \
    | grep -E "Traceback|Error:|error:|line [0-9]+, in|FRAME" | sed "s/^/[$scene] /"
done
