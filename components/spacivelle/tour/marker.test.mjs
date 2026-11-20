// The focus marker stands over whatever is being looked at, wherever the
// admin put it, and follows it if it moves. Run: node components/spacivelle/tour/marker.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFocusMarker, markerAimFor } from "./marker.js";

const frames = (marker, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) marker.update(1 / 60);
};

// A sofa-ish box placed and turned by an admin, inside a moved group.
const products = new THREE.Group();
products.position.set(-6.6, 0.15, 4.9);
const sofa = new THREE.Group();
sofa.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.9), new THREE.MeshBasicMaterial()));
sofa.children[0].position.y = 0.425;
sofa.position.set(3, 0, -2);
sofa.rotation.y = 0.7;
products.add(sofa);
const scene = new THREE.Scene();
scene.add(products);

{
  const marker = createFocusMarker();
  frames(marker, 0.5);
  assert.equal(marker.group.visible, false, "hidden until aimed");

  marker.aim(sofa);
  frames(marker, 0.5);
  const box = new THREE.Box3().setFromObject(sofa);
  const p = marker.group.position;
  assert.equal(marker.group.visible, true);
  assert.ok(Math.abs(p.x - (box.min.x + box.max.x) / 2) < 1e-6, "centred over it in x");
  assert.ok(Math.abs(p.z - (box.min.z + box.max.z) / 2) < 1e-6, "centred over it in z");
  assert.ok(p.y > box.max.y + 0.05 && p.y < box.max.y + 0.3, `just above its top (${p.y.toFixed(2)} vs ${box.max.y.toFixed(2)})`);
  console.log(`  ok  stands over a placed, turned product (tip ${(p.y - box.max.y).toFixed(2)}m above its top)`);

  sofa.position.x += 1.5;
  frames(marker, 1 / 30);
  const moved = new THREE.Box3().setFromObject(sofa);
  assert.ok(Math.abs(marker.group.position.x - (moved.min.x + moved.max.x) / 2) < 1e-6);
  console.log("  ok  follows the product when the admin moves it");

  marker.aim(null);
  frames(marker, 0.5);
  assert.equal(marker.group.visible, false);
  console.log("  ok  disappears when there is nothing to point at");

  marker.aim(sofa);
  frames(marker, 0.5);
  products.remove(sofa);
  frames(marker, 0.5);
  assert.equal(marker.group.visible, false, "a removed product leaves no pin behind");
  products.add(sofa);
  console.log("  ok  a removed product leaves no pin behind");
  marker.dispose();
}

{
  assert.equal(markerAimFor({ kind: "product", object: sofa }), sofa);
  assert.deepEqual(
    markerAimFor({ kind: "slot", slot: { position: [1, 0.15, 2], size: [2, 0.9, 1] } }),
    { x: 1, y: 1.05, z: 2 }
  );
  for (const kind of ["floor", "wall", "ceiling", "light", "room"]) {
    assert.equal(markerAimFor({ kind, point: new THREE.Vector3() }), null, `${kind} gets no pin`);
  }
  assert.equal(markerAimFor(null), null);
  console.log("  ok  products, empty positions and fittings get a pin; surfaces do not");
}

console.log("marker: ok");
