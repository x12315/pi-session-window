import { constants, accessSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Quote one literal argument for the supported macOS/Linux POSIX shell launchers. */
export function shellQuote(value) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Find an executable in the supplied PATH, without executing it. */
export function executableOnPath(name, path = process.env.PATH ?? "") {
	for (const dir of path.split(delimiter)) {
		if (!dir) continue;
		const file = join(dir, name);
		try { accessSync(file, constants.X_OK); return file; }
		catch { /* try the next PATH entry */ }
	}
}

/** Prefer switch-ready ordinary Pi, otherwise native Pi. Never inherit a parent's isolated
 * Profile runtime or select its saved profile. A found but failing pi-h is not retried as pi.
 * The command resumes a saved branch; it does not send a prompt or grant trust approval.
 * With neither executable installed, preserve a pi-h recovery command for the saved file.
 */
export function windowResumeCommand(sessionFile, env = process.env) {
	const executable = executableOnPath("pi-h", env.PATH) ?? executableOnPath("pi", env.PATH) ?? "pi-h";
	const catalog = env.HARNESS_CATALOG ? ` HARNESS_CATALOG=${shellQuote(env.HARNESS_CATALOG)}` : "";
	return `env -u PI_CODING_AGENT_DIR${catalog} ${shellQuote(executable)} --session ${shellQuote(sessionFile)}`;
}
