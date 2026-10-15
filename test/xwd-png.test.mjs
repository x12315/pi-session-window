import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { xwdToPng } from "../tests/busy-clone/xwd-png.mjs";

test("Xvfb screenshot converter preserves RGB pixels and rejects unsupported visuals", () => {
	const fixture = Buffer.alloc(104);
	const header = [100, 7, 2, 24, 1, 1, 0, 0, 32, 0, 32, 32, 4, 4, 0xff0000, 0xff00, 0xff, 8, 256, 0, 1, 1, 0, 0, 0];
	header.forEach((value, i) => fixture.writeUInt32BE(value, i * 4));
	for (const byteOrder of [0, 1]) {
		fixture.writeUInt32BE(byteOrder, 28);
		if (byteOrder === 0) fixture.writeUInt32LE(0xcc8040, 100); else fixture.writeUInt32BE(0xcc8040, 100);
		const png = xwdToPng(fixture);
		assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
		let offset = 8, pixels;
		while (offset < png.length) {
			const size = png.readUInt32BE(offset);
			if (png.subarray(offset + 4, offset + 8).toString() === "IDAT") pixels = inflateSync(png.subarray(offset + 8, offset + 8 + size));
			offset += size + 12;
		}
		assert.deepEqual([...pixels], [0, 0xcc, 0x80, 0x40]);
	}
	fixture.writeUInt32BE(8, 12);
	assert.throws(() => xwdToPng(fixture));
});
