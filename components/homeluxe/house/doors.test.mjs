/**
 * Doors that open must not be doors that trap you.
 *
 *     node components/homeluxe/house/doors.test.mjs
 *
 * MAKING A CLOSED DOOR SOLID IS THE RISKY HALF OF THIS FEATURE. Before it,
 * the walk went through every doorway because there was nothing there; now
 * there is a leaf across each one for as long as it is shut, and the guided
 * tour has to arrive, wait for it to swing, and go through. Get the trigger
 * distance or the swing rate wrong and the tour stops at a door forever --
 * which is strictly worse than walking through it, and looks the same as the
 * whole app having frozen.
 *
 * The door logic is deliberately separable from three.js for this reason (see
 * `createDoorSet`), so the REAL rules are driven here against the REAL
 * manifest, and the whole tour is walked with the doors in the collision
 * volume.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as THREE from "three";

import { createDoorSet } from "./doors.js";
import { createTourController } from "../tour/TourController.js";
import { createWalkVolume, settleRoute, WALK_RADIUS } from "../tour/collision.js";
import { ARRIVE_RADIUS } from "../tour/TourController.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");
const read = (...p) => JSON.parse(readFileSync(join(PUBLIC, ...p), "utf8"));

const collision = read("house", "collision.json");
const doorsManifest = read("house", "doors.json");
const route = read("tour", "tour.json");
const catalog = read("products", "catalog.json");

const wallRects = collision.walls.map((e) => e.rect);
const rooms = collision.rooms.map((e) => {
  const [x0, z0, x1, z1] = e.rect;
  return { room: e.room, label: e.label, x0, z0, x1, z1 };
});

// Furniture, as the browser measures it.
const sizes = new Map(
  catalog.shops.flatMap((s) => s.products.map((p) => [p.id, p.dimensions]))
);
const furnitureRects = catalog.houses["3bed"]
  .filter((p) => !p.isFinish && p.position)
  .flatMap((p) => {
    const size = sizes.get(p.product);
    if (!size?.width || (size.height ?? 0) < 150) return [];
    const turned = Math.round(Math.abs(p.rotationY ?? 0) / 90) % 2 === 1;
    const hw = (turned ? size.depth : size.width) / 2000;
    const hd = (turned ? size.width : size.depth) / 2000;
    const [x, , z] = p.position;
    return [[x - hw, z - hd, x + hw, z + hd]];
  });

// ---------------------------------------------------------------------------
// 1. Every door in the manifest is a door the walk can get through.
//
// A leaf is only passable once it has swung clear, so the OPENING it leaves
// must be wider than the walker. This is arithmetic, not simulation, and it
// catches a door made too narrow for the plan before anyone walks into it.
// ---------------------------------------------------------------------------
{
  const tight = doorsManifest.doors.filter((d) => d.width_m < WALK_RADIUS * 2);
  assert.deepEqual(
    tight.map((d) => `${d.label} is ${(d.width_m * 1000).toFixed(0)}mm`), [],
    `a walker is ${(WALK_RADIUS * 2000).toFixed(0)}mm across and cannot fit`
  );
  console.log(
    `  ${doorsManifest.doors.length} door(s), narrowest leaf ` +
    `${Math.min(...doorsManifest.doors.map((d) => d.width_m * 1000)).toFixed(0)}mm`
  );
}

// ---------------------------------------------------------------------------
// 2. A door opens away from whoever is at it, and never into them.
// ---------------------------------------------------------------------------
{
  const entry = doorsManifest.doors[0];

  for (const side of [1, -1]) {
    const set = createDoorSet([entry]);
    const door = set.doors[0];
    // Stand a metre off the middle of the leaf, on one side then the other.
    const cx = door.hingeX + door.alongX * door.width * 0.5;
    const cz = door.hingeZ + door.alongZ * door.width * 0.5;
    const viewer = {
      x: cx + door.alongZ * side * 1.0,
      z: cz - door.alongX * side * 1.0,
    };

    for (let i = 0; i < 120; i += 1) set.update(1 / 60, viewer);

    assert.ok(door.openness > 0.99, "the door did not open for someone at it");

    // The free end after swinging, and whether it moved towards the visitor.
    const a = door.angle;
    const endX = door.hingeX + (door.alongX * Math.cos(a) + door.alongZ * Math.sin(a)) * door.width;
    const endZ = door.hingeZ + (-door.alongX * Math.sin(a) + door.alongZ * Math.cos(a)) * door.width;
    const closedEndX = door.hingeX + door.alongX * door.width;
    const closedEndZ = door.hingeZ + door.alongZ * door.width;

    const movedToward =
      Math.hypot(endX - viewer.x, endZ - viewer.z) <
      Math.hypot(closedEndX - viewer.x, closedEndZ - viewer.z);

    assert.ok(
      !movedToward,
      `the door swung towards the visitor standing on side ${side}`
    );
  }
  console.log("  swing: away from the visitor, from either side");
}

// ---------------------------------------------------------------------------
// 3. The whole guided tour, with the doors solid until they open.
// ---------------------------------------------------------------------------
{
  const doors = createDoorSet(doorsManifest.doors);
  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic([...furnitureRects, ...doors.footprints()]);

  // Every door starts shut, so the route's own waypoints have to be settled
  // against them exactly as the app does at tour start.
  const { waypoints } = settleRoute(route.waypoints, volume, rooms, ARRIVE_RADIUS);

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
  let opened = 0;
  let elapsed = 0;

  for (let f = 0; f < Math.round(1200 / STEP); f += 1) {
    const at = tour.position;
    // Exactly what CanvasContainer does each frame: swing the doors from
    // where the visitor is, then hand the volume the ones still shut.
    doors.update(STEP, at);
    volume.setDynamic([...furnitureRects, ...doors.footprints()]);
    tour.update(STEP);
    elapsed += STEP;

    opened = Math.max(opened, doors.doors.filter((d) => d.openness > 0.9).length);
    if (seen.length >= route.stops.length) break;
  }

  const missed = route.stops.filter((l) => !seen.includes(l));
  assert.deepEqual(
    missed, [],
    `the tour could not get through: missed ${missed.join(", ")} -- a closed ` +
    `door is blocking a doorway it never opens in time`
  );

  console.log(
    `  tour: ${seen.length}/${route.stops.length} stops in ${elapsed.toFixed(0)}s, ` +
    `${opened} door(s) seen fully open`
  );

  assert.ok(
    opened > 0,
    "the tour completed without a single door opening -- they are not being " +
    "triggered, and the leaves are not blocking anything either"
  );
}

// ---------------------------------------------------------------------------
// 4. A shut door is solid. Walk at one that will not open and be stopped.
// ---------------------------------------------------------------------------
{
  const entry = doorsManifest.doors.find((d) => d.kind === "door_internal");
  const doors = createDoorSet([entry]);
  const volume = createWalkVolume({ fixed: [] });
  volume.setDynamic(doors.footprints());

  const door = doors.doors[0];
  const cx = door.hingeX + door.alongX * door.width * 0.5;
  const cz = door.hingeZ + door.alongZ * door.width * 0.5;

  // Approach along the leaf's normal, from 0.8m out, with the door frozen
  // shut -- `update` is simply not called, so nothing opens.
  const nx = door.alongZ;
  const nz = -door.alongX;
  let x = cx + nx * 0.8;
  let z = cz + nz * 0.8;

  for (let i = 0; i < 200; i += 1) {
    const solved = volume.resolve(x - nx * 0.01, z - nz * 0.01);
    x = solved.x;
    z = solved.z;
  }

  const throughBy = (x - cx) * nx + (z - cz) * nz;
  assert.ok(
    throughBy > 0,
    `walked through a shut door: ended ${(-throughBy * 1000).toFixed(0)}mm ` +
    `past the leaf`
  );
  console.log(
    `  a shut door stops you ${(throughBy * 1000).toFixed(0)}mm short of it`
  );
}

console.log("doors: ok");
