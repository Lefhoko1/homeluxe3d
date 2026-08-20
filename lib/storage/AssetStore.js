/**
 * Where uploaded models and images go.
 *
 * NOT public/. That directory is baked into the build and the filesystem is
 * read-only once deployed, so a file written there by a running app would
 * vanish at the next deploy even if the write succeeded -- which on Vercel it
 * does not. Uploaded assets belong in object storage.
 *
 * THE PATH IS THE PERMISSION
 *
 *     <shop-slug>/<product-slug>/<file>
 *
 * The first segment names the owner, and the storage policy in migration
 * 0005 checks the caller may manage that shop:
 *
 *     can_manage_shop_slug((storage.foldername(name))[1])
 *
 * so a shop cannot write into another shop's folder. It is also legible --
 * `bradlows/sandton-sofa-3/three-seater.glb` tells you what it is from a
 * bucket listing, which a uuid never does.
 *
 * Both buckets are PUBLIC-READ on purpose. GLTFLoader and <img> fetch with no
 * Authorization header; signing every URL would mean a round trip per file
 * before the scene could draw. There is nothing private about an advert.
 */

import { getSupabase } from "../supabase/client";

export const MODEL_BUCKET = "product-models";
export const MEDIA_BUCKET = "product-media";

/** Kept in step with the bucket limits set in migration 0005. */
export const MAX_MODEL_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = "UploadError";
  }
}

export class AssetStore {
  constructor(client = null) {
    this.client = client ?? getSupabase();
    if (!this.client) {
      throw new UploadError(
        "No database is configured, so there is nowhere to upload to."
      );
    }
  }

  /**
   * Upload a .glb.
   *
   * `.gltf` is refused deliberately: a glTF is a JSON file that references
   * buffers and textures beside it, so uploading one file gives you a model
   * that cannot load. One self-contained binary per model is the contract the
   * whole product pipeline is built on.
   *
   * RETURNS THE PATH AS WELL AS THE URL, unlike putImage. A model is not just
   * a file to link to -- it is registered as a numbered asset version, and
   * `register_asset` identifies it by its storage path. Recovering that path
   * from the public URL afterwards is possible but silly when the caller
   * already had it.
   *
   * @returns {Promise<{url: string, path: string, bytes: number, mime: string}>}
   */
  async putModel(file, { shopSlug, productSlug, variantSlug = "default" }) {
    if (!file) throw new UploadError("No model file was chosen.");
    if (!/\.glb$/i.test(file.name)) {
      throw new UploadError(
        `${file.name} is not a .glb. A .gltf references other files beside ` +
        `it, so uploading it alone gives a model that cannot load -- export ` +
        `as glTF Binary (.glb) instead.`
      );
    }
    if (file.size > MAX_MODEL_BYTES) {
      throw new UploadError(
        `${humanSize(file.size)} is over the ${humanSize(MAX_MODEL_BYTES)} limit.`
      );
    }

    const mime = "model/gltf-binary";
    const path = `${slug(shopSlug)}/${slug(productSlug)}/${slug(variantSlug)}.glb`;
    const url = await this.#put(MODEL_BUCKET, path, file, mime);
    return { url, path, bytes: file.size, mime };
  }

  /** Upload a product photo. Returns its public URL. */
  async putImage(file, { shopSlug, productSlug, index = 0 }) {
    if (!file) throw new UploadError("No image was chosen.");
    if (!IMAGE_TYPES.includes(file.type)) {
      throw new UploadError(
        `${file.name} is a ${file.type || "unknown type"}. Use JPEG, PNG, WebP or AVIF.`
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new UploadError(
        `${humanSize(file.size)} is over the ${humanSize(MAX_IMAGE_BYTES)} limit.`
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${slug(shopSlug)}/${slug(productSlug)}/${index}-${stamp()}.${ext}`;
    return this.#put(MEDIA_BUCKET, path, file, file.type);
  }

  /**
   * Delete by public URL.
   *
   * Takes the URL rather than the path because that is what the database
   * rows carry -- callers should not have to reverse-engineer a bucket path
   * from a column they were handed.
   */
  async remove(url) {
    const parsed = parsePublicUrl(url);
    if (!parsed) return false;
    const { error } = await this.client.storage
      .from(parsed.bucket)
      .remove([parsed.path]);
    if (error) throw new UploadError(error.message);
    return true;
  }

  async #put(bucket, path, file, contentType) {
    const { error } = await this.client.storage.from(bucket).upload(path, file, {
      contentType,
      // Re-uploading a variant's model replaces it, so a corrected export
      // does not leave the old one orphaned under a slightly different name.
      upsert: true,
      cacheControl: "31536000",
    });

    if (error) throw new UploadError(explain(error, bucket));

    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}

/** Turn a storage error into something that says what to do about it. */
function explain(error, bucket) {
  const message = error?.message ?? String(error);
  if (/row-level security|not authorized|Unauthorized/i.test(message)) {
    return (
      "The storage policy refused this upload. Either you are not signed in, " +
      "or you do not manage the shop named in the first part of the path."
    );
  }
  if (/Bucket not found/i.test(message)) {
    return `Bucket '${bucket}' does not exist -- run supabase/migrations/0005_storage_and_admin.sql.`;
  }
  return message;
}

/** Split a Supabase public URL back into bucket and path. */
export function parsePublicUrl(url) {
  const match = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url ?? "");
  return match ? { bucket: match[1], path: decodeURIComponent(match[2]) } : null;
}

const slug = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";

const stamp = () => Date.now().toString(36);

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default AssetStore;
