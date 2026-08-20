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
 * WHICH WAY A DOOR SWINGS IS DECIDED IN THE PLAN, and arrives in the manifest
 * as `swing`. It used to be decided here, per visitor -- a door opened away
 * from whoever approached it, because the plan did not record which way it was
 * hung. That is a fair answer to "we do not know" and it gave every door in the
 * house the same fault: opening away from the visitor means opening into
 * whatever is on the other side, so the front door swung through the sofa and
 * each bedroom door swept through its own wardrobe. A door now opens into the
 * room it serves, always, and config/swing.py keeps the furniture out of the
 * quarter-circle it needs.
 *
 * A DOOR IS SOLID THE WHOLE WAY THROUGH ITS SWING, not only while it is shut.
 * The leaf used to drop out of the walk volume once it was a fifth open, which
 * made a closed door a wall and an open door nothing at all -- so the tour
 * walked straight through the leaf resting against the wall beside every
 * doorway. It is a 40mm slab of timber sticking three-quarters of a metre into
 * the room at any angle it happens to be at, and it is modelled as one:
 * `footprints` follows the leaf round. The trigger distance is far enough that
 * a door is open and at rest long before anyone reaches it; the walk test
 * proves the tour still completes.
 */

import * as THREE from "three";

export const DOORS_MANIFEST_URL = "/models/house/doors.json";

/**
 * How far away a visitor has to be for a door to start opening, in metres.
 *
 * MEASURED AGAINST THE ROUTE, not chosen. The tour's first stop is the
 * approach point in front of the entrance -- `tour_json.APPROACH`, 2,600mm
 * out -- and it is labelled "Front door". At 2.2m the visitor stood at a stop
 * called Front door, looking at a shut one, for the whole dwell. Anything the
 * tour deliberately stops at has to be open by the time it gets there.
 */
const OPEN_WITHIN = 3.0;

/**
 * And how far away before it closes again.
 *
 * Wider than it opens, on purpose. With one distance a visitor standing right
 * on the threshold makes the door flutter between states as they shift about;
 * the gap between the two is what stops that.
 */
const CLOSE_BEYOND = 3.9;

/** How far a door opens with nothing in its way. A little past square. */
const OPEN_ANGLE = THREE.MathUtils.degToRad(96);

/**
 * How finely the swing is searched for the first thing it hits.
 *
 * 2 degrees a step over 96, which puts a leaf within 27mm of what stopped it
 * at the latch edge -- closer than anybody can see a door resting against a
 * sofa, and 48 rectangle tests per door on a list that changes rarely.
 */
const SWING_STEPS = 48;

/**
 * How much of the doorway has to be left for the tour to get through.
 *
 * A door stopped by furniture is a real door. A door stopped so early that
 * nobody can pass is a wall, and the guided tour will stand in front of it
 * forever -- which looks exactly like the app having frozen. Below this the
 * leaf is treated as blocked-open: it stays where the furniture stops it and
 * says so, rather than pretending to be a working door.
 */
const MIN_PASS = 0.52;

/** Seconds to swing fully open, and fully shut. */
const OPEN_SECONDS = 0.85;
const CLOSE_SECONDS = 1.6;

/** How thick a leaf is for collision, in metres. */
const LEAF_THICKNESS = 0.05;

/**
 * How many boxes a swinging leaf is modelled as.
 *
 * The walk volume takes axis-aligned rectangles, and one box round a leaf at
 * 45 degrees is a square more than half a metre on a side -- which is nothing
 * like a door and quite enough to wedge the doorway shut mid-swing. Cut into
 * four along its length each box hugs the leaf closely at every angle, at a
 * cost of thirty-odd rectangles for the whole house.
 */
const LEAF_SEGMENTS = 4;

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
  const doors = entries.map((entry) => {
    const sliding = entry.motion === "slide";
    // WORLD metres. The character lives in the scene, not in the house group,
    // so the recentring offset goes on here exactly as it does for the route
    // and the collision model.
    const anchor = sliding ? entry.centre : entry.hinge;
    return {
      label: entry.label,
      sliding,
      anchorX: anchor[0] + offsetX,
      anchorZ: anchor[1] + offsetZ,
      alongX: entry.along[0],
      alongZ: entry.along[1],
      width: entry.width_m,
      travel: entry.travel_m ?? 0,
      openness: 0,    // 0 shut, 1 fully open
      // WHICH WAY IT OPENS, from the plan, and fixed. A door is hung once.
      // The manifest's sign is already in the browser's rotation.y
      // convention, so it needs no flipping here -- see doors_json.
      sign: sliding ? 1 : (entry.swing ?? 1),
      into: entry.into ?? "",
      // How far it can actually go before it meets something. Recomputed by
      // `setObstacles`; a door with nothing in its way opens fully.
      maxAngle: OPEN_ANGLE,
      blocked: false,
      wanted: 0,
      angle: 0,       // radians, hinged
      slide: 0,       // metres along the wall, sliding
    };
  });

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
        // A slider is anchored on its middle already.
        const cx = door.sliding
          ? door.anchorX
          : door.anchorX + door.alongX * door.width * 0.5;
        const cz = door.sliding
          ? door.anchorZ
          : door.anchorZ + door.alongZ * door.width * 0.5;
        const distance = Math.hypot(viewer.x - cx, viewer.z - cz);

        if (distance < OPEN_WITHIN) door.wanted = 1;
        else if (distance > CLOSE_BEYOND) door.wanted = 0;

        const rate = door.wanted === 1 ? 1 / OPEN_SECONDS : -1 / CLOSE_SECONDS;
        const next = Math.min(1, Math.max(0, door.openness + rate * delta));
        door.openness = next;

        // Ease, so a door does not start and stop like a garage shutter.
        const eased = next * next * (3 - 2 * next);
        if (door.sliding) door.slide = eased * door.travel;
        else door.angle = door.sign * eased * door.maxAngle;
      });
    },

    /**
     * Tell the doors what is standing in the rooms, so they stop at it.
     *
     * A REAL DOOR STOPS WHEN IT HITS THE SOFA. It does not pass through it and
     * it does not refuse to open: it opens as far as it can and rests there,
     * which is why doors in a crowded house stand at odd angles. Before this
     * the leaf swung its full 96 degrees through whatever was there, and the
     * front door went through the three-seater every time.
     *
     * DECIDED HERE RATHER THAN IN THE MANIFEST, deliberately. The plan knows
     * where the catalogue put the furniture; it does not know what an operator
     * placed this morning, and the placements come from the database at run
     * time. The browser has the actual rectangles -- the same ones it hands
     * the walk volume -- so it is the only party that can be right.
     *
     * Swept from shut and stopped at the FIRST hit: something beyond a gap is
     * still in the way, because the leaf would have to pass through the near
     * one to reach it. Call it when the furniture changes, not every frame.
     *
     * @param {Array<[number,number,number,number]>} rects world-metre AABBs
     */
    setObstacles(rects = []) {
      doors.forEach((door) => {
        if (door.sliding) return;

        let limit = OPEN_ANGLE;
        for (let i = 1; i <= SWING_STEPS; i += 1) {
          const angle = (OPEN_ANGLE * i) / SWING_STEPS;
          if (!leafClear(door, angle, rects)) {
            limit = (OPEN_ANGLE * (i - 1)) / SWING_STEPS;
            break;
          }
        }

        door.maxAngle = limit;
        // What is left of the doorway with the leaf held there. The leaf lies
        // across the opening by its own length times the cosine of how far it
        // has turned, and the opening is a little wider than the leaf.
        const clear = door.width * (1.08 - Math.cos(limit));
        door.blocked = clear < MIN_PASS;
      });

      const stuck = doors.filter((d) => d.blocked);
      if (stuck.length) {
        console.warn(
          `[doors] ${stuck.length} door(s) cannot open far enough to walk ` +
          `through -- something is standing in the swing:`,
          stuck.map((d) => `${d.label} (${((d.maxAngle * 180) / Math.PI).toFixed(0)}deg)`).join(", ")
        );
      }
    },

    /**
     * Where every leaf is right now, for the walk volume.
     *
     * NOT "the doors that are still shut". A leaf standing open against the
     * wall is a slab of timber three-quarters of a metre into the room, and
     * dropping it from the volume the moment it started to move is why the
     * tour walked through the open ones. It is here at every angle.
     *
     * A hinged leaf is cut into LEAF_SEGMENTS boxes along its length so the
     * axis-aligned rectangles the volume takes still hug it when it is
     * halfway round. A slider stays one box and follows its own travel.
     *
     * Rebuilt on each call rather than cached: this changes every frame, and
     * it is a few dozen rectangles.
     */
    footprints() {
      const rects = [];
      const pad = LEAF_THICKNESS / 2;

      doors.forEach((door) => {
        if (door.sliding) {
          // The sash spans half the opening and slides along the wall.
          const x0 = door.anchorX - door.alongX * door.width * 0.5
            + door.alongX * door.slide;
          const z0 = door.anchorZ - door.alongZ * door.width * 0.5
            + door.alongZ * door.slide;
          const x1 = x0 + door.alongX * door.width;
          const z1 = z0 + door.alongZ * door.width;
          rects.push([
            Math.min(x0, x1) - pad, Math.min(z0, z1) - pad,
            Math.max(x0, x1) + pad, Math.max(z0, z1) + pad,
          ]);
          return;
        }

        // The leaf as it stands: rotate `along` by the current angle and walk
        // out from the hinge. Same rotation the meshes get, so the collision
        // and the thing you can see cannot drift apart.
        const c = Math.cos(door.angle);
        const s = Math.sin(door.angle);
        const dx = door.alongX * c + door.alongZ * s;
        const dz = -door.alongX * s + door.alongZ * c;

        for (let i = 0; i < LEAF_SEGMENTS; i += 1) {
          const t0 = (i / LEAF_SEGMENTS) * door.width;
          const t1 = ((i + 1) / LEAF_SEGMENTS) * door.width;
          const x0 = door.anchorX + dx * t0;
          const z0 = door.anchorZ + dz * t0;
          const x1 = door.anchorX + dx * t1;
          const z1 = door.anchorZ + dz * t1;
          rects.push([
            Math.min(x0, x1) - pad, Math.min(z0, z1) - pad,
            Math.max(x0, x1) + pad, Math.max(z0, z1) + pad,
          ]);
        }
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
      return doors.filter((door) => !door.sliding).map((door) => ({
        label: door.label,
        x: door.anchorX,
        z: door.anchorZ,
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
        door.slide = 0;
      });
    },
  };
}

/**
 * Is the leaf clear of every rectangle when held at `angle`?
 *
 * Points are taken ALONG the leaf, not only at its tip: a wardrobe close to
 * the hinge is missed entirely by a tip-only test, and a wardrobe beside a
 * bedroom door is exactly where wardrobes go.
 */
function leafClear(door, angle, rects) {
  const a = door.sign * angle;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = door.alongX * c + door.alongZ * s;
  const dz = -door.alongX * s + door.alongZ * c;

  for (const f of [0.3, 0.5, 0.7, 0.85, 1.0]) {
    const x = door.anchorX + dx * door.width * f;
    const z = door.anchorZ + dz * door.width * f;
    for (const [x0, z0, x1, z1] of rects) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return false;
    }
  }
  return true;
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

  const entries = manifest.doors ?? [];
  const set = createDoorSet(entries, {
    offsetX: house.position?.x ?? 0,
    offsetZ: house.position?.z ?? 0,
  });

  // ---- Find the moving parts, BY TAG -----------------------------------
  //
  // NOT BY NAME. three.js runs every GLB node name through
  // `PropertyBinding.sanitizeNodeName`, which strips '.' -- so the object
  // Blender called `doors.master.door.leaf` arrives as
  // `doorsmasterdoorleaf`, and looking it up by the name the manifest
  // records finds nothing at all. That is exactly what happened: the doors
  // were modelled, exported, manifested and driven by code that could never
  // locate them, and the only symptom was that no door ever moved.
  //
  // Every moving object instead carries the door's label as a custom
  // property, exported as glTF `extras` and landing in `userData` untouched.
  // No loader is entitled to rewrite that.
  // THE WHOLE HOUSE, not just the doors part. The pool slider is built by the
  // WINDOWS component -- `SlidingDoorFactory` is registered under glazing,
  // because that is what a slider mostly is -- so it ships in windows.glb.
  // Scanning only `parts.doors` found eight doors and silently missed the one
  // the pool terrace is reached through.
  const byDoor = new Map();
  house.traverse((child) => {
    const label = child.userData?.door;
    if (!label) return;
    if (child.userData.door_part === "fixed") return;   // the static sash
    if (!byDoor.has(label)) byDoor.set(label, []);
    byDoor.get(label).push(child);
  });

  const moving = entries.map((entry) => byDoor.get(entry.label) ?? []);
  const missing = entries.filter((entry, i) => moving[i].length === 0);

  if (missing.length) {
    // Loud: a door with nothing to move looks exactly like the feature not
    // working, and that is a whole rebuild to discover otherwise.
    console.error(
      `[doors] ${missing.length} door(s) in the manifest have no tagged ` +
      `geometry in doors.glb and will not move:`,
      missing.map((d) => d.label).join(", "),
      "-- rebuild the house so the objects carry their 'door' property."
    );
  }

  // Where each moving part started, so a slide is an offset from it rather
  // than an absolute position this would otherwise have to know.
  const rest = moving.map((objects) =>
    objects.map((obj) => obj.position.clone())
  );

  console.info(
    `[doors] ${set.count} door(s) will open on approach, ` +
    `${moving.reduce((n, m) => n + m.length, 0)} moving part(s)`
  );

  const apply = () => {
    set.doors.forEach((door, i) => {
      moving[i].forEach((obj, j) => {
        if (door.sliding) {
          // Along the wall, from where it was built.
          obj.position.set(
            rest[i][j].x + door.alongX * door.slide,
            rest[i][j].y,
            rest[i][j].z + door.alongZ * door.slide
          );
        } else {
          obj.rotation.y = door.angle;
        }
      });
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
    setObstacles(rects) {
      set.setObstacles(rects);
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
