/**
 * The guided route, loaded from the manifest the Blender build solves.
 *
 * The route is computed over the plan's own walls and door openings by
 * `blender/houseluxe/export/tour_json.py`, so it cannot pass through a wall.
 * Nothing here re-solves anything; it fetches, converts frames, and hands the
 * result to the controller.
 *
 * ONE FRAME CONVERSION, AND IT MATTERS. The manifest is in HOUSE-LOCAL metres,
 * the same frame the site GLBs are exported in. The character is added to the
 * SCENE and not to the house group -- because the controller drives the
 * camera and fires raycasts, and both work in world space -- so the house
 * group's recentring offset has to be added here. Miss it and the tour walks
 * a perfectly correct route through the lawn about seven metres from the
 * building.
 */

export const TOUR_ROUTE_URL = "/models/tour/tour.json";

/**
 * Fetch the route and convert it to world coordinates.
 *
 * @param {THREE.Object3D} house  the loaded house group, for its offset
 * @returns {Promise<{waypoints: Array, stops: string[]}|null>}
 */
export async function loadRoute(house, url = TOUR_ROUTE_URL) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();

    const offsetX = house?.position?.x ?? 0;
    const offsetZ = house?.position?.z ?? 0;

    const waypoints = (manifest.waypoints ?? []).map((point) => ({
      position: [point.position[0] + offsetX, point.position[1] + offsetZ],
      label: point.label ?? null,
      room: point.room ?? null,
      dwell: point.dwell ?? 0,
    }));

    if (!waypoints.length) return null;

    if (manifest.unreachable?.length) {
      // The solver reports rooms it could not link rather than silently
      // dropping them, so this is worth surfacing: it means part of the
      // house cannot be toured.
      console.warn(
        "[tour] rooms the route could not reach:",
        manifest.unreachable.join(", ")
      );
    }

    console.info(
      `[tour] route: ${manifest.stops?.length ?? 0} stops, ` +
      `${waypoints.length} waypoints, ${manifest.clearance_mm}mm clear of walls`
    );

    return { waypoints, stops: manifest.stops ?? [] };
  } catch (error) {
    console.warn("[tour] no route manifest:", error.message);
    return null;
  }
}
