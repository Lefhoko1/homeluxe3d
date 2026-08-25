/**
 * The front page's showcase, against the real catalogue.
 *
 *     node components/homeluxe/landing/showcase.test.mjs
 *
 * THE SECTION IS A CLAIM ABOUT LIVE DATA. It says "this is the actual model
 * standing in the house" beside a real price and a real offer, so the ways it
 * can be wrong are all data-shaped rather than pixel-shaped:
 *
 *   - a card whose .glb is not on disk turns an empty stand towards the
 *     visitor and says nothing about why;
 *   - the same sofa placed twice in the living room appearing as two chips;
 *   - a shop dropping out of the rail because everything it sells is a finish
 *     -- which is exactly true of Tubod, who dress seven rooms;
 *   - two shops using the same product slug, which would make the `?product=`
 *     link in every notification email ambiguous.
 *
 * None of that needs a browser, so none of it is checked in one. This reads
 * the live view over REST and runs the real shaping code over the answer.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { arrange, opener, money } from "./showcaseData.js";
import { rowsToManifest } from "../../../lib/catalog/repository.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

// The same credentials the browser uses. Read from the file rather than the
// environment so the test needs no setup beyond a working checkout.
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");

      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

assert.ok(URL_BASE && KEY, "NEXT_PUBLIC_SUPABASE_* missing from .env.local");

const rows = await fetch(
  `${URL_BASE}/rest/v1/v_live_placements?select=*&scene_slug=eq.3bed`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
).then((r) => r.json());

assert.ok(Array.isArray(rows) && rows.length, `no placements came back: ${JSON.stringify(rows)}`);

const manifest = rowsToManifest(rows, "3bed");
const { shown, shops } = arrange(manifest, "3bed");

console.log(`\n${rows.length} placements · ${shops.length} shops · ${shown.length} on the stand\n`);

// ---- every card can actually be stood up -----------------------------------

for (const card of shown) {
  assert.ok(card.model, `${card.id} has no model`);

  // Local models must exist. An uploaded one lives in storage and is the
  // browser's problem, not this test's.
  if (card.model.startsWith("/")) {
    const onDisk = join(ROOT, "public", card.model.replace(/^\//, ""));

    assert.ok(existsSync(onDisk), `${card.id}: ${card.model} is not on disk`);
  }

  assert.ok(card.name, `${card.id} has no name`);
  assert.ok(card.shopName, `${card.id} has no shop`);

  console.log(
    `  ${card.shopName.padEnd(12)} ${card.name.padEnd(46)} ` +
      `${(money(card.price, card.currency) ?? "-").padStart(12)}` +
      `${card.promotion ? "  [offer]" : ""}`,
  );
}

// ---- one chip per product, however many times it is placed -----------------

const ids = shown.map((c) => c.id);

assert.equal(new Set(ids).size, ids.length, "the same product appears on the stand twice");

// ---- the ?product= link in every email has exactly one target --------------
//
// The showroom accepts the qualified id AND the bare product slug, because
// migration 0020's triggers only have the latter. That is only safe while
// slugs are unique across shops -- two shops both selling a "queen-bed" would
// make every one of those emails point at whichever the loop found first.

const tails = ids.map((id) => id.split(".").pop());

assert.equal(
  new Set(tails).size,
  tails.length,
  `two products share a slug, so ?product= is ambiguous: ${tails.join(", ")}`,
);

// ---- nobody in the house is missing from the rail --------------------------

const shopsInScene = new Set(rows.map((r) => r.shop_slug));

assert.equal(
  shops.length,
  shopsInScene.size,
  `${shopsInScene.size} shops are in the house but ${shops.length} reached the rail`,
);

// The counts are shown to visitors as fact, so they have to add up.
const counted = shops.reduce((n, s) => n + s.objects + s.finishes, 0);

assert.equal(counted, rows.length, "the rail's counts do not add up to the placements");

console.log("");
for (const shop of shops) {
  console.log(
    `  ${shop.name.padEnd(14)} ${String(shop.objects).padStart(2)} pieces  ` +
      `${String(shop.finishes).padStart(2)} finishes  ` +
      `${shop.rooms.length} rooms  ${shop.products.length} on the stand`,
  );
}

// A shop with no model is not an error -- it is Tubod, and it must still be
// listed. This asserts the case exists rather than that it does not.
const surfacesOnly = shops.filter((s) => s.products.length === 0);

for (const shop of surfacesOnly) {
  assert.ok(
    shop.finishes > 0,
    `${shop.name} has nothing on the stand and no finishes either -- why is it listed?`,
  );
}

// ---- what greets somebody who has just arrived -----------------------------

const first = opener(shown);

assert.ok(first, "nothing at all can be put on the stand");

const beds = shown.filter((c) => c.category === "bed");

if (beds.length) {
  assert.equal(first.category, "bed", "there is a bed in the house and it is not the opener");
}

console.log(`\n  opens with: ${first.name} (${first.shopName})\n`);
console.log("showcase: ok");
