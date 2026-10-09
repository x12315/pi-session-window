import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Window extension does not register automatic session cleanup", () => {
	const source = readFileSync(join(root, "extensions/session-window.ts"), "utf8");
	assert.doesNotMatch(source, /pi\.on\s*\(/, "No lifecycle handlers are registered");
	assert.doesNotMatch(source, /cloneRecord|markClone|renameSync|\.recycled-session-window|\.pi-session-window-clones/);
});

test("Pi loads both window commands from the package", () => {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-session-window-test-"));
	try {
		const result = spawnSync("pi", ["--offline", "--mode", "rpc", "-e", root], {
			cwd: root,
			env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
			input: '{"id":"1","type":"get_commands"}\n',
			encoding: "utf8",
			maxBuffer: 4 * 1024 * 1024,
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "", "Pi loads the extension without warnings");
		const response = result.stdout.split("\n").flatMap((line) => {
			try { return [JSON.parse(line)]; } catch { return []; }
		}).find((line) => line.command === "get_commands");
		assert.ok(response, "Pi returned a get_commands response");
		for (const name of ["clone-window", "fork-window"]) {
			assert.equal(response.data.commands.filter((command) => command.name === name).length, 1, `${name} is registered once`);
			assert.equal(response.data.commands.find((command) => command.name === name).source, "extension");
		}
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});
