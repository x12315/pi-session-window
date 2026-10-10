import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Report real child TUI resume state; remain visible until the disposable guest is destroyed. */
export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		const manager = ctx.sessionManager;
		const texts = manager.getBranch().filter((entry) => entry.type === "message").map((entry) => {
			const content = entry.message.content;
			return typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("");
		});
		writeFileSync(join(process.env.WINDOW_ROOT!, `child-${process.pid}.json`), JSON.stringify({ pid: process.pid, mode: ctx.mode, cwd: ctx.cwd, file: manager.getSessionFile(), parentSession: manager.getHeader()?.parentSession, leaf: manager.getLeafId(), texts }));
	});
}
