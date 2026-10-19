/**
 * Turning the scene manifest into what the front page's showcase shows.
 *
 * SEPARATE FROM THE COMPONENT so it can be run against the real catalogue
 * without a browser. Everything interesting about this section is a decision
 * about data -- which products can stand on a turntable, which shops appear,
 * what goes on the stand first -- and none of those decisions need React to
 * be checked. See showcase.test.mjs.
 */

/**
 * What the house holds, arranged for the showcase.
 *
 * The manifest is a scene: a flat list of placements, each naming a product
 * and a shop. Two different things are wanted from it.
 *
 *   THE PRODUCTS THAT CAN BE STOOD ON A STAND. They need a model, and a
 *   product placed twice is one thing to look at, not two.
 *
 *   A SUMMARY PER SHOP, INCLUDING THE ONES THAT CANNOT. Paint and floor tiles
 *   dress a surface rather than standing on it, so they have no model -- but
 *   they are as much an advert as a sofa, and a shop that sells nothing else
 *   must not vanish from a rail whose whole job is to say who is in the house.
 *
 * @param {{shops: Array, houses: object}} manifest  from fetchSceneCatalog
 * @param {string} scene
 */
export function arrange(manifest, scene = "3bed") {
  const placements = manifest.houses?.[scene] ?? [];
  const byId = new Map();

  (manifest.shops ?? []).forEach((shop) => {
    (shop.products ?? []).forEach((product) => byId.set(product.id, { product, shop }));
  });

  const shown = [];
  const shops = new Map();

  placements.forEach((placement) => {
    const found = byId.get(placement.product);

    if (!found) return;
    const { product, shop } = found;

    if (!shops.has(shop.id)) {
      shops.set(shop.id, {
        id: shop.id,
        name: shop.name,
        logoUrl: shop.logoUrl ?? null,
        objects: 0,
        finishes: 0,
        rooms: new Set(),
        products: [],
      });
    }

    const entry = shops.get(shop.id);

    if (placement.roomName) entry.rooms.add(placement.roomName);

    if (placement.isFinish) {
      entry.finishes += 1;

      return;
    }

    entry.objects += 1;

    if (!product.model || shown.some((s) => s.id === product.id)) return;

    const price = product.effectivePrice ?? product.price;
    const card = {
      id: product.id,
      shopId: shop.id,
      shopName: shop.name,
      name: product.name,
      category: product.category,
      description: product.description ?? null,
      model: product.model,
      anchor: product.anchor ?? null,
      price,
      // Only when there is a live offer AND it actually reduced something. A
      // struck-through price that equals the price is an insult.
      wasPrice:
        product.promotion?.isLive && product.price != null && price < product.price
          ? product.price
          : null,
      currency: product.currency,
      promotion: product.promotion?.isLive ? product.promotion : null,
      dimensions: product.dimensions ?? null,
      room: placement.roomName ?? null,
    };

    shown.push(card);
    entry.products.push(card);
  });

  return {
    shown,
    // Busiest shop first: an honest ranking -- how much of the house a shop
    // has actually taken -- rather than a favour to whoever we like.
    shops: [...shops.values()]
      .map((s) => ({ ...s, rooms: [...s.rooms] }))
      .sort((a, b) => b.objects + b.finishes - (a.objects + a.finishes)),
  };
}

/**
 * What goes on the stand first.
 *
 * A BED IF THERE IS ONE. It is the largest thing in the catalogue and the
 * quickest to read as furniture -- a rug or a door hinge turning on a stand
 * does not say "house" to somebody who arrived five seconds ago.
 */
export function opener(cards) {
  return cards.find((c) => c.category === "bed") ?? cards[0] ?? null;
}

/** A price the way this country writes it. Locale pinned; see ProductPanel. */
export function money(amount, currency = "BWP") {
  if (amount == null) return null;
  const symbol = currency === "BWP" ? "P" : currency;

  return `${symbol} ${Number(amount).toLocaleString("en-GB", {
    maximumFractionDigits: 2,
  })}`;
}

/* ===========================================================================
   Where to stand inside a room
   =========================================================================== */

/** Where a person's eyes are, in metres. */
export const EYE = 1.55;

/** Close, because in a bedroom the wall behind you is a metre away. */
export const NEAR_CLIP = 0.12;

/**
 * The camera position and aim for one featured advert.
 *
 * BACK AWAY FROM THE PRODUCT TOWARDS THE MIDDLE OF THE ROOM, because that is
 * the only direction guaranteed to have floor in it. Furniture stands against
 * walls, so backing off in any other direction puts the camera in the garden.
 * Then clamp inside the room's own rectangle, because a bedroom is three
 * metres across and the ideal framing distance is often four.
 *
 * A FINISH HAS NOWHERE TO STAND. Paint and floor tile dress a surface rather
 * than occupy a spot, so there is nothing to look AT -- only a room to look
 * INTO. The showroom already draws this distinction when a finish is clicked
 * in the room list, and the front page must not invent a second rule.
 *
 * Plain arithmetic on plain arrays, with no three.js in it, so the answer can
 * be checked against the real rooms without a browser. See showcase.test.mjs.
 *
 * @param {{position?: number[]}} placement  three.js-space position, or none
 * @param {{rect: number[]}} room            [x0, z0, x1, z1] from collision.json
 * @param {number} turn                      radians to swing round the target
 * @returns {{eye: number[], target: number[]}|null}
 */
export function viewpoint(placement, room, turn = 0) {
  if (!room?.rect) return null;

  const [x0, z0, x1, z1] = room.rect;
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;

  const stands = Array.isArray(placement?.position);
  const tx = stands ? placement.position[0] : midX;
  const tz = stands ? placement.position[2] : midZ;

  // How far back the room allows, before the ideal distance is asked for.
  const span = Math.min(x1 - x0, z1 - z0);
  const distance = Math.max(1.6, Math.min(span * 0.85, 4.2));

  let bx = midX - tx;
  let bz = midZ - tz;

  // A product standing dead centre -- or a finish, whose target IS the centre
  // -- gives no direction at all. Face down the long axis instead.
  if (bx * bx + bz * bz < 0.04) {
    bx = x1 - x0 >= z1 - z0 ? 1 : 0;
    bz = x1 - x0 >= z1 - z0 ? 0 : 1;
  }

  const length = Math.hypot(bx, bz);

  bx /= length;
  bz /= length;

  // Swing per advert, so two things in the same room are not photographed
  // from the same corner.
  if (turn) {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const rx = bx * cos - bz * sin;

    bz = bx * sin + bz * cos;
    bx = rx;
  }

  const margin = 0.45;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  return {
    eye: [
      clamp(tx + bx * distance, x0 + margin, x1 - margin),
      EYE,
      clamp(tz + bz * distance, z0 + margin, z1 - margin),
    ],
    // Look above the floor rather than at the product's origin, which for a
    // bed or a sofa is its base.
    target: [tx, stands ? 0.62 : 1.15, tz],
  };
}

/**
 * The front page's adverts, ready to point a camera at.
 *
 * Takes the manifest built from `v_landing_showcase` -- whose placements are
 * already in the order an admin ranked them -- and the room rectangles the
 * walk uses, and produces one card per advert.
 */
export function featuredCards(manifest, rooms, scene = "3bed") {
  const placements = manifest.houses?.[scene] ?? [];
  const byId = new Map();

  (manifest.shops ?? []).forEach((shop) => {
    (shop.products ?? []).forEach((product) => byId.set(product.id, { product, shop }));
  });

  const seenPerRoom = new Map();

  return placements
    .map((placement) => {
      const found = byId.get(placement.product);
      const room = rooms.find((r) => r.room === placement.room);

      if (!found || !room) return null;

      // Second advert in the same room gets a different corner.
      const nth = seenPerRoom.get(placement.room) ?? 0;

      seenPerRoom.set(placement.room, nth + 1);

      const { product, shop } = found;
      const price = product.effectivePrice ?? product.price;

      return {
        id: product.id,
        // WHICH INSTANCE, not which product. The same armchair can stand
        // twice in one room; the camera has to be aimed at the one that was
        // featured, and every mesh in the scene carries its placement id.
        placementId: placement.placementId ?? null,
        name: product.name,
        shopName: shop.name,
        room: placement.roomName ?? room.label ?? null,
        priceLabel: money(price, product.currency),
        isFinish: placement.isFinish,
        // The walls to stay inside, carried so the view can be re-aimed at
        // the object's real bounding box and still be clamped to the room.
        rect: room.rect,
        view: viewpoint(placement, room, nth * 0.9),
      };
    })
    .filter((card) => card && card.view);
}
