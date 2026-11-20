/**
 * Audio narration: shops talking the visitor through their product.
 *
 * A narration is up to SIX clips, each up to THIRTY SECONDS, each tied to an
 * ELEVATION of the product -- front, sides, back, top, a close detail -- the
 * same views the 3D model was generated from. The tour plays them in order and
 * turns the camera to each elevation as its clip plays.
 *
 * The database holds the rules (supabase/migrations/0028_audio_narration.sql):
 * the limits are CHECK constraints, who may record is row-level security, and
 * publishing is refused unless the shop's plan or an add-on includes the
 * feature. This module is the browser's side of that -- it never decides
 * anything the database would not also enforce.
 */

import { getSupabase } from "../supabase/client";
import { AssetStore, AUDIO_BUCKET } from "../storage/AssetStore";

export const MAX_CLIPS = 6;
export const MAX_CLIP_MS = 30_000;
/** Shorter than this is a slip of the finger, not a clip. */
export const MIN_CLIP_MS = 500;

/**
 * The elevations a clip can show, in the order a shop would usually talk
 * through them. `yaw` is where the camera stands, in degrees round the piece
 * from its FRONT (0 = in front, 90 = its left side as you face it, 180 =
 * behind); `pitch` is how far above it looks down. Read by the tour as well
 * as the recorder, so the angle a shop picks while recording is the angle the
 * visitor sees.
 */
export const ELEVATIONS = [
  { id: "front",  label: "Front",        yaw: 0,    pitch: 12 },
  { id: "left",   label: "Left side",    yaw: 90,   pitch: 12 },
  { id: "right",  label: "Right side",   yaw: -90,  pitch: 12 },
  { id: "back",   label: "Back",         yaw: 180,  pitch: 12 },
  { id: "top",    label: "From above",   yaw: 25,   pitch: 62 },
  { id: "detail", label: "Close detail", yaw: 30,   pitch: 18, close: true },
];

export const elevationOf = (id) => ELEVATIONS.find((e) => e.id === id) ?? ELEVATIONS[0];

/** Make the database's refusals read like what to do about them. */
function explain(error) {
  const message = error?.message ?? String(error);
  if (/narration_clips_duration_ms_check/.test(message)) {
    return `A clip can be at most ${MAX_CLIP_MS / 1000} seconds.`;
  }
  if (/narration_clips_position_check/.test(message)) {
    return `A product can have at most ${MAX_CLIPS} clips.`;
  }
  if (/row-level security/i.test(message)) {
    return "You do not manage this product's shop, so you cannot change its narration.";
  }
  return message;
}

export class NarrationService {
  constructor(client = null) {
    this.client = client ?? getSupabase();
    if (!this.client) {
      throw new Error("No database is configured, so narration cannot be saved.");
    }
  }

  #store() {
    return new AssetStore(this.client);
  }

  /** May this shop PUBLISH narration right now? (Recording is always allowed.) */
  async canPublish(shopId) {
    const { data, error } = await this.client.rpc("shop_has_feature", {
      p_shop: shopId,
      p_feature: "audio_narration",
    });
    if (error) throw new Error(explain(error));
    return Boolean(data);
  }

  /**
   * Everything the recorder needs about one product: the narration's status,
   * its clips in order, and the slugs its files are stored under.
   */
  async load(productId) {
    const [product, narration, clips] = await Promise.all([
      this.client
        .from("products")
        .select("id, slug, name, shop_id, shops!inner(slug, name)")
        .eq("id", productId)
        .single(),
      this.client
        .from("product_narrations")
        .select("status, published_at")
        .eq("product_id", productId)
        .maybeSingle(),
      this.client
        .from("narration_clips")
        .select("id, position, elevation, audio_url, audio_path, duration_ms, image_url")
        .eq("product_id", productId)
        .order("position"),
    ]);
    for (const result of [product, narration, clips]) {
      if (result.error) throw new Error(explain(result.error));
    }
    return {
      product: {
        id: product.data.id,
        slug: product.data.slug,
        name: product.data.name,
        shopId: product.data.shop_id,
        shopSlug: product.data.shops.slug,
        shopName: product.data.shops.name,
      },
      status: narration.data?.status ?? "none",
      publishedAt: narration.data?.published_at ?? null,
      clips: (clips.data ?? []).map(rowToClip),
    };
  }

  /** The narration row has to exist before its first clip. */
  async #ensureDraft(productId) {
    const { error } = await this.client
      .from("product_narrations")
      .upsert({ product_id: productId }, { onConflict: "product_id", ignoreDuplicates: true });
    if (error) throw new Error(explain(error));
  }

  /**
   * Record a new clip: upload the audio, then add the row at the end.
   *
   * @param {object} product   from `load`
   * @param {object} clip
   * @param {Blob}   clip.audio
   * @param {number} clip.durationMs
   * @param {string} clip.elevation  one of ELEVATIONS
   * @param {string} [clip.imageUrl] the elevation photograph, if any
   * @param {number} position   where it goes -- the next free slot
   */
  async addClip(product, { audio, durationMs, elevation, imageUrl = null }, position) {
    checkDuration(durationMs);
    if (position >= MAX_CLIPS) throw new Error(`A product can have at most ${MAX_CLIPS} clips.`);
    await this.#ensureDraft(product.id);
    const uploaded = await this.#store().putAudio(audio, {
      shopSlug: product.shopSlug,
      productSlug: product.slug,
      elevation,
    });
    const { data, error } = await this.client
      .from("narration_clips")
      .insert({
        product_id: product.id,
        position,
        elevation,
        audio_url: uploaded.url,
        audio_path: uploaded.path,
        duration_ms: Math.round(durationMs),
        image_url: imageUrl,
      })
      .select()
      .single();
    if (error) {
      // The file is useless without its row.
      await this.#store().removePath(AUDIO_BUCKET, uploaded.path).catch(() => {});
      throw new Error(explain(error));
    }
    return rowToClip(data);
  }

  /** Record over an existing clip. The old file goes once the row moves on. */
  async replaceAudio(product, clip, { audio, durationMs }) {
    checkDuration(durationMs);
    const uploaded = await this.#store().putAudio(audio, {
      shopSlug: product.shopSlug,
      productSlug: product.slug,
      elevation: clip.elevation,
    });
    const { data, error } = await this.client
      .from("narration_clips")
      .update({
        audio_url: uploaded.url,
        audio_path: uploaded.path,
        duration_ms: Math.round(durationMs),
      })
      .eq("id", clip.id)
      .select()
      .single();
    if (error) {
      await this.#store().removePath(AUDIO_BUCKET, uploaded.path).catch(() => {});
      throw new Error(explain(error));
    }
    await this.#store().removePath(AUDIO_BUCKET, clip.audioPath).catch(() => {});
    return rowToClip(data);
  }

  /** Change which elevation a clip shows, or its photograph. */
  async updateClip(clipId, { elevation, imageUrl }) {
    const patch = {};
    if (elevation !== undefined) patch.elevation = elevation;
    if (imageUrl !== undefined) patch.image_url = imageUrl;
    const { data, error } = await this.client
      .from("narration_clips")
      .update(patch)
      .eq("id", clipId)
      .select()
      .single();
    if (error) throw new Error(explain(error));
    return rowToClip(data);
  }

  /** Delete a clip and its file, and close the gap it leaves. */
  async deleteClip(product, clip, remaining) {
    const { error } = await this.client.from("narration_clips").delete().eq("id", clip.id);
    if (error) throw new Error(explain(error));
    await this.#store().removePath(AUDIO_BUCKET, clip.audioPath).catch(() => {});
    if (remaining.length) await this.reorder(product.id, remaining.map((c) => c.id));
  }

  /** Put the clips in this order -- one statement, see the migration. */
  async reorder(productId, clipIds) {
    const { error } = await this.client.rpc("reorder_narration_clips", {
      p_product: productId,
      p_clip_ids: clipIds,
    });
    if (error) throw new Error(explain(error));
  }

  /** Switch it on for the tour. Refused by the database without the feature. */
  async publish(productId) {
    await this.#ensureDraft(productId);
    const { error } = await this.client
      .from("product_narrations")
      .update({ status: "published" })
      .eq("product_id", productId);
    if (error) throw new Error(explain(error));
  }

  /** Take it off the tour, keeping the recordings. */
  async unpublish(productId) {
    const { error } = await this.client
      .from("product_narrations")
      .update({ status: "draft" })
      .eq("product_id", productId);
    if (error) throw new Error(explain(error));
  }
}

function checkDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < MIN_CLIP_MS) {
    throw new Error("That recording is too short to keep.");
  }
  if (durationMs > MAX_CLIP_MS + 500) {
    throw new Error(`A clip can be at most ${MAX_CLIP_MS / 1000} seconds.`);
  }
}

function rowToClip(row) {
  return {
    id: row.id,
    position: row.position,
    elevation: row.elevation,
    audioUrl: row.audio_url,
    audioPath: row.audio_path,
    durationMs: row.duration_ms,
    imageUrl: row.image_url ?? null,
  };
}

/**
 * The showroom's read: every published narration of a live, entitled shop,
 * keyed by the product's qualified id (`bradlows.drake-3-seater`) -- the same
 * id the tour's adverts carry. Never throws: no narration is a tour without
 * voices, not a broken tour.
 *
 * @returns {Promise<Map<string, {shopName: string, logoUrl: string|null, clips: Array}>>}
 */
export async function fetchLiveNarrations(client = null) {
  const supabase = client ?? getSupabase();
  const byProduct = new Map();
  if (!supabase) return byProduct;
  try {
    const { data, error } = await supabase
      .from("v_live_narrations")
      .select("qualified_id, shop_name, shop_logo_url, clips");
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const clips = (row.clips ?? []).filter((c) => c?.audioUrl && c.durationMs > 0);
      if (!clips.length) return;
      byProduct.set(row.qualified_id, {
        shopName: row.shop_name,
        logoUrl: row.shop_logo_url ?? null,
        clips,
      });
    });
  } catch (error) {
    console.warn("[narration] none loaded:", error?.message ?? error);
  }
  return byProduct;
}
