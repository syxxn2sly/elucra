/**
 * CLAIRITY — Image resize utility for AI upload.
 *
 * Walks a compression ladder to keep image bytes under the Vercel 4.5 MB
 * request-body limit. Uses expo-image-manipulator's manipulateAsync API.
 * Estimates base64 byte length without the Buffer package (unavailable in Expo Go).
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const DEFAULT_MAX_BYTES = 3_000_000;

const LADDER = [
  { width: 1280, compress: 0.82 },
  { width: 1024, compress: 0.78 },
  { width: 832, compress: 0.74 },
  { width: 640, compress: 0.7 },
  { width: 512, compress: 0.65 },
] as const;

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

/**
 * Resize an Expo image URI into a raw-base64 JPEG that fits inside the
 * Vercel request-body limit for image input requests.
 */
export async function resizeForUpload(
  imageUri: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  for (const step of LADDER) {
    const result = await manipulateAsync(
      imageUri,
      [{ resize: { width: step.width } }],
      {
        format: SaveFormat.JPEG,
        compress: step.compress,
        base64: true,
      },
    );

    if (result.base64 && estimateBase64Bytes(result.base64) <= maxBytes) {
      return {
        base64: stripDataUriPrefix(result.base64),
        mimeType: "image/jpeg",
      };
    }
  }

  throw new Error("IMAGE_TOO_LARGE");
}
