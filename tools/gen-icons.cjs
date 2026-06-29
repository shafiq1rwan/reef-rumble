// Generates the PWA icons (icon-192.png, icon-512.png, plus maskable + apple)
// with no image libraries — draws a chibi shark face and encodes PNG by hand.
// Run:  node tools/gen-icons.cjs
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..");
const lerp = (a, b, t) => a + (b - a) * t;

// ---- draw a shark icon into an RGBA buffer of size `dim` (supersampled) ----
function render(dim, padFrac) {
  const buf = new Uint8ClampedArray(dim * dim * 4);
  const set = (x, y, c) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= dim || y >= dim) return;
    const i = (y * dim + x) * 4, a = c[3] == null ? 1 : c[3];
    buf[i] = buf[i] * (1 - a) + c[0] * a;
    buf[i + 1] = buf[i + 1] * (1 - a) + c[1] * a;
    buf[i + 2] = buf[i + 2] * (1 - a) + c[2] * a;
    buf[i + 3] = 255;
  };
  // background gradient (full-bleed so it works as a maskable icon)
  for (let y = 0; y < dim; y++) {
    const t = y / dim, r = lerp(0x07, 0x04, t), g = lerp(0x24, 0x12, t), b = lerp(0x3c, 0x1f, t);
    for (let x = 0; x < dim; x++) { const i = (y * dim + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; }
  }
  // shapes work in normalized 0..1 space, shrunk into the maskable safe area
  const P = padFrac, S = 1 - 2 * P, ox = P * dim, oy = P * dim;
  const N = (v) => v * S * dim;
  const X = (v) => ox + N(v), Y = (v) => oy + N(v);
  const circle = (cx, cy, rad, c) => {
    const r2 = rad * rad;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r2) set(x, y, c);
      }
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) set(x, y, c);
      }
  };
  const ring = (cx, cy, rad, th, c) => {
    const ro = rad + th / 2, ri = rad - th / 2;
    for (let y = Math.floor(cy - ro); y <= cy + ro; y++)
      for (let x = Math.floor(cx - ro); x <= cx + ro; x++) {
        const d = Math.hypot(x - cx, y - cy); if (d <= ro && d >= ri) set(x, y, c);
      }
  };
  const tri = (a, b, cc, col) => {
    const minx = Math.min(a[0], b[0], cc[0]), maxx = Math.max(a[0], b[0], cc[0]);
    const miny = Math.min(a[1], b[1], cc[1]), maxy = Math.max(a[1], b[1], cc[1]);
    const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    for (let y = Math.floor(miny); y <= maxy; y++)
      for (let x = Math.floor(minx); x <= maxx; x++) {
        const pt = [x, y], d1 = sign(pt, a, b), d2 = sign(pt, b, cc), d3 = sign(pt, cc, a);
        const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        if (!(neg && pos)) set(x, y, col);
      }
  };

  const BODY = [0x47, 0x9f, 0xcf], BODY_T = [0x6a, 0xbb, 0xe2], DARK = [0x2a, 0x67, 0x91];
  const BELLY = [0xcf, 0xea, 0xf8], CYAN = [0x2c, 0xca, 0xda], NAVY = [0x06, 0x20, 0x2b], WHITE = [0xff, 0xff, 0xff];

  // tail + dorsal fin
  tri([X(0.18), Y(0.66)], [X(0.05), Y(0.56)], [X(0.20), Y(0.80)], DARK);
  tri([X(0.40), Y(0.22)], [X(0.62), Y(0.22)], [X(0.54), Y(0.04)], DARK);
  // head
  circle(X(0.52), Y(0.55), N(0.34), BODY);
  ellipse(X(0.50), Y(0.40), N(0.30), N(0.14), BODY_T);   // lighter forehead
  ellipse(X(0.56), Y(0.74), N(0.24), N(0.13), BELLY);    // jaw/belly
  ellipse(X(0.84), Y(0.62), N(0.11), N(0.10), BODY);     // snout
  // teeth
  for (let i = 0; i < 4; i++) tri([X(0.73 + i * 0.045), Y(0.70)], [X(0.755 + i * 0.045), Y(0.70)], [X(0.7425 + i * 0.045), Y(0.745)], WHITE);
  // goggle strap + eyes
  ellipse(X(0.52), Y(0.50), N(0.38), N(0.055), NAVY);
  const er = N(0.135);
  circle(X(0.40), Y(0.51), er, WHITE); ring(X(0.40), Y(0.51), er, N(0.03), CYAN);
  circle(X(0.66), Y(0.51), er, WHITE); ring(X(0.66), Y(0.51), er, N(0.03), CYAN);
  circle(X(0.425), Y(0.51), N(0.06), NAVY); circle(X(0.685), Y(0.51), N(0.06), NAVY);
  circle(X(0.40), Y(0.475), N(0.022), [0xcd, 0xf6, 0xff]); circle(X(0.66), Y(0.475), N(0.022), [0xcd, 0xf6, 0xff]);
  return buf;
}

// box-downscale by 2 (supersample -> final, for anti-aliasing)
function down2(src, dim) {
  const o = dim / 2, out = new Uint8ClampedArray(o * o * 4);
  for (let y = 0; y < o; y++) for (let x = 0; x < o; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((y * 2 + dy) * dim + (x * 2 + dx)) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2];
    }
    const j = (y * o + x) * 4; out[j] = r / 4; out[j + 1] = g / 4; out[j + 2] = b / 4; out[j + 3] = 255;
  }
  return out;
}

// ---- minimal PNG encoder (RGBA, no filtering) ----
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(dim, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0); ihdr.writeUInt32BE(dim, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(dim * (dim * 4 + 1));
  const px = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  for (let y = 0; y < dim; y++) { raw[y * (dim * 4 + 1)] = 0; px.copy(raw, y * (dim * 4 + 1) + 1, y * dim * 4, (y + 1) * dim * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function make(file, size, pad) {
  const buf = down2(render(size * 2, pad), size * 2);
  fs.writeFileSync(path.join(OUT, file), encodePNG(size, buf));
  console.log("wrote", file, size + "x" + size);
}
make("icon-192.png", 192, 0.06);
make("icon-512.png", 512, 0.06);
make("icon-maskable-512.png", 512, 0.14);  // extra safe-zone padding for maskable
make("apple-touch-icon.png", 180, 0.04);
