import { encode } from "uqr";

/** Fraction of the code's width taken by the logo in the middle. */
const LOGO_FRACTION = 0.22;
/** uqr marks modules that carry data (as opposed to finder/timing/alignment patterns) with 0. */
const DATA_MODULE = 0;

/**
 * Black-and-white QR code as an SVG string, with a logo in the centre.
 *
 * Uses the highest error correction (H, ~30% recoverable) and clears only *data*
 * modules behind the logo (about 7% of the code), so it still scans reliably.
 * Everything is drawn in the browser; nothing is stored.
 */
export function qrSvg(text: string, logoHref: string): string {
  const qr = encode(text, { ecc: "H", border: 4 });
  const n = qr.size;

  // Logo square in module units, centred, with one module of white margin around it.
  let logo = Math.round(n * LOGO_FRACTION);
  if ((n - logo) % 2) logo += 1; // keep it exactly centred
  const start = (n - logo) / 2;
  const clearFrom = start - 1;
  const clearTo = start + logo + 1;
  const behindLogo = (x: number, y: number): boolean =>
    x >= clearFrom && x < clearTo && y >= clearFrom && y < clearTo && qr.types[y]?.[x] === DATA_MODULE;

  // One path for all dark modules; consecutive dark modules in a row become one run.
  let d = "";
  qr.data.forEach((row, y) => {
    let x = 0;
    while (x < n) {
      if (!row[x] || behindLogo(x, y)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < n && row[x + run] && !behindLogo(x + run, y)) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });

  const pad = 0.15; // logo sits slightly inside its white square
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">
<rect width="${n}" height="${n}" fill="#fff"/>
<path d="${d}" fill="#000"/>
<rect x="${clearFrom}" y="${clearFrom}" width="${logo + 2}" height="${logo + 2}" fill="#fff"/>
<image href="${logoHref}" x="${start - pad}" y="${start - pad}" width="${logo + 2 * pad}" height="${logo + 2 * pad}" shape-rendering="auto"/>
</svg>`;
}
