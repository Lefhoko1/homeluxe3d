/**
 * The tour has to survive the stock rotating under it.
 *
 *     node components/homeluxe/tour/rotation.test.mjs
 *
 * THIS IS THE BUSINESS CASE, AS A TEST. The house is an advertising space:
 * batches go live, promotions end, a shop's bed is in the master bedroom this
 * week and gone the next. All of that arrives from the database at page load.
 * NONE of it rebuilds `tour.json`, which was solved in Blender against the
 * catalogue as it stood at the last export.
 *
 * So the route ages, and it ages in one specific way that matters: a room's
 * stop is that room's centre nudged to somewhere a person could stand GIVEN
 * THE FURNITURE AT THE TIME. Put a queen bed across that spot afterwards and
 * the walker is pushed out of it -- correctly -- but if it is pushed further
 * than the arrival radius it can never register as having arrived, and the
 * tour stands beside the bed until someone reloads the page.
 *
 * The failure is silent and it is the difference between a showroom and a
 * broken one, so it is worth proving rather than hoping.
 *
 * Two cases:
 *
 *   1. A product dropped exactly on a stop. The stop must move, stay in its
 *      own room, and the tour must still complete.
 *   2. A room made genuinely impassable. The tour must REPORT it rather than
 *      jam silently, and must still walk everything else.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as THREE from "three";

import { ARRIVE_RADIUS, createTourController } from "./TourController.js";
import { createWalkVolume, settleRoute } from "./collision.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");
const read = (...p) => JSON.parse(readFileSync(join(PUBLIC, ...p), "utf8"));

const collision = read("house", "collision.json");
const route = read("tour", "tour.json");

const wallRects = collision.walls.map((entry) => entry.rect);
const rooms = collision.rooms.map((entry) => {
  const [x0, z0, x1, z1] = entry.rect;
  return { room: entry.room, label: entry.label, x0, z0, x1, z1 };
});

/** Walk the route and report which labelled stops were reached. */
function walk(waypoints, volume, seconds = 900) {
  const tour = createTourController({
    character: new THREE.Object3D(),
    camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000),
    walkVolume: volume,
    groundObjects: [],
    obstacles: [],
    start: waypoints[0].position,
    startHeading: 0,
  });

  const seen = [];
  tour.followRoute(waypoints, (stop) => {
    if (stop.label) seen.push(stop.label);
  });

  const STEP = 1 / 60;
  const total = route.stops.length;
  for (let f = 0; f < Math.round(seconds / STEP); f += 1) {
    tour.update(STEP);
    if (seen.length >= total) break;
  }
  return seen;
}

/** A footprint centred on a point, as the browser would measure one. */
const footprint = (x, z, w, d) => [x - w / 2, z - d / 2, x + w / 2, z + d / 2];

const masterStop = route.waypoints.find((p) => p.room === "master");
assert.ok(masterStop, "the route has no master bedroom stop to test against");

// ---------------------------------------------------------------------------
// 1. A wardrobe arrives from the database, exactly on the master stop.
// ---------------------------------------------------------------------------
{
  const [sx, sz] = masterStop.position;
  // 1.8m x 0.6m, centred on the stop -- a double wardrobe, the sort of thing
  // a bedroom shop puts in a bedroom.
  const wardrobe = footprint(sx, sz, 1.8, 0.6);

  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic([wardrobe]);

  // Without settling, the stop is unreachable -- prove that first, or the
  // test proves nothing about the fix.
  const before = volume.resolve(sx, sz);
  const pushed = Math.hypot(before.x - sx, before.z - sz);
  assert.ok(
    pushed > ARRIVE_RADIUS,
    `the wardrobe should make the stop unreachable, but it only pushes ` +
    `${(pushed * 1000).toFixed(0)}mm -- the test is not testing anything`
  );

  const { waypoints, moved, stranded } = settleRoute(
    route.waypoints, volume, rooms, ARRIVE_RADIUS
  );

  assert.deepEqual(stranded, [], "the master bedroom should not be stranded");
  assert.ok(
    moved.some((m) => m.room === "master"),
    "the master stop was not re-seated"
  );

  // The new stop must be somewhere a person can actually stand...
  const settled = waypoints.find((p) => p.room === "master");
  const after = volume.resolve(...[settled.position[0], settled.position[1]]);
  const residual = Math.hypot(
    after.x - settled.position[0], after.z - settled.position[1]
  );
  assert.ok(
    residual <= ARRIVE_RADIUS * 0.5,
    `re-seated stop is still obstructed by ${(residual * 1000).toFixed(0)}mm`
  );

  // ...and it must still be IN the master bedroom, not out in the hall.
  const room = rooms.find((r) => r.room === "master");
  const [nx, nz] = settled.position;
  assert.ok(
    nx >= room.x0 && nx <= room.x1 && nz >= room.z0 && nz <= room.z1,
    `re-seated stop left the room it names: ${nx.toFixed(2)}, ${nz.toFixed(2)}`
  );

  const seen = walk(waypoints, volume);
  const missed = route.stops.filter((label) => !seen.includes(label));
  assert.deepEqual(missed, [], `tour still jammed: missed ${missed.join(", ")}`);

  console.log(
    `  wardrobe on the master stop: re-seated ${(moved.find((m) => m.room === "master").by * 1000).toFixed(0)}mm, ` +
    `all ${seen.length} stops reached`
  );
}

// ---------------------------------------------------------------------------
// 2. A room filled wall to wall. It must be reported, not silently jammed.
// ---------------------------------------------------------------------------
{
  const room = rooms.find((r) => r.room === "master");
  const filled = [room.x0 - 0.5, room.z0 - 0.5, room.x1 + 0.5, room.z1 + 0.5];

  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic([filled]);

  const { stranded } = settleRoute(route.waypoints, volume, rooms, ARRIVE_RADIUS);

  assert.ok(
    stranded.some((s) => s.room === "master"),
    "a room filled wall to wall was not reported as stranded"
  );
  console.log(
    `  room filled wall to wall: reported as stranded (${stranded.map((s) => s.label).join(", ")})`
  );
}

// ---------------------------------------------------------------------------
// 3. Nothing placed at all -- the empty-house case a new scene starts from.
// ---------------------------------------------------------------------------
{
  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic([]);

  const { moved, stranded } = settleRoute(route.waypoints, volume, rooms, ARRIVE_RADIUS);
  assert.deepEqual(stranded, [], "an empty house stranded a room");

  const seen = walk(route.waypoints, volume);
  const missed = route.stops.filter((label) => !seen.includes(label));
  assert.deepEqual(missed, [], `empty house missed ${missed.join(", ")}`);
  console.log(
    `  empty house: ${moved.length} stop(s) needed moving, all ${seen.length} reached`
  );
}

console.log("rotation: ok");
