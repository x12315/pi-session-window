import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
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
