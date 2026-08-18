/**
 * What the visitor cannot walk through.
 *
 * WHY THIS EXISTS AT ALL. The walk used to decide where the walls were by
 * firing a short ray along the direction of travel and stopping if it hit
 * something. Three things go wrong with that in a house, and all three were
 * happening:
 *
 *  1. A ray is a line; a walker is not. Take a doorway at an angle and the
 *     ray goes through the gap while the shoulder goes through the jamb.
 *
 *  2. A ray finds a surface, not a volume. Any frame longer than the ray is
 *     deep -- a tab regaining focus, a slow phone -- steps clean over it, and
 *     the character is simply on the other side of the wall with nothing to
 *     pull it back. Nothing in a surface test can recover from being inside.
 *
 *  3. A ray answers yes or no. "Yes" while sliding along a wall is a dead
 *     stop, which is why every attempt to tune its reach moved the place the
 *     tour jammed instead of removing it -- and why the guided tour ended up
 *     not testing the walls at all.
 *
 * So the walls are not read from the picture. They come from `collision.json`,
 * written by `blender/houseluxe/export/collision_json.py` out of the same
 * `solid_spans` decomposition the wall geometry itself is built from: a list
 * of solid rectangles on the floor plan, doorways already absent because at
 * walking height a doorway is a real gap.
 *
 * The test is then a CIRCLE AGAINST RECTANGLES, and it is a different kind of
 * thing from a ray:
 *
 *  - It is a volume, so the shoulder is included and a corner cannot be
 *    clipped.
 *  - It is a position test, not a movement test, so it works however far the
 *    character moved in one frame and can push it back out if it ever ends up
 *    somewhere it should not be.
 *  - It resolves by DISPLACEMENT rather than refusal: pushed out along the
 *    nearest face, a walker pressed into a wall slides along it instead of
 *    stopping. Nothing can stick.
 *
 * WHY IT IS FLAT. Rooms are one storey and every wall is vertical, so the
 * third dimension carries no information the export has not already used --
 * it kept only the spans that overlap the height a person occupies, which is
 * why a window sill collides and the lintel over a door does not.
 */

import * as THREE from "three";

export const COLLISION_URL = "/models/house/collision.json";

/**
 * How wide the visitor is, in metres -- the radius of the circle.
 *
 * MUST STAY UNDER HALF THE NARROWEST DOOR. The internal doors in this plan
 * are 770mm, so anything at or over 385mm cannot fit through one at all and
 * the tour would wedge in the first doorway. 260mm is a 520mm shoulder --
 * a realistic adult -- and leaves 125mm either side in the tightest door.
 *
 * It also has to stay under the route's solved clearance, or the character is
 * pushed off waypoints it is being steered towards. The route currently
 * solves at 380mm.
 */
export const WALK_RADIUS = 0.26;

/**
 * Furniture below this is walked OVER, not around.
 *
 * A rug is 10mm thick and a doormat less. Blocking them would fence the
 * living room off behind its own rug -- which is 2.4m across and sits exactly
 * where the tour has to stand to show the suite off.
 */
const STEP_OVER_HEIGHT = 0.15;

/**
 * Load the wall rectangles and room extents, in WORLD coordinates.
 *
 * The manifest is in house-local metres, the same frame as `tour.json` and
 * `catalog.json`. The character lives in the scene rather than in the house
 * group -- the controller drives the camera and both work in world space --
 * so the house group's recentring offset is added here, exactly as
 * `route.js` does it. Miss it and the walls are seven metres from the house.
 *
 * @param {THREE.Object3D} house  the loaded house group, for its offset
 */
export async function loadCollision(house, url = COLLISION_URL) {
  try {
    // Revalidated on every load, for the reason given in route.js: this and
    // the route are one decision in two files and must never be a version
    // apart.
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();

    const dx = house?.position?.x ?? 0;
    const dz = house?.position?.z ?? 0;
    const shift = ([x0, z0, x1, z1]) => [x0 + dx, z0 + dz, x1 + dx, z1 + dz];

    const walls = (manifest.walls ?? []).map((entry) => shift(entry.rect));

    const rooms = (manifest.rooms ?? []).map((entry) => {
      const [x0, z0, x1, z1] = shift(entry.rect);
      return {
        room: entry.room,
        label: entry.label,
        type: entry.type,
        x0, z0, x1, z1,
        centre: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2),
      };
    });

    console.info(
      `[collision] ${walls.length} solid wall piece(s), ${rooms.length} room(s)`
    );

    return { walls, rooms, ceiling: manifest.ceiling_m ?? 2.4 };
  } catch (error) {
    // Without this the walk falls back to the ray test, which is worse but
    // not nothing -- and a missing manifest must not blank the canvas.
    console.warn("[collision] no manifest:", error.message);
    return null;
  }
}

/**
 * The footprints of a group's direct children, as rectangles.
 *
 * Used for the furniture, which is the one part of the scene the exported
 * manifest cannot describe: an admin can drag a sofa anywhere at run time,
 * long after the route was solved.
 *
 * DIRECT CHILDREN, NOT MESHES. Each child of the products group is one
 * placement, and its bounding box is the footprint of the whole piece. Going
 * deeper would give a box per cushion, which is a hundred times the work for
 * the same rectangle.
 */
export function footprintsOf(group) {
  if (!group) return [];

  const box = new THREE.Box3();
  const rects = [];

  group.updateMatrixWorld(true);
  group.children.forEach((child) => {
    if (child.visible === false) return;
    box.setFromObject(child);
    if (box.isEmpty()) return;
    // A rug is not an obstacle; a coffee table is.
    if (box.max.y - Math.max(box.min.y, 0) < STEP_OVER_HEIGHT) return;
    rects.push([box.min.x, box.min.z, box.max.x, box.max.z]);
  });

  return rects;
}

/**
 * Move a stop that something is now standing on.
 *
 * THE ROUTE IS SOLVED AT BUILD TIME; THE FURNITURE IS NOT. `tour.json` is
 * computed in Blender against the catalogue as it stood when the house was
 * last exported, and every room's stop is that room's centre nudged to
 * somewhere a person could stand GIVEN THAT FURNITURE. But products rotate:
 * a batch goes live, a promotion ends, a shop's queen bed appears in the
 * master bedroom this morning and is gone on Friday. None of that rebuilds
 * the route.
 *
 * So a stop can end up inside a bed that did not exist when it was solved.
 * The walker is then pushed out of the bed -- correctly -- and if it is
 * pushed further than `arriveRadius` it can never register as having arrived.
 * The tour stands next to the bed forever. That is the one way rotating
 * stock can break the walk, and it is silent.
 *
 * The fix is small because the WALLS have not moved: the route's legs are
 * still valid, and only the endpoint needs to shift a little. So each stop is
 * tested against the live world and, if occupied, walked outward in rings
 * until a free spot inside the same room is found.
 *
 * EVERY WAYPOINT IS SETTLED, not only the stops. The first version of this
 * did only the stops, on the reasoning that an intermediate corner the walker
 * is pushed off is just a corner cut slightly wide. That is true of a SMALL
 * push and false of a large one, and the distinction is exactly the arrival
 * radius: a leg point 360mm inside a wardrobe can no more be arrived at than
 * a stop can, and the walk waits at it just the same. The wardrobe test in
 * rotation.test.mjs is that failure, kept.
 *
 * The two are settled differently, though. A stop names a room and has to
 * stay in it -- announcing "Master Bedroom" from the corridor is worse than
 * standing slightly off centre. A leg names nothing and only has to be
 * somewhere walkable, so it is allowed to move wherever is nearest.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is re-solve the path. Re-implementing
 * the grid solver in the browser would be a second pathfinder that has to
 * agree with the first -- the mistake this codebase already made once with
 * the collision model. Nudging the points the existing path is made of is a
 * much smaller claim, and `TourController`'s stall guard covers what it
 * cannot reach.
 *
 * @param {Array} waypoints    the route, world metres
 * @param {object} volume      the live walk volume
 * @param {Array} rooms        room extents from the collision manifest
 * @param {number} arriveRadius  how close counts as arriving
 * @returns {{waypoints: Array, moved: Array, stranded: Array}}
 */
export function settleRoute(waypoints, volume, rooms = [], arriveRadius = 0.22) {
  if (!waypoints?.length || !volume) {
    return { waypoints: waypoints ?? [], moved: [], stranded: [] };
  }

  const byRoom = new Map(rooms.map((room) => [room.room, room]));
  const moved = [];
  const stranded = [];

  /** How far the volume displaces a walker standing here. */
  const displacement = (x, z) => {
    const solved = volume.resolve(x, z);
    return Math.hypot(solved.x - x, solved.z - z);
  };

  const settled = waypoints.map((point) => {
    const [x, z] = point.position;
    if (displacement(x, z) <= arriveRadius) return point;

    // A stop must stay in the room it names. A leg names nothing, so it may
    // go wherever is nearest and walkable -- and it should not go far, or the
    // straight line into it starts cutting through something else.
    const room = point.label ? byRoom.get(point.room) : null;
    const rings = point.label ? 14 : 8;

    // Outward in rings. Coarse enough to be quick -- this runs once, when the
    // tour starts -- and fine enough to find the gap beside a bed.
    for (let ring = 1; ring <= rings; ring += 1) {
      const radius = ring * 0.18;
      const steps = Math.max(8, ring * 6);
      let best = null;
      let bestDrop = Infinity;

      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const cx = x + Math.cos(angle) * radius;
        const cz = z + Math.sin(angle) * radius;

        // Stay in the room the stop belongs to. Wandering into the hallway to
        // find space would mean announcing "Master Bedroom" from the corridor.
        if (room && (cx < room.x0 || cx > room.x1 || cz < room.z0 || cz > room.z1)) {
          continue;
        }

        const drop = displacement(cx, cz);
        if (drop < bestDrop) {
          bestDrop = drop;
          best = [cx, cz];
        }
        if (drop <= 0.001) break;
      }

      if (best && bestDrop <= arriveRadius * 0.5) {
        moved.push({
          label: point.label,
          room: point.room,
          by: radius,
        });
        return { ...point, position: best };
      }
    }

    // Nothing walkable within reach.
    //
    // Only a STOP is worth reporting. A stop that cannot be re-seated means a
    // room has been filled wall to wall and the tour will not be able to show
    // it -- which somebody needs to know about. An unsettleable leg point is
    // not news: it is one corner of a path, the stall guard walks past it,
    // and reporting it would bury the one message that matters under a dozen
    // that do not.
    if (point.label) stranded.push({ label: point.label, room: point.room });
    return point;
  });

  return { waypoints: settled, moved, stranded };
}

/**
 * A solid world the walker is pushed out of.
 *
 * `fixed` are the walls, which never move. `dynamic` are the furniture
 * footprints, replaced whenever something is placed or dragged.
 */
export function createWalkVolume({ fixed = [], radius = WALK_RADIUS } = {}) {
  let dynamic = [];

  /**
   * Push a circle out of one rectangle, if it is in it.
   *
   * Returns true if it moved `out`. Two cases, and the second is the one that
   * makes this recoverable: OUTSIDE the rectangle the nearest point on it is
   * on its edge, so the push is straight out of the nearest face; INSIDE it
   * there is no such direction, so the shortest way out is chosen -- which is
   * how a character that has somehow ended up in a wall gets back out of it
   * rather than being trapped there.
   */
  function push(rect, x, z, out) {
    const [x0, z0, x1, z1] = rect;
    // Cheap reject: the rectangle grown by the radius is the only place a
    // circle of that radius can touch it.
    if (x < x0 - radius || x > x1 + radius || z < z0 - radius || z > z1 + radius) {
      return false;
    }

    const inside = x > x0 && x < x1 && z > z0 && z < z1;

    if (inside) {
      const left = x - x0;
      const right = x1 - x;
      const up = z - z0;
      const down = z1 - z;
      const least = Math.min(left, right, up, down);
      if (least === left) out.set(x0 - radius, 0, z);
      else if (least === right) out.set(x1 + radius, 0, z);
      else if (least === up) out.set(x, 0, z0 - radius);
      else out.set(x, 0, z1 + radius);
      return true;
    }

    const nx = Math.min(Math.max(x, x0), x1);
    const nz = Math.min(Math.max(z, z0), z1);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return false;

    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      // Dead on the face. Any direction is as good as another and none is
      // right, so leave it to a later pass rather than picking at random.
      return false;
    }
    out.set(nx + (dx / d) * radius, 0, nz + (dz / d) * radius);
    return true;
  }

  const scratch = new THREE.Vector3();

  return {
    get radius() {
      return radius;
    },

    /** Replace the furniture footprints. Cheap enough to call on every save. */
    setDynamic(rects) {
      dynamic = rects ?? [];
    },

    get count() {
      return fixed.length + dynamic.length;
    },

    /**
     * The nearest position to (x, z) that is not inside anything solid.
     *
     * SEVERAL PASSES, because one is not enough in a corner: pushed out of
     * the wall in front you can end up inside the wall beside it, and the
     * second pass is what slides you along both. Four passes settles every
     * corner in this plan; the loop stops early when a pass changes nothing,
     * which is the usual case.
     *
     * @returns {{x:number, z:number, hit:boolean}}
     */
    resolve(x, z) {
      let px = x;
      let pz = z;
      let hit = false;

      for (let pass = 0; pass < 4; pass += 1) {
        let moved = false;

        for (let i = 0; i < fixed.length; i += 1) {
          if (push(fixed[i], px, pz, scratch)) {
            px = scratch.x;
            pz = scratch.z;
            moved = true;
          }
        }
        for (let i = 0; i < dynamic.length; i += 1) {
          if (push(dynamic[i], px, pz, scratch)) {
            px = scratch.x;
            pz = scratch.z;
            moved = true;
          }
        }

        if (!moved) break;
        hit = true;
      }

      return { x: px, z: pz, hit };
    },
  };
}
