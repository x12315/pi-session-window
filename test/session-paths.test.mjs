import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Clone and fork windows use permanent paths that survive parent runtime cleanup", () => {
	const fixture = mkdtempSync(join(tmpdir(), "window-session-paths-"));
	const env = { ...process.env, PI_CODING_AGENT_DIR: join(fixture, "runtime"), WINDOW_TEST_ROOT: fixture };
	delete env.PI_CODING_AGENT_SESSION_DIR;
	for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET)$/i.test(key)) delete env[key];
	try {
		const result = spawnSync("pi", ["--offline", "--mode", "rpc", "--no-extensions", "-e", join(root, "test/session-path-fixture.ts")], {
			cwd: fixture, env, input: "", encoding: "utf8", timeout: 30000,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "");
		assert.deepEqual(JSON.parse(readFileSync(join(fixture, "result.json"), "utf8")), { pass: true });
	} finally { rmSync(fixture, { recursive: true, force: true }); }
});
