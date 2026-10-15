import assert from "node:assert/strict";
import { test } from "node:test";
import { latestCompleteEntry } from "../extensions/session-snapshot.mjs";

const user = { id: "user", type: "message", message: { role: "user", content: "task" } };
const call = { id: "call", type: "message", message: { role: "assistant", content: [
	{ type: "toolCall", id: "one" }, { type: "toolCall", id: "two" },
] } };
const result = (id, isError = false) => ({ id: `result-${id}`, type: "message", message: { role: "toolResult", toolCallId: id, isError } });

test("Saved input is a valid snapshot before the first response finishes", () => {
	assert.equal(latestCompleteEntry([user]), user);
	assert.equal(latestCompleteEntry([]), undefined);
});

test("Unfinished tool batches exclude both the call and completed siblings", () => {
	assert.equal(latestCompleteEntry([user, call]), user);
	assert.equal(latestCompleteEntry([user, call, result("one")]), user);
});

test("Completed batches, including failed tools, can be cloned", () => {
	const last = result("two", true);
	assert.equal(latestCompleteEntry([user, call, result("one"), last]), last);
});

test("Only the most recent unfinished batch is excluded", () => {
	const saved = result("two");
	const next = { ...call, id: "next", message: { role: "assistant", content: [{ type: "toolCall", id: "three" }] } };
	assert.equal(latestCompleteEntry([user, call, result("one"), saved, next]), saved);
});

test("Metadata cannot hide pending calls; complete metadata remains included", () => {
	const metadata = { id: "name", type: "session_info" };
	assert.equal(latestCompleteEntry([user, call, metadata]), user);
	assert.equal(latestCompleteEntry([user, metadata]), metadata);
});

test("Malformed or duplicate tool-call IDs cannot become complete snapshots", () => {
	const malformed = { ...call, message: { role: "assistant", content: [{ type: "toolCall" }] } };
	const duplicate = { ...call, message: { role: "assistant", content: [{ type: "toolCall", id: "one" }, { type: "toolCall", id: "one" }] } };
	assert.equal(latestCompleteEntry([user, malformed, result(undefined)]), user);
	assert.equal(latestCompleteEntry([user, duplicate, result("one")]), user);
});

test("Unknown tool results do not produce invalid child transcripts", () => {
	assert.equal(latestCompleteEntry([user, result("unknown"), { id: "later", type: "model_change" }]), user);
});
