/**
 * The boundary is whatever the database says it is.
 *
 *     node components/homeluxe/house/textures/fencing.test.mjs
 *
 * Blender generates a panel between every pair of fence posts and names the
 * surface `fence.boundary`. What that panel LOOKS like is a placement: Tubod's
 * diamond mesh today, a precast screen wall if somebody sells one tomorrow.
 * Nothing about that decision is in the code, which is the point, and it is
 * also why it is worth a test -- a chain of five joins and a texture lookup
 * fails silently by leaving a grey panel that looks deliberate.
 *
 * THE APERTURE IS THE THING MOST LIKELY TO BE WRONG, and it exposed a real
 * bug. The finish spec took its repeat from the PRODUCT'S WIDTH, which is
 * correct for a tile by coincidence -- a 600mm tile is 600mm wide -- and
 * nonsense for a roll of mesh, which is thirty metres wide and repeats every
 * fifty millimetres. The variant carries the module; this proves it is the
 * variant that is read.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { rowsToManifest } from "../../../../lib/catalog/repository.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const at = l.indexOf("=");

      return [l.slice(0, at).trim(), l.slice(at + 1).trim()];
    })
);

const rows = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/v_live_placements?select=*&scene_slug=eq.3bed`,
  {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  }
).then((r) => r.json());

assert.ok(Array.isArray(rows) && rows.length, "no placements came back");

const manifest = rowsToManifest(rows, "3bed");
const placements = manifest.houses["3bed"];
const byId = new Map();

manifest.shops.forEach((s) => s.products.forEach((p) => byId.set(p.id, p)));

/**
 * Exactly the spec CanvasContainer builds for `applyFinishes`.
 *
 * Kept in the same shape on purpose: if that grows a field, this is where the
 * new field has to be described.
 */
const specFor = (placement) => {
  const product = byId.get(placement.product);
  const variant = (product?.variants ?? []).find((v) => v.slug === placement.variant);

  return {
    surface: placement.surface,
    category: product?.category,
    material: variant?.material ?? product?.material ?? placement.surface,
    tileMm: product?.textureTileMm ?? product?.dimensions?.width,
    swatch: variant?.swatch ?? product?.swatch,
  };
};

// ---- the boundary is dressed ----------------------------------------------

const boundary = placements.filter((p) => p.isFinish && p.surface === "fence.boundary");

assert.equal(
  boundary.length,
  1,
  `expected exactly one finish on fence.boundary, found ${boundary.length} -- ` +
  "the five runs are one purchase and one decision"
);

const spec = specFor(boundary[0]);

console.log(`\n  surface  ${spec.surface}`);
console.log(`  category ${spec.category}`);
console.log(`  material ${spec.material}`);
console.log(`  aperture ${spec.tileMm}mm\n`);

// ---- and dressed with something the renderer knows about -------------------

assert.equal(
  spec.category,
  "fencing",
  "the boundary finish must be category `fencing` -- the renderer table is " +
  "keyed by category, so any other value leaves the panel undressed"
);

// ---- the aperture is the variant's, and it is a real mesh size -------------

assert.ok(
  spec.tileMm >= 25 && spec.tileMm <= 150,
  `aperture ${spec.tileMm}mm is outside the sizes diamond mesh is made in ` +
  "(25mm to 150mm, one inch to six). A value in the thousands means the " +
  "module is being read from the product's overall width again"
);

// ---- and every other finish still resolves ---------------------------------
//
// The change that carried the variant's module through the manifest touched
// the spec every finish is built from, so the tiles have to be checked too:
// a 600mm porcelain tile repeating at 30 metres would be one grey smear.

for (const placement of placements.filter((p) => p.isFinish)) {
  const s = specFor(placement);

  assert.ok(s.surface, `a finish with no surface: ${placement.product}`);
  assert.ok(s.material, `${placement.product} dresses nothing`);

  if (s.category === "tile") {
    assert.ok(
      s.tileMm > 0 && s.tileMm <= 1200,
      `${placement.product}: a ${s.tileMm}mm tile is not a tile`
    );
  }

  console.log(
    `  ${String(s.category).padEnd(9)} ${String(s.material).padEnd(28)} ` +
    `${s.surface}${s.tileMm ? `  @${s.tileMm}mm` : ""}`
  );
}

console.log("\nfencing: ok");
