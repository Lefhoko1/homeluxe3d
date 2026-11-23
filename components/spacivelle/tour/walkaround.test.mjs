// The walk-round: a product is framed whole -- on a phone held upright too --
// then the camera goes round it as far as the room allows, and it can be
// replayed. Run: node components/spacivelle/tour/walkaround.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";

import { createTourController } from "./TourController.js";
import { createWalkVolume } from "./collision.js";
import { createShowcase } from "./showcase.js";
import { elevationView } from "../../../lib/narration/elevationView.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../../../public/models/${p}`, import.meta.url)));
const collision = read("house/collision.json");
const lights = read("house/lights.json");
const catalog = read("products/catalog.json");
const route = read("tour/tour.json");
const products = new Map(catalog.shops.flatMap((s) => s.products.map((p) => [p.id, p])));

// ---- The house: furniture as boxes, walls and ceiling as real geometry ----
const group = new THREE.Group();
const rects = [];
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
  if ((size.height ?? 0) < 150) return;
  const turned = Math.round(Math.abs(placement.rotationY ?? 0) / 90) % 2 === 1;
  const hw = (turned ? size.depth : size.width) / 2000, hd = (turned ? size.width : size.depth) / 2000;
  const [x, , z] = placement.position;
  rects.push([x - hw, z - hd, x + hw, z + hd]);
});
group.updateMatrixWorld(true);

const ceiling = collision.ceiling_m;
const walls = new THREE.Group();
collision.walls.forEach(({ rect: [x0, z0, x1, z1] }) => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(Math.max(x1 - x0, 0.01), ceiling, Math.max(z1 - z0, 0.01)));
  wall.position.set((x0 + x1) / 2, ceiling / 2, (z0 + z1) / 2);
  walls.add(wall);
});
const lid = new THREE.Mesh(new THREE.PlaneGeometry(200, 200));
lid.rotation.x = Math.PI / 2;
lid.position.y = ceiling;
walls.add(lid);
walls.updateMatrixWorld(true);

const rooms = collision.rooms.map((e) => {
  const [x0, z0, x1, z1] = e.rect;
  return { room: e.room, label: e.label, type: e.type, x0, z0, x1, z1, centre: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2) };
});
const living = rooms.find((r) => r.room === "living");
const insideWall = (p) => collision.walls.some(({ rect: [x0, z0, x1, z1] }) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);


function makeTour({ aspect = 1.6 } = {}) {
  const volume = createWalkVolume({ fixed: collision.walls.map((w) => w.rect) });
  volume.setDynamic(rects);
  const showcase = createShowcase({
    products: group, rooms, ceiling,
    fittings: lights.lights.map((l) => ({ room: l.room, point: new THREE.Vector3().fromArray(l.position) })),
  });
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
  const character = new THREE.Object3D();
  const tour = createTourController({
    character, camera, walkVolume: volume, cameraObstacles: [walls],
    start: route.waypoints[0].position, startHeading: 0,
  });
  return { tour, camera, character, showcase };
}

const STEP = 1 / 60;
const roomOf = (p) => rooms.find((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1);

// 1. Every product in the living room is walked round: inside the room, out
//    of the walls, under the ceiling, without her in the shot.
{
  const { tour, camera, character, showcase } = makeTour();
  let stops = 0;
  const walked = new Map();   // caption -> {keys, yaws:Set, frames, bad, seen}
  let current = null;
  tour.followRoute(route.waypoints, (s) => { if (s.label) stops += 1; }, { showcase, onShow: (t) => { current = t; } });
  for (let t = 0; t < 1800 && stops < route.stops.length; t += STEP) {
    tour.update(STEP);
    camera.updateMatrixWorld(true);
    const w = tour.walkingRound;
    if (!w) continue;
    // By placement, not by name: the same television stands in two rooms.
    const key = w.target.object.uuid;
    if (!walked.has(key)) walked.set(key, { name: w.target.caption, keys: w.keys, yaws: new Set(), frames: 0, bad: [], room: w.target.roomRect });
    const rec = walked.get(key);
    rec.yaws.add(Math.round(w.yaw / 15) * 15);
    rec.frames += 1;
    const c = camera.position;
    const [x0, z0, x1, z1] = rec.room;
    if (rec.frames > 90) {   // once the camera has had a moment to get there
      if (!(c.x > x0 && c.x < x1 && c.z > z0 && c.z < z1)) rec.bad.push(`outside its room at ${c.x.toFixed(2)},${c.z.toFixed(2)}`);
      if (insideWall(c)) rec.bad.push("inside a wall");
      if (c.y >= ceiling) rec.bad.push("in the ceiling");
      if (character.visible) rec.bad.push("she is in the shot");
    }
  }
  assert.equal(stops, route.stops.length, "the tour still finishes");
  const products = group.children.length;
  const missed = group.children.filter((c) => !walked.has(c.uuid)).map((c) => c.userData.name);
  assert.deepEqual(missed, [], `not walked round: ${missed.join(", ")}`);
  for (const rec of walked.values()) {
    const name = `${rec.name} (${rooms.find((r) => r.x0 === rec.room[0] && r.z0 === rec.room[1])?.room})`;
    assert.deepEqual(rec.bad.slice(0, 3), [], `${name}: ${rec.bad[0]}`);
    const span = Math.max(...rec.yaws) - Math.min(...rec.yaws);
    assert.ok(span >= 50, `${name}: went at least part way round (${span} degrees)`);
    console.log(`  ok  ${name.slice(0, 40).padEnd(40)} round ${String(span).padStart(3)} degrees  (${rec.keys.join(" -> ")})`);
  }
}

// 2. A phone held upright: the front view fits the whole piece.
{
  const { tour, camera, showcase } = makeTour({ aspect: 0.46 });
  let stops = 0;
  let checked = 0;
  tour.followRoute(route.waypoints, (s) => { if (s.label) stops += 1; }, { showcase });
  for (let t = 0; t < 600 && checked < 3; t += STEP) {
    tour.update(STEP);
    const w = tour.walkingRound;
    if (!w || w.yaw !== 0 || w.keys.length < 2) continue;
    camera.updateMatrixWorld(true);
    // Once settled on the front hold.
    const box = new THREE.Box3().setFromObject(w.target.object);
    const fit = elevationView({ box, front: new THREE.Vector3(-Math.sin(w.target.object.rotation.y), 0, -Math.cos(w.target.object.rotation.y)) }, { yaw: 0, pitch: 16 }, { fov: camera.fov, aspect: camera.aspect });
    const cam = camera.clone();
    cam.position.copy(fit.eye); cam.lookAt(fit.target); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    let inside = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(cam);
      if (Math.abs(p.x) <= 1.001 && Math.abs(p.y) <= 1.001) inside += 1;
    }
    assert.equal(inside, 8, `${w.target.caption}: the whole piece fits an upright phone`);
    checked += 1;
    tour.replayItem(1);   // on to the next, to check another
  }
  assert.ok(checked >= 1, "checked at least one framing");
  console.log(`  ok  on an upright phone (0.46 wide for 1 tall) the front view fits the whole piece (${checked} checked)`);
}

// 3. Replay: the same piece again from the start; Back: the one before it.
{
  const { tour, showcase } = makeTour();
  const shown = [];
  let stops = 0;
  tour.followRoute(route.waypoints, (s) => { if (s.label) stops += 1; }, { showcase, onShow: (t) => shown.push(t.caption) });
  assert.equal(tour.canReplay, false, "nothing to replay before the first room");
  let t = 0;
  for (; t < 600 && !(tour.walkingRound && tour.walkingRound.yaw !== 0); t += STEP) tour.update(STEP);
  const piece = tour.walkingRound.target.caption;
  assert.ok(tour.canReplay);
  const before = shown.length;
  assert.equal(tour.replayItem(0), true);
  for (let k = 0; k < 120; k += 1) tour.update(STEP);
  assert.equal(shown[before], piece, "replay shows the same piece again");
  const w = tour.walkingRound;
  assert.ok(w && w.yaw === w.keys[0], "from the start of its walk-round");
  for (let k = 0; k < 60 * 20 && shown.length < before + 2; k += 1) tour.update(STEP);
  const next = shown[shown.length - 1];
  tour.replayItem(-1);
  for (let k = 0; k < 60; k += 1) tour.update(STEP);
  assert.equal(shown[shown.length - 1], piece, `Back returns to ${piece} from ${next}`);
  console.log(`  ok  Replay shows "${piece}" again from the start; Back returns to it from the next`);
}

console.log("walkaround: ok");
