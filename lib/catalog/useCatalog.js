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

import { useEffect, useMemo, useState } from "react";

import { fetchSceneCatalog } from "./repository";

/** Room codes the scene actually has, with labels and an icon for the list. */
const ROOM_LABELS = {
  living: { label: "Living Room", icon: "🛋️" },
  dining: { label: "Dining Room", icon: "🍽️" },
  kitchen: { label: "Kitchen", icon: "🍳" },
  master: { label: "Master Bedroom", icon: "🛏️" },
  bed2: { label: "Bedroom 2", icon: "🛏️" },
  bed3: { label: "Bedroom 3", icon: "🛏️" },
  bathroom: { label: "Bathroom", icon: "🛁" },
  ensuite: { label: "Ensuite", icon: "🚿" },
  wc: { label: "WC", icon: "🚽" },
  laundry: { label: "Laundry", icon: "🧺" },
  hall: { label: "Hallway", icon: "🚪" },
  wir: { label: "Walk-in Robe", icon: "👔" },
  outdoor: { label: "Outdoor", icon: "🌳" },
};

/** A shop icon, keyed by slug, falling back to a generic storefront. */
const SHOP_ICONS = {
  bradlows: "🛋️",
  tubod: "🧱",
};

export function useCatalog({ scene = "3bed", shopFilter = null } = {}) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSceneCatalog({ scene })
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
  }, [scene]);

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
        icon: SHOP_ICONS[shop.id] ?? "🏬",
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

    const rooms = Object.keys(productsByRoom)
      .sort()
      .map((code) => ({
        code,
        label: ROOM_LABELS[code]?.label ?? code,
        icon: ROOM_LABELS[code]?.icon ?? "📦",
        count: productsByRoom[code].length,
      }));

    return { shops, productsByRoom, rooms, products };
  }, [catalog, scene, shopFilter]);

  return {
    ...derived,
    source: catalog?.source ?? null,
    loading,
    error,
  };
}

export { ROOM_LABELS };
