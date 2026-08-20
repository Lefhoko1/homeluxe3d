/**
 * The tour has to actually show what is being advertised.
 *
 *     node components/homeluxe/tour/showcase.test.mjs
 *
 * THIS IS THE PART OF THE TOUR THE BUSINESS IS PAYING FOR. A walk-through
 * that visits every room and never turns to face the sofa has done the
 * expensive half of the job and skipped the point of it. The failure is
 * quiet, too: the tour still runs, still names the room, still looks busy.
 *
 * The list is built from the real catalogue, the real collision manifest and
 * the real lights manifest, with the products stood up as boxes of their
 * catalogued size -- so this checks the joins that actually break: a product
 * whose room does not match the route's room name, a finish keyed by a
 * material name rather than a surface, a room with no fitting.
 *
 * What it asserts:
 *
 *   1. Every advertised, placed product is shown somewhere on the tour.
 *   2. Every room with a finish placed in it shows that finish.
 *   3. No stop is over the maximum or under the minimum -- a room must never
 *      be a two-second glance, and never a half-minute stand.
 *   4. Nothing is aimed at somewhere impossible: below the floor or above the
 *      ceiling.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as THREE from "three";

import { createShowcase } from "./showcase.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");
const read = (...parts) => JSON.parse(readFileSync(join(PUBLIC, ...parts), "utf8"));

const collision = read("house", "collision.json");
const lights = read("house", "lights.json");
const doorsManifest = read("house", "doors.json");
const slotsManifest = read("house", "slots.json");
const catalog = read("products", "catalog.json");
const route = read("tour", "tour.json");

const placements = catalog.houses["3bed"];
const products = new Map(
  catalog.shops.flatMap((shop) => shop.products.map((p) => [p.id, p]))
);

// ---- Stand the furniture up ----------------------------------------------
// Boxes of the catalogued size, in the catalogued place. The browser measures
// the loaded models; a box of the same dimensions has the same bounding box,
// which is all the showcase reads.
const group = new THREE.Group();

placements
  .filter((placement) => !placement.isFinish && placement.position)
  .forEach((placement) => {
    const product = products.get(placement.product);
    const size = product?.dimensions ?? { width: 500, depth: 500, height: 500 };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        size.width / 1000, size.height / 1000, size.depth / 1000
      )
    );
    mesh.position.fromArray(placement.position);
    mesh.position.y += size.height / 2000;   // products stand ON the floor
    mesh.rotation.y = THREE.MathUtils.degToRad(placement.rotationY ?? 0);
    mesh.userData = {
      productId: placement.product,
      name: product?.name ?? placement.product,
      room: placement.room,
      // CARRIED, because the showcase matches free slots against what is
      // already standing here by category. Without it the stub was thinner
      // than `advertFor` and the master offered a bed position with the
      // Slumberland in it -- a fault in the test, not in the code.
      category: product?.category,
    };
    group.add(mesh);
  });

// ---- The finishes, as CanvasContainer maps them --------------------------
// Same classification, and it has to STAY the same: a finish aimed at the
// wrong surface shows a visitor the floor and calls it a hinge.
const finishKind = (placement) => {
  if (products.get(placement.product)?.category === "hardware") return "fitting";
  return /^wall/i.test(placement.surface ?? "") ? "wall" : "floor";
};

const finishes = placements
  .filter((placement) => placement.isFinish && placement.room !== "exterior")
  .map((placement) => ({
    room: placement.room,
    kind: finishKind(placement),
    advert: {
      productId: placement.product,
      name: products.get(placement.product)?.name ?? placement.product,
      isFinish: true,
    },
  }));

// Where the hinges are, so a door-hardware advert has something to aim at.
// HINGED DOORS ONLY: a slider runs on a track and has no hinge to show, which
// is exactly why `points()` filters them out in doors.js. Reading `hinge` off
// every entry threw the moment the slider joined the manifest.
const doorPoints = doorsManifest.doors
  .filter((d) => d.motion === "swing")
  .map((d) => ({ label: d.label, x: d.hinge[0], y: 1.04, z: d.hinge[1] }));

const fittings = lights.lights.map((light) => ({
  room: light.room,
  point: new THREE.Vector3().fromArray(light.position),
}));

const rooms = collision.rooms.map((entry) => {
  const [x0, z0, x1, z1] = entry.rect;
  return {
    room: entry.room,
    label: entry.label,
    type: entry.type,
    x0, z0, x1, z1,
    centre: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2),
  };
});

const showcase = createShowcase({
  products: group,
  finishes,
  fittings,
  rooms,
  ceiling: collision.ceiling_m,
  doors: doorPoints,
  slots: slotsManifest.slots,
});

// ---- Walk the route's stops ----------------------------------------------
const stops = route.waypoints.filter((point) => point.room);
assert.ok(stops.length > 0, "the route has no room stops at all");

const shown = new Map();     // room -> targets
let totalSeconds = 0;

stops.forEach((stop) => {
  const from = new THREE.Vector3(stop.position[0], 0, stop.position[1]);
  const targets = showcase.forRoom(stop.room, from);
  shown.set(stop.room, targets);
  totalSeconds += targets.reduce((sum, target) => sum + target.dwell, 0);
});

// ---- 1. Every placed product is shown ------------------------------------
{
  const advertised = placements
    .filter((placement) => !placement.isFinish && placement.position)
    .map((placement) => placement.product);

  const seen = new Set(
    [...shown.values()].flat()
      .filter((target) => target.kind === "product")
      .map((target) => target.advert.productId)
  );

  const missed = [...new Set(advertised)].filter((id) => !seen.has(id));
  assert.deepEqual(
    missed, [],
    `placed but never looked at: ${missed.join(", ")}`
  );
  console.log(`  products: all ${seen.size} placed item(s) are shown`);
}

// ---- 2. Every placed finish is shown -------------------------------------
{
  const missed = finishes.filter((finish) => {
    const targets = shown.get(finish.room) ?? [];
    return !targets.some((target) => target.kind === finish.kind);
  });

  assert.deepEqual(
    missed.map((f) => `${f.advert.productId} in ${f.room}`), [],
    "a finish was placed in a room the tour never shows it in"
  );

  // Door hardware has to be aimed AT A DOOR. Falling back to the floor aim
  // would still count as "shown" above while showing the wrong thing.
  const fittings = [...shown.values()].flat().filter((t) => t.kind === "fitting");
  fittings.forEach((target) => {
    const onADoor = doorPoints.some(
      (d) => Math.hypot(d.x - target.point.x, d.z - target.point.z) < 0.01
    );
    assert.ok(
      onADoor,
      `${target.caption} is aimed at ${target.point.x.toFixed(2)}, ` +
      `${target.point.z.toFixed(2)}, which is not a door`
    );
  });

  console.log(
    `  finishes: all ${finishes.length} placed finish(es) are shown ` +
    `(${fittings.length} aimed at a door)`
  );
}

// ---- 2b. The empty positions are offered ---------------------------------
//
// A slot is what is FOR SALE. A walkthrough that only shows what has already
// been bought is a tour of somebody else's success -- the visitor being sold
// space has to be shown the space.
{
  const offered = [...shown.values()].flat().filter((t) => t.kind === "slot");
  assert.ok(
    offered.length > 0,
    "the tour never offers an empty position, so nothing in this house is " +
    "visibly for sale"
  );

  // Every one has to be a real slot from the manifest, aimed where it says.
  const byId = new Map(slotsManifest.slots.map((s) => [s.id, s]));
  offered.forEach((target) => {
    const slot = byId.get(target.slot?.id);
    assert.ok(slot, `offered a slot that is not in the manifest: ${target.caption}`);
    assert.ok(
      Math.hypot(target.point.x - slot.position[0],
                 target.point.z - slot.position[2]) < 0.01,
      `${slot.id} is aimed at ${target.point.x.toFixed(2)},` +
      `${target.point.z.toFixed(2)} but stands at ` +
      `${slot.position[0]},${slot.position[2]}`
    );
  });

  // A position that is already filled must never be offered.
  const placedCategories = new Map();
  placements.filter((p) => !p.isFinish && p.position).forEach((p) => {
    const cat = products.get(p.product)?.category;
    if (cat) placedCategories.set(`${p.room}:${cat}`, true);
  });
  const doubleSold = offered.filter(
    (t) => t.slot.category && placedCategories.has(`${t.slot.room}:${t.slot.category}`)
  );
  assert.deepEqual(
    doubleSold.map((t) => `${t.slot.id} in ${t.slot.room}`), [],
    "offered a position that already holds a product of that category"
  );

  const rooms = new Set(offered.map((t) => t.slot.room));
  console.log(
    `  inventory: ${offered.length} empty position(s) offered across ` +
    `${rooms.size} room(s)`
  );
}

// ---- 3. Every stop is a real pause, and none is a stand ------------------
{
  const wrong = [];
  shown.forEach((targets, room) => {
    const seconds = targets.reduce((sum, target) => sum + target.dwell, 0);
    if (seconds < 8) wrong.push(`${room} stops for only ${seconds.toFixed(1)}s`);
    if (seconds > 26) wrong.push(`${room} stands for ${seconds.toFixed(1)}s`);
    if (!targets.length) wrong.push(`${room} has nothing to look at`);
  });

  assert.deepEqual(wrong, [], `badly sized stops:\n  ${wrong.join("\n  ")}`);
  console.log(
    `  stops: ${shown.size} room(s), ${totalSeconds.toFixed(0)}s of looking in total`
  );
}

// ---- 4. Nothing is aimed through the floor or the roof -------------------
{
  const impossible = [];
  shown.forEach((targets, room) => {
    targets.forEach((target) => {
      if (target.point.y < 0 || target.point.y > collision.ceiling_m) {
        impossible.push(
          `${room}: ${target.kind} "${target.caption}" at y=${target.point.y.toFixed(2)}`
        );
      }
    });
  });

  assert.deepEqual(impossible, [], `aimed outside the room:\n  ${impossible.join("\n  ")}`);
}

// A useful thing to see when tuning the dwells.
console.log("");
shown.forEach((targets, room) => {
  console.log(
    `  ${room.padEnd(9)} ${targets.map((t) => t.caption).join(", ")}`
  );
});

console.log("\nshowcase: ok");
