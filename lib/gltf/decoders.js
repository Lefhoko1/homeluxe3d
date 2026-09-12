/**
 * The decoders a compressed .glb needs before it will open.
 *
 * A glTF file may store its geometry compressed, and the loader cannot
 * unpack it on its own: three.js ships the decoders separately and you have
 * to hand them over before calling `load`. Miss one and the failure is
 * confusing rather than obvious -- the file is valid, the server serves it,
 * and three.js reports a parse error mentioning the extension by name.
 *
 * Two are in use here:
 *
 *   KHR_draco_mesh_compression   -- what the house's own parts use.
 *   EXT_meshopt_compression      -- what modern exporters produce, often
 *                                   alongside KHR_mesh_quantization, which
 *                                   needs no decoder of its own.
 *
 * WHY THIS MODULE EXISTS AT ALL. Six places build a GLTFLoader -- the house,
 * the trees, products (twice), the walking character, and the admin's model
 * inspector -- and a decoder registered in five of them is a bug that only
 * shows up on whichever path was missed. An uploaded sofa that loads in the
 * admin preview and is invisible in the house is exactly that bug. So every
 * loader is built here.
 *
 * THE DECODERS ARE SHARED, not made per file. DRACOLoader starts a pool of
 * Web Workers; one pool per GLB would be seventeen pools for a single scene.
 * MeshoptDecoder is a module-level singleton by design and carries its own
 * `ready` promise, which GLTFLoader awaits.
 */

import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader, GLTFLoader } from "three-stdlib";

/** Where the Draco decoder binaries are served from. */
const DRACO_DECODER_PATH = "/draco/";

let sharedDraco = null;

/**
 * The one Draco decoder.
 *
 * No `setDecoderConfig`: the default detects WebAssembly and picks the 188KB
 * .wasm build, falling back to the 500KB .js one only where wasm is missing.
 * Forcing "js" would always pay the larger one.
 */
export function getDracoLoader() {
  if (!sharedDraco) {
    sharedDraco = new DRACOLoader();
    sharedDraco.setDecoderPath(DRACO_DECODER_PATH);
  }
  return sharedDraco;
}

/** Release the shared Draco workers. Safe when no load is running. */
export function disposeDracoLoader() {
  sharedDraco?.dispose();
  sharedDraco = null;
}

/**
 * The meshopt decoder.
 *
 * Pure WebAssembly with no worker pool and no files to serve -- it is
 * compiled into the bundle -- so there is nothing to dispose and nothing to
 * copy into `public/`.
 */
export function getMeshoptDecoder() {
  return MeshoptDecoder;
}

/**
 * A GLTFLoader that can open anything this app accepts.
 *
 * Use this instead of `new GLTFLoader()`. `manager` is passed through for
 * the callers that track loading progress.
 */
export function createGltfLoader(manager) {
  const loader = manager ? new GLTFLoader(manager) : new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  loader.setMeshoptDecoder(getMeshoptDecoder());
  return loader;
}
