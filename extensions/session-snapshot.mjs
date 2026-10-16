/** Return the latest saved branch entry with no outstanding tool calls.
 * Streaming text and queued input are not session entries. An incomplete tool
 * batch (including already returned siblings) is excluded as a whole. Unknown
 * tool results stop selection rather than producing an invalid transcript.
 * Failed/aborted assistant messages remain in native history but do not open
 * tool batches: Pi excludes them from model replay, including partial calls.
 */
export function latestCompleteEntry(entries) {
	const pending = new Set();
	let latest;
	for (const entry of entries) {
		if (entry.type === "message") {
			const message = entry.message;
			if (message.role === "assistant" && message.stopReason !== "aborted" && message.stopReason !== "error" && Array.isArray(message.content)) {
				for (const part of message.content) {
					if (part.type === "toolCall") {
						if (typeof part.id !== "string" || !part.id || pending.has(part.id)) return latest;
						pending.add(part.id);
					}
				}
			} else if (message.role === "toolResult" && !pending.delete(message.toolCallId)) {
				break;
			}
		}
		if (pending.size === 0) latest = entry;
	}
	return latest;
}
