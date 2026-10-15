#!/usr/bin/env bash
set -euo pipefail
D=${1:?usage: assert.sh <run-dir>}
test "$(< "$D/guest/tmp/ah.rc")" = 0
test -s "$D/project-source.sha256"
test -s "$D/gui.png"
node - "$D/guest/tmp/ah.out" "$D/runtime.json" <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const text=fs.readFileSync(process.argv[2],'utf8');
const marker=text.split('\n').find(line=>line.startsWith('NATIVE_BUSY_CLONE_PASS '));
assert.ok(marker,'native keyboard acceptance marker required');
const result=JSON.parse(marker.slice('NATIVE_BUSY_CLONE_PASS '.length));
assert.equal(result.platform,'darwin');
assert.equal(result.nativeWindows,3);
assert.equal(result.mockRequests,2);
assert.equal(result.cases.length,2);
assert.equal(new Set(result.cases.map(c=>c.childPid).concat(result.parent.pid)).size,3);
for(const c of result.cases) assert.ok(c.childTaskDone&&c.parentCompleted&&c.incompleteExcluded);
const runtime=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
assert.ok(runtime.ok);assert.equal(runtime.tools.pi,'0.87.1');
console.log('native macOS busy clone: real iTerm parent/children; both busy stages PASS');
NODE
