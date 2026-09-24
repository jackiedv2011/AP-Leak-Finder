#!/usr/bin/env bash
# usage: explore/run.sh script.py key=val ...   (run from landing-site/blender)
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
s="$1"; shift
"$B" -b --factory-startup --python "$s" -- "$@" 2>&1 | grep -E "FRAME|DONE|WROTE|DIFF|ENCODED|Error|error|Traceback|File \"|line [0-9]|NOTE|INFO:" | grep -v "Warning" | tail -${TAILN:-40}
