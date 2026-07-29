/**
 * CLAIRITY — Image resize utility for AI upload.
 *
 * Walks a compression ladder to keep image bytes under the request-body limit,
 * using expo-image-manipulator. Estimates base64 byte length without the Buffer
 * package (unavailable in Expo Go).
 *
 * The manipulator is native-only in practice. Its web implementation loads the
 * source through an `<img>` tagged `crossOrigin = "anonymous"`, and on failure
 * rejects with the bare `HTMLCanvasElement` rather than an Error
 * (expo-image-manipulator/src/web/utils.web.ts, `loadImageAsync`). That is why
 * this module cannot simply trust the ladder: on web it can reject with a value
 * that is not throwable-shaped, and the message the user sees would be
 * meaningless. When the ladder fails for any reason we fall back to reading the
 * source bytes directly, which needs no canvas and works on both platforms.
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

const DEFAULT_MAX_BYTES = 3_000_000;

const LADDER = [
  { width: 1280, compress: 0.82 },
  { width: 1024, compress: 0.78 },
  { width: 832, compress: 0.74 },
  { width: 640, compress: 0.7 },
  { width: 512, compress: 0.65 },
] as const;

/** Media types the Anthropic API will accept as image input. */
const SUPPORTED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export const PDF_MIME = "application/pdf";

/**
 * PDFs go to the model whole, so the ceiling is the request limit rather than
 * the image budget. Anything larger is almost certainly a scanned book rather
 * than a report, and would be slow and expensive to read.
 */
const PDF_MAX_BYTES = 12_000_000;

const isPdf = (uri: string, mimeType?: string): boolean =>
  mimeType === PDF_MIME || /\.pdf($|\?)/i.test(uri);

export interface UploadImage {
  base64: string;
  mimeType: string;
}

const stripDataUriPrefix = (b64: string): string => {
  if (!b64.startsWith("data:")) return b64;
  const comma = b64.indexOf(",");
  return comma === -1 ? b64 : b64.slice(comma + 1);
};

/**
 * Estimate the byte length of a base64 string.
 * Base64 encodes 3 bytes per 4 characters, minus padding.
 */
function estimateBase64Bytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.onloadend = () => resolve(stripDataUriPrefix(String(reader.result ?? "")));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resize on web with our own canvas.
 *
 * This is what expo-image-manipulator's web path is meant to do, minus the one
 * line that breaks it: it sets `crossOrigin = "anonymous"` on the loader, which
 * makes the browser refuse the blob and data URLs the file picker produces. The
 * source here is always the user's own local file, so no cross-origin handling
 * is wanted at all. Returns null instead of throwing so the caller can fall
 * through to its next option.
 */
async function resizeViaCanvas(uri: string, width: number, quality: number): Promise<string | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") return null;

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = uri;
  });
  if (!image?.naturalWidth) return null;

  // Only ever scale down; upscaling a small document would add bytes and no detail.
  const scale = Math.min(1, width / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  try {
    return stripDataUriPrefix(canvas.toDataURL("image/jpeg", quality));
  } catch {
    // A tainted canvas throws here. Cannot happen for a local file, but the
    // export is the one call that can fail after everything else succeeded.
    return null;
  }
}

/**
 * Read the source image as-is, without resizing.
 *
 * Used when the manipulator is unavailable or fails. Returns null rather than
 * throwing so the caller can report the original failure, and refuses anything
 * over the byte ceiling or in a format the API will not accept — an oversized
 * upload would only fail later with a less obvious error.
 */
async function readSourceBytes(
  uri: string,
  maxBytes: number,
  forceMimeType?: string,
): Promise<UploadImage | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    if (blob.size > maxBytes) return null;

    // Only claim a type we can vouch for. Labelling an unrecognised blob as
    // JPEG just moves the failure to the API, where the message is worse — a
    // HEIC from the photo library is the realistic case.
    const detected = SUPPORTED_MIME.includes(blob.type as (typeof SUPPORTED_MIME)[number])
      ? blob.type
      : null;
    const mimeType = forceMimeType ?? detected;
    if (!mimeType) return null;

    const base64 = await blobToBase64(blob);
    return base64 ? { base64, mimeType } : null;
  } catch {
    return null;
  }
}

/**
 * Prepare any supported source for upload.
 *
 * A PDF is sent as-is: its text is already digital, so rasterising it — which
 * is what "screenshot the page and photograph it" amounted to — throws away the
 * one input that needs no reading at all. Patient-portal results are usually
 * PDFs, which made the app worst at the document people most often have.
 * Images still go down the resize ladder.
 */
export async function prepareForUpload(uri: string, mimeType?: string): Promise<UploadImage> {
  if (!isPdf(uri, mimeType)) return resizeForUpload(uri);

  const bytes = await readSourceBytes(uri, PDF_MAX_BYTES, PDF_MIME);
  if (bytes) return bytes;

  throw new Error(
    "This PDF is too large or could not be opened. Please try a photo of the page instead.",
  );
}

/**
 * Resize an Expo image URI into raw base64 that fits inside the request-body
 * limit for image input requests.
 */
export async function resizeForUpload(
  imageUri: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<UploadImage> {
  // On web the manipulator cannot load a local file at all, so go straight to
  // our own canvas rather than failing five times first.
  const onWeb = Platform.OS === "web";
  let resizerFailed = false;

  for (const step of LADDER) {
    let base64: string | null = null;

    if (onWeb) {
      base64 = await resizeViaCanvas(imageUri, step.width, step.compress);
      if (!base64) {
        resizerFailed = true;
        break;
      }
    } else {
      try {
        const result = await manipulateAsync(
          imageUri,
          [{ resize: { width: step.width } }],
          { format: SaveFormat.JPEG, compress: step.compress, base64: true },
        );
        base64 = result.base64 ? stripDataUriPrefix(result.base64) : null;
      } catch {
        // Every rung uses the same loader, so one failure means all five will.
        resizerFailed = true;
        break;
      }
    }

    if (base64 && estimateBase64Bytes(base64) <= maxBytes) {
      return { base64, mimeType: "image/jpeg" };
    }
  }

  // Either the resizer is unavailable, or even the smallest rung stayed over
  // the ceiling. Sending the untouched file still succeeds when it is small
  // enough to begin with.
  const original = await readSourceBytes(imageUri, maxBytes);
  if (original) return original;

  throw new Error(
    resizerFailed
      ? "This image could not be prepared for upload. Please try a different photo."
      : "This photo is too large to process, even after shrinking it. Please take a new photo showing just the document.",
  );
}
