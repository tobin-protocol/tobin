// Builds the Tobin "T with a break" mark into the favicon set.
// Run from apps/landing: node scripts/build-brand-icons.mjs  (needs sharp, which Next already installs).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

/** The T on a 100 x 100 grid: a top bar, a stem, and a thin horizontal break cut through the stem. */
export const T_PATH = "M0 6H100V34H68V54H32V34H0Z M32 62H68V94H32Z";

const tile = (bg, fg, radius, scale = 1) => {
  const s = 100 * scale;
  const o = (100 - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="${bg}"/><g transform="translate(${o + s * 0.2} ${o + s * 0.2}) scale(${s * 0.006})"><path d="${T_PATH}" fill="${fg}"/></g></svg>`;
};

const svg = tile("#08080b", "#ffffff", 22);
writeFileSync("src/app/icon.svg", svg);

const png = (markup, size) => sharp(Buffer.from(markup), { density: 384 }).resize(size, size).png().toBuffer();

writeFileSync("src/app/apple-icon.png", await png(tile("#08080b", "#ffffff", 0), 180));
writeFileSync("public/icon-192.png", await png(svg, 192));
writeFileSync("public/icon-512.png", await png(svg, 512));
// Maskable: full-bleed ground, with the mark inside the central safe zone.
writeFileSync("public/icon-maskable-512.png", await png(tile("#08080b", "#ffffff", 0, 0.8), 512));

// favicon.ico: PNG-in-ICO at 16, 32 and 48.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((n) => png(svg, n)));
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach((img, i) => {
  const n = sizes[i];
  const e = 6 + i * 16;
  head.writeUInt8(n, e);
  head.writeUInt8(n, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(img.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([head, ...images]));
console.log("brand icons written");
