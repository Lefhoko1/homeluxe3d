// A shop's narration on the guided tour: the clips play in order, the audio
// sets the pace, the camera goes to each elevation without leaving the room,
// and nothing about it can stall the tour.
// Run: node components/spacivelle/tour/narration.test.mjs
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

// ---- The narration: the sofa, three clips, one of them its back ----------
const SOFA = "bradlows.drake-3-seater";
const clips = [
  { position: 0, elevation: "front", audioUrl: "front.webm", durationMs: 6000 },
  { position: 1, elevation: "left", audioUrl: "left.webm", durationMs: 5000 },
  { position: 2, elevation: "back", audioUrl: "back.webm", durationMs: 4000 },
];
const narrations = new Map([[SOFA, { shopName: "Bradlows", clips }]]);
const sofa = group.children.find((c) => c.userData.productId === SOFA);
assert.ok(sofa, "the sofa is in the catalogue");

function makeTour() {
  const volume = createWalkVolume({ fixed: collision.walls.map((w) => w.rect) });
  volume.setDynamic(rects);
  const showcase = createShowcase({
    products: group, rooms, ceiling, narrations,
    fittings: lights.lights.map((l) => ({ room: l.room, point: new THREE.Vector3().fromArray(l.position) })),
  });
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000);
  const character = new THREE.Object3D();
  const tour = createTourController({
    character, camera, walkVolume: volume, cameraObstacles: [walls],
    start: route.waypoints[0].position, startHeading: 0,
  });
  return { tour, camera, character, showcase };
}

const STEP = 1 / 60;

/**
 * Drive a tour, with a stand-in audio player that reports each clip ended
 * after its recorded length -- unless `silent`, when it never reports.
 */
function drive({ silent = false, pauseDuring = null, untilStops = route.stops.length } = {}) {
  const { tour, camera, character, showcase } = makeTour();
  const started = [];          // {index, elevation, at, camera}
  let playingUntil = null;
  let stops = 0;
  let t = 0;
  let paused = false;
  let hiddenDuringClips = true;
  let pausedOnce = false;

  tour.followRoute(route.waypoints, (s) => { if (s.label) stops += 1; }, {
    showcase,
    onNarrate: (target, index, clip) => {
      started.push({ index, elevation: clip.elevation, at: t });
      playingUntil = t + clip.durationMs / 1000;
    },
  });

  for (; t < 1500 && stops < untilStops; t += STEP) {
    tour.update(STEP);
    camera.updateMatrixWorld(true);
    const now = tour.narrating;
    if (now?.playing) {
      if (character.visible) hiddenDuringClips = false;
      const last = started[started.length - 1];
      if (last && !last.camera && t - last.at > 1.2) last.camera = camera.position.clone();
      if (pauseDuring !== null && !pausedOnce && now.index === pauseDuring && t - last.at > 1) {
        pausedOnce = true;
        paused = true;
        tour.pauseRoute();
        playingUntil = null;
        setTimeout(() => {}, 0);
      }
    }
    if (paused && t - started[started.length - 1].at > 4) {
      paused = false;
      tour.resumeRoute();
    }
    if (!silent && playingUntil !== null && t >= playingUntil) {
      playingUntil = null;
      tour.narrationClipEnded();
    }
  }
  return { started, stops, t, hiddenDuringClips, characterVisibleAfter: character.visible };
}

// 1. The clips play in order, each once, and the tour carries on.
{
  const run = drive();
  assert.deepEqual(run.started.map((s) => s.elevation), ["front", "left", "back"], "clips played in order");
  for (let i = 1; i < run.started.length; i += 1) {
    const gap = run.started[i].at - run.started[i - 1].at;
    assert.ok(gap >= clips[i - 1].durationMs / 1000, `clip ${i} waited for clip ${i - 1} to finish (${gap.toFixed(1)}s)`);
    assert.ok(gap < clips[i - 1].durationMs / 1000 + 4.5, `and did not hang about (${gap.toFixed(1)}s)`);
  }
  assert.equal(run.stops, route.stops.length, "the whole tour still finished");
  assert.ok(run.hiddenDuringClips, "she is out of the shot while the shop talks");
  console.log(`  ok  ${run.started.map((s) => s.elevation).join(" -> ")}, each after the last ended; tour finished all ${run.stops} stops`);

  // 2. Every shot is in the living room, out of the walls, under the ceiling.
  const box = new THREE.Box3().setFromObject(sofa);
  const centre = box.getCenter(new THREE.Vector3());
  const front = new THREE.Vector3(-Math.sin(sofa.rotation.y), 0, -Math.cos(sofa.rotation.y));
  run.started.forEach((s) => {
    const c = s.camera;
    assert.ok(c, `${s.elevation}: camera measured`);
    assert.ok(c.x > living.x0 && c.x < living.x1 && c.z > living.z0 && c.z < living.z1,
      `${s.elevation}: camera inside the living room (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
    assert.ok(!insideWall(c), `${s.elevation}: camera not inside a wall`);
    assert.ok(c.y < ceiling, `${s.elevation}: camera under the ceiling (${c.y.toFixed(2)})`);
  });
  const toFront = run.started[0].camera.clone().sub(centre).setY(0).normalize().dot(front);
  assert.ok(toFront > 0.5, `the front clip is shot from the front (${toFront.toFixed(2)})`);
  console.log(`  ok  every shot inside the room, clear of the walls and ceiling; the front clip from the front (${toFront.toFixed(2)})`);
}

// 3. A player that never reports (blocked autoplay, failed file) cannot hold the tour.
{
  const run = drive({ silent: true });
  assert.equal(run.started.length, 3, "all three clips were still announced");
  const gap = run.started[1].at - run.started[0].at;
  assert.ok(gap < clips[0].durationMs / 1000 + 6.5, `moved on by itself after ${gap.toFixed(1)}s`);
  assert.equal(run.stops, route.stops.length, "and the tour finished");
  console.log(`  ok  with no word from the player it moves on by itself (${gap.toFixed(1)}s for a 6s clip)`);
}

// 4. Pausing mid-clip replays that clip on resume.
{
  const run = drive({ pauseDuring: 1 });
  const order = run.started.map((s) => s.elevation);
  assert.deepEqual(order, ["front", "left", "left", "back"], `paused clip replayed: ${order.join(", ")}`);
  console.log(`  ok  paused during "left" and resumed: ${order.join(" -> ")}`);
}

console.log("narration: ok");
