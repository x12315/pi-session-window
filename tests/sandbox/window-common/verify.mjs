import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.WINDOW_ROOT;
const read = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
assert.equal(existsSync(join(root, 'refused-input.json')), false, 'no unexpected model input permitted');
const seed = read('seed.json');
const parent = read('parent-start.json');
const children = readdirSync(root).filter(name => /^child-\d+\.json$/.test(name)).map(read);
for (const observed of [parent, ...children]) {
    assert.equal(observed.hasUI, true);
    assert.equal(observed.stdinTTY, true, 'real terminal stdin required');
    assert.equal(observed.stdoutTTY, true, 'real terminal stdout required');
    assert.ok(observed.mode === null || observed.mode === 'tui', 'RPC/print prohibited; null records older public API');
}
if (process.platform === 'darwin') assert.equal(parent.termProgram, 'iTerm.app');
assert.equal(parent.file, seed.file);
assert.equal(read('parent.json').leaf, parent.leaf);
assert.equal(read('parent.json').unchanged, true);
assert.ok(Date.now() - read('parent.json').observedAt < 2000, 'live parent observation required');
assert.equal(readFileSync(seed.file, 'utf8'), parent.bytes);
assert.equal(children.length, 2);
const clone = read(read('clone-child.json').file);
const fork = children.find(child => child.pid !== clone.pid);
assert.ok(children.some(child => child.pid === clone.pid), 'recorded clone must be a reported child');
assert.equal(clone.texts.length, 4, '/clone-window must retain all four messages');
assert.equal(fork?.texts.length, 2, '/fork-window must stop before the selected second user message');
assert.equal(new Set(children.map(child => child.file)).size, 2);
assert.equal(new Set([parent.pid, ...children.map(child => child.pid)]).size, 3);
for (const child of children) {
    assert.equal(child.cwd, seed.cwd);
    assert.notEqual(child.file, seed.file);
    assert.equal(child.parentSession, seed.file);
    assert.deepEqual(child.texts, ['fixture first user', 'fixture first assistant', 'fixture second user', 'fixture second assistant'].slice(0, child.texts.length));
    if (process.platform === 'darwin') assert.equal(child.termProgram, 'iTerm.app');
    const marker = read(`marker-${child.pid}.json`);
    assert.equal(marker.runtime, null);
    assert.equal(marker.catalog, 'fixture-catalog-only');
    assert.deepEqual(marker.args, ['--session', child.file]);
}
writeFileSync(join(root, 'result.json'), JSON.stringify({ pass: true, scope: 'real-parent-tui/native-child-tui/pi-h-marker-not-Harness', parent, children }));
