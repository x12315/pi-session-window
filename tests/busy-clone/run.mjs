import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { shellQuote } from "../../extensions/window-launcher.mjs";
import { verifyClonedPrefix } from "./verify-snapshot.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = mkdtempSync(join(tmpdir(), "pi-busy-clone-"));
const socket = join(root, "tmux.sock");
const tmuxConfig = join(root, "tmux.conf");
writeFileSync(tmuxConfig, "set -g extended-keys on\nset -g extended-keys-format csi-u\n");
const find = (name) => {
	const result = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
	assert.equal(result.status, 0, `${name} is required; this test cannot be skipped`);
	return result.stdout.trim();
};
const pi = find("pi"), tmuxExecutable = find("tmux");
const home = join(root, "home"), agentDir = join(root, "parent-agent"), bin = join(root, "bin");
for (const dir of [home, agentDir, bin, join(home, ".pi/agent")]) mkdirSync(dir, { recursive: true });
const env = { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDir, WINDOW_ROOT: root, BUSY_WINDOW_ROOT: root, BUSY_WINDOW_STAGE: "parent", PATH: `${bin}:${process.env.PATH}` };
for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET)$/i.test(key)) delete env[key];
delete env.PI_CODING_AGENT_SESSION_DIR;
delete env.HARNESS_CATALOG;
env.NO_PROXY = env.no_proxy = "127.0.0.1,localhost";
env.DISPLAY = ":busy-fixture";
const read = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const tmux = (...args) => {
	const result = spawnSync(tmuxExecutable, ["-S", socket, "-f", tmuxConfig, ...args], { env, encoding: "utf8" });
	assert.equal(result.status, 0, `tmux ${args.join(" ")}: ${result.stderr}`);
	return result.stdout;
};
const pane = (name) => tmux("capture-pane", "-p", "-t", name);
async function wait(check, description) {
	const deadline = Date.now() + 12000;
	while (Date.now() < deadline) {
		if (check()) return;
		await delay(60);
	}
	throw new Error(`Timed out: ${description}; evidence=${root}\n${pane("parent")}`);
}
const send = (name, text) => { tmux("send-keys", "-t", name, "-l", text); tmux("send-keys", "-t", name, "Enter"); };
const records = (prefix) => readdirSync(root).filter((file) => file.startsWith(prefix));
let releaseStream;
const childRequests = [];
const errors = [];
const server = createServer(async (request, response) => {
	try {
		let data = "";
		for await (const chunk of request) data += chunk;
		const body = JSON.parse(data);
		const last = body.messages.at(-1);
		const text = typeof last.content === "string" ? last.content : (last.content ?? []).map((part) => part.text ?? "").join("");
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
		const finish = (text) => { chunk({ content: text }); chunk({}, "stop"); response.end("data: [DONE]\n\n"); };
		if (last.role === "user" && text === "stream job") {
			chunk({ role: "assistant", content: "PARENT_STREAMING" });
			releaseStream = () => finish(" PARENT_DONE");
		} else if (last.role === "user" && text === "tool job") {
			chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_busy", type: "function", function: { name: "window_test_wait", arguments: "{}" } }] });
			chunk({}, "tool_calls"); response.end("data: [DONE]\n\n");
		} else if (last.role === "tool") {
			finish("PARENT_DONE");
		} else if (last.role === "user" && text === "child task") {
			childRequests.push(body.messages);
			finish("CHILD_DONE");
		} else {
			throw new Error(`Unexpected mock request: ${JSON.stringify(last)}`);
		}
	} catch (error) {
		errors.push(String(error));
		writeFileSync(join(root, "mock-errors.json"), JSON.stringify(errors));
		response.destroy();
	}
});
try {
	await new Promise((done) => server.listen(0, "127.0.0.1", done));
	const models = { providers: { "window-fixture": { api: "openai-completions", apiKey: "fixture", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, models: [{ id: "fixture", name: "Local window fixture", contextWindow: 32000, maxTokens: 512, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } };
	for (const dir of [agentDir, join(home, ".pi/agent")]) writeFileSync(join(dir, "models.json"), JSON.stringify(models));
	const flags = ["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files"];
	const seeded = spawnSync(pi, [...flags, "--mode", "rpc", "-e", join(repo, "tests/sandbox/window-common/parent-probe.ts")], { env: { ...env, WINDOW_SEED: "1", WINDOW_SNAPSHOT_HISTORY: "1" }, input: "", encoding: "utf8", timeout: 12000 });
	assert.equal(seeded.status, 0, seeded.stderr);
	const seed = read("seed.json");
	const probe = join(repo, "tests/busy-clone/probe.ts");
	const childCommand = [pi, ...flags, "--provider", "window-fixture", "--model", "fixture", "-e", probe].map(shellQuote).join(" ");
	writeFileSync(join(bin, "pi-h"), `#!/bin/sh\nexport BUSY_WINDOW_STAGE=child\nexec ${childCommand} "$@"\n`, { mode: 0o700 });
	const terminal = `#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');const a=process.argv.slice(2);const launcher=a[1]?.startsWith('tell application')?a[1].match(/\\/bin\\/sh '([^']+)'/)[1]:a.at(-1);const root=${JSON.stringify(root)};const counter=root+'/child-count';const n=fs.existsSync(counter)?Number(fs.readFileSync(counter))+1:1;fs.writeFileSync(counter,String(n));const q=s=>"'"+s.replaceAll("'","'\\\\''")+"'";const r=cp.spawnSync(${JSON.stringify(tmuxExecutable)},['-S',${JSON.stringify(socket)},'new-session','-d','-s','child-'+n,'-x','96','-y','28','/bin/sh '+q(launcher)],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exit(1)}\n`;
	for (const name of ["osascript", "x-terminal-emulator"]) writeFileSync(join(bin, name), terminal, { mode: 0o700 });
	const parentCommand = [pi, ...flags, "--provider", "window-fixture", "--model", "fixture", "-e", join(repo, "extensions/session-window.ts"), "-e", probe, "--session", seed.file].map(shellQuote).join(" ");
	tmux("new-session", "-d", "-s", "parent", "-x", "96", "-y", "28", `cd ${shellQuote(seed.cwd)} && ${parentCommand}`);
	await wait(() => records("parent-start-").length === 1, "parent TUI session_start");
	const parentStart = read(records("parent-start-")[0]);
	assert.equal(parentStart.mode, "tui"); assert.equal(parentStart.tty, true);
	const observedChildren = new Set();
	for (const [index, job] of ["stream job", "tool job"].entries()) {
		const stage = index === 0 ? "streaming" : "tool-running";
		if (existsSync(join(root, `parent-end-${parentStart.pid}.json`))) rmSync(join(root, `parent-end-${parentStart.pid}.json`));
		send("parent", job);
		await wait(() => existsSync(join(root, `parent-${stage}.json`)), `${job} active`);
		if (index === 0) assert.equal(read("parent-streaming.json").busy, true);
		const bytes = readFileSync(seed.file, "utf8");
		send("parent", "/clone-window");
		await wait(() => records("child-start-").length === index + 1, "child TUI started while parent busy");
		assert.equal(readFileSync(seed.file, "utf8"), bytes, "cloning must not mutate the running parent");
		assert.ok(!existsSync(join(root, `parent-end-${parentStart.pid}.json`)), "parent must still be running");
		assert.ok(!existsSync(join(root, "parent-tool-aborted.json")));
		assert.ok(!existsSync(join(root, "parent-unexpected-input.json")), "clone command must not become queued model input");
		const children = records("child-start-").map(read);
		const child = children.find((item) => !observedChildren.has(item.pid));
		assert.ok(child, "a distinct child process must start");
		observedChildren.add(child.pid);
		assert.equal(child.mode, "tui"); assert.equal(child.tty, true); assert.equal(child.agentDir, null);
		const childFile = readFileSync(child.file, "utf8");
		const snapshot = verifyClonedPrefix(bytes, childFile, index === 1 ? "call_busy" : undefined);
		console.log(`CLONE_PREFIX_PASS ${JSON.stringify(snapshot)}`);
		if (index === 0) assert.ok(!childFile.includes("PARENT_STREAMING"), "unfinished reply must not be cloned");
		else assert.ok(!childFile.includes("call_busy"), "outstanding tool call must not be cloned");
		assert.equal(JSON.parse(childFile.split("\n")[0]).parentSession, realpathSync(seed.file));
		send(`child-${index + 1}`, "child task");
		await wait(() => childRequests.length === index + 1 && pane(`child-${index + 1}`).includes("CHILD_DONE"), "child accepts independent task");
		assert.ok(!existsSync(join(root, `parent-end-${parentStart.pid}.json`)), "child task must not stop parent task");
		if (index === 0) releaseStream(); else writeFileSync(join(root, "release-tool"), "release");
		await wait(() => existsSync(join(root, `parent-end-${parentStart.pid}.json`)), "parent continues and finishes");
		if (index === 1) assert.equal(read("parent-tool-completed.json").done, true);
		console.log(`${job}: parent continued; child accepted a new task; incomplete context excluded`);
	}
	assert.deepEqual(errors, []);
	assert.equal(childRequests.length, 2);
	console.log("BUSY_CLONE_TUI_PASS (mock local model and terminal launcher; no GUI acceptance)");
} catch (error) {
	writeFileSync(join(root, "failure.txt"), JSON.stringify({ error: String(error), mockErrors: errors }));
	console.error(`Failure evidence retained: ${root}`);
	throw error;
} finally {
	spawnSync(tmuxExecutable, ["-S", socket, "kill-server"], { env });
	server.closeAllConnections();
	await new Promise((done) => server.close(done));
	if (!existsSync(join(root, "failure.txt"))) rmSync(root, { recursive: true, force: true });
}
