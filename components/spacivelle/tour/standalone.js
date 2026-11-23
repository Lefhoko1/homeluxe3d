import * as THREE from "three";

/**
 * A copy of a placed piece, on its own: for "All sides" (ProductViewer).
 *
 * Shares the house's geometry and materials -- nothing is downloaded or
 * duplicated on the GPU -- but not the glossy outline the house may be
 * drawing round it (tour/outline.js). Set facing -Z, its footprint centred on
 * the origin and its base on the floor, keeping the placement's scale.
 *
 * @param {THREE.Object3D} object  the placed piece in the house
 * @returns {THREE.Group}
 */
export function standalonePiece(object) {
  const piece = object.clone(true);
  const helpers = [];
  piece.traverse((child) => { if (child.userData?.outlineHelper) helpers.push(child); });
  helpers.forEach((helper) => helper.parent?.remove(helper));
  piece.position.set(0, 0, 0);
  piece.rotation.set(0, 0, 0);
  piece.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(piece);
  const centre = box.getCenter(new THREE.Vector3());
  piece.position.set(-centre.x, -box.min.y, -centre.z);
  const holder = new THREE.Group();
  holder.add(piece);
  holder.updateMatrixWorld(true);
  return holder;
}
