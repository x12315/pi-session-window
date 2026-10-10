#!/usr/bin/env bash
set -euo pipefail
D=${1:?usage: assert.sh <run-dir>}
test "$(< "$D/guest/tmp/ah.rc")" = 0
test -s "$D/project-source.sha256"
grep -q '^# tests 7$' "$D/guest/tmp/ah.out"
grep -q '^# fail 0$' "$D/guest/tmp/ah.out"
grep -q '^guestTerminalWindows=PASS' "$D/guest/tmp/ah.out"
grep -q '^windowHandlers=PASS scope=handler-ui-fixture/native-child-tui/pi-h-marker-not-Harness$' "$D/guest/tmp/ah.out"
