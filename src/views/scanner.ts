import { h } from "../dom";
import { normalizePublicId, qrPath } from "../../shared/publicId";

/** Hosts whose /q/ links we treat as ours (besides the page's own origin). */
const KNOWN_HOSTS = ["bevelflow.pages.dev"];
/** Decode at most this wide; plenty for a QR code and keeps phones fast. */
const SCAN_WIDTH = 640;
/** Time between decode attempts. */
const SCAN_INTERVAL_MS = 150;

/**
 * Where a scanned code should take us: "/q/<ID>" for a Bevelflow QR link
 * (or a bare record ID like "ABCD-EFGH"), otherwise null.
 */
export function scanTarget(text: string, origin: string): string | null {
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    const ours = url.origin === origin || KNOWN_HOSTS.includes(url.hostname);
    const m = /^\/q\/([^/]+)\/?$/.exec(url.pathname);
    const id = ours && m?.[1] ? normalizePublicId(decodeURIComponent(m[1])) : null;
    return id ? qrPath(id) : null;
  } catch {
    const id = normalizePublicId(trimmed);
    return id ? qrPath(id) : null;
  }
}

type Decoder = (frame: HTMLCanvasElement) => Promise<string | null>;

/** Native BarcodeDetector where the browser has one (Chrome/Android); jsQR otherwise (iPhone). */
async function createDecoder(): Promise<Decoder> {
  const BD = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (BD && (await BD.getSupportedFormats?.())?.includes("qr_code")) {
    const detector = new BD({ formats: ["qr_code"] });
    return async (frame) => (await detector.detect(frame))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr"); // loaded only when scanning
  return async (frame) => {
    const ctx = frame.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, frame.width, frame.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
  getSupportedFormats?(): Promise<string[]>;
}

/**
 * Full-screen camera view that reads a Bevelflow QR code and opens its /q/ link
 * inside the app (so you stay in the installed app and its sign-in).
 */
export function openScanner(): void {
  if (document.querySelector(".scanner")) return;

  const video = h("video", { class: "scanner-video", playsinline: true, muted: true, autoplay: true });
  video.setAttribute("playsinline", ""); // iOS: play inline instead of fullscreen
  video.muted = true;
  const message = h("p", { class: "scanner-message" }, "Point the camera at a Bevelflow QR code");
  const closeBtn = h("button", { class: "scanner-close", type: "button", "aria-label": "Close scanner" }, "✕");
  const overlay = h(
    "div",
    { class: "scanner", role: "dialog", "aria-label": "Scan QR code" },
    video,
    h("div", { class: "scanner-frame", "aria-hidden": "true" }),
    closeBtn,
    message,
  );

  let stream: MediaStream | null = null;
  let timer: number | undefined;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("hashchange", close);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", close);
  document.body.append(overlay);

  void (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera-api");
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      message.textContent = denied
        ? "Camera access was blocked. Allow camera access for Bevelflow in Settings, then try again."
        : "Couldn't start the camera on this device.";
      message.classList.add("is-error");
      return;
    }

    const decode = await createDecoder();
    const canvas = document.createElement("canvas");
    let lastBad = "";

    const tick = async (): Promise<void> => {
      if (closed) return;
      const w = video.videoWidth;
      const hgt = video.videoHeight;
      if (w && hgt) {
        const scale = Math.min(1, SCAN_WIDTH / w);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(hgt * scale);
        canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0, canvas.width, canvas.height);
        const text = await decode(canvas).catch(() => null);
        if (text && !closed) {
          const target = scanTarget(text, location.origin);
          if (target) {
            message.textContent = "Opening…";
            message.classList.remove("is-error");
            close();
            // Go through the /q/ redirect, same as scanning with the phone's camera app.
            location.assign(target);
            return;
          }
          if (text !== lastBad) {
            lastBad = text;
            message.textContent = "That isn't a Bevelflow QR code.";
            message.classList.add("is-error");
          }
        }
      }
      timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };
    void tick();
  })();
}
