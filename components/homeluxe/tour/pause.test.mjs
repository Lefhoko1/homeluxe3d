/**
 * Pausing the tour must not lose the tour.
 *
 *     node components/homeluxe/tour/pause.test.mjs
 *
 * WHY THIS IS WORTH A TEST. There was already a way to stop a guided walk --
 * `stopRoute` -- and it throws the route away: the waypoints, the index, the
 * dwell timer and the showcase all go, and the only way back is to start again
 * from the driveway. Reusing it for "pause while I look at that sofa" would
 * have looked right for about two seconds and then restarted the tour at the
 * front door, which is the sort of bug nobody reports precisely because it
 * looks like a feature working oddly.
 *
 * So `pauseRoute` keeps everything and simply stops being stepped. The three
 * things worth proving are that the walk really does stop, that the place is
 * really kept, and that the tour really does finish afterwards.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as THREE from "three";

import { createDoorSet } from "../house/doors.js";
import { createTourController, ARRIVE_RADIUS } from "./TourController.js";
import { createWalkVolume, settleRoute } from "./collision.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");
const read = (...p) => JSON.parse(readFileSync(join(PUBLIC, ...p), "utf8"));

const collision = read("house", "collision.json");
const doorsManifest = read("house", "doors.json");
const route = read("tour", "tour.json");

const wallRects = collision.walls.map((e) => e.rect);
const rooms = collision.rooms.map((e) => {
  const [x0, z0, x1, z1] = e.rect;
  return { room: e.room, label: e.label, x0, z0, x1, z1 };
});

/** A tour part-way through the house, so pausing has something to lose. */
function walkingTour() {
  const doors = createDoorSet(doorsManifest.doors);
  const volume = createWalkVolume({ fixed: wallRects });
  volume.setDynamic(doors.footprints());

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
  const step = (seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
      doors.update(STEP, tour.position);
      volume.setDynamic(doors.footprints());
      tour.update(STEP);
    }
  };

  return { tour, seen, step, total: route.stops.length };
}

// ---------------------------------------------------------------------------
// 1. A held tour goes nowhere at all.
// ---------------------------------------------------------------------------
{
  const { tour, step } = walkingTour();
  step(30);                            // get properly under way

  assert.ok(tour.progress.at > 0, "the tour never started, so this proves nothing");

  const held = tour.pauseRoute();
  assert.ok(held, "pauseRoute refused to hold a walking tour");
  assert.ok(tour.paused, "the tour does not think it is paused");

  const where = tour.position;
  const at = tour.progress.at;

  step(20);                            // twenty seconds of nothing

  assert.equal(
    tour.position.distanceTo(where), 0,
    "the character moved while the tour was paused"
  );
  assert.equal(
    tour.progress.at, at,
    "the tour advanced through its stops while paused"
  );
  console.log(
    `  held: 20s passed, 0mm moved, still on stop ${at} of ${tour.progress.total}`
  );
}

// ---------------------------------------------------------------------------
// 2. Resuming carries on from there -- it does NOT start again.
//
// THE FAULT THIS CATCHES is the tempting implementation: pause by stopping
// the route and resume by following it again. `followRoute` deliberately
// always starts at waypoint 0, because every waypoint is indoors and the
// visitor begins on the driveway. Resuming that way would walk them back out
// of the front door.
// ---------------------------------------------------------------------------
{
  const { tour, step } = walkingTour();
  step(45);

  const before = tour.progress.at;
  const where = tour.position;
  assert.ok(before > 0, "no progress to preserve");

  tour.pauseRoute();
  step(10);
  const resumed = tour.resumeRoute();

  assert.ok(resumed, "resumeRoute refused to carry on");
  assert.ok(!tour.paused, "the tour still thinks it is paused");
  assert.equal(
    tour.progress.at, before,
    "resuming reset the count of stops already visited"
  );
  assert.ok(
    tour.position.distanceTo(where) < 0.01,
    "resuming moved the character before it took a step"
  );

  step(2);
  assert.ok(
    tour.position.distanceTo(where) > 0.05,
    "the tour did not start walking again after resuming"
  );
  console.log(
    `  resumed: carried on from stop ${before}, not from the driveway`
  );
}

// ---------------------------------------------------------------------------
// 3. A tour interrupted still gets round the whole house.
//
// The point of keeping the place is that the walk finishes. If pausing cost
// the visitor three rooms, it would be better not to offer it.
// ---------------------------------------------------------------------------
{
  const { tour, seen, step, total } = walkingTour();

  // Interrupt it three times, the way somebody browsing the list would.
  for (const after of [20, 40, 60]) {
    step(after);
    tour.pauseRoute();
    step(8);                            // reading about a sofa
    tour.resumeRoute();
  }

  step(400);

  const missed = route.stops.filter((label) => !seen.includes(label));
  assert.deepEqual(
    missed, [],
    `interrupting the tour cost it: never reached ${missed.join(", ")}`
  );
  console.log(`  interrupted 3 times and still reached all ${total} stops`);
}

// ---------------------------------------------------------------------------
// 4. The guards. Pausing what is not walking must not pretend it worked.
// ---------------------------------------------------------------------------
{
  const { tour, step } = walkingTour();
  step(10);

  assert.equal(tour.resumeRoute(), false, "resumed a tour that was not paused");
  tour.pauseRoute();
  assert.equal(tour.pauseRoute(), false, "paused an already paused tour");
  tour.resumeRoute();

  // Leaving clears the hold, or the next tour starts frozen.
  tour.pauseRoute();
  tour.exit();
  assert.ok(!tour.paused, "exiting the tour left it holding");
  console.log("  guards: pausing twice, resuming twice and exiting all behave");
}

console.log("pause: ok");
