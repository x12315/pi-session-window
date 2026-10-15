import assert from "node:assert/strict";
import { crc32, deflateSync } from "node:zlib";

/** Convert the fixture's bounded 24-bit TrueColor Xvfb framebuffer to PNG;
 * reject other XWD layouts rather than claiming an unreadable screenshot.
 */
export function xwdToPng(file) {
	const h = Array.from({ length: 25 }, (_, i) => file.readUInt32BE(i * 4));
	const [width, height] = [h[4], h[5]];
	assert.ok(width > 0 && height > 0 && width <= 2048 && height <= 2048);
	assert.deepEqual([h[1], h[2], h[3], h[11], h[13], h[14], h[15], h[16]], [7, 2, 24, 32, 4, 0xff0000, 0xff00, 0xff]);
	const offset = h[0] + h[19] * 12;
	assert.ok(offset + h[12] * height <= file.length);
	const raw = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const pixelOffset = offset + y * h[12] + x * 4;
		const pixel = h[7] === 0 ? file.readUInt32LE(pixelOffset) : file.readUInt32BE(pixelOffset);
		const at = y * (width * 3 + 1) + 1 + x * 3;
		raw[at] = pixel >>> 16 & 255; raw[at + 1] = pixel >>> 8 & 255; raw[at + 2] = pixel & 255;
	}
	const chunk = (name, data) => {
		const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
		length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
		return Buffer.concat([length, type, data, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
	return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
