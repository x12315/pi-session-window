import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Observe a real Pi TUI and provide a bounded blocking tool for the local mock-model test. */
export default function (pi: ExtensionAPI) {
	const root = process.env.BUSY_WINDOW_ROOT!;
	const stage = process.env.BUSY_WINDOW_STAGE!;
	const record = (name: string, value: unknown) => writeFileSync(join(root, `${stage}-${name}.json`), JSON.stringify(value));
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setTitle(`Busy ${stage} ${process.pid}`);
		record(`start-${process.pid}`, { pid: process.pid, file: ctx.sessionManager.getSessionFile(), mode: ctx.mode ?? null, hasUI: ctx.hasUI, tty: process.stdin.isTTY && process.stdout.isTTY, agentDir: process.env.PI_CODING_AGENT_DIR ?? null });
		ctx.ui.notify("BUSY_TEST_READY", "info");
	});
	pi.on("input", (event) => {
		const allowed = stage === "parent" ? ["stream job", "tool job"] : ["child task"];
		if (!allowed.includes(event.text)) {
			record("unexpected-input", { text: event.text });
			return { action: "handled" };
		}
	});
	pi.on("message_update", (event, ctx) => {
		if (stage === "parent" && JSON.stringify(event.message.content).includes("PARENT_STREAMING")) record("streaming", { busy: !ctx.isIdle(), leaf: ctx.sessionManager.getLeafId() });
	});
	pi.on("agent_end", () => record(`end-${process.pid}`, { done: true }));
	pi.registerTool({
		name: "window_test_wait", label: "Fixture blocking tool", description: "Local regression fixture only",
		parameters: Type.Object({}),
		execute: async (_id, _params, signal) => {
			record("tool-running", { running: true });
			const deadline = Date.now() + Number(process.env.BUSY_TOOL_BUDGET_MS ?? 20000);
			try {
				while (!existsSync(join(root, "release-tool"))) {
					if (Date.now() > deadline) throw new Error("Tool fixture exceeded its budget");
					await delay(40, undefined, { signal });
				}
			} catch (error) {
				record("tool-aborted", { error: String(error) });
				throw error;
			}
			record("tool-completed", { done: true });
			return { content: [{ type: "text", text: "PARENT_TOOL_DONE" }], details: undefined };
		},
	});
}
