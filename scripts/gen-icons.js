import fs from 'fs';
import zlib from 'zlib';

function createGradientPng(width, height, outputPath) {
  // Pure Node PNG generator with gradient and music circle
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bits per channel
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // Deflate
  ihdr.writeUInt8(0, 11); // Filter method
  ihdr.writeUInt8(0, 12); // Interlace method

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with scanline filter byte 0
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  const cx = width / 2;
  const cy = height / 2;
  const rCircle = width * 0.38;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None

    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const pxOffset = rowOffset + 1 + x * 4;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Dark futuristic slate background
      let r = Math.round(15 + 10 * nx);
      let g = Math.round(17 + 15 * ny);
      let b = Math.round(23 + 20 * (nx + ny) / 2);

      // Gradient glowing disc in center
      if (dist <= rCircle) {
        const factor = 1 - (dist / rCircle);
        // Emerald & Cyan glow (#10b981 to #06b6d4)
        r = Math.round(r * (1 - factor) + 16 * factor);
        g = Math.round(g * (1 - factor) + 185 * factor);
        b = Math.round(b * (1 - factor) + 129 * factor);
      }

      // Rounded edge border
      const cornerRadius = width * 0.22;
      let inBounds = true;
      if (x < cornerRadius && y < cornerRadius) {
        if (Math.hypot(x - cornerRadius, y - cornerRadius) > cornerRadius) inBounds = false;
      } else if (x > width - cornerRadius && y < cornerRadius) {
        if (Math.hypot(x - (width - cornerRadius), y - cornerRadius) > cornerRadius) inBounds = false;
      } else if (x < cornerRadius && y > height - cornerRadius) {
        if (Math.hypot(x - cornerRadius, y - (height - cornerRadius)) > cornerRadius) inBounds = false;
      } else if (x > width - cornerRadius && y > height - cornerRadius) {
        if (Math.hypot(x - (width - cornerRadius), y - (height - cornerRadius)) > cornerRadius) inBounds = false;
      }

      rawData[pxOffset] = inBounds ? r : 0;
      rawData[pxOffset + 1] = inBounds ? g : 0;
      rawData[pxOffset + 2] = inBounds ? b : 0;
      rawData[pxOffset + 3] = inBounds ? 255 : 0;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const finalPng = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outputPath, finalPng);
  console.log(`Generated ${outputPath}`);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crc = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, body, crcBuf]);
}

// CRC32 implementation
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

if (!fs.existsSync('./public/icons')) {
  fs.mkdirSync('./public/icons', { recursive: true });
}

createGradientPng(192, 192, './public/icons/icon-192.png');
createGradientPng(512, 512, './public/icons/icon-512.png');
