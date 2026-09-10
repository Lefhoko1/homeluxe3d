/**
 * Nothing standing in the house blocks the walk.
 *
 *     node components/homeluxe/tour/clearance.test.mjs
 *
 * THE ROUTE IS SOLVED IN BLENDER; THE FURNITURE COMES FROM THE DATABASE.
 * `tour_json` paints the walls, the joinery and the catalogue's own placements
 * and solves a path clear of all of them. That is the whole safety net, and it
 * has a hole the size of every product that does NOT come through the
 * catalogue: an upload placed by migration or by an operator in the admin
 * screen is invisible to the solver, because the solver ran months earlier on
 * a different machine.
 *
 * A 3.37m kitchen run inserted that way went straight across the kitchen's
 * 2.4m doorway. The route still said 110 waypoints at 300mm clearance --
 * perfectly true, and solved against a house that no longer existed -- while
 * the browser's collision model, which reads the live placements, refused to
 * let the character through. The tour simply stopped arriving, and the first
 * anybody knew was a person walking into it.
 *
 * So this reads the placements the browser will actually load and checks them
 * against the waypoints the character will actually walk, which is the pair
 * nothing else compares. It is the check that was missing rather than a test
 * of code that changed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { WALK_RADIUS } from "./collision.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

const route = JSON.parse(
  readFileSync(join(ROOT, "public", "models", "tour", "tour.json"), "utf8")
);

// The same credentials the browser uses.
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");

      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    })
);

const rows = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/v_live_placements` +
  "?select=product_name,shop_slug,room_code,x_mm,y_mm,z_mm,rotation_deg," +
  "width_mm,depth_mm,height_mm,model_url&scene_slug=eq.3bed",
  {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  }
).then((r) => r.json());

assert.ok(Array.isArray(rows) && rows.length, `no placements: ${JSON.stringify(rows)}`);

/**
 * A placement's footprint in three.js metres.
 *
 * Plan y becomes -z, which is the frame `tour.json` and `collision.json` are
 * both written in. Rotation is quantised to the nearest quarter turn because
 * that is all a footprint needs: an axis-aligned box is either the way it was
 * modelled or turned on its side.
 */
function footprint(row) {
  const turned = Math.round(Math.abs(Number(row.rotation_deg) || 0) / 90) % 2 === 1;
  const w = (turned ? Number(row.depth_mm) : Number(row.width_mm)) / 2000;
  const d = (turned ? Number(row.width_mm) : Number(row.depth_mm)) / 2000;
  const x = Number(row.x_mm) / 1000;
  const z = -Number(row.y_mm) / 1000;

  return { x0: x - w, z0: z - d, x1: x + w, z1: z + d };
}

/**
 * What the walk is actually pushed out of.
 *
 * A FINISH IS NOT AN OBSTACLE -- paint has no footprint. Nor is anything you
 * step over: `footprintsOf` in collision.js drops whatever stands lower than
 * a step, which is how the rug in the living room is walked across rather
 * than around. And nothing that begins ABOVE the walk band blocks it: a
 * television standing on a media unit is at 800mm, over the walker's feet and
 * entirely inside the unit's own footprint.
 */
const STEP_OVER_MM = 120;
const HEAD_MM = 2000;

const solid = rows.filter((r) => {
  if (!r.model_url) return false;                       // a finish
  if (r.x_mm === null || r.y_mm === null) return false;  // nothing to stand on
  const base = Number(r.z_mm) || 0;
  const top = base + (Number(r.height_mm) || 0);

  if (top <= STEP_OVER_MM) return false;                // stepped over
  if (base >= HEAD_MM) return false;                    // walked under

  return true;
});

console.log(
  `\n${rows.length} live placement(s), ${solid.length} of them solid; ` +
  `${route.waypoints.length} waypoints, walker radius ${WALK_RADIUS * 1000}mm\n`
);

const blocked = [];

for (const row of solid) {
  const box = footprint(row);

  for (const [i, point] of route.waypoints.entries()) {
    const [x, z] = point.position;
    const dx = Math.max(box.x0 - x, 0, x - box.x1);
    const dz = Math.max(box.z0 - z, 0, z - box.z1);
    const gap = Math.hypot(dx, dz);

    if (gap < WALK_RADIUS) {
      blocked.push({
        what: row.product_name,
        room: row.room_code,
        waypoint: i,
        label: point.label ?? point.room ?? "",
        gap,
      });
    }
  }
}

if (blocked.length) {
  console.log("BLOCKED:");
  for (const b of blocked.slice(0, 12)) {
    console.log(
      `  ${b.what} (${b.room}) sits on waypoint #${b.waypoint} ` +
      `${b.label} -- ${(b.gap * 1000).toFixed(0)}mm of ` +
      `${WALK_RADIUS * 1000}mm needed`
    );
  }
  if (blocked.length > 12) console.log(`  ... and ${blocked.length - 12} more`);
}

const offenders = [...new Set(blocked.map((b) => `${b.what} in ${b.room}`))];

assert.equal(
  blocked.length,
  0,
  `${offenders.length} placement(s) stand on the solved route: ` +
  `${offenders.join("; ")}. The route was solved in Blender without them -- ` +
  "either move them, or put them in the catalogue and rebuild so the solver " +
  "routes around them."
);

console.log("every live placement leaves the route walkable");

// And the two radii still agree. The route is solved against one number and
// the browser pushes out of another; they are the same number in two
// languages and a jam is what disagreement looks like.
assert.equal(
  route.clearance_mm >= WALK_RADIUS * 1000,
  true,
  `the route was solved at ${route.clearance_mm}mm, narrower than the ` +
  `${WALK_RADIUS * 1000}mm walker -- it threads gaps the character cannot enter`
);

console.log(
  `route solved at ${route.clearance_mm}mm, walker is ${WALK_RADIUS * 1000}mm`
);
console.log("clearance: ok");

/**
 * AND NOTHING STANDS IN A DOORWAY.
 *
 * The waypoint check above is not enough, and the way it is not enough was
 * reported by somebody watching the tour: the character walked out through
 * the dining room's sliding door and straight into a kitchen unit.
 *
 * Every check said yes. The waypoints were clear, because the route is solved
 * around the walls and none of them runs through the doorway itself.
 * `doors.test.mjs` was happy, because it tests the DOOR -- that the slider
 * opens in time and that its aperture is wider than the walker -- and a door
 * knows nothing about what somebody has parked in front of it. So a 3,367mm
 * run stood across a 2,325mm opening, covering all of it, and the only thing
 * that noticed was a person.
 *
 * The door manifest gives each opening as a segment on the wall. A placement
 * blocks it if its footprint comes within a walker's radius of that segment,
 * which is the same rule and the same number the rest of the walk uses.
 */
function doorSegment(door) {
  // A hinged leaf: the gap runs from the hinge, along the wall, one leaf wide.
  if (door.motion === "swing") {
    const [hx, hz] = door.hinge;
    const [ax, az] = door.along;

    return [hx, hz, hx + ax * door.width_m, hz + az * door.width_m];
  }

  // A sash: the gap is the sash plus the fixed panel it slides over, centred
  // on the opening. Half of it is the sash, half is what it slides across.
  const [cx, cz] = door.centre;
  const [ax, az] = door.along;
  const half = (door.width_m + door.travel_m) / 2;

  return [cx - ax * half, cz - az * half, cx + ax * half, cz + az * half];
}

/** Distance from a point to a segment, in metres. */
function toSegment(px, pz, [x0, z0, x1, z1]) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / len));

  return Math.hypot(px - (x0 + t * dx), pz - (z0 + t * dz));
}

const doors = JSON.parse(
  readFileSync(join(ROOT, "public", "models", "house", "doors.json"), "utf8")
).doors;

const obstructed = [];

for (const row of solid) {
  const box = footprint(row);

  for (const door of doors) {
    const segment = doorSegment(door);

    // Sample the footprint's outline against the opening. The corners alone
    // miss a long run lying across a short doorway -- every corner is far
    // from it and the middle of the edge is sitting in it.
    let nearest = Infinity;
    const STEPS = 40;
    for (let i = 0; i <= STEPS; i += 1) {
      const t = i / STEPS;
      const xs = box.x0 + (box.x1 - box.x0) * t;
      const zs = box.z0 + (box.z1 - box.z0) * t;

      nearest = Math.min(
        nearest,
        toSegment(xs, box.z0, segment), toSegment(xs, box.z1, segment),
        toSegment(box.x0, zs, segment), toSegment(box.x1, zs, segment)
      );
    }

    if (nearest < WALK_RADIUS) {
      obstructed.push({
        what: row.product_name, room: row.room_code,
        door: door.label, gap: nearest,
      });
    }
  }
}

if (obstructed.length) {
  console.log("\nIN A DOORWAY:");
  for (const b of obstructed) {
    console.log(
      `  ${b.what} (${b.room}) stands in ${b.door} -- ` +
      `${(b.gap * 1000).toFixed(0)}mm of ${WALK_RADIUS * 1000}mm needed`
    );
  }
}

assert.equal(
  obstructed.length,
  0,
  `${obstructed.length} placement(s) stand in a doorway: ` +
  obstructed.map((b) => `${b.what} blocks ${b.door}`).join("; ") +
  ". A door the furniture will not let you through is a room you cannot leave."
);

console.log(`every doorway is clear (${doors.length} checked)`);
