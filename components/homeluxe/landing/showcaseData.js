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
