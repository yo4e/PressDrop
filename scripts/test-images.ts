import { deflateSync } from "node:zlib";
// Deliberately visible, generated test fixtures, not publication photographs.
export function testPng(variant: number): Buffer {
  const width = 640, height = 400;
  const pixels = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * (1 + width * 3) + 1 + x * 3;
    const block = y > 100 && y < 300 && x < 560 && (x % 180 > 35 && x % 180 < 155);
    pixels[i] = block ? (variant === 2 ? 130 : 30 + variant * 40) : 230;
    pixels[i + 1] = block ? (variant === 2 ? 80 : 95 + variant * 30) : 240;
    pixels[i + 2] = block ? 175 : 245;
  }
  function chunk(type: string, data: Buffer) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
