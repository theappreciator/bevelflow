// Generates every app icon from one logo definition.
//   npm run generate-icons
// Writes to public/: icon.svg, favicon.ico, apple-touch-icon.png,
// pwa-192.png, pwa-512.png, maskable-512.png. Commit the results.
//
// The logo: a beveled octagon tile (a square with its corners cut off), its edge
// facets shaded as if lit from the top-left, with a single wave ("flow") across
// its face, on an indigo-to-cyan gradient.

import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = new URL("../public/", import.meta.url);

const BG_FROM = "#4f46e5"; // indigo
const BG_TO = "#06b6d4"; // cyan

// Octagon tile in a 512 grid: outer edge, and the inner face inset 36px.
const OUTER = [[192, 120], [320, 120], [392, 192], [392, 320], [320, 392], [192, 392], [120, 320], [120, 192]];
const INNER = [[207, 156], [305, 156], [356, 207], [356, 305], [305, 356], [207, 356], [156, 305], [156, 207]];
// White opacity for each bevel facet (top, top-right, right, bottom-right, bottom,
// bottom-left, left, top-left): bright toward the light, dim away from it.
const FACET_LIGHT = [0.9, 0.55, 0.35, 0.18, 0.3, 0.5, 0.75, 0.97];
const WAVE = "M184 280 C216 216 248 216 256 256 C264 296 296 296 328 232";
const WAVE_WIDTH = 40;

const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * @param {object} o
 * @param {boolean} o.rounded  rounded-square background with transparent corners (favicons,
 *                             regular PWA icons); false = full-bleed square (iOS and
 *                             Android crop/round these themselves)
 * @param {number} o.scale     size of the tile relative to the canvas
 */
function logoSvg({ rounded, scale }) {
  const facets = OUTER.map((p, i) => {
    const n = (i + 1) % 8;
    return `<polygon points="${pts([p, OUTER[n], INNER[n], INNER[i]])}" fill="#fff" fill-opacity="${FACET_LIGHT[i]}"/>`;
  }).join("");
  const t = +(256 * (1 - scale)).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BG_FROM}"/><stop offset="1" stop-color="${BG_TO}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="url(#bg)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    ${facets}
    <polygon points="${pts(INNER)}" fill="#fff"/>
    <path d="${WAVE}" fill="none" stroke="url(#bg)" stroke-width="${WAVE_WIDTH}" stroke-linecap="round"/>
  </g>
</svg>
`;
}

const roundedSvg = logoSvg({ rounded: true, scale: 1.3 });
// Full-bleed: the tile's farthest corner is ~35% of the width from the centre, inside
// the 40% "safe zone" that Android keeps for maskable icons.
const fullSvg = logoSvg({ rounded: false, scale: 1.2 });

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

/** .ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const files = {
  "icon.svg": roundedSvg,
  "favicon.ico": ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(roundedSvg, size) })))),
  "pwa-192.png": await png(roundedSvg, 192),
  "pwa-512.png": await png(roundedSvg, 512),
  "maskable-512.png": await png(fullSvg, 512),
  "apple-touch-icon.png": await png(fullSvg, 180),
};

for (const [name, data] of Object.entries(files)) {
  await writeFile(new URL(name, OUT), data);
  console.log(`public/${name}  ${typeof data === "string" ? data.length : data.byteLength} bytes`);
}
