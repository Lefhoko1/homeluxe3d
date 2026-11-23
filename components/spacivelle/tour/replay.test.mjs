// Replay and Back on the tour card: the current piece again from the start,
// or the one before it in the room. Run: node components/spacivelle/tour/replay.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";

import { createTourController } from "./TourController.js";
import { createWalkVolume } from "./collision.js";
import { createShowcase } from "./showcase.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../../../public/models/${p}`, import.meta.url)));
const collision = read("house/collision.json");
const lights = read("house/lights.json");
const catalog = read("products/catalog.json");
const route = read("tour/tour.json");
const products = new Map(catalog.shops.flatMap((s) => s.products.map((p) => [p.id, p])));

const group = new THREE.Group();
catalog.houses["3bed"].filter((p) => !p.isFinish && p.position).forEach((placement) => {
  const size = products.get(placement.product)?.dimensions ?? { width: 500, depth: 500, height: 500 };
  const holder = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.width / 1000, size.height / 1000, size.depth / 1000));
  mesh.position.y = size.height / 2000;
  holder.add(mesh);
  holder.position.fromArray(placement.position);
  holder.rotation.y = THREE.MathUtils.degToRad(placement.rotationY ?? 0);
  holder.userData = { productId: placement.product, name: products.get(placement.product)?.name, room: placement.room };
  group.add(holder);
});
group.updateMatrixWorld(true);
const rooms = collision.rooms.map((e) => {
  const [x0, z0, x1, z1] = e.rect;
  return { room: e.room, label: e.label, type: e.type, x0, z0, x1, z1, centre: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2) };
});

const showcase = createShowcase({
  products: group, rooms, ceiling: collision.ceiling_m,
  fittings: lights.lights.map((l) => ({ room: l.room, point: new THREE.Vector3().fromArray(l.position) })),
});
const tour = createTourController({
  character: new THREE.Object3D(), camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000),
  walkVolume: createWalkVolume({ fixed: collision.walls.map((w) => w.rect) }),
  start: route.waypoints[0].position, startHeading: 0,
});

const shown = [];
tour.followRoute(route.waypoints, null, { showcase, onShow: (t) => shown.push(t.caption) });
assert.equal(tour.canReplay, false, "nothing to replay before the first room");
assert.equal(tour.replayItem(0), false);

const STEP = 1 / 60;
for (let t = 0; t < 900 && shown.length < 2; t += STEP) tour.update(STEP);
assert.ok(shown.length >= 2, "reached a room and moved on to its second piece");
const [first, second] = shown;

assert.ok(tour.canReplay);
assert.equal(tour.replayItem(0), true);
for (let k = 0; k < 30; k += 1) tour.update(STEP);
assert.equal(shown[shown.length - 1], second, "Replay shows the same piece again");

tour.replayItem(-1);
for (let k = 0; k < 30; k += 1) tour.update(STEP);
assert.equal(shown[shown.length - 1], first, "Back shows the one before it");

tour.replayItem(-5);
for (let k = 0; k < 30; k += 1) tour.update(STEP);
assert.equal(shown[shown.length - 1], first, "and never goes past the first in the room");

console.log(`  ok  Replay shows "${second}" again; Back returns to "${first}", and stops there`);
console.log("replay: ok");
