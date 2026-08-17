/**
 * Loads the house from its per-component GLBs.
 *
 * Parts load in parallel and are kept as separate child groups rather than
 * being merged, so each one stays individually addressable: hide the roof,
 * swap the windows, reload only the walls. That is the point of exporting
 * them separately in the first place.
 *
 * A part that fails to load does not take the house down with it -- the
 * failure is collected and returned, and the rest of the building still
 * renders. A missing roof is better than a blank canvas.
 */

import * as THREE from "three";
import { DRACOLoader, GLTFLoader } from "three-stdlib";

import {
  HOUSE_BASE_PATH,
  HOUSE_PARTS,
  SITE_BASE_PATH,
  SITE_PARTS,
} from "./houseConfig";
import { createHouseMaterials } from "./textures/materialLibrary";
import { addFarGround, fitLawnToYard } from "./siteGround";
import { addTrees } from "./trees";
import { addRoomLights } from "../lighting/roomLights";

/**
 * Where the Draco decoder lives. Vendored into `public/draco/` from
 * `three/examples/jsm/libs/draco/gltf/` rather than pulled from a CDN, so the
 * app has no third-party runtime dependency and works offline.
 *
 * KEEP IN SYNC WITH `three`. The decoder is copied out of the installed
 * package; after a major three upgrade, re-copy those files.
 */
const DRACO_DECODER_PATH = "/draco/";

/**
 * One decoder instance for the whole module.
 *
 * DRACOLoader spins up Web Workers. Creating one per load would start a
 * worker pool per GLB — 17 pools for one scene — so it is shared and only
 * torn down by `disposeDracoLoader()`.
 */
let sharedDraco = null;

export function getDracoLoader() {
  if (!sharedDraco) {
    sharedDraco = new DRACOLoader();
    sharedDraco.setDecoderPath(DRACO_DECODER_PATH);
    // No setDecoderConfig: the default detects WebAssembly and picks the
    // 188KB .wasm decoder, falling back to the 500KB .js build only where
    // wasm is unavailable. Forcing "js" would always pay the larger one.
  }
  return sharedDraco;
}

/** Release the shared Draco workers. Safe to call when no load is running. */
export function disposeDracoLoader() {
  sharedDraco?.dispose();
  sharedDraco = null;
}

/** Load one GLB and return its scene, or throw. */
function loadPart(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Replace glTF materials with the textured three.js ones, matching on name.
 *
 * The GLB ships flat Principled colours from Blender. Those are correct but
 * untextured -- they exist so the model is never invisible if this step is
 * skipped. Anything without an override keeps what Blender shipped.
 */
function applyMaterials(root, materials, stats) {
  root.traverse((child) => {
    if (!child.isMesh) return;

    const name = child.material?.name;
    const override = name ? materials.get(name) : null;

    if (override) {
      child.material = override;
      stats.textured += 1;
    } else if (name) {
      stats.untextured.add(name);
    }
  });
}

function applyShadows(root, { castShadow, receiveShadow }) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;
  });
}

/**
 * Load the whole house.
 *
 * @param {object} options
 * @param {string} options.basePath   where the GLBs live
 * @param {Array}  options.parts      manifest, see houseConfig
 * @param {Map}    options.materials  name -> THREE.Material
 * @param {boolean} options.recentre  centre X/Z on the origin, floor at Y=0
 * @returns {Promise<{house: THREE.Group, errors: Array, bounds: THREE.Box3, stats: object}>}
 */
/** Load one manifest's parts into `root`, recording them in `partMap`. */
async function loadManifest(loader, basePath, parts, materials, root, partMap,
                            errors, stats) {
  const loaded = await Promise.all(
    parts.map(async (part) => {
      try {
        const scene = await loadPart(loader, `${basePath}${part.file}`);
        return { part, scene };
      } catch (error) {
        errors.push({ part: part.id, file: part.file, error });
        return null;
      }
    })
  );

  const added = [];

  loaded.forEach((entry) => {
    if (!entry) return;
    const { part, scene } = entry;

    scene.name = part.id;
    scene.visible = part.visible !== false;
    scene.userData = { ...scene.userData, partId: part.id, label: part.label };

    applyMaterials(scene, materials, stats);
    applyShadows(scene, {
      castShadow: part.castShadow === true,
      receiveShadow: part.receiveShadow === true,
    });

    root.add(scene);
    partMap[part.id] = scene;
    stats.parts += 1;
    added.push(scene);
  });

  return added;
}

/**
 * Measure a set of objects with everything temporarily visible.
 *
 * Hiding the roof must not move the building, so bounds are always taken
 * from the full model regardless of what is currently shown.
 */
function measure(objects) {
  const bounds = new THREE.Box3();
  const hidden = [];

  objects.forEach((object) => {
    object.traverse((child) => {
      if (child.visible === false) {
        hidden.push(child);
        child.visible = true;
      }
    });
  });

  objects.forEach((object) => bounds.expandByObject(object));
  hidden.forEach((child) => {
    child.visible = false;
  });

  return bounds;
}

/**
 * Load the house and, optionally, the yard around it.
 *
 * Both manifests go into ONE group and are recentred together using the
 * HOUSE bounds. Recentring them separately would put each at its own origin
 * and tear the model apart -- they were built in a shared coordinate system
 * in Blender, and that has to survive the trip.
 *
 * @returns {Promise<{house: THREE.Group, errors: Array, bounds: THREE.Box3, stats: object}>}
 */
export async function loadHouse(options = {}) {
  const {
    basePath = HOUSE_BASE_PATH,
    parts = HOUSE_PARTS,
    sitePath = SITE_BASE_PATH,
    siteParts = SITE_PARTS,
    includeSite = true,
    materials = createHouseMaterials(),
    recentre = true,
  } = options;

  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());

  const house = new THREE.Group();
  house.name = "house";

  const errors = [];
  const stats = { textured: 0, untextured: new Set(), parts: 0 };
  const partMap = {};

  const houseObjects = await loadManifest(
    loader, basePath, parts, materials, house, partMap, errors, stats
  );

  if (includeSite && siteParts?.length) {
    await loadManifest(
      loader, sitePath, siteParts, materials, house, partMap, errors, stats
    );
  }

  // Anchor on the house alone: the yard is far larger and off-centre, so
  // centring on everything would push the building away from the origin.
  const bounds = measure(houseObjects.length ? houseObjects : [house]);

  if (recentre) {
    const centre = bounds.getCenter(new THREE.Vector3());
    // Centre horizontally, but sit the model ON the ground rather than
    // centring vertically -- Y=0 should mean floor level.
    house.position.set(-centre.x, -bounds.min.y, -centre.z);
  }

  house.userData.parts = partMap;
  house.userData.bounds = bounds;

  // A real light under each ceiling fitting. Parented to the house, so the
  // manifest's coordinates need no offset applied.
  house.userData.roomLights = await addRoomLights(house);

  // Both of these need the yard's real extent, so they can only run once it
  // has loaded and been recentred: one copy of the lawn photograph stretched
  // over the site, and ground continuing past it so the yard does not read as
  // a slab of turf floating in mid air.
  if (includeSite) {
    fitLawnToYard(house, materials);
    addFarGround(house, materials);
    // Trees are a model instanced from a manifest, not baked geometry. This
    // is awaited so callers get a finished yard rather than one that grows
    // trees a second later.
    await addTrees(house, { materials, dracoLoader: getDracoLoader() });
  }

  return { house, errors, bounds, stats };
}

/** Show or hide one part by id. Returns false if there is no such part. */
export function setPartVisible(house, partId, visible) {
  const part = house?.userData?.parts?.[partId];
  if (!part) return false;
  part.visible = visible;
  return true;
}

/** Current visibility of every part, as `{ [partId]: boolean }`. */
export function getPartVisibility(house) {
  const parts = house?.userData?.parts ?? {};
  return Object.fromEntries(
    Object.entries(parts).map(([id, object]) => [id, object.visible])
  );
}

/** Release all geometry owned by the house. Materials are freed separately. */
export function disposeHouse(house) {
  if (!house) return;
  house.traverse((child) => {
    if (child.isMesh) child.geometry?.dispose();
  });
}
