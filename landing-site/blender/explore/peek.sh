#!/usr/bin/env bash
# peek.sh out.png size cols img1 img2 ...   quick contact sheet over the site grey
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
o=$1; s=$2; c=$3; shift 3; L=$(IFS=,; echo "$*")
"$B" -b --factory-startup --python explore/sheet.py -- mode=strip srcs=$L size=$s cols=$c bg=${BG:-e5e5e5} out=$o 2>&1 | grep -E "WROTE|Error"
