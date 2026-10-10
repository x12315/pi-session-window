import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Report real child TUI resume state; remain visible until the disposable guest is destroyed. */
export default function (pi: ExtensionAPI) {
	pi.on("input", (event) => {
		writeFileSync(join(process.env.WINDOW_ROOT!, "refused-input.json"), JSON.stringify({ pid: process.pid, text: event.text }));
		return { action: "handled" };
	});
	pi.on("session_start", (_event, ctx) => {
		const manager = ctx.sessionManager;
		const texts = manager.getBranch().filter((entry) => entry.type === "message").map((entry) => {
			const content = entry.message.content;
			return typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("");
		});
		writeFileSync(join(process.env.WINDOW_ROOT!, `child-${process.pid}.json`), JSON.stringify({ pid: process.pid, mode: ctx.mode ?? null, hasUI: ctx.hasUI, stdinTTY: process.stdin.isTTY === true, stdoutTTY: process.stdout.isTTY === true, termProgram: process.env.TERM_PROGRAM ?? null, cwd: ctx.cwd, file: manager.getSessionFile(), parentSession: manager.getHeader()?.parentSession, leaf: manager.getLeafId(), texts }));
	});
}
