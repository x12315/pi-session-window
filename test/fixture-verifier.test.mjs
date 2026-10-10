import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const verifier = existsSync(join(packageRoot, "verify.mjs")) ? join(packageRoot, "verify.mjs") : join(packageRoot, "tests/sandbox/window-common/verify.mjs");

test("Guest verifier accepts named branches and rejects swapped clone/fork results", () => {
	const root = mkdtempSync(join(tmpdir(), "window-verifier-test-"));
	const json = (name, value) => writeFileSync(join(root, name), JSON.stringify(value));
	try {
		const file = join(root, "parent.jsonl");
		writeFileSync(file, "synthetic parent bytes\n");
		json("seed.json", { file, cwd: root });
		json("parent-start.json", { pid: 1, mode: "tui", hasUI: true, stdinTTY: true, stdoutTTY: true, termProgram: "iTerm.app", file, leaf: "parent-leaf", bytes: readFileSync(file, "utf8") });
		json("parent.json", { leaf: "parent-leaf", unchanged: true, observedAt: Date.now() });
		const texts = ["fixture first user", "fixture first assistant", "fixture second user", "fixture second assistant"];
		for (const [pid, count] of [[2, 4], [3, 2]]) {
			const childFile = join(root, `branch-${pid}.jsonl`);
			json(`child-${pid}.json`, { pid, mode: "tui", hasUI: true, stdinTTY: true, stdoutTTY: true, termProgram: "iTerm.app", cwd: root, file: childFile, parentSession: file, texts: texts.slice(0, count) });
			json(`marker-${pid}.json`, { runtime: null, catalog: "fixture-catalog-only", args: ["--session", childFile] });
		}
		json("clone-child.json", { file: "child-2.json" });
		const run = () => spawnSync(process.execPath, [verifier], { env: { ...process.env, WINDOW_ROOT: root }, encoding: "utf8" });
		const valid = run();
		assert.equal(valid.status, 0, valid.stderr);
		for (const [pid, count] of [[2, 2], [3, 4]]) {
			const path = join(root, `child-${pid}.json`);
			json(`child-${pid}.json`, { ...JSON.parse(readFileSync(path, "utf8")), texts: texts.slice(0, count) });
		}
		const swapped = run();
		assert.notEqual(swapped.status, 0);
		assert.match(swapped.stderr, /clone-window must retain all four messages/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
