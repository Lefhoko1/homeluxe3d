/**
 * Make a loaded model solid -- you should never see through a sofa.
 *
 * WHY THINGS COME OUT SEE-THROUGH. Many exporters (MakeHuman/MPFB, a lot of
 * "web" and AI-generated furniture) mark ordinary opaque surfaces with glTF
 * alphaMode BLEND. three.js's glTF loader turns BLEND into `transparent: true,
 * depthWrite: false`, and a surface that writes no depth hides nothing behind
 * it: the far side of a sofa, the inside of a head, a hand behind a back, all
 * get drawn over it in whatever order the GPU happens to reach them.
 *
 * The second cause is faces pointing the wrong way. three.js draws only the
 * front of a face by default, so a model with flipped or one-sided faces has
 * holes you can look straight through from one side. `doubleSided` draws
 * both.
 *
 * WHAT IS LEFT ALONE: real glass, water and the like -- by name, or because
 * the material is genuinely faint (opacity well under 1). A coffee table's
 * glass top is supposed to be see-through.
 */

import * as THREE from "three";

/** Materials that are meant to be see-through. */
const SEE_THROUGH = /glass|water|window|crystal|acrylic|perspex|liquid|transparent|lens/i;

/** Below this, a material's own opacity says it is meant to be faint. */
const MEANT_FAINT = 0.95;

/**
 * Is this material meant to be see-through?
 * @param {THREE.Material} material
 */
export function isMeantSeeThrough(material) {
  if (!material) return false;
  return SEE_THROUGH.test(material.name ?? "") || (material.opacity ?? 1) < MEANT_FAINT;
}

/**
 * Fix one material in place. Returns true if it was changed.
 *
 * @param {THREE.Material} material
 * @param {object} [options]
 * @param {RegExp} [options.cutout]  names whose texture alpha is real shape
 *        (hair strands, lashes, leaves): kept as a hard cut-out, which still
 *        hides what is behind it
 * @param {boolean} [options.doubleSided]  draw both sides of every face
 */
export function solidifyMaterial(material, { cutout = null, doubleSided = false } = {}) {
  if (!material) return false;
  let changed = false;

  if (material.transparent && !isMeantSeeThrough(material)) {
    material.transparent = false;
    material.depthWrite = true;
    material.opacity = 1;
    material.alphaTest = cutout && cutout.test(material.name ?? "") ? 0.5 : 0;
    changed = true;
  }

  if (doubleSided && material.side !== THREE.DoubleSide && !material.transparent) {
    material.side = THREE.DoubleSide;
    changed = true;
  }

  if (changed) material.needsUpdate = true;
  return changed;
}

/**
 * Fix every material under `root`. Materials shared between meshes (and
 * between clones) are fixed once.
 *
 * @returns {number} how many materials were changed
 */
export function solidify(root, options = {}) {
  if (!root) return 0;
  const seen = new Set();
  let changed = 0;
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      if (solidifyMaterial(material, options)) changed += 1;
    }
  });
  return changed;
}
