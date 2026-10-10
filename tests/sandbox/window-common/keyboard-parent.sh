#!/usr/bin/env bash
set -euo pipefail
root=$WINDOW_ROOT
pi=$WINDOW_REAL_PI
base=/tmp/ahsb-push/window
flags='--offline --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files'
WINDOW_SEED=1 "$pi" $flags --mode rpc -e "$base/tests/sandbox/parent-probe.ts" </dev/null > "$root/seed.out" 2> "$root/seed.err"
node <<'NODE'
const fs=require('node:fs');
const root=process.env.WINDOW_ROOT;
const seed=JSON.parse(fs.readFileSync(root+'/seed.json'));
const q=s=>"'"+s.replaceAll("'", "'\\''")+"'";
fs.writeFileSync(root+'/parent.sh', `#!/bin/sh\nexport WINDOW_ROOT=${q(root)} PI_CODING_AGENT_DIR=${q(root+'/parent-runtime')} PATH=${q(process.env.PATH)} HARNESS_CATALOG=fixture-catalog-only\ncd ${q(seed.cwd)}\nexec ${q(process.env.WINDOW_REAL_PI)} --offline --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files -e /tmp/ahsb-push/window/extensions/session-window.ts -e /tmp/ahsb-push/window/tests/sandbox/parent-probe.ts --session ${q(seed.file)}\n`);
NODE
wait_file() {
    for attempt in $(seq 1 80); do [ ! -f "$1" ] || return 0; sleep 0.25; done
    echo "timed out waiting for ${1##*/}; no permissions granted" >&2
    return 44
}
if [ "$(uname -s)" = Darwin ]; then
    app="$HOME/Applications/iTerm.app"
    [ -d "$app" ] || app=/Applications/iTerm.app
    /usr/bin/open "$app"
    /usr/bin/osascript - "sh '$root/parent.sh'" > "$root/parent-window-index.txt" <<'APPLESCRIPT'
on run argv
    with timeout of 20 seconds
        tell application "System Events"
            repeat 40 times
                if exists process "iTerm2" then
                    tell process "iTerm2"
                        set frontmost to true
                        if frontmost and (count windows) > 0 then exit repeat
                    end tell
                end if
                delay 0.25
            end repeat
            tell process "iTerm2" to set beforeCount to count windows
            keystroke "n" using command down
            repeat 40 times
                tell process "iTerm2"
                    set frontmost to true
                    set afterCount to count windows
                end tell
                if afterCount > beforeCount then exit repeat
                delay 0.25
            end repeat
            if afterCount <= beforeCount then error "guest iTerm parent window not ready"
            keystroke (item 1 of argv)
            key code 36
            return afterCount
        end tell
    end timeout
end run
APPLESCRIPT
    input_parent() {
        printf '%s' "$1" | /usr/bin/pbcopy
        /usr/bin/osascript - "$1" "${2:-}" "$(< "$root/parent-window-index.txt")" <<'APPLESCRIPT'
on run argv
    with timeout of 10 seconds
        tell application "System Events"
            tell process "iTerm2"
                set frontmost to true
            end tell
            keystroke (item 3 of argv) using {command down, option down}
            delay 0.2
            keystroke "u" using control down
            keystroke "v" using command down
            delay 0.2
            key code 36
            if item 2 of argv is "select" then
                delay 0.7
                key code 36
            end if
        end tell
    end timeout
end run
APPLESCRIPT
    }
else
    command -v tmux >/dev/null || { echo 'guest missing tmux' >&2; exit 42; }
    socket="$root/parent-tmux"
    xterm -T 'Window fixture parent' -e tmux -S "$socket" -f /dev/null new-session -s parent /bin/sh "$root/parent.sh" > "$root/parent-terminal.log" 2>&1 &
    parent_terminal_pid=$!
    input_parent() {
        tmux -S "$socket" send-keys -t parent -l "$1"
        tmux -S "$socket" send-keys -t parent Enter
        if [ "${2:-}" = select ]; then
            for attempt in $(seq 1 40); do
                tmux -S "$socket" capture-pane -p -t parent | grep -q 'Fork in new window' && break
                sleep 0.1
            done
            tmux -S "$socket" capture-pane -p -t parent | grep -q 'Fork in new window'
            tmux -S "$socket" send-keys -t parent Enter
        fi
    }
fi
wait_file "$root/parent-start.json"
if [ "$(uname -s)" = Darwin ]; then
    /usr/bin/osascript -l JavaScript > "$root/windows-before.json" <<'JXA'
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
JSON.stringify(windows.filter(w => ['iTerm2', 'iTerm'].includes(w.kCGWindowOwnerName) && w.kCGWindowLayer === 0 && w.kCGWindowAlpha > 0 && w.kCGWindowBounds.Width > 0).map(w => w.kCGWindowNumber));
JXA
fi
input_parent /clone-window
for attempt in $(seq 1 80); do
    [ "$(find "$root" -name 'child-*.json' | wc -l | tr -d ' ')" -ge 1 ] && break
    sleep 0.25
done
[ "$(find "$root" -name 'child-*.json' | wc -l | tr -d ' ')" -eq 1 ] || { echo 'clone child did not resume; possible permission request, no approval attempted' >&2; exit 44; }
node -e 'const fs=require("node:fs"),r=process.env.WINDOW_ROOT;const files=fs.readdirSync(r).filter(f=>/^child-\d+\.json$/.test(f));if(files.length!==1)throw Error("exact clone child required");fs.writeFileSync(r+"/clone-child.json",JSON.stringify({file:files[0]}));'
input_parent /fork-window select
for attempt in $(seq 1 80); do
    [ "$(find "$root" -name 'child-*.json' | wc -l | tr -d ' ')" -ge 2 ] && break
    sleep 0.25
done
[ "$(find "$root" -name 'child-*.json' | wc -l | tr -d ' ')" -eq 2 ] || { echo 'fork child did not resume' >&2; exit 44; }
sleep 1
wait_file "$root/parent.json"
