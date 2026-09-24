/**
 * The tour character model.
 *
 * Facing +Y in Blender, which the exporter turns into -Z in three.js. The
 * controller's heading of 0 means -Z for exactly that reason: they have to
 * agree, or the character walks backwards.
 *
 * Three kinds of model work here. The oldest is built by
 * `blender/houseluxe/components/character.py` out of thirteen rigid parts. Then
 * a photographic reconstruction, a single skin over a skeleton, rigged by the
 * model generator's `blender/rig_character.py`. The current one is a MakeHuman
 * figure built in MPFB -- dressed, and on heels, which is why she measures
 * 1.85m rather than the 1.70m the reconstruction did. She carries a Mixamo
 * skeleton, so her bones are named and oriented differently from the
 * reconstruction's; `gait.js` handles that. All three stand with their feet at
 * the origin and face -Z, and `gait.js` drives whichever it finds.
 *
 * Her heels are baked into the rest pose rather than posed on top of it, so a
 * walk that rotates her legs cannot stand her flat-footed inside her shoes.
 */

import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { createGltfLoader } from "../../../lib/gltf/decoders";

export const TOUR_CHARACTER_URL = "/models/tour/woman_mpfb_v2.glb";

/**
 * Where the visitor starts, in house-local metres AFTER recentring.
 *
 * On the driveway at the street end, facing the front door — so the tour
 * begins by walking up to the house rather than inside it, which is what
 * "come from outside" means.
 *
 * Derived from the site plan: the driveway runs x 3,800..7,400 at
 * y -14,000..-1,500 in Blender millimetres, so its centre line is x 5,600.
 * Recentring shifts the house by about (-6.6, +0.3, +4.95) metres.
 */
export const TOUR_START = {
  position: [-1.0, 13.5],   // [x, z] metres
  heading: 0,               // 0 = facing -Z = north = toward the house
};

/**
 * How tall the visitor is, in metres.
 *
 * The model is built at 1.70m. Shrinking it to 1.55m is not about realism --
 * it is about how much of a 3m-deep bedroom the figure occupies when the
 * camera has to sit two metres behind it. A shorter figure leaves more of the
 * room visible over its shoulder, and 1.55m is still a plausible adult
 * standing next to a 2.1m door head, so the sense of scale a walk-through
 * exists to give is not thrown away.
 */
export const CHARACTER_HEIGHT = 1.55;
/** Assumed only if the model turns out to have no measurable size. */
const MODEL_HEIGHT = 1.70;

/** Load the character, or return null if it is missing. */
export async function loadCharacter({ materials = null, dracoLoader = null } = {}) {
  // Both decoders, always. See lib/gltf/decoders.js -- `dracoLoader` is
  // still accepted so callers that share one keep sharing it.
  const loader = createGltfLoader();
  if (dracoLoader) loader.setDRACOLoader(dracoLoader);

  const scene = await new Promise((resolve, reject) => {
    loader.load(TOUR_CHARACTER_URL, (gltf) => resolve(gltf.scene), undefined, reject);
  });

  scene.name = "tour-character";
  scene.visible = false;   // shown only while the tour is running
  // The model is MEASURED rather than assumed to be 1.70m, so a figure built
  // to any height -- a reconstruction is whatever height its subject was --
  // still stands 1.55m in the house. Feet stay at the origin, so scaling does
  // not lift the character off the floor or sink it into the slab.
  const measured = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
  scene.scale.setScalar(CHARACTER_HEIGHT / (measured > 0.1 ? measured : MODEL_HEIGHT));

  scene.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    // A skinned figure's bounds are its REST pose, so a swinging limb can
    // cross the edge of the screen and take the whole figure with it.
    if (child.isSkinnedMesh) child.frustumCulled = false;
    const override = materials?.get(child.material?.name);
    if (override) child.material = override;
  });

  return scene;
}

/** Free the character's geometry. */
export function disposeCharacter(character) {
  if (!character) return;
  character.traverse((child) => {
    if (child.isMesh) child.geometry?.dispose();
  });
}
