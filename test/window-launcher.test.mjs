import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { shellQuote, windowResumeCommand } from "../extensions/window-launcher.mjs";

function fixture(action) {
	const root = mkdtempSync(join(tmpdir(), "window-launch-test-"));
	const bin = join(root, "bin"); mkdirSync(bin);
	const stub = (name, code = 0) => writeFileSync(join(bin, name), `#!/bin/sh\n${code ? `exit ${code}` : `exec ${shellQuote(process.execPath)} -e ${shellQuote('console.log(JSON.stringify({args:process.argv.slice(1),runtime:process.env.PI_CODING_AGENT_DIR??null,catalog:process.env.HARNESS_CATALOG??null}))')} -- "$@"`}\n`, { mode: 0o755 });
	const env = { ...process.env, PATH: `${bin}${delimiter}/usr/bin${delimiter}/bin`, PI_CODING_AGENT_DIR: "/isolated/parent/profile", HARNESS_CATALOG: "/catalog with spaces/owner's config" };
	try { action({ root, bin, stub, env }); }
	finally { rmSync(root, { recursive: true, force: true }); }
}

test("Window launch prefers pi-h and resumes a literal session without inheriting isolation", () => fixture(({ stub, env }) => {
	stub("pi"); stub("pi-h");
	const file = "/sessions/owner's conversation; echo unexpected.jsonl";
	const command = windowResumeCommand(file, env);
	assert.match(command, /pi-h'/);
	const result = JSON.parse(execFileSync("/bin/sh", ["-c", command], { env, encoding: "utf8" }));
	assert.deepEqual(result.args, ["--session", file]);
	assert.equal(result.runtime, null); assert.equal(result.catalog, env.HARNESS_CATALOG);
	assert.equal(env.PI_CODING_AGENT_DIR, "/isolated/parent/profile", "parent environment is untouched");
	assert.doesNotMatch(command, /--approve|--model|--thinking|ultralight|heavy|medium/);
}));

test("pi-h preference spans PATH directories; native Pi remains a fallback when unavailable", () => fixture(({ root, stub, env }) => {
	stub("pi");
	let command = windowResumeCommand("/sessions/native.jsonl", env);
	assert.match(command, /bin\/pi'/);
	const later = join(root, "later"); mkdirSync(later);
	writeFileSync(join(later, "pi-h"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
	command = windowResumeCommand("/sessions/ordinary.jsonl", { ...env, PATH: `${env.PATH}${delimiter}${later}` });
	assert.match(command, /later\/pi-h'/);
}));

test("A failing pi-h does not silently retry native Pi", () => fixture(({ stub, env }) => {
	stub("pi"); stub("pi-h", 13);
	const result = spawnSync("/bin/sh", ["-c", windowResumeCommand("/sessions/branch.jsonl", env)], { env, encoding: "utf8" });
	assert.equal(result.status, 13); assert.equal(result.stdout, "");
}));

test("Missing entrypoints still produce a literal recoverable session command", () => {
	const command = windowResumeCommand("/session with spaces.jsonl", { PATH: "/nonexistent" });
	assert.equal(command, "env -u PI_CODING_AGENT_DIR 'pi-h' --session '/session with spaces.jsonl'");
});

for (const scenario of [
	{ name: "normal Pi exit", code: 0 },
	{ name: "failed Pi exit", code: 7 },
	{ name: "interrupted Pi exit", code: 130 },
	{ name: "missing working directory", missingCwd: true },
]) {
	test(`Window launcher hands off to a login shell after ${scenario.name}`, () => fixture(({ root, bin, env }) => {
		const source = readFileSync(new URL("../extensions/session-window.ts", import.meta.url), "utf8");
		const template = source.match(/writeFileSync\(launcher, (`[\s\S]*?`), \{ mode: 0o600 \}\)/)?.[1];
		assert.ok(template, "Exercise the actual extension launcher template");
		const dir = join(root, "launcher"); mkdirSync(dir);
		const cwd = join(root, "project's directory");
		if (!scenario.missingCwd) mkdirSync(cwd);
		const shell = join(bin, "user's shell");
		const shellOutput = 'console.log("SHELL_READY "+JSON.stringify({args:process.argv.slice(1),cwd:process.cwd()}))';
		writeFileSync(shell, `#!/bin/sh\nexec ${shellQuote(process.execPath)} -e ${shellQuote(shellOutput)} -- "$@"\n`, { mode: 0o755 });
		writeFileSync(join(bin, "pi-h"), `#!/bin/sh\nexit ${scenario.code ?? 0}\n`, { mode: 0o755 });
		const launcherEnv = { ...env, SHELL: shell };
		const script = runInNewContext(template, {
			process: { env: launcherEnv }, dir, cwd, sessionFile: "/sessions/branch.jsonl",
			shellQuote, windowResumeCommand: (file) => windowResumeCommand(file, launcherEnv),
		});
		const launcher = join(dir, "launch.sh"); writeFileSync(launcher, script);
		const result = spawnSync("/bin/sh", [launcher], { env: launcherEnv, cwd: root, encoding: "utf8", timeout: 5000 });
		assert.equal(result.status, 0, result.stderr);
		const ready = result.stdout.split("\n").find(line => line.startsWith("SHELL_READY "));
		assert.ok(ready, `No shell after ${scenario.name}: ${result.stdout}`);
		assert.deepEqual(JSON.parse(ready.slice("SHELL_READY ".length)), { args: ["-l"], cwd: realpathSync(scenario.missingCwd ? root : cwd) });
		if (scenario.code) assert.match(result.stdout, new RegExp(`Pi exited with status ${scenario.code}\\.`));
		else assert.doesNotMatch(result.stdout, /Pi exited with status/);
		if (scenario.missingCwd) assert.match(result.stdout, /Could not open session directory/);
		assert.equal(existsSync(dir), false, "Temporary launcher directory is removed");
	}));
}
