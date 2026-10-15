import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import windowExtension from "../extensions/session-window.ts";
import { shellQuote } from "../extensions/window-launcher.mjs";

/** Exercise both handlers with real session storage and a synthetic UI; no terminal or model is started. */
export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, runtime) => {
		const root = realpathSync(process.env.WINDOW_TEST_ROOT!);
		const resultFile = join(root, "result.json");
		const originalPath = process.env.PATH;
		try {
			const sessions = join(root, "agent/sessions");
			const instance = join(root, "instances/launch-parent");
			mkdirSync(sessions, { recursive: true });
			mkdirSync(instance, { recursive: true });
			symlinkSync(sessions, join(instance, "sessions"), "dir");
			const manager = SessionManager.create(root, join(instance, "sessions/project"));
			const assistant = (text: string) => ({ role: "assistant" as const, content: [{ type: "text" as const, text }], api: "anthropic-messages", provider: "anthropic", model: "fixture-no-request", stopReason: "stop" as const, timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
			manager.appendMessage({ role: "user", content: "first user", timestamp: Date.now() });
			manager.appendMessage(assistant("first assistant"));
			const secondUser = manager.appendMessage({ role: "user", content: "second user", timestamp: Date.now() });
			manager.appendMessage(assistant("second assistant"));
			const source = manager.getSessionFile()!;
			const durableSource = realpathSync(source);
			const before = readFileSync(source, "utf8");
			const leaf = manager.getLeafId();
			const commands = new Map();
			windowExtension({ registerCommand: (name, command) => commands.set(name, command) } as ExtensionAPI);
			const notifications: string[] = [];
			const ctx = {
				mode: "tui", cwd: root, sessionManager: manager, isIdle: () => true,
				ui: { notify: (message: string) => notifications.push(message), custom: async () => secondUser },
			} as unknown as ExtensionCommandContext;
			// Force manual recovery instead of opening a real GUI or copying to the clipboard.
			process.env.PATH = "";
			for (const name of ["clone-window", "fork-window"]) await commands.get(name).handler("", ctx);
			assert.equal(manager.getSessionFile(), source);
			assert.equal(manager.getLeafId(), leaf);
			assert.equal(readFileSync(source, "utf8"), before, "parent session must be unchanged");
			const branches = readdirSync(join(sessions, "project")).map((file) => join(sessions, "project", file)).filter((file) => file !== durableSource);
			assert.equal(branches.length, 2);
			assert.equal(notifications.length, 2);
			const children = branches.map((file) => {
				assert.ok(notifications.some((message) => message.includes(`--session ${shellQuote(file)}`)), "resume command must use the permanent path");
				const child = SessionManager.open(file);
				assert.equal(child.getHeader()?.parentSession, durableSource);
				return child;
			});
			assert.deepEqual(children.map((child) => child.getEntries().filter((entry) => entry.type === "message").length).sort(), [2, 4]);
			rmSync(instance, { recursive: true, force: true });
			assert.equal(existsSync(source), false, "simulate old runtime cleanup");
			for (const child of children) child.appendSessionInfo("saved after parent runtime cleanup");
			assert.equal(readFileSync(durableSource, "utf8"), before);
			writeFileSync(resultFile, JSON.stringify({ pass: true }));
		} catch (error) {
			writeFileSync(resultFile, JSON.stringify({ pass: false, error: String(error) }));
		} finally {
			if (originalPath === undefined) delete process.env.PATH;
			else process.env.PATH = originalPath;
			runtime.shutdown();
		}
	});
}
