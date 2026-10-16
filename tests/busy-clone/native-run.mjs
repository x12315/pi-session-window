import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { shellQuote } from "../../extensions/window-launcher.mjs";
import { xwdToPng } from "./xwd-png.mjs";
import { verifyClonedPrefix } from "./verify-snapshot.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-busy-native-")));
const linux = process.platform === "linux";
assert.ok(linux || process.platform === "darwin");
const home = join(root, "home"), agentDir = join(root, "parent-agent"), bin = join(root, "bin"), socket = join(root, "tmux.sock");
for (const dir of [home, agentDir, bin]) mkdirSync(dir, { recursive: true });
const env = { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDir, WINDOW_ROOT: root, BUSY_WINDOW_ROOT: root, BUSY_WINDOW_STAGE: "parent", BUSY_TOOL_BUDGET_MS: "60000", PATH: `${bin}:${process.env.PATH}`, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET)$/i.test(key)) delete env[key];
delete env.PI_CODING_AGENT_SESSION_DIR;
delete env.HARNESS_CATALOG;
if (linux) env.DISPLAY = ":87";
const exec = (command, args, options = {}) => {
	const result = spawnSync(command, args, { env, encoding: "utf8", timeout: 15000, ...options });
	assert.ifError(result.error); assert.equal(result.status, 0, `${command}: ${result.stderr}`);
	return result.stdout;
};
const find = (name) => exec("sh", ["-c", `command -v ${name}`]).trim();
const pi = find("pi"), node = process.execPath, tmuxExecutable = linux ? find("tmux") : undefined;
const read = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const records = (prefix) => readdirSync(root).filter((file) => file.startsWith(prefix));
async function wait(check, description) {
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline) { if (check()) return; await delay(100); }
	throw Error(`Timed out: ${description}; no permission grants attempted`);
}
const tmux = (...args) => exec(tmuxExecutable, ["-S", socket, ...args]);
const apple = (script, args = []) => exec("/usr/bin/osascript", ["-", ...args], { input: `with timeout of 12 seconds\n${script}\nend timeout\n` });
const windows = () => JSON.parse(exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", `ObjC.import('CoreGraphics');ObjC.import('Foundation');JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1,0))).filter(w=>['iTerm2','iTerm'].includes(w.kCGWindowOwnerName)&&w.kCGWindowLayer===0&&w.kCGWindowAlpha>0).map(w=>w.kCGWindowNumber))`]));
let parentWindow;
function inputWindow(index, text) {
	exec("/usr/bin/pbcopy", [], { input: text });
	apple(`tell application "System Events"\n tell process "iTerm2" to set frontmost to true\n keystroke "${index}" using {command down, option down}\n delay 0.2\n keystroke "u" using control down\n keystroke "v" using command down\n delay 0.2\n key code 36\nend tell`);
}
function send(name, text, index) {
	if (linux) { tmux("send-keys", "-t", name, "-l", text); tmux("send-keys", "-t", name, "Enter"); }
	else inputWindow(index, text);
}
let releaseStream, xvfb, parentTerminal;
const childRequests = [], errors = [], evidence = [];
const server = createServer(async (request, response) => {
	try {
		let data = ""; for await (const chunk of request) data += chunk;
		const body = JSON.parse(data), last = body.messages.at(-1);
		const text = typeof last.content === "string" ? last.content : (last.content ?? []).map((part) => part.text ?? "").join("");
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
		const finish = (text) => { chunk({ content: text }); chunk({}, "stop"); response.end("data: [DONE]\n\n"); };
		if (last.role === "user" && text === "stream job") {
			chunk({ role: "assistant", content: "PARENT_STREAMING" }); releaseStream = () => finish(" PARENT_DONE");
		} else if (last.role === "user" && text === "tool job") {
			chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_busy", type: "function", function: { name: "window_test_wait", arguments: "{}" } }] });
			chunk({}, "tool_calls"); response.end("data: [DONE]\n\n");
		} else if (last.role === "tool") finish("PARENT_DONE");
		else if (last.role === "user" && text === "child task") { childRequests.push(body.messages); finish("CHILD_DONE"); }
		else throw Error(`Unexpected fixture input role=${last.role}`);
	} catch (error) { errors.push(String(error)); response.destroy(); }
});
try {
	console.log(`nativeBusyStage=setup platform=${process.platform} pi=${exec(pi, ["--version"]).trim()} node=${process.version}`);
	await new Promise((done) => server.listen(0, "127.0.0.1", done));
	const models = { providers: { "window-fixture": { api: "openai-completions", apiKey: "fixture", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, models: [{ id: "fixture", name: "Local fixture", contextWindow: 32000, maxTokens: 512, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } };
	const prepareRuntime = (dir) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "models.json"), JSON.stringify(models)); writeFileSync(join(dir, "settings.json"), '{"cacheWarming":"off"}'); };
	prepareRuntime(agentDir); writeFileSync(join(root, "models.json"), JSON.stringify(models));
	const flags = ["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files"];
	exec(pi, [...flags, "--mode", "rpc", "-e", join(repo, "tests/sandbox/window-common/parent-probe.ts")], { env: { ...env, WINDOW_SEED: "1", WINDOW_SNAPSHOT_HISTORY: "1" }, input: "" });
	const seed = read("seed.json"), probe = join(repo, "tests/busy-clone/probe.ts");
	const child = [pi, ...flags, "--provider", "window-fixture", "--model", "fixture", "-e", probe].map(shellQuote).join(" ");
	const marker = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(root)}+'/launch-'+process.ppid+'.json',JSON.stringify({pid:process.ppid,inheritedRuntime:process.env.PI_CODING_AGENT_DIR??null,args:process.argv.slice(1)}));`;
	const childCount = `const fs=require('node:fs'),f=${JSON.stringify(root)}+'/child-count';const n=fs.existsSync(f)?Number(fs.readFileSync(f))+1:1;fs.writeFileSync(f,String(n));process.stdout.write(String(n));`;
	const exports = Object.entries(env).filter(([key]) => ["HOME", "PATH", "BUSY_WINDOW_ROOT", "WINDOW_ROOT", "BUSY_TOOL_BUDGET_MS", "NO_PROXY", "no_proxy"].includes(key)).map(([key, value]) => `export ${key}=${shellQuote(value)}`).join("\n");
	writeFileSync(join(bin, "pi-h"), `#!/bin/sh\n${exports}\n${shellQuote(node)} -e ${shellQuote(marker)} -- "$@"\nexport BUSY_WINDOW_STAGE=child PI_CODING_AGENT_DIR=${shellQuote(root)}/child-runtime-$$\nmkdir -p "$PI_CODING_AGENT_DIR"\ncp ${shellQuote(join(root, "models.json"))} "$PI_CODING_AGENT_DIR/models.json"\nprintf '{"cacheWarming":"off"}' > "$PI_CODING_AGENT_DIR/settings.json"\n${linux ? `n=$(${shellQuote(node)} -e ${shellQuote(childCount)})\nexec ${shellQuote(tmuxExecutable)} -S ${shellQuote(socket)} new-session -s "child-$n" -e BUSY_WINDOW_STAGE=child -e PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" ${child}` : `exec ${child}`} "$@"\n`, { mode: 0o700 });
	const parent = [pi, ...flags, "--provider", "window-fixture", "--model", "fixture", "-e", join(repo, "extensions/session-window.ts"), "-e", probe, "--session", seed.file].map(shellQuote).join(" ");
	writeFileSync(join(root, "parent.sh"), `#!/bin/sh\n${Object.entries(env).filter(([key]) => !/(?:API_KEY|TOKEN|SECRET)$/i.test(key)).map(([key, value]) => `export ${key}=${shellQuote(value)}`).join("\n")}\ncd ${shellQuote(seed.cwd)}\nexec ${parent}\n`, { mode: 0o700 });
	if (linux) {
		for (const command of ["Xvfb", "xterm", "xwininfo"]) find(command);
		env.DISPLAY = ":87";
		xvfb = spawn("Xvfb", [env.DISPLAY, "-screen", "0", "1280x800x24", "-nolisten", "tcp", "-fbdir", root], { env, stdio: "ignore" });
		await wait(() => spawnSync("xwininfo", ["-root"], { env, stdio: "ignore" }).status === 0, "guest X11 ready");
		const launch = `export DISPLAY=:87; /bin/sh ${shellQuote(join(root, "parent.sh"))}`;
		const tmuxConfig = join(root, "tmux.conf");
		writeFileSync(tmuxConfig, "set -g extended-keys on\nset -g extended-keys-format csi-u\n");
		parentTerminal = spawn("xterm", ["-T", "Busy clone parent", "-e", tmuxExecutable, "-S", socket, "-f", tmuxConfig, "new-session", "-s", "parent", launch], { env, stdio: "ignore" });
	} else {
		exec("/usr/bin/open", ["-b", "com.googlecode.iterm2"]);
		parentWindow = Number(apple(`tell application "System Events"\n repeat 40 times\n  if exists process "iTerm2" then\n   tell process "iTerm2"\n    set frontmost to true\n    if frontmost and (count windows) > 0 then exit repeat\n   end tell\n  end if\n  delay 0.2\n end repeat\n tell process "iTerm2"\n  if exists button "No" of window 1 then\n   if (value of every static text of window 1) contains "See Tips of the Day?" then click button "No" of window 1\n  end if\n  set beforeCount to count windows\n end tell\n keystroke "n" using command down\n repeat 40 times\n  tell process "iTerm2" to set afterCount to count windows\n  if afterCount > beforeCount then exit repeat\n  delay 0.2\n end repeat\n if afterCount <= beforeCount then error "native parent window not ready"\n return afterCount\nend tell`).trim());
		inputWindow(parentWindow, `/bin/sh ${shellQuote(join(root, "parent.sh"))}`);
	}
	await wait(() => records("parent-start-").length === 1, "real parent TUI started");
	const parentStart = read(records("parent-start-")[0]);
	assert.ok(parentStart.tty && parentStart.hasUI && (parentStart.mode === "tui" || parentStart.mode === null));
	const beforeWindows = linux ? null : windows();
	const observed = new Set();
	for (const [index, job] of ["stream job", "tool job"].entries()) {
		const end = join(root, `parent-end-${parentStart.pid}.json`); if (existsSync(end)) rmSync(end);
		send("parent", job, parentWindow);
		await wait(() => existsSync(join(root, `parent-${index === 0 ? "streaming" : "tool-running"}.json`)), `${job} busy`);
		if (index === 0) assert.equal(read("parent-streaming.json").busy, true);
		const bytes = readFileSync(seed.file, "utf8");
		send("parent", "/clone-window", parentWindow);
		await wait(() => records("child-start-").length === index + 1, "new native child while parent busy");
		assert.equal(readFileSync(seed.file, "utf8"), bytes);
		assert.ok(!existsSync(end) && !existsSync(join(root, "parent-tool-aborted.json")) && !existsSync(join(root, "parent-unexpected-input.json")));
		const childStart = records("child-start-").map(read).find((item) => !observed.has(item.pid));
		assert.ok(childStart.tty && childStart.hasUI && (childStart.mode === "tui" || childStart.mode === null));
		assert.notEqual(childStart.pid, parentStart.pid); observed.add(childStart.pid);
		assert.notEqual(childStart.agentDir, agentDir);
		const launchMarker = records("launch-").map(read).find((item) => item.args.includes(childStart.file));
		assert.ok(launchMarker); assert.equal(launchMarker.inheritedRuntime, null);
		const childBytes = readFileSync(childStart.file, "utf8");
		const snapshot = verifyClonedPrefix(bytes, childBytes, index === 1 ? "call_busy" : undefined);
		assert.ok(!childBytes.includes(index === 0 ? "PARENT_STREAMING" : "call_busy"));
		assert.equal(JSON.parse(childBytes.split("\n")[0]).parentSession, realpathSync(seed.file));
		send(`child-${index + 1}`, "child task", parentWindow + index + 1);
		await wait(() => childRequests.length === index + 1 && existsSync(join(root, `child-end-${childStart.pid}.json`)), "child independent task finishes before parent release");
		assert.ok(readFileSync(childStart.file, "utf8").includes("CHILD_DONE")); assert.ok(!existsSync(end));
		if (index === 0) releaseStream(); else writeFileSync(join(root, "release-tool"), "release");
		await wait(() => existsSync(end), "parent completes without cancellation");
		if (index === 1) assert.equal(read("parent-tool-completed.json").done, true);
		evidence.push({ job, parentPid: parentStart.pid, childPid: childStart.pid, childFile: childStart.file, ...snapshot, childTaskDone: true, parentCompleted: true, incompleteExcluded: true });
		console.log(`nativeBusyStage=PASS job=${job}`);
	}
	assert.deepEqual(errors, []); assert.equal(childRequests.length, 2); assert.equal(observed.size, 2);
	if (linux) {
		const tree = exec("xwininfo", ["-root", "-tree"]);
		assert.ok((tree.match(/"XTerm"/g) ?? []).length >= 3);
		writeFileSync(join(root, "windows.txt"), tree);
		const ids = [...tree.matchAll(/(0x[0-9a-f]+) .*"XTerm"/g)].map((match) => match[1]);
		for (const id of ids) assert.ok(exec("xwininfo", ["-id", id]).includes("Map State: IsViewable"));
		for (const name of ["parent", "child-1", "child-2"]) assert.ok(!tmux("capture-pane", "-p", "-t", name).includes("Warning:"), "native TUI warnings must be resolved, not hidden");
		mkdirSync("/tmp/ah-artifacts/native-busy", { recursive: true });
		writeFileSync("/tmp/ah-artifacts/native-busy/gui.png", xwdToPng(readFileSync(join(root, "Xvfb_screen0"))));
	} else {
		const after = windows();
		assert.equal(after.filter((id) => !beforeWindows.includes(id)).length, 2);
		assert.ok(beforeWindows.every((id) => after.includes(id)));
		apple(`tell application "System Events"\n tell process "iTerm2"\n  repeat with targetWindow in windows\n   repeat with element in (entire contents of targetWindow)\n    try\n     set elementName to name of element as text\n    on error\n     set elementName to ""\n    end try\n    if elementName contains "Always Allow" or elementName contains "Always Deny" then error "unanswered native terminal permission prompt"\n   end repeat\n  end repeat\n end tell\nend tell`);
		writeFileSync(join(root, "windows.json"), JSON.stringify({ before: beforeWindows, after }));
	}
	console.log(`NATIVE_BUSY_CLONE_PASS ${JSON.stringify({ platform: process.platform, parent: parentStart, cases: evidence, nativeWindows: 3, mockRequests: childRequests.length, launcher: "native-terminal/pi-h-marker-not-Harness" })}`);
} catch (error) {
	console.log(`NATIVE_BUSY_FAILURE ${JSON.stringify({ error: String(error), mockErrors: errors, files: records("parent-").concat(records("child-")) })}`);
	throw error;
} finally {
	server.closeAllConnections(); await new Promise((done) => server.close(done));
	if (linux) {
		if (xvfb) {
			mkdirSync("/tmp/ah-artifacts/native-busy", { recursive: true });
			const screen = spawnSync(tmuxExecutable, ["-S", socket, "capture-pane", "-p", "-t", "parent"], { env, encoding: "utf8" });
			writeFileSync("/tmp/ah-artifacts/native-busy/parent-screen.txt", screen.stdout ?? "");
			if (!existsSync("/tmp/ah-artifacts/native-busy/gui.png") && existsSync(join(root, "Xvfb_screen0"))) {
				try { writeFileSync("/tmp/ah-artifacts/native-busy/gui.png", xwdToPng(readFileSync(join(root, "Xvfb_screen0")))); }
				catch (error) { console.log(`NATIVE_SCREEN_FAILURE ${String(error)}`); }
			}
		}
		spawnSync(tmuxExecutable, ["-S", socket, "kill-server"], { env, stdio: "ignore" }); parentTerminal?.kill(); xvfb?.kill();
	}
	for (const file of readdirSync(root).filter((name) => name.endsWith(".json") && name !== "models.json")) console.log(`NATIVE_EVIDENCE ${file} ${readFileSync(join(root, file), "utf8")}`);
}
