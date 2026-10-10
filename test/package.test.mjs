import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

test("macOS uses the stable iTerm bundle ID and preserves native Terminal selection", () => {
	const source = readFileSync(join(root, "extensions/session-window.ts"), "utf8");
	assert.match(source, /process\.env\.TERM_PROGRAM === "iTerm\.app"\s*\? `tell application id "com\.googlecode\.iterm2" to create window with default profile command \$\{appleScriptQuote\(command\)\}`\s*:\s*`tell application "Terminal" to do script \$\{appleScriptQuote\(command\)\}`/);
	assert.doesNotMatch(source, /tell application "iTerm2?"/);
});

test("RPC refuses window commands and blocks unregistered input without a model turn", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-session-window-rpc-"));
	const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
	for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET)$/i.test(key)) delete env[key];
	try {
		for (const name of ["clone-window", "fork-window", "window-test-missing-command"]) {
			const expected = name === "window-test-missing-command" ? "WINDOW_TEST_INPUT_BLOCKED" : `/${name} requires interactive mode`;
			const output = await new Promise((resolve, reject) => {
				const child = spawn("pi", ["--offline", "--mode", "rpc", "--no-extensions", "-e", root, "-e", join(root, "test/rpc-input-guard.ts")], { cwd: root, env });
				let text = "", pending = "", refused = false, sent = false, failure;
				const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`RPC refusal timeout: ${text}`)); }, 45000);
				child.stdout.on("data", (chunk) => {
					text += chunk; pending += chunk;
					let end;
					while ((end = pending.indexOf("\n")) >= 0) {
						const line = pending.slice(0, end); pending = pending.slice(end + 1);
						let message; try { message = JSON.parse(line); } catch { continue; }
						if (message.command !== "get_commands" || sent) continue;
						const commands = message.data?.commands ?? [];
						if (!["window-test-input-guard", "clone-window", "fork-window"].every(command => commands.filter(item => item.name === command).length === 1)) {
							failure = "Required commands/guard missing; no prompt sent"; child.kill("SIGTERM"); return;
						}
						sent = true;
						child.stdin.write(JSON.stringify({ type: "prompt", message: `/${name}` }) + "\n");
					}
					if (text.includes(expected)) { refused = true; child.kill("SIGTERM"); }
					else if (text.includes("WINDOW_TEST_INPUT_BLOCKED")) { failure = "Registered command reached ordinary input"; child.kill("SIGTERM"); }
				});
				child.stderr.on("data", (chunk) => { text += chunk; });
				child.once("error", (error) => { clearTimeout(timer); reject(error); });
				child.once("close", () => {
					clearTimeout(timer);
					if (refused && !failure) resolve(text); else reject(new Error(`${failure ?? "RPC exited without refusal"}: ${text}`));
				});
				child.stdin.write('{"type":"get_commands"}\n');
			});
			assert.doesNotMatch(output, /New window failed|Nothing to clone|No user messages|agent_start/);
		}
	} finally { rmSync(agentDir, { recursive: true, force: true }); }
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
