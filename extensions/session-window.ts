import { spawn, execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executableOnPath, shellQuote, windowResumeCommand } from "./window-launcher.mjs";
import { promisify } from "node:util";
import { copyToClipboard, type ExtensionAPI, type ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const run = promisify(execFile);

function appleScriptQuote(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function openTerminal(launcher: string): Promise<void> {
	const command = `/bin/sh ${shellQuote(launcher)}`;
	if (process.platform === "darwin") {
		const script = process.env.TERM_PROGRAM === "iTerm.app"
			? `tell application id "com.googlecode.iterm2" to create window with default profile command ${appleScriptQuote(command)}`
			: `tell application "Terminal" to do script ${appleScriptQuote(command)}`;
		await run("osascript", ["-e", script]);
		return;
	}
	if (process.platform !== "linux") throw new Error("Only macOS and Linux terminals are supported");
	if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("No graphical display is available");
	const terminal = [
		["x-terminal-emulator", ["-e", "/bin/sh", launcher]],
		["gnome-terminal", ["--", "/bin/sh", launcher]],
		["xterm", ["-e", "/bin/sh", launcher]],
	] as const;
	const selected = terminal.find(([name]) => executableOnPath(name));
	if (!selected) throw new Error("No supported terminal found (x-terminal-emulator, gnome-terminal, xterm)");
	await new Promise<void>((resolve, reject) => {
		const child = spawn(selected[0], [...selected[1]], { detached: true, stdio: "ignore" });
		child.once("error", reject);
		child.once("spawn", () => { child.unref(); resolve(); });
	});
}

async function openWindow(sessionFile: string, cwd: string): Promise<void> {
	if (!executableOnPath("pi-h") && !executableOnPath("pi")) throw new Error("Neither pi-h nor pi is on PATH");
	const dir = mkdtempSync(join(tmpdir(), "pi-session-window-"));
	const launcher = join(dir, "launch.sh");
	try {
		writeFileSync(launcher, `#!/bin/sh
export PATH=${shellQuote(process.env.PATH ?? "")}
rm -f "$0"
rmdir ${shellQuote(dir)} 2>/dev/null
if ! cd ${shellQuote(cwd)}; then
  printf 'Could not open session directory.\\n'
  exec ${shellQuote(process.env.SHELL || "/bin/sh")} -l
fi
${windowResumeCommand(sessionFile)}
status=$?
if [ "$status" -ne 0 ]; then
  printf '\\nPi exited with status %s.\\n' "$status"
  exec ${shellQuote(process.env.SHELL || "/bin/sh")} -l
fi
`, { mode: 0o600 });
		await openTerminal(launcher);
	} catch (error) {
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}

async function forkInWindow(ctx: ExtensionCommandContext, leafId: string, prompt?: string): Promise<void> {
	if (!ctx.isIdle()) {
		ctx.ui.notify("Wait for the current response to finish before opening a fork", "warning");
		return;
	}
	const sourceFile = ctx.sessionManager.getSessionFile();
	if (!sourceFile || !existsSync(sourceFile)) {
		ctx.ui.notify("Wait for the first assistant response so the session is saved", "warning");
		return;
	}
	try {
		const branch = SessionManager.open(sourceFile, ctx.sessionManager.getSessionDir());
		const forkedFile = branch.createBranchedSession(leafId);
		if (!forkedFile || !existsSync(forkedFile)) {
			ctx.ui.notify("This branch has no saved assistant response yet", "warning");
			return;
		}
		try {
			await openWindow(forkedFile, ctx.cwd);
		} catch (error) {
			ctx.ui.notify(`New window failed: ${String(error)}\nOpen manually: ${windowResumeCommand(forkedFile)}`, "error");
			return;
		}
		if (prompt) {
			try {
				await copyToClipboard(prompt);
				ctx.ui.notify("Fork opened; selected prompt copied to clipboard. Paste it in the new window to edit.", "info");
			} catch (error) {
				ctx.ui.notify(`Fork opened, but could not copy the selected prompt: ${String(error)}`, "warning");
			}
		} else {
			ctx.ui.notify("Clone opened in a new window; this session is unchanged.", "info");
		}
	} catch (error) {
		ctx.ui.notify(`Could not fork session: ${String(error)}`, "error");
	}
}

/** Register window-preserving alternatives to pi's built-in /clone and /fork commands. */
export default function (pi: ExtensionAPI): void {
	pi.registerCommand("clone-window", {
		description: "Clone the current conversation into a new terminal window, preserving this session",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/clone-window requires interactive mode", "warning");
				return;
			}
			const leafId = ctx.sessionManager.getLeafId();
			if (!leafId) {
				ctx.ui.notify("Nothing to clone yet", "warning");
				return;
			}
			await forkInWindow(ctx, leafId);
		},
	});

	pi.registerCommand("fork-window", {
		description: "Fork before a previous user message in a new window, preserving this session",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/fork-window requires interactive mode", "warning");
				return;
			}
			const messages = ctx.sessionManager.getEntries().filter(
				(entry) => entry.type === "message" && entry.message.role === "user",
			);
			const choices = messages.map((entry) => {
				const content = entry.message.content;
				const text = typeof content === "string"
					? content
					: content.filter((part) => part.type === "text").map((part) => part.text).join("");
				return {
					entry,
					text,
					hasImages: typeof content !== "string" && content.some((part) => part.type === "image"),
					label: `${text.replace(/\s+/g, " ").slice(0, 80)} [${entry.id}]`,
				};
			}).filter((choice) => choice.text);
			if (!choices.length) {
				ctx.ui.notify("No user messages to fork from", "warning");
				return;
			}
			const selected = await ctx.ui.custom<string | undefined>((tui, theme, keys, done) => {
				let index = choices.length - 1;
				const visibleCount = () => Math.max(1, Math.min(9, tui.terminal.rows - 3));
				return {
					render(width: number): string[] {
						const count = visibleCount();
						const start = Math.max(0, Math.min(index - Math.floor(count / 2), choices.length - count));
						const end = Math.min(start + count, choices.length);
						const lines: string[] = [];
						if (tui.terminal.rows >= 3) lines.push(truncateToWidth(theme.bold("Fork in new window"), width));
						if (tui.terminal.rows >= 4) lines.push(truncateToWidth(theme.fg("muted", "↑↓ navigate · PgUp/PgDn page · Enter select · Esc cancel"), width));
						for (let i = start; i < end; i++) {
							const active = i === index;
							const prefix = active ? "› " : "  ";
							const text = truncateToWidth(choices[i].label, Math.max(0, width - 2));
							lines.push(truncateToWidth(active ? theme.fg("accent", `${prefix}${text}`) : `${prefix}${text}`, width));
						}
						if (tui.terminal.rows >= 2) lines.push(truncateToWidth(theme.fg("muted", `${index + 1}/${choices.length} · ${start > 0 ? "↑ more " : ""}${end < choices.length ? "↓ more" : ""}`), width));
						return lines;
					},
					invalidate(): void {},
					handleInput(data: string): void {
						const page = visibleCount();
						if (keys.matches(data, "tui.select.up")) index = Math.max(0, index - 1);
						else if (keys.matches(data, "tui.select.down")) index = Math.min(choices.length - 1, index + 1);
						else if (keys.matches(data, "tui.select.pageUp")) index = Math.max(0, index - page);
						else if (keys.matches(data, "tui.select.pageDown")) index = Math.min(choices.length - 1, index + page);
						else if (keys.matches(data, "tui.select.confirm")) return done(choices[index].entry.id);
						else if (keys.matches(data, "tui.select.cancel")) return done(undefined);
						tui.requestRender();
					},
				};
			}, { overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" } });
			const choice = choices.find((item) => item.entry.id === selected);
			if (!choice) return;
			if (choice.hasImages) {
				ctx.ui.notify("Cannot copy image attachments into the new window's editor", "warning");
				return;
			}
			if (!choice.entry.parentId) {
				ctx.ui.notify("Cannot open a fork before the first message in a new window", "warning");
				return;
			}
			await forkInWindow(ctx, choice.entry.parentId, choice.text);
		},
	});
}
