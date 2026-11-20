// The focus marker lands ON whatever is being looked at, wherever the admin
// put it, follows it if it moves, and is the same size on screen at any
// distance. Run: node components/spacivelle/tour/marker.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFocusMarker, markerAimFor } from "./marker.js";

const frames = (marker, seconds, camera = null) => {
  for (let t = 0; t < seconds; t += 1 / 60) marker.update(1 / 60, camera);
};

/** A box-shaped piece, `w x h x d` metres, standing on the floor at (x, z). */
function piece(w, h, d, x, z, turn = 0) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  mesh.position.y = h / 2;
  root.add(mesh);
  root.position.set(x, 0, z);
  root.rotation.y = turn;
  return root;
}

const products = new THREE.Group();
products.position.set(-6.6, 0.15, 4.9);
const scene = new THREE.Scene();
scene.add(products);

const camera = new THREE.PerspectiveCamera(55, 1.6, 0.05, 100);
const look = (from, to) => {
  camera.position.copy(from);
  camera.lookAt(to);
  camera.updateMatrixWorld(true);
};
// The renderer updates the whole scene's matrices before every frame; a test
// has to do the same before measuring, or a child's box ignores its parents.
const worldBox = (o) => {
  scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};
const onSurface = (p, box, tol = 0.02) =>
  [["x", "min"], ["x", "max"], ["y", "min"], ["y", "max"], ["z", "min"], ["z", "max"]]
    .some(([axis, end]) => Math.abs(p[axis] - box[end][axis]) < tol) &&
  box.clone().expandByScalar(tol).containsPoint(p);

// A RUG: the pin must touch it, not hover over it.
{
  const rug = piece(2.4, 0.015, 1.6, 2, -2);
  products.add(rug);
  const box = worldBox(rug);
  const centre = box.getCenter(new THREE.Vector3());
  look(new THREE.Vector3(centre.x, 1.6, centre.z + 3), centre);

  const marker = createFocusMarker();
  marker.aim(rug, centre.clone());
  frames(marker, 0.5, camera);
  const tip = marker.group.position;
  assert.equal(marker.group.visible, true);
  assert.ok(tip.y - box.max.y < 0.05, `tip ${((tip.y - box.max.y) * 1000).toFixed(0)}mm above the rug`);
  assert.ok(tip.y >= box.max.y - 0.005, "and never sunk into it");
  console.log(`  ok  a rug: the tip touches it (${((tip.y - box.max.y) * 1000).toFixed(0)}mm at most, bobbing)`);
  products.remove(rug);
  marker.dispose();
}

// A LONG, TALL UNIT seen from close: the pin goes on its face, in view --
// not off the top of the screen.
{
  const unit = piece(3.4, 2.05, 0.68, 4, -3);
  products.add(unit);
  const box = worldBox(unit);
  const centre = box.getCenter(new THREE.Vector3());
  const aim = new THREE.Vector3(centre.x, Math.min(box.max.y - 0.15, 1.1) + 0.15, centre.z);
  look(new THREE.Vector3(centre.x + 0.4, 1.6, box.max.z + 1.4), aim);

  const marker = createFocusMarker();
  marker.aim(unit, aim);
  frames(marker, 1 / 30, camera);
  const tip = marker.group.position.clone();
  assert.ok(onSurface(tip, box), "the tip is on the unit's surface");
  const ndc = tip.clone().project(camera);
  assert.ok(Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.8, `on screen (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
  const topNdc = new THREE.Vector3(centre.x, box.max.y, centre.z).project(camera);
  console.log(`  ok  a 3.4m x 2.05m unit from 1.4m: on its face at screen y ${ndc.y.toFixed(2)} (the old top-of-box spot was at ${topNdc.y.toFixed(2)})`);
  products.remove(unit);
  marker.dispose();
}

// SAME SIZE ON SCREEN close up and far away.
{
  const sofa = piece(2.0, 0.85, 0.9, 3, -2, 0.7);
  products.add(sofa);
  const box = worldBox(sofa);
  const centre = box.getCenter(new THREE.Vector3());
  const marker = createFocusMarker();

  const screenHeight = (distance) => {
    look(new THREE.Vector3(centre.x, 1.6, centre.z + distance), centre);
    marker.aim(null);
    frames(marker, 0.5, camera);
    marker.aim(sofa, centre.clone());
    frames(marker, 0.5, camera);
    // Tip to the top of the pin's head, at the pin's real scale.
    marker.group.updateMatrixWorld(true);
    const pin = marker.group.children[0];
    const tip = pin.localToWorld(new THREE.Vector3(0, 0, 0)).project(camera);
    const top = pin.localToWorld(new THREE.Vector3(0, 0.265, 0)).project(camera);
    return top.y - tip.y;
  };
  const near = screenHeight(1.5);
  const far = screenHeight(5);
  assert.ok(Math.abs(near - far) / far < 0.25, `near ${near.toFixed(3)} vs far ${far.toFixed(3)}`);
  console.log(`  ok  the same size on screen at 1.5m and 5m (${(near / far).toFixed(2)}x)`);

  // Follows the product when the admin moves it.
  look(new THREE.Vector3(centre.x, 1.6, centre.z + 3), centre);
  marker.aim(sofa, centre.clone());
  frames(marker, 0.5, camera);
  const before = marker.group.position.x;
  sofa.position.x += 1.5;
  frames(marker, 1 / 30, camera);
  assert.ok(Math.abs(marker.group.position.x - before - 1.5) < 1e-6);
  console.log("  ok  follows the product when the admin moves it");

  // Gone with nothing to point at, or when the product is withdrawn.
  marker.aim(null);
  frames(marker, 0.5, camera);
  assert.equal(marker.group.visible, false);
  marker.aim(sofa, null);
  frames(marker, 0.5, camera);
  products.remove(sofa);
  frames(marker, 0.5, camera);
  assert.equal(marker.group.visible, false);
  console.log("  ok  disappears with nothing to point at, and with a withdrawn product");
  marker.dispose();
}

{
  const sofa = piece(2, 0.85, 0.9, 0, 0);
  const point = new THREE.Vector3(1, 2, 3);
  assert.deepEqual(markerAimFor({ kind: "product", object: sofa, point }), { what: sofa, at: point });
  assert.deepEqual(
    markerAimFor({ kind: "slot", slot: { position: [1, 0.15, 2], size: [2, 0.9, 1] } }),
    { what: { x: 1, y: 1.05, z: 2 }, at: null }
  );
  for (const kind of ["floor", "wall", "ceiling", "light", "room"]) {
    assert.equal(markerAimFor({ kind, point: new THREE.Vector3() }), null, `${kind} gets no pin`);
  }
  console.log("  ok  products, empty positions and fittings get a pin; floors, walls, ceilings do not");
}

console.log("marker: ok");
