// Generates icon16.png, icon48.png, icon128.png using pure Node.js (no dependencies)
// Run once: node create_icons.js

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([typeBytes, data]));
  const out = Buffer.alloc(4 + 4 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crcVal, 8 + data.length);
  return out;
}

// ── PNG builder (RGBA) ────────────────────────────────────────────────────────
function buildPNG(size, drawPixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  const rowSize = 1 + size * 4;
  const raw = Buffer.alloc(size * rowSize, 0);

  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      const o = y * rowSize + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon drawing ──────────────────────────────────────────────────────────────
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function drawBookIcon(x, y, size) {
  const BLUE        = [102, 126, 234, 255]; // #667EEA
  const WHITE       = [255, 255, 255, 255];
  const LINE_COLOR  = [190, 205, 245, 255]; // light indigo lines on pages
  const SPINE_COLOR = [228, 232, 252, 255]; // very light center spine
  const TRANSPARENT = [0, 0, 0, 0];

  // Rounded corners (radius = 22% of size)
  const r = size * 0.22;
  const s = size - 1;
  if (x < r     && y < r     && dist(x, y, r,   r  ) > r) return TRANSPARENT;
  if (x > s - r && y < r     && dist(x, y, s-r, r  ) > r) return TRANSPARENT;
  if (x < r     && y > s - r && dist(x, y, r,   s-r) > r) return TRANSPARENT;
  if (x > s - r && y > s - r && dist(x, y, s-r, s-r) > r) return TRANSPARENT;

  // Normalized coords 0→1
  const nx = x / s;
  const ny = y / s;

  // Page bounds
  const pL = 0.12, pR = 0.88, pT = 0.12, pB = 0.88;
  const spL = 0.46, spR = 0.54;

  if (nx < pL || nx > pR || ny < pT || ny > pB) return BLUE;

  if (nx >= spL && nx <= spR) return SPINE_COLOR;

  // Text lines (adaptive thickness)
  const lineH = Math.max(0.03, 2.0 / size);
  const lineYs = [0.28, 0.38, 0.48, 0.58, 0.68, 0.78];
  const llS = 0.18, llE = 0.42;
  const rlS = 0.58, rlE = 0.82;

  for (const ly of lineYs) {
    if (ny >= ly && ny <= ly + lineH) {
      if ((nx >= llS && nx <= llE) || (nx >= rlS && nx <= rlE)) {
        return LINE_COLOR;
      }
    }
  }

  return WHITE;
}

// ── Generate ──────────────────────────────────────────────────────────────────
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

for (const size of [16, 48, 128]) {
  const png = buildPNG(size, drawBookIcon);
  const out = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ icons/icon${size}.png`);
}
