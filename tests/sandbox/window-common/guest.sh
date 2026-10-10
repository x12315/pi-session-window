#!/usr/bin/env bash
# Guest-only; no downloads, model prompts, base changes, or native preference edits.
set -euo pipefail
umask 077
cd /tmp/ahsb-push/window
platform=$(uname -s)
case "$platform" in Linux|Darwin) ;; *) echo 'unsupported guest OS' >&2; exit 2 ;; esac
command -v node
real_pi=$(command -v pi)
node --version
"$real_pi" --version
export PI_OFFLINE=1
export WINDOW_ROOT
WINDOW_ROOT=$(mktemp -d /tmp/pi-window-fixture.XXXXXX)
mkdir -p "$WINDOW_ROOT/parent-runtime" "$WINDOW_ROOT/bin" /tmp/ah-artifacts/window
printf '{"cacheWarming":"off"}\n' > "$WINDOW_ROOT/parent-runtime/settings.json"
export PI_CODING_AGENT_DIR="$WINDOW_ROOT/parent-runtime"
# Keep stage output even when a native terminal prerequisite fails.
finish() {
    rc=$?
    cp -R "$WINDOW_ROOT/." /tmp/ah-artifacts/window/
    for file in "$WINDOW_ROOT"/*.json; do
        [ ! -f "$file" ] || { printf '\nEVIDENCE %s\n' "${file##*/}"; node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1],"utf8")+"\n")' "$file"; }
    done
    if [ -s "$WINDOW_ROOT/handler.err" ]; then node -e 'process.stderr.write(require("node:fs").readFileSync(process.argv[1],"utf8"))' "$WINDOW_ROOT/handler.err"; fi
    printf 'windowGuestRc=%s\n' "$rc"
}
trap finish EXIT
node --test --test-reporter=tap test/*.test.mjs
printf 'windowUnitTests=PASS\n'

if [ "$platform" = Linux ]; then
    missing=0
    for tool in Xvfb xterm xwininfo; do
        command -v "$tool" >/dev/null || { echo "BLOCKED: guest missing $tool; no install/base change attempted" >&2; missing=1; }
    done
    [ "$missing" = 0 ] || exit 42
    export DISPLAY=:87
    unset WAYLAND_DISPLAY
    Xvfb "$DISPLAY" -screen 0 1280x800x24 > "$WINDOW_ROOT/xvfb.log" 2>&1 &
    xvfb_pid=$!
    for attempt in $(seq 1 40); do
        xwininfo -root >/dev/null 2>&1 && break
        kill -0 "$xvfb_pid" || exit 42
        sleep 0.25
    done
    xwininfo -root >/dev/null || exit 42
fi

# This pi-h is ONLY a marker shim. It proves launcher selection/environment, not Harness behavior.
export WINDOW_REAL_PI="$real_pi" HARNESS_CATALOG=fixture-catalog-only
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.WINDOW_ROOT;
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const marker = 'const fs=require("node:fs");fs.writeFileSync(process.env.WINDOW_ROOT+"/marker-"+process.ppid+".json",JSON.stringify({runtime:process.env.PI_CODING_AGENT_DIR??null,catalog:process.env.HARNESS_CATALOG??null,args:process.argv.slice(1)}))';
fs.writeFileSync(path.join(root, 'bin/pi-h'), `#!/bin/sh\nexport WINDOW_ROOT=${quote(root)}\n${quote(process.execPath)} -e ${quote(marker)} -- "$@"\nexport PI_CODING_AGENT_DIR="$WINDOW_ROOT/child-runtime-$$"\nmkdir -p "$PI_CODING_AGENT_DIR"\nprintf '{"cacheWarming":"off"}\\n' > "$PI_CODING_AGENT_DIR/settings.json"\nunset ANTHROPIC_API_KEY OPENAI_API_KEY\nexec ${quote(process.env.WINDOW_REAL_PI)} --offline --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files -e /tmp/ahsb-push/window/tests/sandbox/child-probe.ts "$@"\n`, {mode: 0o755});
NODE
export PATH="$WINDOW_ROOT/bin:$PATH"
export WINDOW_REAL_PI="$real_pi"
bash /tmp/ahsb-push/window/keyboard-parent.sh
node /tmp/ahsb-push/window/verify.mjs
if [ "$platform" = Linux ]; then
    xwininfo -root -tree > "$WINDOW_ROOT/windows.txt"
    grep -i xterm "$WINDOW_ROOT/windows.txt"
    [ "$(grep -ic '"XTerm"' "$WINDOW_ROOT/windows.txt")" -ge 3 ]
    if command -v import >/dev/null; then import -window root /tmp/ah-artifacts/window/gui.png; fi
    printf 'guestTerminalWindows=PASS (X11 tree, guest Xvfb)\n'
else
    /usr/bin/osascript -l JavaScript > "$WINDOW_ROOT/windows.json" <<'JXA'
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
const terminals = windows.filter(w => ['iTerm2', 'iTerm'].includes(w.kCGWindowOwnerName) && w.kCGWindowLayer === 0 && w.kCGWindowAlpha > 0 && w.kCGWindowBounds.Width > 0);
if (terminals.length < 3) throw Error('parent plus two visible guest iTerm windows required');
JSON.stringify(terminals);
JXA
    node -e 'const fs=require("node:fs");const r=process.env.WINDOW_ROOT;const before=JSON.parse(fs.readFileSync(r+"/windows-before.json"));const after=JSON.parse(fs.readFileSync(r+"/windows.json"));if(after.filter(w=>!before.includes(w.kCGWindowNumber)).length!==2||!before.every(id=>after.some(w=>w.kCGWindowNumber===id)))throw Error("two new native windows and preserved parent required")'
    printf 'guestTerminalWindows=PASS (CoreGraphics, two new guest iTerm windows, parent preserved)\n'
fi
printf 'windowKeyboard=PASS scope=real-parent-tui/native-child-tui/pi-h-marker-not-Harness\n'
