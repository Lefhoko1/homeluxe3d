/**
 * Is this a device that needs the light version of the 3D?
 *
 * A budget phone -- a Huawei Y5 has 2 GB of memory and a small Mali GPU --
 * cannot draw what a laptop draws: soft shadows from a 4096px shadow map, a
 * garden of 54,000-triangle trees drawn twice for those shadows, two times
 * the pixels on a high-density screen. It does not fail; it crawls, and a
 * visitor who waits a minute for a sofa has gone.
 *
 * So the 3D asks once, at start, and takes the LIGHT path on:
 *
 *   - 2 GB of memory or less            (navigator.deviceMemory; Chrome/Android)
 *   - a data-saver setting               (connection.saveData)
 *   - a slow connection                  (connection.effectiveType 2g/3g)
 *   - four cores or fewer on a phone     (a desktop with four cores is fine)
 *
 * None of these is reported by every browser; each is used when it is, and a
 * browser that reports nothing gets the full version. `?quality=low` or
 * `?quality=high` in the address overrides it, for testing.
 */

export function deviceTier() {
  if (typeof window === "undefined") return "high";

  try {
    const forced = new URLSearchParams(window.location.search).get("quality");
    if (forced === "low" || forced === "high") return forced;
  } catch {
    // no override
  }

  const nav = window.navigator ?? {};
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
  const phone = window.matchMedia?.("(pointer: coarse)").matches && Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) < 820;

  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return "low";
  if (connection?.saveData) return "low";
  if (["slow-2g", "2g", "3g"].includes(connection?.effectiveType)) return "low";
  if (phone && typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) return "low";
  return "high";
}

/** What the light path turns down. One place, so both 3D views agree. */
export function qualityFor(tier) {
  return tier === "low"
    ? { pixelRatio: 1, antialias: false, shadows: false, maxTrees: 3, screenVideo: false }
    : { pixelRatio: 2, antialias: true, shadows: true, maxTrees: Infinity, screenVideo: true };
}
