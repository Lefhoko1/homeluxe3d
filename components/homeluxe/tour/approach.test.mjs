/**
 * The tour walks up to what it shows you, and walks back to its route.
 *
 *     node components/homeluxe/tour/approach.test.mjs
 *
 * WHY THIS IS A SEPARATE WALK FROM walk.test.mjs. That one runs without the
 * showcase, on the reasoning that what the tour looks at once it has stopped
 * cannot move it. That stopped being true when the character started walking
 * up to each piece instead of turning to it from the middle of the room: a
 * stop now takes the walker off its solved route and brings it back, so the
 * same guarantees have to hold with the showcase ON --
 *
 *   1. Every stop is still reached, and the walk is never inside a wall or a
 *      piece of furniture.
 *   2. Each piece is looked at from in front of it and near it -- the point
 *      of the change. Measured as the nearest the walker got to the piece's
 *      edge while it was the one being shown.
 *   3. The figure faces the way it walks. `rotation.y = heading` faced it the
 *      mirror image of its walk east and west; this would have caught it.
 *   4. "Show me" walks there -- to another room, by the route -- and resuming
 *      walks back and carries on, instead of the camera flying off.
 *
 * Same fixtures as the other two: the real route, the real collision model,
 * and the furniture stood up as boxes of its catalogued size.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as THREE from "three";

import { createTourController } from "./TourController.js";
import { createWalkVolume } from "./collision.js";
import { approachOf, createShowcase } from "./showcase.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");
const read = (...parts) => JSON.parse(readFileSync(join(PUBLIC, ...parts), "utf8"));

const collision = read("house", "collision.json");
const lights = read("house", "lights.json");
const catalog = read("products", "catalog.json");
const route = read("tour", "tour.json");

const placements = catalog.houses["3bed"];
const products = new Map(
  catalog.shops.flatMap((shop) => shop.products.map((p) => [p.id, p]))
);

// ---- The furniture, as boxes and as footprints ------------------------------
const group = new THREE.Group();
const furnitureRects = [];

placements
  .filter((placement) => !placement.isFinish && placement.position)
  .forEach((placement) => {
    const product = products.get(placement.product);
    const size = product?.dimensions ?? { width: 500, depth: 500, height: 500 };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.width / 1000, size.height / 1000, size.depth / 1000)
    );
    mesh.position.fromArray(placement.position);
    mesh.position.y += size.height / 2000;
    mesh.rotation.y = THREE.MathUtils.degToRad(placement.rotationY ?? 0);
    mesh.userData = {
      productId: placement.product,
      name: product?.name ?? placement.product,
      room: placement.room,
      category: product?.category,
    };
    group.add(mesh);

    // A rug is walked over, not around -- the same rule the browser applies.
    if ((size.height ?? 0) < 150) return;
    const turned = Math.round(Math.abs(placement.rotationY ?? 0) / 90) % 2 === 1;
    const halfW = (turned ? size.depth : size.width) / 2000;
    const halfD = (turned ? size.width : size.depth) / 2000;
    const [x, , z] = placement.position;
    furnitureRects.push([x - halfW, z - halfD, x + halfW, z + halfD]);
  });

const wallRects = collision.walls.map((entry) => entry.rect);
const solid = [...wallRects, ...furnitureRects];
const insideSolid = (x, z) =>
  solid.find(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

const rooms = collision.rooms.map((entry) => {
  const [x0, z0, x1, z1] = entry.rect;
  return {
    room: entry.room, label: entry.label, type: entry.type, x0, z0, x1, z1,
    centre: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2),
  };
});

const makeTour = () => {
  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic(furnitureRects);
  const showcase = createShowcase({
    products: group,
    fittings: lights.lights.map((light) => ({
      room: light.room, point: new THREE.Vector3().fromArray(light.position),
    })),
    rooms,
    ceiling: collision.ceiling_m,
  });
  const character = new THREE.Object3D();
  const tour = createTourController({
    character,
    camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000),
    walkVolume: volume,
    start: route.waypoints[0].position,
    startHeading: 0,
  });
  return { tour, character, showcase };
};

const STEP = 1 / 60;

// ---------------------------------------------------------------------------
// 1-3. The whole house, with the showcase on.
// ---------------------------------------------------------------------------
{
  const { tour, character, showcase } = makeTour();
  const seen = [];
  let current = null;
  const nearest = new Map();       // product -> closest edge distance while shown

  tour.followRoute(route.waypoints, (stop) => { if (stop.label) seen.push(stop.label); }, {
    showcase,
    onShow: (target) => { current = target; },
  });

  let breaches = 0;
  let firstBreach = null;
  let backwards = 0;
  let movingFrames = 0;
  let previous = tour.position;
  let seconds = 0;

  for (let frame = 0; frame < Math.round(1500 / STEP); frame += 1) {
    tour.update(STEP);
    seconds += STEP;
    const now = tour.position;

    const hit = insideSolid(now.x, now.z);
    if (hit) {
      breaches += 1;
      firstBreach ??= `(${now.x.toFixed(2)}, ${now.z.toFixed(2)}) at ${seconds.toFixed(1)}s`;
    }

    // The figure faces where it goes. The model faces -Z; rotation.y turns it.
    const moved = now.clone().sub(previous).setY(0);
    if (moved.length() > 0.004) {
      movingFrames += 1;
      const ry = character.rotation.y;
      const facing = new THREE.Vector3(-Math.sin(ry), 0, -Math.cos(ry));
      if (facing.dot(moved.normalize()) < 0.5) backwards += 1;
    }
    previous = now;

    if (current?.kind === "product" && current.approach) {
      const spec = current.approach;
      const edge =
        Math.hypot(now.x - spec.centre.x, now.z - spec.centre.z) -
        Math.max(spec.halfAlong, spec.halfAcross);
      const key = current.advert.productId;
      nearest.set(key, Math.min(nearest.get(key) ?? Infinity, edge));
    }

    if (seen.length >= route.stops.length) break;
  }

  assert.equal(
    seen.length, route.stops.length,
    `reached ${seen.length} of ${route.stops.length} stops in ${seconds.toFixed(0)}s: ${seen.join(", ")}`
  );
  assert.equal(breaches, 0, `inside a wall or furniture for ${breaches} frame(s), first ${firstBreach}`);
  console.log(`  walk: all ${seen.length} stops, showcase on, never inside anything, ${seconds.toFixed(0)}s`);

  assert.ok(movingFrames > 1000, "hardly moved; the facing check proves nothing");
  assert.ok(
    backwards / movingFrames < 0.02,
    `faced away from its own walk on ${backwards} of ${movingFrames} moving frames`
  );
  console.log(`  facing: the figure faced its walk on ${movingFrames - backwards} of ${movingFrames} moving frames`);

  // Standing pieces are looked at from near them. A flat one -- a rug -- is
  // seen from wherever the walker is, which is by design.
  const standing = [...nearest.entries()].filter(([id]) => (products.get(id)?.dimensions?.height ?? 0) >= 150);
  const far = standing.filter(([, edge]) => edge > 2.3);
  assert.ok(standing.length >= 5, `only ${standing.length} standing piece(s) were shown`);
  assert.deepEqual(
    far.map(([id, edge]) => `${id} from ${edge.toFixed(2)}m`), [],
    "a piece was looked at from across the room instead of walked up to"
  );
  console.log(
    `  near: ${standing.length} standing piece(s), each seen from within 2.3m of its edge ` +
    `(furthest ${Math.max(...standing.map(([, e]) => e)).toFixed(2)}m)`
  );
}

// ---------------------------------------------------------------------------
// 4. "Show me the bed" -- from the living room, in another room entirely.
// ---------------------------------------------------------------------------
{
  const { tour } = makeTour();
  const seen = [];
  tour.followRoute(route.waypoints, (stop) => { if (stop.label) seen.push(stop.label); });

  // Walk until a couple of stops in, then ask for something elsewhere.
  for (let i = 0; i < 60 * 400 && seen.length < 2; i += 1) tour.update(STEP);
  assert.ok(seen.length >= 2, "never got going");

  const bed = group.children.find((child) => child.userData.category === "bed");
  assert.ok(bed, "no bed in the catalogue to visit");
  const spec = approachOf(bed);

  const leftFrom = tour.position;
  tour.pauseRoute();
  const walking = tour.visit({ point: spec.centre.clone().setY(0.6), approach: spec });
  assert.ok(walking, "visit found no way to the bed");

  let seconds = 0;
  let breaches = 0;
  let edge = Infinity;
  for (; seconds < 180; seconds += STEP) {
    tour.update(STEP);
    const now = tour.position;
    if (insideSolid(now.x, now.z)) breaches += 1;
    edge = Math.min(
      edge,
      Math.hypot(now.x - spec.centre.x, now.z - spec.centre.z) - Math.max(spec.halfAlong, spec.halfAcross)
    );
  }
  assert.equal(breaches, 0, "walked through something on the way to the bed");
  assert.ok(edge < 2.0, `never got near the bed: closest edge ${edge.toFixed(2)}m`);
  assert.equal(seen.length >= 2 && tour.paused, true, "the tour did not stay held during the visit");
  console.log(
    `  visit: walked ${leftFrom.distanceTo(tour.position).toFixed(1)}m to the bed, ` +
    `stood ${edge.toFixed(2)}m from it, route held`
  );

  // Resume: back to where it left off, then the rest of the house.
  const stopsBefore = seen.length;
  tour.resumeRoute();
  for (let i = 0; i < 60 * 1200 && seen.length < route.stops.length; i += 1) {
    tour.update(STEP);
    const now = tour.position;
    if (insideSolid(now.x, now.z)) breaches += 1;
  }
  assert.equal(breaches, 0, "walked through something on the way back");
  assert.equal(
    seen.length, route.stops.length,
    `after the visit reached ${seen.length} of ${route.stops.length} stops`
  );
  console.log(`  resume: walked back and finished the tour (${route.stops.length - stopsBefore} more stops)`);
}

console.log("approach: ok");
