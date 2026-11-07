/** Longest side of a stored photo, in pixels. */
const MAX_EDGE = 1600;
/** JPEG quality (0–1). ~0.7 keeps a phone photo around 150–300 KB at 1600 px. */
const QUALITY = 0.7;

/**
 * Shrinks a camera photo to "medium quality" JPEG before upload.
 * createImageBitmap applies the photo's EXIF rotation, so the result is upright.
 */
export async function resizeToJpeg(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo format isn't supported by this browser.");
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process the photo.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("Couldn't process the photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}
