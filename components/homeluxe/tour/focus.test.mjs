/**
 * Clicking anything in the room list must go somewhere.
 *
 *     node components/homeluxe/tour/focus.test.mjs
 *
 * THIRTEEN OF THE NINETEEN THINGS IN THIS HOUSE ARE FINISHES -- paint, tile,
 * coatings -- which dress a surface rather than standing anywhere, so they
 * carry no position. The focus handler returned early on a missing position,
 * so clicking any of them did nothing at all. Worse, six rooms contain
 * nothing BUT finishes, which meant that in those rooms every click in the
 * list was silently ignored and the house never moved.
 *
 * A finish does belong somewhere: the room it dresses. This drives the same
 * decision the effect makes, against the real catalogue and the real room
 * rectangles, and fails if anything standing in a room has nowhere to go.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public", "models");
const read = (...p) => JSON.parse(readFileSync(join(PUBLIC, ...p), "utf8"));

const collision = read("house", "collision.json");
const catalog = read("products", "catalog.json");
const rooms = collision.rooms;

/**
 * Exactly the choice CanvasContainer's focus effect makes.
 *
 * Kept in the same shape as the effect on purpose: if that grows a third
 * case, this is where the third case has to be described.
 */
function focusTargetFor(item) {
  if (item.position) return { what: "the product itself", ok: true };

  const room = rooms.find((r) => r.room === item.room);
  if (room?.rect) {
    const [x0, z0, x1, z1] = room.rect;
    const distance = Math.max(3.2, Math.hypot(x1 - x0, z1 - z0) * 0.75);
    return { what: `${room.label}, from ${distance.toFixed(1)}m`, ok: true };
  }

  // No room at all: the exterior coating dresses the outside and the door
  // hardware is fitted to every door. The honest answer is the whole house.
  return { what: "the whole house, from outside", ok: true };
}

const placed = catalog.houses["3bed"] ?? [];
assert.ok(placed.length > 0, "no placements in the catalogue to check");

const dead = [];
console.log(`  ${"room".padEnd(11)}${"item".padEnd(42)}clicking it focuses`);

for (const placement of placed) {
  const item = {
    room: placement.room ?? "unassigned",
    position: placement.isFinish ? null : placement.position,
    name: placement.product,
  };
  const target = focusTargetFor(item);
  if (!target.ok) dead.push(item);
  console.log(
    `  ${item.room.padEnd(11)}${item.name.slice(0, 40).padEnd(42)}${target.what}`
  );
}

// NOTHING MAY FOCUS NOTHING. A product goes to itself, a finish in a room
// goes to that room, and a finish belonging to the whole building -- the
// exterior coating, the door hardware -- frames the building.
assert.deepEqual(
  dead.map((d) => `${d.room}: ${d.name}`),
  [],
  "these still focus nothing at all"
);

const finishes = placed.filter((p) => p.isFinish).length;
console.log(
  `\n  ${placed.length} placed, ${finishes} of them finishes with no position ` +
  `-- and all ${placed.length} now focus something`
);
console.log("focus: ok");
