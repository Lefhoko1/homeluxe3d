// The browser side of narration, against a stand-in Supabase client.
// Run: node lib/narration/NarrationService.test.mjs
import assert from "node:assert/strict";
import { NarrationService, fetchLiveNarrations, MAX_CLIPS } from "./NarrationService.js";

/** A tiny fake of the parts of supabase-js the service uses. */
function fakeClient({ insertError = null, uploads = [], removed = [], calls = [], views = [] } = {}) {
  const chain = (table) => {
    const q = {
      _table: table, _op: "select",
      select() { return q; }, eq() { return q; }, order() { return q; }, not() { return q; }, limit() { return q; },
      upsert(row) { calls.push(["upsert", table, row]); q._op = "upsert"; return q; },
      insert(row) { calls.push(["insert", table, row]); q._op = "insert"; q._row = row; return q; },
      update(row) { calls.push(["update", table, row]); q._op = "update"; q._row = row; return q; },
      delete() { calls.push(["delete", table]); q._op = "delete"; return q; },
      single() { return q.then((r) => r); }, maybeSingle() { return q.then((r) => r); },
      then(resolve) {
        if (table === "v_live_narrations") return Promise.resolve({ data: views, error: null }).then(resolve);
        if (q._op === "insert" && insertError) return Promise.resolve({ data: null, error: insertError }).then(resolve);
        const row = { id: "c1", position: 0, elevation: "front", audio_url: "u", audio_path: "p", duration_ms: 12000, ...(q._row ?? {}) };
        return Promise.resolve({ data: row, error: null }).then(resolve);
      },
    };
    return q;
  };
  return {
    from: chain,
    rpc: async (name, args) => { calls.push(["rpc", name, args]); return { data: true, error: null }; },
    storage: {
      from: (bucket) => ({
        upload: async (path, file, opts) => { uploads.push({ bucket, path, type: opts.contentType }); return { error: null }; },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://x/storage/v1/object/public/${bucket}/${path}` } }),
        remove: async (paths) => { removed.push(...paths); return { error: null }; },
      }),
    },
  };
}

const product = { id: "p1", slug: "drake-3-seater", shopSlug: "bradlows", shopId: "s1" };
const take = { audio: new Blob(["x"], { type: "audio/webm;codecs=opus" }), durationMs: 12000, elevation: "left" };

// A clip uploads to the shop's own folder, as a plain audio type, then gets its row.
{
  const uploads = [], calls = [];
  const service = new NarrationService(fakeClient({ uploads, calls }));
  const clip = await service.addClip(product, take, 0);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, "product-audio");
  assert.match(uploads[0].path, /^bradlows\/drake-3-seater\/left-[a-z0-9]+\.webm$/);
  assert.equal(uploads[0].type, "audio/webm", "codec parameter stripped for the bucket");
  const order = calls.map(([op, t]) => `${op}:${t}`);
  assert.deepEqual(order, ["upsert:product_narrations", "insert:narration_clips"], "draft row first, then the clip");
  assert.equal(clip.elevation, "left");
  console.log(`  ok  a clip goes to ${uploads[0].path} and its row follows`);
}

// If the row is refused, the uploaded file does not stay behind.
{
  const uploads = [], removed = [];
  const service = new NarrationService(fakeClient({
    uploads, removed,
    insertError: { message: 'new row for relation "narration_clips" violates check constraint "narration_clips_position_check"' },
  }));
  await assert.rejects(service.addClip(product, take, 5), /at most 6 clips/);
  assert.equal(removed.length, 1, "the orphaned upload is removed");
  assert.equal(removed[0], uploads[0].path);
  console.log("  ok  a refused clip leaves no file behind, and says why in words");
}

// The limits are checked before anything is uploaded.
{
  const uploads = [];
  const service = new NarrationService(fakeClient({ uploads }));
  await assert.rejects(service.addClip(product, { ...take, durationMs: 31_000 }, 0), /at most 30 seconds/);
  await assert.rejects(service.addClip(product, { ...take, durationMs: 200 }, 0), /too short/);
  await assert.rejects(service.addClip(product, take, MAX_CLIPS), /at most 6 clips/);
  await assert.rejects(service.addClip(product, { ...take, audio: new Blob(["x"], { type: "video/mp4" }) }, 0), /MP3, M4A, WAV/);
  assert.equal(uploads.length, 0, "nothing uploaded for a clip that cannot be kept");
  console.log("  ok  too long, too short, a seventh clip and a video are refused before uploading");
}

// Re-recording replaces the file only once the row points at the new one.
{
  const uploads = [], removed = [];
  const service = new NarrationService(fakeClient({ uploads, removed }));
  await service.replaceAudio(product, { id: "c1", elevation: "front", audioPath: "bradlows/drake-3-seater/front-old.webm" }, take);
  assert.equal(uploads.length, 1);
  assert.deepEqual(removed, ["bradlows/drake-3-seater/front-old.webm"]);
  console.log("  ok  recording again swaps the file and removes the old one");
}

// The showroom read: keyed by qualified id, empty narrations skipped, never throws.
{
  const views = [
    { qualified_id: "bradlows.drake-3-seater", shop_name: "Bradlows", shop_logo_url: null,
      clips: [{ position: 0, elevation: "front", audioUrl: "a.webm", durationMs: 12000 }] },
    { qualified_id: "bears.bed", shop_name: "Bears", clips: [] },
  ];
  const live = await fetchLiveNarrations(fakeClient({ views }));
  assert.deepEqual([...live.keys()], ["bradlows.drake-3-seater"]);
  assert.equal(live.get("bradlows.drake-3-seater").clips[0].elevation, "front");
  const broken = await fetchLiveNarrations({ from: () => { throw new Error("offline"); } });
  assert.equal(broken.size, 0);
  console.log("  ok  the tour gets narrations by product id, and an outage is just silence");
}

console.log("NarrationService: ok");
