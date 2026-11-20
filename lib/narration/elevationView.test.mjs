// The angle a shop records from is the angle the visitor sees -- and "left"
// is the visitor's left. Run: node lib/narration/elevationView.test.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { ELEVATIONS, elevationView } from "./elevationView.js";

// A 2m x 0.9m x 0.85m sofa facing -Z (rotation 0, the house's convention).
const box = new THREE.Box3(new THREE.Vector3(-1, 0, -0.45), new THREE.Vector3(1, 0.85, 0.45));
const front = new THREE.Vector3(0, 0, -1);

const front_ = elevationView({ box, front }, "front");
assert.ok(front_.eye.z < -1, "the front view stands in front (-Z)");
assert.ok(Math.abs(front_.eye.x) < 1e-9, "and square on");

// Standing at the front looking at it (+Z), your left is +X.
const left = elevationView({ box, front }, "left");
const right = elevationView({ box, front }, "right");
assert.ok(left.eye.x > 1, `left side is on the viewer's left (+X), got x=${left.eye.x.toFixed(2)}`);
assert.ok(right.eye.x < -1, `right side is on the viewer's right (-X), got x=${right.eye.x.toFixed(2)}`);
assert.ok(elevationView({ box, front }, "back").eye.z > 1, "back is behind (+Z)");
console.log("  ok  front, back, and left/right as the visitor faces it");

// Turned in the house: the views turn with it.
const turned = new THREE.Vector3(1, 0, 0);          // now faces +X
const tl = elevationView({ box, front: turned }, "left");
// Facing it from its front you look along -X; your right is
// (-X) x up = -Z, so your left is +Z.
assert.ok(tl.eye.z > 1, `turned piece: left follows it, got z=${tl.eye.z.toFixed(2)}`);
assert.ok(elevationView({ box, front: turned }, "right").eye.z < -1, "and right is -Z");
console.log("  ok  a turned piece's elevations turn with it");

// Every view keeps the whole piece in frame, and the camera above the floor.
for (const e of ELEVATIONS) {
  const { eye, target, distance } = elevationView({ box, front }, e);
  assert.ok(eye.y > 0, `${e.id}: camera above the floor`);
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.01, 100);
  cam.position.copy(eye);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const inside = corners.filter((c) => { const p = c.clone().project(cam); return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1; }).length;
  if (!e.close) assert.equal(inside, 8, `${e.id}: all 8 corners in frame`);
  console.log(`  ok  ${e.label.padEnd(13)} camera ${distance.toFixed(2)}m away${e.close ? " (close up)" : ", whole piece in frame"}`);
}
console.log("elevationView: ok");
