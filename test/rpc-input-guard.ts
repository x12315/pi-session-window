import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Test-only: prove guard loading via metadata and stop every ordinary input before any model turn. */
export default function (pi: ExtensionAPI) {
	pi.registerCommand("window-test-input-guard", {
		description: "Test-only input guard availability marker",
		handler: async () => {},
	});
	pi.on("input", (_event, ctx) => {
		ctx.ui.notify("WINDOW_TEST_INPUT_BLOCKED", "warning");
		return { action: "handled" };
	});
}
