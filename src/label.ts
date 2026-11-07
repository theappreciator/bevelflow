/**
 * Printable label image (QR code + public ID) for the iOS home screen app, where
 * window.print() doesn't work (it does in iOS Safari). The image is handed to the Share sheet, which has Print.
 */

const SIZE = 600; // px width of the label image
const QR = 560; // px size of the QR code on it
const TEXT_GAP = 24;
const FONT_PX = 56;

let logoDataUri: Promise<string> | undefined;

/** The logo as a data URI; an SVG drawn into a canvas can't load external files. */
function logo(): Promise<string> {
  logoDataUri ??= fetch("/icon.svg")
    .then((r) => r.text())
    .then((svg) => `data:image/svg+xml;base64,${btoa(svg)}`);
  return logoDataUri;
}

/** iPhone / iPad (iPadOS reports itself as a Mac with a touch screen). */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Running as an app added to the Home Screen rather than in a browser tab. */
function isStandalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
}

/**
 * True for the iOS home screen app, where window.print() does nothing; printing
 * there goes through the Share sheet instead. iOS Safari prints normally.
 */
export function needsShareToPrint(): boolean {
  return isIOS() && isStandalone();
}

/**
 * PNG of the label: the QR code with the logo, and the ID (e.g. "PYK4-DFD4") beneath.
 * `qrSvgMarkup` is the SVG from qrSvg(); its logo reference is inlined here.
 */
export async function labelPng(qrSvgMarkup: string, idText: string): Promise<Blob> {
  const svg = qrSvgMarkup.replace('href="/icon.svg"', `href="${await logo()}"`);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await img.decode();
    const height = (SIZE - QR) / 2 + QR + TEXT_GAP + FONT_PX + 40;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, SIZE, height);
    ctx.imageSmoothingEnabled = false; // keep QR modules crisp
    const x = (SIZE - QR) / 2;
    ctx.drawImage(img, x, x, QR, QR);
    ctx.fillStyle = "#000";
    ctx.font = `700 ${FONT_PX}px Menlo, "SF Mono", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(idText, SIZE / 2, x + QR + TEXT_GAP);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Couldn't create the label image.");
    return blob;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
