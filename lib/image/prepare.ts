/**
 * Client-side receipt preparation, run before upload.
 *
 * Three jobs, all of which matter:
 *  1. Downscale to Claude's 2576px input ceiling — anything larger is wasted
 *     bytes on a phone connection and wasted image tokens on the API.
 *  2. Re-encode to JPEG, which normalizes iPhone HEIC without a decoder library
 *     (the browser already decoded it to draw the canvas).
 *  3. Strip EXIF, which otherwise carries the GPS coordinates of the restaurant.
 *
 * PDFs pass through untouched — Claude reads them natively.
 */

const MAX_EDGE = 2576;
const QUALITY = 0.85;

export async function prepareReceipt(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation honours the EXIF rotation flag before we discard EXIF,
    // so a photo taken sideways doesn't reach the model upside down.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Unknown or unsupported encoding — let the server reject it with a
    // sensible message rather than failing silently here.
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return file;

  return new File([blob], replaceExtension(file.name, "jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "receipt";
  return `${base}.${extension}`;
}
