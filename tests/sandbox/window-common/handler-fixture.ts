import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import windowExtension from "../../extensions/session-window.ts";

/** Guest-only handler fixture: real SessionManager/launcher, synthetic parent UI (not keyboard TUI). */
export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, runtime) => {
		const root = process.env.WINDOW_ROOT!;
		const notifications: { message: string; level: string }[] = [];
		let stage = "prepare";
		const deadline = setTimeout(() => {
			writeFileSync(join(root, "result.json"), JSON.stringify({ pass: false, error: "handler fixture exceeded 60 seconds", stage, notifications }));
			process.exit(44);
		}, 60_000);
		try {
			const commands = new Map();
			windowExtension({ registerCommand: (name, command) => commands.set(name, command) } as ExtensionAPI);
			const cwd = join(root, "workspace with spaces");
			mkdirSync(cwd);
			const manager = SessionManager.create(cwd, join(root, "sessions"));
			const assistant = (text: string) => ({ role: "assistant" as const, content: [{ type: "text" as const, text }], api: "anthropic-messages", provider: "anthropic", model: "fixture-no-request", stopReason: "stop" as const, timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
			manager.appendMessage({ role: "user", content: "fixture first user", timestamp: Date.now() });
			manager.appendMessage(assistant("fixture first assistant"));
			manager.appendMessage({ role: "user", content: "fixture second user", timestamp: Date.now() });
			manager.appendMessage(assistant("fixture second assistant"));
			const source = manager.getSessionFile()!;
			const before = readFileSync(source, "utf8");
			const leaf = manager.getLeafId();
			const ctx = {
				mode: "tui", cwd, sessionManager: manager, isIdle: () => true,
				ui: {
					notify: (message: string, level: string) => notifications.push({ message, level }),
					custom: async (factory) => {
						let selected;
						const component = factory({ terminal: { rows: 10 }, requestRender() {} }, { bold: (s) => s, fg: (_c, s) => s }, { matches: (input, action) => input === action }, (value) => { selected = value; });
						assert.ok(component.render(80).some((line) => line.includes("fixture second user")));
						component.handleInput("tui.select.confirm");
						return selected;
					},
				},
			};
			for (const name of ["clone-window", "fork-window"]) {
				stage = name;
				await commands.get(name).handler("", ctx);
			}
			stage = "child-resume";
			assert.equal(manager.getSessionFile(), source);
			assert.equal(manager.getLeafId(), leaf);
			assert.equal(readFileSync(source, "utf8"), before, "parent bytes must be unchanged");
			writeFileSync(join(root, "parent.json"), JSON.stringify({ source, leaf, unchanged: true, notifications }));
			assert.ok(!notifications.some((n) => n.level === "error"), JSON.stringify(notifications));
			for (let attempt = 0; attempt < 80; attempt++) {
				if (readdirSync(root).filter((name) => name.startsWith("child-") && name.endsWith(".json")).length === 2) break;
				await delay(250);
			}
			const children = readdirSync(root).filter((name) => name.startsWith("child-") && name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(root, name), "utf8")));
			assert.equal(children.length, 2, "two real Pi children must report resumed state");
			assert.deepEqual(children.map((child) => child.texts.length).sort(), [2, 4]);
			for (const child of children) {
				assert.equal(child.mode, "tui", "child must be a real interactive Pi, not RPC");
				assert.equal(child.cwd, cwd);
				assert.notEqual(child.file, source);
				assert.equal(child.parentSession, source);
				assert.deepEqual(child.texts, ["fixture first user", "fixture first assistant", "fixture second user", "fixture second assistant"].slice(0, child.texts.length));
				const marker = JSON.parse(readFileSync(join(root, `marker-${child.pid}.json`), "utf8"));
				assert.equal(marker.runtime, null, "launcher must remove parent isolated runtime");
				assert.equal(marker.catalog, "fixture-catalog-only");
				assert.deepEqual(marker.args, ["--session", child.file]);
			}
			assert.equal(readFileSync(source, "utf8"), before);
			writeFileSync(join(root, "result.json"), JSON.stringify({ pass: true, scope: "handler-ui-fixture/native-child-tui/pi-h-marker-not-Harness", children }));
		} catch (error) {
			writeFileSync(join(root, "result.json"), JSON.stringify({ pass: false, error: String(error), stage, notifications }));
		} finally {
			clearTimeout(deadline);
			runtime.shutdown();
		}
	});
}
