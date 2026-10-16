#!/usr/bin/env bash
set -euo pipefail
D=${1:?usage: assert.sh <run-dir>}
test "$(< "$D/guest/tmp/ah.rc")" = 0
test -s "$D/project-source.sha256"
test -s "$D/gui.png"
grep -q '^# fail 0$' "$D/guest/tmp/ah.out"
grep -q '^windowKeyboard=PASS scope=real-parent-tui/native-child-tui/pi-h-marker-not-Harness$' "$D/guest/tmp/ah.out"
node - "$D/guest/tmp/ah.out" "$D/runtime.json" <<'NODE'
const assert = require('node:assert/strict'), fs = require('node:fs');
const output = fs.readFileSync(process.argv[2], 'utf8');
const lines = output.split('\n').filter(line => line.startsWith('NATIVE_QUIT_PASS '));
assert.equal(lines.length, 1);
const cases = JSON.parse(lines[0].slice('NATIVE_QUIT_PASS '.length));
assert.deepEqual(cases.map(item => item.kind), ['clone', 'fork']);
for (const item of cases) {
 assert.equal(item.piExited, true); assert.equal(item.windowsPreserved, true);
 assert.equal(item.shell.stdinTTY, true); assert.equal(item.shell.stdoutTTY, true);
 assert.equal(item.shell.termProgram, 'iTerm.app');
 assert.match(item.shell.shell, /(?:^|\/)-?(?:zsh|bash|sh)$/);
 assert.ok(item.windowIds.length >= 3);
}
const runtime = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
assert.equal(runtime.ok, true); assert.equal(runtime.tools.pi, '0.87.1');
console.log('native iTerm /quit: clone and fork preserve windows and execute ordinary shell commands');
NODE
