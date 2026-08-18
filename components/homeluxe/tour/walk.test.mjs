/**
 * The guided tour must walk the whole house without going through a wall.
 *
 *     node components/homeluxe/tour/walk.test.mjs
 *
 * WHY THIS IS WORTH A TEST AND NOT A LOOK. Both failure modes are invisible
 * from the outside for the first minute of a two-minute tour: the character
 * walking through a wall looks fine until you notice the room it just crossed,
 * and a tour that jams looks exactly like a tour that is pausing. Watching for
 * either means taking the whole tour, and taking the whole tour after every
 * change to the plan is not something anyone will keep doing.
 *
 * So the REAL controller is driven over the REAL route, against the REAL
 * collision model, at a fixed timestep, and asked two questions:
 *
 *   1. Can it reach every stop? A jam is a stop that never arrives.
 *   2. Is it ever inside a wall? Not "did it try" -- the volume would push it
 *      straight back out -- but whether its settled position each frame is
 *      ever inside solid geometry. That is the guarantee the whole design
 *      rests on, and before this it did not hold: the route was solved
 *      through doorways that were half a door-width from the real ones, and
 *      the walk trusted the route rather than testing the walls.
 *
 * There is no browser here. The character is a bare Object3D, the camera a
 * real PerspectiveCamera, and there are no ground objects -- which makes the
 * ground probe find nothing and the height stay flat, exactly as it does on
 * the driveway. Everything the test is about happens in the XZ plane anyway.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as THREE from "three";

import { ARRIVE_RADIUS, createTourController } from "./TourController.js";
import { createWalkVolume, WALK_RADIUS } from "./collision.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");

const read = (...parts) => JSON.parse(readFileSync(join(PUBLIC, ...parts), "utf8"));

const collision = read("house", "collision.json");
const route = read("tour", "tour.json");
const catalog = read("products", "catalog.json");

// Both manifests are in house-local metres, so no offset is needed as long as
// neither gets one. The browser adds the same offset to both.
const wallRects = collision.walls.map((entry) => entry.rect);

/**
 * The furniture, as footprints.
 *
 * In the browser these are measured from the loaded models; here they are
 * rebuilt from the catalogue's dimensions, which is what those models were
 * built to. Rotation is quarter-turns in this plan, so a quarter turn swaps
 * width and depth.
 */
const sizes = new Map(
  catalog.shops.flatMap((shop) =>
    shop.products.map((product) => [product.id, product.dimensions])
  )
);

const furnitureRects = catalog.houses["3bed"]
  .filter((placement) => !placement.isFinish && placement.position)
  .flatMap((placement) => {
    const size = sizes.get(placement.product);
    if (!size?.width) return [];
    // A rug is walked over, not around -- the same rule the browser applies
    // from the measured height.
    if ((size.height ?? 0) < 150) return [];
    const turned = Math.round(Math.abs(placement.rotationY ?? 0) / 90) % 2 === 1;
    const halfW = (turned ? size.depth : size.width) / 2000;
    const halfD = (turned ? size.width : size.depth) / 2000;
    const [x, , z] = placement.position;
    return [[x - halfW, z - halfD, x + halfW, z + halfD]];
  });

/** The first solid rectangle a point is inside, if any. */
function insideSolid(x, z, rects) {
  return rects.find(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
}

// ---------------------------------------------------------------------------
// 1. Every waypoint has to be somewhere the walker can actually get to.
//
// The route is solved by one program and the collision model built by another,
// from the same plan, and where they disagree the walk is steered towards a
// place it is then pushed out of. A little of that is fine and expected: the
// grid keeps its clearance ACROSS a wall, not around the END of one, so
// rounding a corner displaces the walker by a few centimetres. Displacement is
// what a pushout is for.
//
// What is NOT survivable is a waypoint the walker is pushed further off than
// its own arrival radius, because then it can never arrive and the tour stands
// there forever. So that is the assertion.
// ---------------------------------------------------------------------------
{
  const REACHABLE = WALK_RADIUS - ARRIVE_RADIUS;

  const unreachable = [];
  let nudged = 0;

  route.waypoints.forEach((point, index) => {
    const [x, z] = point.position;
    let closest = Infinity;

    wallRects.forEach(([x0, z0, x1, z1]) => {
      const nx = Math.min(Math.max(x, x0), x1);
      const nz = Math.min(Math.max(z, z0), z1);
      closest = Math.min(closest, Math.hypot(x - nx, z - nz));
    });

    if (closest < WALK_RADIUS) nudged += 1;
    if (closest < REACHABLE) {
      unreachable.push(
        `waypoint ${index} (${point.label ?? "leg"}) is ` +
        `${(closest * 1000).toFixed(0)}mm from a wall, so the walker is pushed ` +
        `${((WALK_RADIUS - closest) * 1000).toFixed(0)}mm off it -- further than ` +
        `the ${(ARRIVE_RADIUS * 1000).toFixed(0)}mm that counts as arriving`
      );
    }
  });

  assert.deepEqual(
    unreachable, [],
    `route and collision model disagree:${unreachable.map((p) => `\n  ${p}`).join("")}`
  );

  console.log(
    `  route: ${route.waypoints.length} waypoints over ${wallRects.length} wall ` +
    `pieces; ${nudged} close enough to a corner to be nudged, none far enough ` +
    `to be missed`
  );
}

// ---------------------------------------------------------------------------
// 2. Walk it.
// ---------------------------------------------------------------------------
{
  const solid = [...wallRects, ...furnitureRects];
  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic(furnitureRects);

  const character = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 1000);

  const tour = createTourController({
    character,
    camera,
    walkVolume: volume,
    // No ground and no yard: the height never changes and there is nothing
    // outdoors to bump into, which is what the driveway is like anyway.
    groundObjects: [],
    obstacles: [],
    start: route.waypoints[0].position,
    startHeading: 0,
  });

  const seen = [];
  // No showcase. What the tour LOOKS at once it has stopped cannot move it, so
  // it cannot break the route -- and leaving it out keeps this test about the
  // one thing it is for.
  tour.followRoute(route.waypoints, (stop) => {
    if (stop.label) seen.push(stop.label);
  });

  const STEP = 1 / 60;
  const LIMIT_SECONDS = 900;

  let breaches = 0;
  let firstBreach = null;
  let travelled = 0;
  let previous = tour.position;
  let elapsed = 0;

  for (let frame = 0; frame < Math.round(LIMIT_SECONDS / STEP); frame += 1) {
    tour.update(STEP);
    elapsed += STEP;

    const at = tour.position;
    travelled += Math.hypot(at.x - previous.x, at.z - previous.z);
    previous = at;

    const wall = insideSolid(at.x, at.z, solid);
    if (wall && firstBreach === null) {
      firstBreach =
        `at ${at.x.toFixed(2)}, ${at.z.toFixed(2)} after ${elapsed.toFixed(1)}s, ` +
        `inside [${wall.map((n) => n.toFixed(2)).join(", ")}]`;
    }
    if (wall) breaches += 1;

    // The route loops, so it is finished the moment the last label is seen.
    if (seen.length >= route.stops.length) break;
  }

  console.log(
    `  walk: ${travelled.toFixed(1)}m in ${elapsed.toFixed(0)}s, reached ` +
    `${seen.length} of ${route.stops.length} stops`
  );

  assert.equal(
    breaches, 0,
    `the character stood inside solid geometry on ${breaches} frame(s) -- ${firstBreach}`
  );

  const missed = route.stops.filter((label) => !seen.includes(label));
  assert.deepEqual(
    missed, [],
    `the tour never reached: ${missed.join(", ")} -- it jammed, or it is too slow`
  );
}

console.log("walk: ok");
