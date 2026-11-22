/**
 * Make an uploaded model light enough for a phone, in the browser, before it
 * is uploaded.
 *
 * WHY. Shops upload what their 3D tool exported: a sofa made from photos
 * arrives at ~2 MB, most of it uncompressed geometry and images far larger
 * than a phone will ever show. The walking figure was the same story -- 12.8
 * MB, of which a 2048px texture for her teeth. Every visitor downloads every
 * model in the house, so this is the difference between a showroom that
 * opens on a budget phone and one that does not.
 *
 * WHAT, in this order:
 *
 *   1. dedup + prune     identical data stored once; unused data dropped
 *   2. images            anything over 1024px scaled down; opaque images
 *                        saved as JPEG, images with transparency as WebP where
 *                        the browser can write it (PNG where it cannot --
 *                        older Safari silently writes PNG for "webp")
 *   3. meshopt           geometry quantised and compressed (the showroom's
 *                        loader already has the decoder: lib/gltf/decoders.js)
 *
 * DRACO FILES ARE PASSED THROUGH. A model already compressed with Draco is
 * compact, and reading it needs a decoder that does not bundle cleanly into
 * a browser page -- so it is uploaded as it is.
 *
 * It changes how the model is STORED, not what it is: the same meshes,
 * materials, names and size. It runs entirely in the browser and contacts
 * nothing. If anything about it fails, the caller uploads the original --
 * an upload is never blocked by its optimisation.
 */

import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

/** Longest side, in pixels, any texture keeps. */
export const MAX_TEXTURE = 1024;
/** Not worth replacing the original for less than this saving. */
const MIN_SAVING = 0.05;

/**
 * Re-encode one image in the browser. Returns `{data, mimeType}`, or null to
 * keep the original. Replaceable, so the geometry path can be tested in Node.
 */
export async function browserEncodeImage(bytes, mimeType, { max = MAX_TEXTURE } = {}) {
  if (typeof createImageBitmap === "undefined") return null;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }), {
    // Keep the numbers as they are: a normal map or a roughness map is data,
    // not a picture, and colour conversion would bend it.
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  // Does it use transparency? Sampled -- every pixel of a 1024 image is a
  // million reads for a yes/no question.
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(4, Math.floor(pixels.length / 4 / 40000) * 4);
  let alpha = false;
  for (let i = 3; i < pixels.length; i += step) {
    if (pixels[i] < 250) { alpha = true; break; }
  }

  const encode = async (type, quality) => {
    const blob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type, quality })
      : await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    return blob;
  };

  let blob;
  if (!alpha) {
    blob = await encode("image/jpeg", 0.85);
  } else {
    blob = await encode("image/webp", 0.85);
    // Asked for WebP and got PNG: this browser cannot write WebP.
    if (blob?.type !== "image/webp") blob = await encode("image/png");
  }
  if (!blob) return null;
  return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type };
}

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * @param {File|Blob|Uint8Array} input   a .glb
 * @param {object} [options]
 * @param {Function} [options.encodeImage]  see browserEncodeImage
 * @param {number}   [options.maxTexture]
 * @returns {Promise<{data: Uint8Array, before: number, after: number,
 *                    changed: boolean}>}
 */
export async function optimizeModel(input, { encodeImage = browserEncodeImage, maxTexture = MAX_TEXTURE } = {}) {
  const original = input instanceof Uint8Array
    ? input
    : new Uint8Array(await input.arrayBuffer());

  const used = glbJson(original)?.extensionsUsed ?? [];
  if (used.includes("KHR_draco_mesh_compression")) {
    return { data: original, before: original.byteLength, after: original.byteLength, changed: false, skipped: "draco" };
  }

  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

  const doc = await io.readBinary(original);
  await doc.transform(dedup(), prune());

  // ---- images ----------------------------------------------------------
  let webp = false;
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    const mimeType = texture.getMimeType();
    if (!image || !EXTENSION[mimeType]) continue;   // KTX2 etc: leave alone
    let encoded = null;
    try {
      encoded = await encodeImage(image, mimeType, { max: maxTexture });
    } catch {
      encoded = null;
    }
    if (!encoded || !EXTENSION[encoded.mimeType]) continue;
    // Keep whichever is smaller, unless the original was too big to keep.
    const tooBig = await isOversized(image, mimeType, maxTexture);
    if (encoded.data.byteLength >= image.byteLength && !tooBig) continue;
    texture.setImage(encoded.data).setMimeType(encoded.mimeType);
    const uri = texture.getURI();
    if (uri) texture.setURI(uri.replace(/\.[a-z0-9]+$/i, `.${EXTENSION[encoded.mimeType]}`));
    if (encoded.mimeType === "image/webp") webp = true;
  }
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);

  // ---- geometry ----------------------------------------------------------
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  const data = await io.writeBinary(doc);
  const changed = data.byteLength < original.byteLength * (1 - MIN_SAVING);
  return {
    data: changed ? data : original,
    before: original.byteLength,
    after: changed ? data.byteLength : original.byteLength,
    changed,
  };
}

/** The JSON chunk of a .glb, or null if it is not one. */
function glbJson(bytes) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) return null;   // "glTF"
    const length = view.getUint32(12, true);
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  } catch {
    return null;
  }
}

/** Is a PNG/JPEG/WebP larger than `max` on its longest side? Header only. */
async function isOversized(bytes, mimeType, max) {
  const size = imageSize(bytes, mimeType);
  return size ? Math.max(size.width, size.height) > max : false;
}

/** Width and height from the file header, without decoding the image. */
export function imageSize(bytes, mimeType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === "image/png" && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}
