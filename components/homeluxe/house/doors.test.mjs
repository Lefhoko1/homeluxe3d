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
// 0. Every door in the manifest has geometry the browser can actually find.
//
// THIS IS THE TEST THAT WOULD HAVE CAUGHT THE DOORS NOT MOVING AT ALL. The
// first version looked its objects up by the name in the manifest, and
// three.js strips '.' from every GLB node name as it loads -- so
// `doors.master.door.leaf` arrives as `doorsmasterdoorleaf` and matched
// nothing. Everything else was right: the leaves were built, the origins were
// on the hinges, the manifest was correct, and not one door ever moved.
//
// So the objects carry their door's label as glTF `extras`, and this reads
// the shipped GLBs to prove the tags are there and cover every door. It also
// catches the second half of that bug: the pool slider is built by the
// WINDOWS component, so it ships in windows.glb and a scan of doors.glb alone
// silently misses it.
// ---------------------------------------------------------------------------
{
  const tagged = new Map();

  for (const file of ["doors", "windows"]) {
    const buf = readFileSync(join(PUBLIC, "house", `${file}.glb`));
    const gltf = JSON.parse(
      buf.slice(20, 20 + buf.readUInt32LE(12)).toString("utf8")
    );
    for (const node of gltf.nodes ?? []) {
      const label = node.extras?.door;
      if (!label) continue;
      if (node.extras.door_part === "fixed") continue;
      tagged.set(label, (tagged.get(label) ?? 0) + 1);
    }
  }

  const untagged = doorsManifest.doors.filter((d) => !tagged.has(d.label));
  assert.deepEqual(
    untagged.map((d) => d.label), [],
    "these doors have no tagged geometry in any GLB, so nothing can move them"
  );

  console.log(
    `  tags: ${tagged.size} door(s) carry moving geometry ` +
    `(${[...tagged.values()].reduce((a, b) => a + b, 0)} parts)`
  );
}

// ---------------------------------------------------------------------------
// 1. Every door in the manifest is a door the walk can get through.
//
// A leaf is only passable once it has swung clear, so the OPENING it leaves
// must be wider than the walker. This is arithmetic, not simulation, and it
// catches a door made too narrow for the plan before anyone walks into it.
// ---------------------------------------------------------------------------
{
  const tight = doorsManifest.doors.filter(
    (d) => (d.motion === "slide" ? d.travel_m : d.width_m) < WALK_RADIUS * 2
  );
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
// 2. A door opens INTO THE ROOM IT SERVES, from either side.
//
// This used to assert the opposite rule: a door opened away from whoever
// approached it, because the plan did not record which way it was hung. It is
// a fair answer to "we do not know" and it has one consequence nobody wants --
// opening away from the visitor means opening into whatever is on the OTHER
// side, so the front door swung through the three-seater and every bedroom
// door swept through its own wardrobe.
//
// The plan decides now, and this proves the decision survives the trip into
// the browser: swing each leaf fully open, take the middle of it, and it must
// be standing in the room the manifest named. That is the check that catches a
// sign flip, and a sign flip is the only way this can go wrong -- the browser's
// z axis is negated against the plan's y, so it is one minus sign between "the
// door opens into the bedroom" and "the door opens into the corridor".
// ---------------------------------------------------------------------------
{
  const roomAt = (x, z) =>
    rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

  const wrong = [];
  for (const entry of doorsManifest.doors.filter((d) => d.motion === "swing")) {
    const set = createDoorSet([entry]);
    const door = set.doors[0];

    // Stand right at it, from BOTH sides in turn, and it must go the same way.
    const landings = [1, -1].map((side) => {
      set.closeAll();
      const cx = door.anchorX + door.alongX * door.width * 0.5;
      const cz = door.anchorZ + door.alongZ * door.width * 0.5;
      const viewer = {
        x: cx + door.alongZ * side * 1.0,
        z: cz - door.alongX * side * 1.0,
      };
      for (let i = 0; i < 120; i += 1) set.update(1 / 60, viewer);

      const a = door.angle;
      const dx = door.alongX * Math.cos(a) + door.alongZ * Math.sin(a);
      const dz = -door.alongX * Math.sin(a) + door.alongZ * Math.cos(a);
      // The middle of the leaf, not its tip: a tip lands within millimetres
      // of a wall and picks up whichever room rounding puts it in.
      return roomAt(
        door.anchorX + dx * door.width * 0.6,
        door.anchorZ + dz * door.width * 0.6
      )?.room;
    });

    if (landings[0] !== landings[1]) {
      wrong.push(`${entry.label} opens two different ways depending on who is at it`);
    } else if (entry.into && landings[0] !== entry.into) {
      wrong.push(
        `${entry.label} should open into ${entry.into} but its leaf ends up ` +
        `in ${landings[0] ?? "no room at all"}`
      );
    }
  }

  assert.deepEqual(wrong, [], wrong.join("; "));
  console.log(
    `  swing: ${doorsManifest.doors.filter((d) => d.motion === "swing").length} ` +
    `leaf/leaves open into the room they serve, from either side`
  );
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
  const cx = door.anchorX + door.alongX * door.width * 0.5;
  const cz = door.anchorZ + door.alongZ * door.width * 0.5;

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

// ---------------------------------------------------------------------------
// 5. A door stops when it meets the furniture, and does not pass through it.
//
// THIS IS THE FAULT THAT STARTED ALL OF IT: doors opening straight through the
// sofa. Making them open inward is only half the answer -- inward is where the
// furniture is. A real door opens as far as it can and rests against whatever
// stopped it, which is why doors in a crowded house stand at odd angles.
//
// Driven against the REAL catalogue placements, and it must hold for the leaf
// at every angle on the way, not only where it comes to rest -- a leaf that
// ends up clear having swept through a wardrobe on the way is exactly the bug.
// ---------------------------------------------------------------------------
{
  const doors = createDoorSet(doorsManifest.doors);
  doors.setObstacles(furnitureRects);

  const inside = (x, z) =>
    furnitureRects.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

  const through = [];
  for (const door of doors.doors) {
    if (door.sliding) continue;
    // Every angle it can reach, at 1 degree, along the whole leaf.
    const steps = Math.max(1, Math.round((door.maxAngle * 180) / Math.PI));
    for (let i = 0; i <= steps; i += 1) {
      const a = door.sign * (door.maxAngle * i) / steps;
      const dx = door.alongX * Math.cos(a) + door.alongZ * Math.sin(a);
      const dz = -door.alongX * Math.sin(a) + door.alongZ * Math.cos(a);
      for (const f of [0.3, 0.5, 0.7, 0.85, 1.0]) {
        if (inside(door.anchorX + dx * door.width * f,
                   door.anchorZ + dz * door.width * f)) {
          through.push(`${door.label} at ${((a * 180) / Math.PI).toFixed(0)}deg`);
          i = steps;
          break;
        }
      }
    }
  }

  assert.deepEqual(through, [], `these leaves pass through furniture: ${through.join(", ")}`);

  const stopped = doors.doors.filter((d) => !d.sliding && d.maxAngle < Math.PI / 2);
  console.log(
    `  furniture: no leaf passes through any of ${furnitureRects.length} piece(s)` +
    (stopped.length
      ? `; ${stopped.map((d) => `${d.label} rests at ${((d.maxAngle * 180) / Math.PI).toFixed(0)}deg`).join(", ")}`
      : "; every door opens fully")
  );
}

// ---------------------------------------------------------------------------
// 6. A door stopped by furniture still leaves room to walk through.
//
// The cost of a door that stops at the sofa is a door that might stop across
// its own doorway, and the guided tour would then stand in front of it for
// ever -- which looks exactly like the application having frozen, and is
// strictly worse than the walking-through-furniture it replaced.
// ---------------------------------------------------------------------------
{
  const doors = createDoorSet(doorsManifest.doors);
  doors.setObstacles(furnitureRects);

  const jammed = doors.doors.filter((d) => !d.sliding && d.blocked);
  assert.deepEqual(
    jammed.map((d) => `${d.label} opens only ${((d.maxAngle * 180) / Math.PI).toFixed(0)}deg`),
    [],
    "a door is held so nearly shut by furniture that nobody can get past it"
  );
  console.log("  passage: every obstructed door still opens wide enough to pass");
}

console.log("doors: ok");
