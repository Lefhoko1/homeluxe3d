/**
 * Doors that open.
 *
 * The tour used to walk through closed doors. Not through a gap beside them --
 * through the leaf, because the walk deliberately never collided with a door
 * on the grounds that "a tour which requires you to work out which doors open
 * is a worse tour". True of the alternative it was written against, and a poor
 * substitute for the obvious thing: a door that opens as you reach it.
 *
 * NO PIVOT GROUPS. Every leaf is exported with its ORIGIN ALREADY ON ITS HINGE
 * AXIS -- `openings._hang` moves it there before export -- so swinging a door
 * is one line, `leaf.rotation.y = angle`, and the hinge plates screwed to that
 * leaf share the same origin and take the same angle. Rebuilding that pivot in
 * the browser by measuring bounding boxes would be guessing at which end the
 * hinges are on, and would guess wrong the first time a door is made wider.
 *
 * WHICH WAY A DOOR SWINGS IS DECIDED HERE, not in the plan, and it is decided
 * per visitor: a door opens AWAY from whoever is approaching it. Real doors are
 * hung to swing one way, that decision is made on site, and this plan does not
 * record it -- so inventing it per door means being wrong half the time and
 * meeting somebody with a door in the face. The direction is latched as the
 * door starts to move, so it cannot flip while you are standing in the
 * doorway.
 *
 * A CLOSED DOOR IS SOLID. It contributes a footprint to the walk volume while
 * it is nearly shut and stops doing so as it opens, so you cannot walk through
 * a closed leaf -- which is what "doors must be opened" actually asks for. The
 * trigger distance is far enough that the door is wide open long before anyone
 * reaches it; the walk test proves the tour still completes.
 */

import * as THREE from "three";

export const DOORS_MANIFEST_URL = "/models/house/doors.json";

/** How far away a visitor has to be for a door to start opening, in metres. */
const OPEN_WITHIN = 2.2;

/**
 * And how far away before it closes again.
 *
 * Wider than it opens, on purpose. With one distance a visitor standing right
 * on the threshold makes the door flutter between states as they shift about;
 * the gap between the two is what stops that.
 */
const CLOSE_BEYOND = 3.0;

/** How far a door opens. A little past square, as a door pushed open rests. */
const OPEN_ANGLE = THREE.MathUtils.degToRad(96);

/** Seconds to swing fully open, and fully shut. */
const OPEN_SECONDS = 0.85;
const CLOSE_SECONDS = 1.6;

/**
 * How nearly shut a door has to be to still block the way.
 *
 * Not zero: a door one degree ajar is still a door across the opening. Past
 * about a fifth of its travel the gap is wider than a person, so the footprint
 * is dropped and the walk sees an empty doorway.
 */
const BLOCKS_BELOW = 0.2;

/** How thick a closed leaf is for collision, in metres. */
const LEAF_THICKNESS = 0.05;

/**
 * The height the tour looks at a hinge, in metres.
 *
 * The middle of the three, which on a 2.07m leaf lands just above a metre --
 * chest height, and the one a person actually looks at. The bottom hinge is
 * by your feet and the top one is over your head.
 */
const HINGE_LOOK_HEIGHT = 1.04;

/**
 * The state of a set of doors, with no three.js objects attached.
 *
 * SEPARATED FROM THE SCENE ON PURPOSE. What a door does -- when it opens,
 * which way, and whether it is still blocking the way -- is the part that can
 * jam the guided tour, and it is the part worth proving. Bound to meshes it
 * can only be tested in a browser, which in practice means not tested; as
 * plain numbers over the manifest it is driven at sixty frames a second in a
 * few milliseconds. See doors.test.mjs.
 *
 * `loadDoors` wraps this and does the only thing it does not: turn the angles
 * into rotations on the objects.
 */
export function createDoorSet(entries = [], { offsetX = 0, offsetZ = 0 } = {}) {
  const doors = entries.map((entry) => ({
    label: entry.label,
    // WORLD metres. The character lives in the scene, not in the house group,
    // so the recentring offset goes on here exactly as it does for the route
    // and the collision model.
    hingeX: entry.hinge[0] + offsetX,
    hingeZ: entry.hinge[1] + offsetZ,
    alongX: entry.along[0],
    alongZ: entry.along[1],
    width: entry.width_m,
    openness: 0,      // 0 shut, 1 fully open
    sign: 1,          // which way it is swinging, latched while it moves
    wanted: 0,
    angle: 0,
  }));

  return {
    get count() {
      return doors.length;
    },

    /** Every door, for a caller that has objects to move. */
    get doors() {
      return doors;
    },

    /**
     * Swing whatever the visitor is near.
     *
     * @param {number} delta seconds
     * @param {{x:number, z:number}} viewer  where the visitor is, world metres
     */
    update(delta, viewer) {
      if (!viewer) return;

      doors.forEach((door) => {
        // The middle of the leaf, which is what you walk at -- measuring to
        // the hinge makes a door open late when you come at the latch side.
        const cx = door.hingeX + door.alongX * door.width * 0.5;
        const cz = door.hingeZ + door.alongZ * door.width * 0.5;
        const distance = Math.hypot(viewer.x - cx, viewer.z - cz);

        if (distance < OPEN_WITHIN) door.wanted = 1;
        else if (distance > CLOSE_BEYOND) door.wanted = 0;

        // Latch the direction as it leaves the frame, so it cannot reverse
        // while somebody is standing in the opening.
        if (door.wanted === 1 && door.openness < 0.02) {
          const toX = viewer.x - door.hingeX;
          const toZ = viewer.z - door.hingeZ;
          // Rotating the leaf by +angle sweeps its free end towards
          // (along.z, -along.x). Away from the visitor is the opposite sign
          // to whichever side of that line they are standing on.
          const side = toX * door.alongZ - toZ * door.alongX;
          door.sign = side > 0 ? -1 : 1;
        }

        const rate = door.wanted === 1 ? 1 / OPEN_SECONDS : -1 / CLOSE_SECONDS;
        const next = Math.min(1, Math.max(0, door.openness + rate * delta));
        door.openness = next;

        // Ease, so a door does not start and stop like a garage shutter.
        const eased = next * next * (3 - 2 * next);
        door.angle = door.sign * eased * OPEN_ANGLE;
      });
    },

    /**
     * Footprints of the doors that are still shut, for the walk volume.
     *
     * Rebuilt on each call rather than cached: which doors are shut changes
     * continuously, and this is a handful of rectangles.
     */
    footprints() {
      const rects = [];
      doors.forEach((door) => {
        if (door.openness >= BLOCKS_BELOW) return;
        const x0 = door.hingeX;
        const z0 = door.hingeZ;
        const x1 = x0 + door.alongX * door.width;
        const z1 = z0 + door.alongZ * door.width;
        const pad = LEAF_THICKNESS / 2;
        rects.push([
          Math.min(x0, x1) - pad, Math.min(z0, z1) - pad,
          Math.max(x0, x1) + pad, Math.max(z0, z1) + pad,
        ]);
      });
      return rects;
    },

    /**
     * Where each door's hinges are, in world metres.
     *
     * The tour needs this to show the hinge off. A hinge is 100mm of black
     * metal on the edge of a door and there is no other way to find one: it
     * has no placement of its own, because it is fitted as joinery rather
     * than stood somewhere.
     */
    points() {
      return doors.map((door) => ({
        label: door.label,
        x: door.hingeX,
        z: door.hingeZ,
        // The middle hinge, which is the one at a comfortable height to look
        // at rather than the one by the floor.
        y: HINGE_LOOK_HEIGHT,
      }));
    },

    /** Shut everything, instantly. */
    closeAll() {
      doors.forEach((door) => {
        door.wanted = 0;
        door.openness = 0;
        door.angle = 0;
      });
    },
  };
}

/**
 * Find every door in the loaded house and make it openable.
 *
 * @param {THREE.Object3D} house  the loaded house group
 * @param {string} url            the manifest
 * @returns {Promise<object|null>} a controller, or null if there is nothing
 */
export async function loadDoors(house, url = DOORS_MANIFEST_URL) {
  if (!house) return null;

  let manifest;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (error) {
    console.warn("[doors] no manifest, doors stay shut:", error.message);
    return null;
  }

  const part = house.userData?.parts?.doors;
  if (!part) {
    console.warn("[doors] the house has no doors part");
    return null;
  }

  const entries = manifest.doors ?? [];
  const set = createDoorSet(entries, {
    offsetX: house.position?.x ?? 0,
    offsetZ: house.position?.z ?? 0,
  });

  // What each door has to turn: the leaf, and the hinge plates screwed to it.
  // They were given the same origin in Blender, so they take the same angle
  // and nothing has to be reparented here.
  const missing = [];
  const moving = entries.map((entry) => {
    const leaf = part.getObjectByName(entry.leaf);
    if (!leaf) {
      missing.push(entry.leaf);
      return [];
    }
    const objects = [leaf];
    part.traverse((child) => {
      if (child === leaf) return;
      if (!child.name.startsWith(entry.hinge_prefix)) return;
      // The plate screwed to the door, and its countersunk dishes.
      if (child.name.endsWith("leaf_plate") || child.name.includes(".leaf_hole")) {
        objects.push(child);
      }
    });
    return objects;
  });

  if (missing.length) {
    // Loud: a renamed object silently leaves a door that never opens, which
    // looks exactly like the feature not working at all.
    console.error(
      `[doors] ${missing.length} leaf/leaves named in the manifest are not in ` +
      `doors.glb and will not open:`, missing.join(", ")
    );
  }

  console.info(
    `[doors] ${set.count} door(s) will open on approach, ` +
    `${moving.reduce((n, m) => n + m.length, 0)} moving part(s)`
  );

  const apply = () => {
    set.doors.forEach((door, i) => {
      moving[i].forEach((obj) => { obj.rotation.y = door.angle; });
    });
  };

  return {
    get count() {
      return set.count;
    },
    update(delta, viewer) {
      set.update(delta, viewer);
      apply();
    },
    footprints() {
      return set.footprints();
    },
    points() {
      return set.points();
    },
    closeAll() {
      set.closeAll();
      apply();
    },
  };
}
