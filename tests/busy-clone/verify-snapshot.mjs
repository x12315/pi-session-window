import assert from "node:assert/strict";

/** Require the entire latest safe parent prefix, not just absence of unfinished output.
 * The fixture contains interrupted history, compaction and two completed checkpoints.
 * pendingCallId marks the current incomplete batch; all earlier entries must survive.
 */
export function verifyClonedPrefix(parentBytes, childBytes, pendingCallId) {
	const parse = (bytes) => bytes.trim().split("\n").map((line) => JSON.parse(line)).filter((entry) => entry.type !== "session");
	const parent = parse(parentBytes), child = parse(childBytes);
	const pendingIndex = pendingCallId === undefined ? parent.length : parent.findIndex((entry) => entry.message?.role === "assistant" && entry.message.content.some((part) => part.type === "toolCall" && part.id === pendingCallId));
	assert.ok(pendingIndex > 0, "current pending call must be saved before the clone command");
	const expected = parent.slice(0, pendingIndex);
	for (const checkpoint of ["LATEST_SAVED_ONE", "LATEST_SAVED_TWO"]) assert.ok(expected.some((entry) => entry.message?.role === "assistant" && entry.message.content.some((part) => part.text === `${checkpoint} assistant`)), `fixture must contain ${checkpoint}`);
	assert.ok(parent.some((entry) => entry.type === "compaction"));
	for (const stopReason of ["aborted", "error"]) assert.ok(parent.some((entry) => entry.message?.stopReason === stopReason));
	const parentIds = new Set(parent.map((entry) => entry.id));
	const copied = child.filter((entry) => parentIds.has(entry.id));
	assert.deepEqual(copied, expected, "clone must retain every parent entry through the latest safe saved leaf");
	const expectedLeaf = expected.at(-1).id, copiedLeaf = copied.at(-1)?.id;
	assert.equal(copiedLeaf, expectedLeaf);
	return { expectedLeaf, copiedLeaf, copiedEntries: copied.length };
}
