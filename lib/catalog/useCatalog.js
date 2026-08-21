/**
 * One catalogue, shared by the 3D scene and every panel around it.
 *
 * Before this, the side panels showed a hardcoded list of invented shops --
 * "Luxury Patio Set" from "Garden Life" -- while the room behind them showed
 * the real Bradlows suite. Two applications in one window, disagreeing.
 *
 * This hook is the single source both halves read, so selecting a room, a
 * product or a shop means the same thing everywhere.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchSceneCatalog } from "./repository";

/**
 * An icon for a KIND of room, not for a room.
 *
 * This is the only lookup table left here, and it is presentation rather than
 * data: the database has no icon column and should not grow one for the sake
 * of an emoji. Keyed by `room_type`, so a fifth bedroom needs no entry -- the
 * table that WAS here was keyed by room code and had thirteen names in it,
 * which meant the plan's new bedroom and garage appeared in the strip as the
 * raw codes `bed4` and `garage`. Names and order come from the database now;
 * see migration 0018.
 */
const ROOM_TYPE_ICONS = {
  living: "🛋️",
  dining: "🍽️",
  kitchen: "🍳",
  bedroom: "🛏️",
  bathroom: "🛁",
  ensuite: "🚿",
  laundry: "🧺",
  hallway: "🚪",
  storage: "👔",
  garage: "🚗",
  outdoor: "🌳",
};

/** A shop's mark: its own logo, or the initial every shop has. */
function shopMark(shop) {
  return shop.logoUrl
    ? { logoUrl: shop.logoUrl, initial: null }
    : { logoUrl: null, initial: (shop.name ?? "?").trim().slice(0, 1).toUpperCase() };
}

export function useCatalog({ scene = "3bed", shopFilter = null, live = false } = {}) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Bumped to re-read. An admin who moves a sofa and saves must see the room
  // lists and the counts agree with the scene immediately -- otherwise the
  // panels keep describing the layout as it was before the save.
  const [reloads, setReloads] = useState(0);

  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchSceneCatalog({ scene, live })
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scene, live, reloads]);

  const derived = useMemo(() => {
    if (!catalog) {
      return { shops: [], productsByRoom: {}, rooms: [], products: new Map() };
    }

    // Products, flattened and tagged with their shop's display name.
    const products = new Map();
    const shops = (catalog.shops ?? []).map((shop) => {
      (shop.products ?? []).forEach((p) =>
        products.set(p.id, { ...p, shopName: shop.name, shopSlug: shop.id })
      );
      return {
        id: shop.id,
        name: shop.name,
        tagline: shop.tagline,
        ...shopMark(shop),
        productCount: (shop.products ?? []).length,
      };
    });

    // Placements grouped by the room they stand in. Only ACTIVE products get
    // this far -- an ended promotion drops out of the scene and the list at
    // the same moment, because both read this.
    const placements = catalog.houses?.[scene] ?? [];
    const productsByRoom = {};
    placements.forEach((placement) => {
      const product = products.get(placement.product);
      if (!product || product.isActive === false) return;
      // Filtering happens HERE, not in each panel, so the room list, the
      // counts and the selection all narrow together and cannot disagree.
      if (shopFilter && product.shopSlug !== shopFilter) return;
      (productsByRoom[placement.room] ??= []).push({
        ...product,
        room: placement.room,
        roomName: placement.roomName ?? null,
        roomSort: placement.roomSort ?? null,
        roomType: placement.roomType ?? null,
        isFinish: Boolean(placement.isFinish),
        position: placement.position ?? null,
        placementId: placement.placementId ?? null,
      });
    });

    // Only offer rooms that have something in them, so "Outdoor" cannot be
    // selected and then say "coming soon" over a picture of the living room.
    Object.values(productsByRoom).forEach((list) =>
      list.sort((a, b) => Number(a.isFinish) - Number(b.isFinish))
    );

    // NAMED AND ORDERED BY THE DATABASE. `rooms.name` and `rooms.sort_order`
    // ride along on every placement (migration 0018), so a room the plan adds
    // tomorrow appears with its proper name and in the right place without
    // anybody editing this file. The order is roughly the order you would
    // walk them; alphabetical put the bathroom first.
    const rooms = Object.keys(productsByRoom)
      .map((code) => {
        const first = productsByRoom[code][0] ?? {};
        return {
          code,
          label: first.roomName ?? (code === "unassigned" ? "House-wide" : code),
          icon: ROOM_TYPE_ICONS[first.roomType] ?? "📦",
          sort: first.roomSort ?? 9999,
          count: productsByRoom[code].length,
        };
      })
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));

    return { shops, productsByRoom, rooms, products };
  }, [catalog, scene, shopFilter]);

  return {
    ...derived,
    source: catalog?.source ?? null,
    loading,
    error,
    refresh,
  };
}

