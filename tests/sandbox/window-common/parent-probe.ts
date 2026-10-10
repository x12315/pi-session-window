import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Seed persisted messages without a model; observe the real keyboard-driven parent without replacing its context. */
export default function (pi: ExtensionAPI) {
	const root = process.env.WINDOW_ROOT!;
	if (process.env.WINDOW_SEED === "1") {
		pi.on("session_start", (_event, ctx) => {
			const cwd = join(root, "workspace with spaces");
			mkdirSync(cwd);
			const manager = SessionManager.create(cwd, join(root, "sessions"));
			for (const text of ["fixture first", "fixture second"]) {
				manager.appendMessage({ role: "user", content: `${text} user`, timestamp: Date.now() });
				manager.appendMessage({ role: "assistant", content: [{ type: "text", text: `${text} assistant` }], api: "anthropic-messages", provider: "anthropic", model: "fixture-no-request", stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
			}
			const file = manager.getSessionFile()!;
			writeFileSync(join(root, "seed.json"), JSON.stringify({ file, cwd, leaf: manager.getLeafId(), bytes: readFileSync(file, "utf8") }));
			ctx.shutdown();
		});
		return;
	}
	let timer: ReturnType<typeof setInterval> | undefined;
	pi.on("input", (event) => {
		writeFileSync(join(root, "refused-input.json"), JSON.stringify({ text: event.text }));
		return { action: "handled" };
	});
	pi.on("session_shutdown", () => { if (timer) clearInterval(timer); });
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setTitle("Window fixture parent");
		writeFileSync(join(root, "parent-start.json"), JSON.stringify({ pid: process.pid, mode: ctx.mode ?? null, hasUI: ctx.hasUI, stdinTTY: process.stdin.isTTY === true, stdoutTTY: process.stdout.isTTY === true, termProgram: process.env.TERM_PROGRAM ?? null, file: ctx.sessionManager.getSessionFile(), leaf: ctx.sessionManager.getLeafId(), bytes: readFileSync(ctx.sessionManager.getSessionFile()!, "utf8") }));
		const before = JSON.parse(readFileSync(join(root, "parent-start.json"), "utf8"));
		timer = setInterval(() => {
			const file = ctx.sessionManager.getSessionFile();
			const leaf = ctx.sessionManager.getLeafId();
			writeFileSync(join(root, "parent.json"), JSON.stringify({ unchanged: file === before.file && leaf === before.leaf && readFileSync(before.file, "utf8") === before.bytes, file, leaf, observedAt: Date.now() }));
		}, 250);
	});
}
