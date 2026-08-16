/**
 * Real trees, placed from a manifest.
 *
 * The yard used to grow its trees out of primitives: a tapered trunk and
 * seven overlapping ellipsoids per tree, generated in Blender and baked into
 * `yard_planting.glb`. That was the right trade while there was no real tree
 * to use -- a few hundred triangles that read as a tree from thirty metres.
 *
 * There is a real tree now, so this loads it once and instances it.
 *
 * SAME DIVISION AS PRODUCTS: the geometry is an ASSET, the position is DATA.
 * `trees.json` is written by the Blender build from the site config, so
 * re-planting the garden is a config edit rather than a re-model, and the
 * tree can be replaced with a better one without anything here changing.
 *
 * ONE DOWNLOAD, EIGHT TREES. `clone(true)` shares geometry and materials
 * between copies, so eight trees cost one fetch, one decode and one copy of
 * the vertex data on the GPU. What they do cost is triangles: this model is
 * about 54,000 of them, so the garden is roughly 430,000 -- drawn twice,
 * once for the shadow pass. That is the most expensive thing in the scene by
 * a wide margin, and it is worth knowing before adding a ninth.
 */

import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

export const TREE_MANIFEST_URL = "/models/site/trees.json";

/**
 * Load the tree model and plant it at every point in the manifest.
 *
 * A CHILD of the house group, like everything else from the site: that group
 * carries the recentring offset, and the manifest's coordinates are in the
 * same frame the site GLBs were exported in.
 *
 * Never throws. A missing manifest or model leaves the yard treeless, which
 * is a worse garden but a working one -- the same rule the rest of the loader
 * follows.
 *
 * @returns {Promise<THREE.Group|null>}
 */
export async function addTrees(house, { materials, dracoLoader } = {}) {
  if (!house) return null;

  let manifest;
  try {
    const response = await fetch(TREE_MANIFEST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.warn("[trees] no planting manifest:", error.message);
    return null;
  }

  const points = manifest?.trees ?? [];
  if (!points.length) return null;

  let source;
  try {
    source = await loadModel(manifest.model, dracoLoader);
  } catch (error) {
    console.warn(`[trees] ${manifest.model} failed to load:`, error.message);
    return null;
  }

  // Measure the model rather than trusting a number in the manifest.
  //
  // `height` in the manifest is how tall the tree should be IN THE SCENE, not
  // how tall the file is. Recording the file's height in the data would mean
  // that replacing the asset with a taller or shorter one silently resized
  // every tree in the garden.
  const box = new THREE.Box3().setFromObject(source);
  const natural = box.max.y - box.min.y;
  if (!(natural > 0)) {
    console.warn("[trees] the model has no height; planting skipped");
    return null;
  }

  // Sit it on its own base. The export puts the origin at the footprint
  // centre with the base on the floor, but measuring costs nothing and means
  // a model exported by someone else still lands on the ground rather than
  // hovering or sinking.
  const baseOffset = -box.min.y;
  const centreX = (box.min.x + box.max.x) / 2;
  const centreZ = (box.min.z + box.max.z) / 2;

  const group = new THREE.Group();
  group.name = "yard_trees";

  points.forEach((tree) => {
    const instance = source.clone(true);
    const scale = tree.height / natural;

    // The correction is applied INSIDE the pivot, so the outer object still
    // rotates about the trunk and stands at the coordinate it was given.
    const pivot = new THREE.Group();
    instance.position.set(-centreX, baseOffset, -centreZ);
    pivot.add(instance);

    pivot.scale.setScalar(scale);
    pivot.rotation.y = THREE.MathUtils.degToRad(tree.rotation ?? 0);
    pivot.position.fromArray(tree.position);
    pivot.name = `tree.${tree.seed}`;

    if (materials) applyMaterials(pivot, materials);
    pivot.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    group.add(pivot);
  });

  house.add(group);
  house.userData.parts = house.userData.parts ?? {};
  house.userData.parts.yard_trees = group;

  console.info(`[trees] planted ${points.length}, scaled from ${natural.toFixed(1)}m`);
  return group;
}

function loadModel(url, dracoLoader) {
  const loader = new GLTFLoader();
  if (dracoLoader) loader.setDRACOLoader(dracoLoader);
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Swap the glTF materials for the app's, matching on name.
 *
 * The exported tree carries materials called `trunk` and `foliage` and
 * nothing else -- the originals were procedural noise and colour ramps, which
 * glTF cannot represent at all. The name IS the payload, and both names
 * already exist in the material library, so the tree picks up the same bark
 * and leaf textures the rest of the planting uses.
 */
function applyMaterials(root, materials) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const override = materials.get(child.material?.name);
    if (override) child.material = override;
  });
}

// No dispose function here on purpose: the trees are children of the house
// group, so `disposeHouse` already walks them. Clones share one geometry and
// THREE.BufferGeometry.dispose() is idempotent, so being visited eight times
// costs nothing.
