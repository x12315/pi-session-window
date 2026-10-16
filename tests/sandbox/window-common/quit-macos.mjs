import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { shellQuote } from "../../../extensions/window-launcher.mjs";

assert.equal(process.platform, "darwin", "Run only inside the disposable macOS guest");
const root = process.env.WINDOW_ROOT;
assert.ok(root);
const run = (command, args, input) => {
	const result = spawnSync(command, args, { input, encoding: "utf8", timeout: 15000 });
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
};
const read = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const windows = () => JSON.parse(run("/usr/bin/osascript", ["-l", "JavaScript", "-e", `ObjC.import('CoreGraphics');ObjC.import('Foundation');JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1,0))).filter(w=>['iTerm2','iTerm'].includes(w.kCGWindowOwnerName)&&w.kCGWindowLayer===0&&w.kCGWindowAlpha>0).map(w=>w.kCGWindowNumber).sort((a,b)=>a-b))`]));
const inputWindow = (index, text) => {
	run("/usr/bin/pbcopy", [], text);
	run("/usr/bin/osascript", ["-e", `with timeout of 12 seconds
 tell application "System Events"
  tell process "iTerm2" to set frontmost to true
  keystroke "${index}" using {command down, option down}
  delay 0.2
  keystroke "u" using control down
  keystroke "v" using command down
  delay 0.2
  key code 36
 end tell
end timeout`]);
};
async function wait(check, description) {
	const end = Date.now() + 12000;
	while (Date.now() < end) { if (check()) return; await delay(100); }
	throw new Error(`Timed out: ${description}; no permission grants attempted`);
}
const parentIndex = Number(readFileSync(join(root, "parent-window-index.txt"), "utf8").trim());
assert.ok(Number.isInteger(parentIndex) && parentIndex > 0);
const cloneName = read("clone-child.json").file;
const forkNames = readdirSync(root).filter(name => /^child-\d+\.json$/.test(name) && name !== cloneName);
assert.equal(forkNames.length, 1);
const baseline = windows();
const results = [];
for (const [offset, name] of [cloneName, forkNames[0]].entries()) {
	const kind = offset === 0 ? "clone" : "fork";
	const child = read(name);
	const shellFile = join(root, `quit-shell-${kind}.json`);
	inputWindow(parentIndex + offset + 1, "/quit");
	await wait(() => {
		try { process.kill(child.pid, 0); return false; }
		catch (error) { if (error.code === "ESRCH") return true; throw error; }
	}, `${kind} Pi exits after /quit`);
	assert.deepEqual(windows(), baseline, `${kind} /quit must preserve every original native window ID`);
	const code = `const fs=require('node:fs'),cp=require('node:child_process');const shell=cp.execFileSync('/bin/ps',['-p',String(process.ppid),'-o','comm='],{encoding:'utf8'}).trim();fs.writeFileSync(${JSON.stringify(shellFile)},JSON.stringify({shell,pid:process.ppid,stdinTTY:process.stdin.isTTY===true,stdoutTTY:process.stdout.isTTY===true,termProgram:process.env.TERM_PROGRAM}));console.log('PI_QUIT_SHELL_READY ${kind}')`;
	inputWindow(parentIndex + offset + 1, `${shellQuote(process.execPath)} -e ${shellQuote(code)}`);
	await wait(() => existsSync(shellFile), `${kind} ordinary shell executes marker command`);
	const shell = read(`quit-shell-${kind}.json`);
	assert.match(shell.shell, /(?:^|\/)-?(?:zsh|bash|sh)$/);
	assert.equal(shell.stdinTTY, true); assert.equal(shell.stdoutTTY, true);
	assert.equal(shell.termProgram, "iTerm.app");
	assert.deepEqual(windows(), baseline);
	results.push({ kind, piPid: child.pid, piExited: true, shell, windowIds: baseline, windowsPreserved: true });
}
console.log(`NATIVE_QUIT_PASS ${JSON.stringify(results)}`);
