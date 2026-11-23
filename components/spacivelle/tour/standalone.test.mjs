// "All sides" shows a copy of the placed piece, on its own. Run: node components/spacivelle/tour/standalone.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { standalonePiece } from "./standalone.js";
import { createFocusOutline } from "./outline.js";

const products = new THREE.Group();
products.position.set(-6.6, 0.15, 4.9);
const sofa = new THREE.Group();
const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.85, 0.9), new THREE.MeshStandardMaterial());
mesh.position.y = 0.425;
sofa.add(mesh);
sofa.position.set(8.4, 0, -0.83);
sofa.rotation.y = Math.PI / 2;
sofa.scale.setScalar(0.85);
products.add(sofa);
const scene = new THREE.Scene();
scene.add(products);
scene.updateMatrixWorld(true);

// The house is outlining it when "All sides" is pressed.
const outline = createFocusOutline();
outline.aim(sofa);

const copy = standalonePiece(sofa);
let helpers = 0, meshes = 0, shared = 0;
copy.traverse((o) => {
  if (o.userData.outlineHelper) helpers += 1;
  if (o.isMesh && !o.userData.outlineHelper) { meshes += 1; if (o.geometry === mesh.geometry && o.material === mesh.material) shared += 1; }
});
assert.equal(helpers, 0, "the outline stays in the house");
assert.equal(meshes, 1);
assert.equal(shared, 1, "geometry and material shared, nothing duplicated");

const box = new THREE.Box3().setFromObject(copy);
assert.ok(Math.abs(box.min.y) < 1e-6, "standing on the floor");
assert.ok(Math.abs((box.min.x + box.max.x) / 2) < 1e-6 && Math.abs((box.min.z + box.max.z) / 2) < 1e-6, "centred on the origin");
const size = box.getSize(new THREE.Vector3());
assert.ok(Math.abs(size.x - 2 * 0.85) < 1e-6 && Math.abs(size.z - 0.9 * 0.85) < 1e-6, "facing -Z again, at the placement's scale");

let stillThere = 0;
sofa.traverse((o) => { if (o.userData.outlineHelper) stillThere += 1; });
assert.equal(stillThere, 2, "and the house's own piece keeps its outline");
assert.equal(sofa.parent, products, "the original is untouched");
outline.dispose();
console.log("  ok  a copy of the placed piece: no outline, shared geometry, standing at the origin facing -Z, at its scale");
console.log("standalone: ok");
