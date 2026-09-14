/**
 * AI placement is only as good as what it is measured against.
 *
 *     node lib/admin/placementGeometry.test.mjs
 *
 * The assistant decides where things go; placementGeometry decides whether
 * that is physically right. So this checks the measuring against the real
 * house and the real live placements, on the cases that have actually gone
 * wrong here: a television that must sit on its console rather than float
 * above it or sink into it, and a kitchen unit standing in a sliding door.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildHouse,
  checkPlacement,
  describeRoom,
  facing,
  footprint,
} from "./placementGeometry.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

// -- conventions, which are easy to get backwards ----------------------------
assert.equal(facing(0), "north");
assert.equal(facing(-90), "east", "-90 faces east, not west");
assert.equal(facing(90), "west");
assert.equal(facing(180), "south");

const turned = footprint({ x_mm: 0, y_mm: 0, rotation_deg: 90, width_mm: 2000, depth_mm: 500 });
assert.equal(Math.round(turned.x1), 250, "a quarter turn puts the depth east-west");
assert.equal(Math.round(turned.y1), 1000, "and the width north-south");
console.log("conventions: ok");

// -- the real house ------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const rows = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/v_live_placements` +
    "?select=placement_id,product_name,category_code,room_code,x_mm,y_mm,z_mm," +
    "rotation_deg,scale,width_mm,depth_mm,height_mm,model_url&scene_slug=eq.3bed",
  {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  },
).then((response) => response.json());
assert.ok(Array.isArray(rows) && rows.length, `no placements: ${JSON.stringify(rows)}`);

const house = buildHouse({
  collision: readJson("public/models/house/collision.json"),
  doors: readJson("public/models/house/doors.json"),
  tour: readJson("public/models/tour/tour.json"),
  placements: rows,
});

const productOf = (row) => ({
  name: row.product_name,
  width_mm: row.width_mm,
  depth_mm: row.depth_mm,
  height_mm: row.height_mm,
  room_types: [],
});
const transformOf = (row, changes = {}) => ({
  x_mm: row.x_mm,
  y_mm: row.y_mm,
  z_mm: row.z_mm,
  rotation_deg: row.rotation_deg,
  scale: row.scale ?? 1,
  ...changes,
});

// -- something standing on something else ---------------------------------------
const tv = rows.find((r) => r.room_code === "living" && /Sansui/i.test(r.product_name));
const stand = rows.find((r) => /Modern Black TV Console/i.test(r.product_name));
assert.ok(tv && stand, "the living room television and its console must be placed");

const seated = checkPlacement(house, {
  product: productOf(tv),
  transform: transformOf(tv),
  excludePlacementId: tv.placement_id,
});
assert.equal(seated.sits_on, stand.product_name, "the television stands on its console");
assert.ok(
  !seated.issues.some((i) => i.kind === "floating" || i.kind === "sunk"),
  `the television is seated: ${JSON.stringify(seated.issues)}`,
);
console.log(`seated: ${tv.product_name} sits on ${seated.sits_on} at ${seated.surface_z_mm}mm`);

const lifted = checkPlacement(house, {
  product: productOf(tv),
  transform: transformOf(tv, { z_mm: Number(tv.z_mm) + 120 }),
  excludePlacementId: tv.placement_id,
});
const floating = lifted.issues.find((i) => i.kind === "floating");
assert.ok(floating, "120mm up is floating");
assert.ok(Math.abs(floating.mm - 120) <= 2, `floating by ~120mm, got ${floating.mm}`);
assert.match(floating.message, new RegExp(`z_mm to ${seated.surface_z_mm}`), "and it says the height that fixes it");
console.log(`floating: ${floating.message}`);

const dropped = checkPlacement(house, {
  product: productOf(tv),
  transform: transformOf(tv, { z_mm: 0 }),
  excludePlacementId: tv.placement_id,
});
assert.ok(
  dropped.issues.some((i) => i.kind === "furniture" && i.message.includes(stand.product_name)),
  `on the floor it collides with the console: ${JSON.stringify(dropped.issues)}`,
);
console.log("inside: on the floor it collides with the console");

// -- a doorway -------------------------------------------------------------------------
const kitchen = rows.find((r) => /Grandiose/i.test(r.product_name));
assert.ok(kitchen, "the Grandiose run is placed");
const blocking = checkPlacement(house, {
  product: productOf(kitchen),
  transform: transformOf(kitchen),
  excludePlacementId: kitchen.placement_id,
});
const door = blocking.issues.find((i) => i.kind === "doorway");
assert.ok(door && door.message.includes("dining.slider"), `the run stands in the slider: ${JSON.stringify(blocking.issues)}`);
console.log(`doorway: ${door.message}`);

// -- describing a room -------------------------------------------------------------------
const living = describeRoom(house, "living");
assert.equal(living.code, "living");
assert.ok(living.items.some((item) => /Console/i.test(item.name)), "the living room lists its console");
const westRun = Math.max(0, ...living.sides.west.solid_wall.map((run) => run.length));
assert.ok(westRun >= 2000, `the living room's west wall is its long solid run (${westRun}mm)`);
assert.ok(describeRoom(house, "nowhere").error, "an unknown room says so");
console.log(`room: living has ${living.items.length} items, a ${westRun}mm west wall, ${living.doors.length} door(s)`);

console.log("placement geometry: ok");
