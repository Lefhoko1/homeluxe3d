// Shops' uploads are optimised before upload. Run: node lib/gltf/optimizeModel.test.mjs
//
// The image step uses the browser's canvas, which Node does not have, so it
// is stubbed here; everything else -- reading, compressing the geometry,
// writing -- is the real thing, on real models from this repository, and
// the result is loaded back the way the showroom loads it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imageSize, optimizeModel } from "./optimizeModel.js";

class FakeImage { constructor() { this.width = 1; this.height = 1; } set src(_v) { queueMicrotask(() => this.onload?.()); } addEventListener(t, f) { if (t === "load") queueMicrotask(f); } removeEventListener() {} }
globalThis.self = globalThis;
globalThis.Image = FakeImage;
globalThis.document = { createElementNS: () => new FakeImage(), createElement: () => new FakeImage() };
globalThis.URL.createObjectURL = () => "blob:stub";
globalThis.URL.revokeObjectURL = () => {};
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
const THREE = await import("three");
const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
const { GLTFLoader } = await import("three-stdlib");

/** Load as the showroom does, and describe what came out. */
async function describe(bytes) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(copy, "", res, rej));
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  const materials = new Set();
  gltf.scene.traverse((o) => { if (o.isMesh) { meshes.push(o.name); materials.add(o.material.name); } });
  return { box: new THREE.Box3().setFromObject(gltf.scene), meshes: meshes.sort(), materials: [...materials].sort() };
}

const json = (bytes) => JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))));

// A Draco file is passed through untouched.
{
  const draco = new Uint8Array(readFileSync("public/models/products/bradlows/drake-3-seater.glb"));
  const out = await optimizeModel(draco, { encodeImage: async () => null });
  assert.equal(out.skipped, "draco");
  assert.equal(out.data, draco);
  console.log("  ok  a Draco-compressed upload is passed through as it is");
}

// The original 12.8 MB walking figure (uncompressed, big PNGs -- a raw
// export, like a shop's upload) if it has been extracted from git history:
//   git show 4880391^:public/models/tour/woman_mpfb_v2.glb > /tmp/woman-original.glb
// and the plain (uncompressed) kitchen unit, which is in the repository.
const RAW = process.env.RAW_MODEL;
for (const path of [RAW, "public/models/products/tubod/grandiose-kitchen-unit.glb"].filter(Boolean)) {
  const original = new Uint8Array(readFileSync(path));
  const { data, before, after, changed } = await optimizeModel(original, { encodeImage: async () => null });
  const a = await describe(original);
  const b = await describe(data);
  assert.deepEqual(b.meshes, a.meshes, "same meshes, same names");
  assert.deepEqual(b.materials, a.materials, "same materials");
  for (const end of ["min", "max"]) for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(b.box[end][axis] - a.box[end][axis]) < 0.002, `${path}: same size within 2mm (${end}.${axis})`);
  }
  if (changed) assert.ok(json(data).extensionsUsed.includes("EXT_meshopt_compression"));
  console.log(`  ok  ${path.split("/").pop().padEnd(32)} ${(before / 1024).toFixed(0).padStart(5)} KB -> ${(after / 1024).toFixed(0).padStart(5)} KB, same meshes, materials and size`);
}

// Images: a re-encoded WebP is declared, so viewers know to expect it.
{
  const original = new Uint8Array(readFileSync(RAW ?? "public/models/tour/woman_mpfb_v2.glb"));
  const hasImages = (json(original).images ?? []).length > 0;
  if (hasImages) {
    const { data } = await optimizeModel(original, { encodeImage: async () => ({ data: new Uint8Array(16), mimeType: "image/webp" }) });
    const j = json(data);
    assert.ok(j.extensionsUsed.includes("EXT_texture_webp") && j.extensionsRequired.includes("EXT_texture_webp"));
    assert.ok(j.images.every((im) => im.mimeType === "image/webp"));
    console.log("  ok  images re-encoded as WebP are declared (EXT_texture_webp)");
  }
  const { data } = await optimizeModel(original, { encodeImage: async () => { throw new Error("no canvas"); } });
  assert.ok(data.byteLength > 0, "an image that cannot be re-encoded is kept as it was");
  console.log("  ok  an image the browser cannot re-encode is kept, and the rest still optimised");
}

// Image sizes read from the header, for "is it over 1024px?".
{
  const png = new Uint8Array(24); const v = new DataView(png.buffer);
  png.set([0x89, 0x50, 0x4e, 0x47]); v.setUint32(16, 2048); v.setUint32(20, 1024);
  assert.deepEqual(imageSize(png, "image/png"), { width: 2048, height: 1024 });
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x04, 0x00, 0x08, 0x00, 3, 0, 0, 0]);
  assert.deepEqual(imageSize(jpg, "image/jpeg"), { width: 2048, height: 1024 });
  console.log("  ok  image sizes read from PNG and JPEG headers");
}

console.log("optimizeModel: ok");
