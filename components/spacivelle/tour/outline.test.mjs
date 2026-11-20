// The glossy line round the piece being shown. What can be checked without a
// screen: the geometry it is pushed out from has no cracks, it follows the
// piece, it goes when the piece goes, and it never gets in the way of clicks
// or measurements. Run: node components/spacivelle/tour/outline.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFocusOutline, outlineGeometryFor } from "./outline.js";

// 1. A BOX -- the worst case: every face has its own normals, so a naive push
// opens a gap at all eight corners. Welded, its 24 vertices are 8, and each
// corner's normal points out diagonally, between its three faces.
{
  const box = new THREE.BoxGeometry(2, 0.8, 0.9);
  assert.equal(box.attributes.position.count, 24);
  const g = outlineGeometryFor(box);
  assert.equal(g.attributes.position.count, 8, "corners welded");
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < 8; i += 1) {
    p.fromBufferAttribute(g.attributes.position, i);
    n.fromBufferAttribute(g.attributes.normal, i);
    // Outward on every axis -- that is what closes the corner -- and leaning
    // away from the centre. (Averaging weights the bigger faces more, so the
    // split is uneven; the sign is what matters.)
    for (const axis of ["x", "y", "z"]) {
      assert.ok(Math.sign(n[axis]) === Math.sign(p[axis]) && Math.abs(n[axis]) > 0.1, `corner ${i} normal points out along ${axis}`);
    }
    assert.ok(n.dot(p.clone().normalize()) > 0.5, `corner ${i} leans outward`);
  }
  assert.equal(outlineGeometryFor(box), g, "made once per geometry, then cached");
  console.log("  ok  a box's 24 split vertices weld to 8 corners, each pushed out diagonally -- no cracks");
}

// 2. Compressed models (quantised, normalised int16 -- like the uploads)
// are read as their real sizes.
{
  const q = new THREE.BufferGeometry();
  q.setAttribute("position", new THREE.BufferAttribute(new Int16Array([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true));
  const g = outlineGeometryFor(q);
  const xs = [0, 1, 2].map((i) => g.attributes.position.getX(i));
  assert.ok(Math.abs(Math.min(...xs) + 1) < 1e-4 && Math.abs(Math.max(...xs) - 1) < 1e-4, `read as -1..1, got ${xs}`);
  console.log("  ok  a compressed (quantised) model is read at its real size");
}

// 3. On a piece: follows it, stays out of the way, goes with it.
{
  const products = new THREE.Group();
  const sofa = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.9), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  seat.position.y = 0.4;
  sofa.add(seat);
  sofa.position.set(3, 0, -2);
  products.add(sofa);
  const scene = new THREE.Scene();
  scene.add(products);
  scene.updateMatrixWorld(true);

  const before = new THREE.Box3().setFromObject(sofa);
  const ray = new THREE.Raycaster(new THREE.Vector3(3, 0.4, 5), new THREE.Vector3(0, 0, -1));
  const hitsBefore = ray.intersectObject(sofa, true).length;

  const outline = createFocusOutline();
  outline.aim(sofa);
  outline.update(0.016);
  const helpers = [];
  sofa.traverse((o) => { if (o.userData.outlineHelper) helpers.push(o); });
  assert.equal(helpers.length, 2, "a mask and a line for the one mesh");
  assert.ok(helpers.every((h) => h.parent === seat), "children of the mesh, so they move with it");
  assert.ok(helpers.every((h) => !h.castShadow), "no shadows");
  assert.ok(helpers.find((h) => h.material.stencilFunc === THREE.NotEqualStencilFunc), "the line is cut by the mask");

  scene.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(sofa);
  assert.ok(after.equals(before), "the piece measures the same with its outline on");
  assert.equal(ray.intersectObject(sofa, true).length, hitsBefore, "clicks hit exactly what they did");
  console.log("  ok  outlined: moves with the piece, same size, same clicks, no shadow");

  outline.aim(sofa);
  sofa.traverse((o) => { if (o.userData.outlineHelper && !helpers.includes(o)) helpers.push(o); });
  assert.equal(helpers.length, 2, "aiming again at the same piece adds nothing");

  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), new THREE.MeshStandardMaterial());
  products.add(chair);
  outline.aim(chair);
  let left = 0;
  sofa.traverse((o) => { if (o.userData.outlineHelper) left += 1; });
  assert.equal(left, 0, "moving on to the next piece takes the line off the last");

  products.remove(chair);
  outline.update(0.016);
  assert.equal(outline.aimed, null, "a withdrawn piece takes its line with it");
  outline.aim(null);
  outline.dispose();
  console.log("  ok  moves on cleanly, and a withdrawn piece leaves nothing behind");
}

console.log("outline: ok");
