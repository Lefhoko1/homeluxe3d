/**
 * What the tour stops to look at, room by room.
 *
 * THE POINT OF THE WHOLE APPLICATION is that the things in this house are for
 * sale. A tour that walks a visitor into a room, sweeps its head across it and
 * walks out has shown them a room; it has not shown them the three-piece suite,
 * the tile the floor is laid in or the paint on the wall, which are the things
 * somebody is paying to advertise.
 *
 * So the pause in each room is not a sweep any more. It is a LIST, and every
 * item on it is something being advertised there:
 *
 *     the furniture   ->  turn to it, hold, show its advert
 *     the floor       ->  look down at the tile in front of you
 *     the walls       ->  look across at the far wall and its paint
 *     the ceiling     ->  look up at the fitting
 *
 * NOTHING HERE IS TYPED IN. The list is read off the scene as it stands at
 * the moment the tour starts: the products group is whatever the catalogue
 * placed and the admin has since moved, the finishes are whichever surfaces a
 * placement dressed, the fittings come from the lights manifest. Add a sofa,
 * repaint a bedroom, end a promotion so a product drops out of the scene --
 * the tour shows what is there, because it looks.
 *
 * A room with nothing advertised in it still gets its floor, walls and
 * ceiling, so the tour never arrives somewhere and just stands there.
 */

import * as THREE from "three";

/**
 * Seconds spent on one advertised object.
 *
 * Long enough to read the panel that appears with it. Under about three
 * seconds the camera is moving again before the eye has settled, which is the
 * complaint the old six-second whole-room sweep attracted.
 */
const PRODUCT_DWELL = 3.6;

/** Seconds spent on a surface -- floor, wall, ceiling. */
const SURFACE_DWELL = 2.6;

/**
 * Longest a single stop may last, in seconds.
 *
 * The living room holds five pieces plus three surfaces, which unbounded is
 * half a minute standing in one place. Past this the remaining items are
 * dropped rather than the dwell being shortened: three things looked at
 * properly beats eight glimpsed.
 */
const MAX_STOP_SECONDS = 26;

/**
 * Shortest a stop may last, in seconds.
 *
 * There is a floor as well as a ceiling, and it is the more important of the
 * two. A kitchen with nothing placed in it yet has one thing on its list --
 * the ceiling light -- and without this the tour would walk in, glance up for
 * two and a half seconds and walk out, which is worse than the ten-second
 * pause it replaced. The shortfall becomes an unhurried look at the room
 * itself, taken FIRST: arrive, take the room in, then be shown what is in it.
 */
const MIN_STOP_SECONDS = 8;

/** How far ahead the visitor looks down at the floor, in metres. */
const FLOOR_LOOK_AHEAD = 1.7;

/** Height on a wall that reads as "the wall", rather than the skirting. */
const WALL_LOOK_HEIGHT = 1.5;

/**
 * Build the look-list for one room.
 *
 * `from` is where the character is standing, which matters: the wall worth
 * showing is the one they are NOT already next to, and the patch of floor
 * worth showing is the one in front of them rather than under their feet.
 */
function surfaceTargets(room, from, finishes, fittings, ceiling, doors) {
  const targets = [];

  const floorFinish = finishes.find((f) => f.kind === "floor");
  const wallFinish = finishes.find((f) => f.kind === "wall");
  const fitting = finishes.find((f) => f.kind === "fitting");

  // ---- Door hardware ----------------------------------------------------
  // A hinge is 100mm of black metal on the edge of a door. It is advertised
  // like a finish -- it dresses something the house already has -- but unlike
  // paint it is not on a wall and unlike tile it is not underfoot, so it
  // needs its own aim or the tour shows a visitor the floor and calls it a
  // hinge. The nearest door to where the visitor is standing is the one they
  // can actually see.
  if (fitting && doors?.length) {
    let nearest = null;
    let bestD = Infinity;
    doors.forEach((door) => {
      const d = (door.x - from.x) ** 2 + (door.z - from.z) ** 2;
      if (d < bestD) {
        bestD = d;
        nearest = door;
      }
    });
    if (nearest) {
      targets.push({
        kind: "fitting",
        point: new THREE.Vector3(nearest.x, nearest.y, nearest.z),
        // Longer than a surface: it is a small object and the camera has to
        // travel before it is worth looking at.
        dwell: PRODUCT_DWELL,
        advert: fitting.advert,
        caption: fitting.advert?.name ?? "Door hardware",
      });
    }
  }

  // ---- The floor -------------------------------------------------------
  // Aimed a stride ahead rather than at the feet: looking straight down is
  // what you do when you have dropped something, not when you are admiring
  // a tile.
  if (floorFinish && room) {
    const toCentre = new THREE.Vector3()
      .subVectors(room.centre, from)
      .setY(0);
    if (toCentre.lengthSq() < 0.04) {
      // Standing on the centre already: look along the room's longer axis,
      // which is the direction with the most floor to see.
      const wide = room.x1 - room.x0 > room.z1 - room.z0;
      toCentre.set(wide ? 1 : 0, 0, wide ? 0 : 1);
    }
    toCentre.normalize().multiplyScalar(FLOOR_LOOK_AHEAD);
    targets.push({
      kind: "floor",
      point: new THREE.Vector3(from.x + toCentre.x, 0.02, from.z + toCentre.z),
      dwell: SURFACE_DWELL,
      advert: floorFinish.advert,
      caption: floorFinish.advert?.name ?? "Floor",
    });
  }

  // ---- The walls -------------------------------------------------------
  // The FAR wall, because the near one fills the frame with a flat colour and
  // says nothing about the room. Each of the room's four sides is offered and
  // the most distant wins.
  if (wallFinish && room) {
    const sides = [
      new THREE.Vector3((room.x0 + room.x1) / 2, WALL_LOOK_HEIGHT, room.z0),
      new THREE.Vector3((room.x0 + room.x1) / 2, WALL_LOOK_HEIGHT, room.z1),
      new THREE.Vector3(room.x0, WALL_LOOK_HEIGHT, (room.z0 + room.z1) / 2),
      new THREE.Vector3(room.x1, WALL_LOOK_HEIGHT, (room.z0 + room.z1) / 2),
    ];
    let best = sides[0];
    let bestD = -1;
    sides.forEach((side) => {
      const d = (side.x - from.x) ** 2 + (side.z - from.z) ** 2;
      if (d > bestD) {
        bestD = d;
        best = side;
      }
    });
    targets.push({
      kind: "wall",
      point: best,
      dwell: SURFACE_DWELL,
      advert: wallFinish.advert,
      caption: wallFinish.advert?.name ?? "Walls",
    });
  }

  // ---- The ceiling and its light ---------------------------------------
  // A fitting if the room has one, the ceiling itself if it does not. Either
  // way the visitor looks UP, which is the one direction a walk-through
  // otherwise never shows -- and the ceiling and its lights are part of what
  // the house is offering.
  const lightFitting = fittings.find((light) => light.room === room?.room);
  if (lightFitting) {
    targets.push({
      kind: "light",
      point: lightFitting.point.clone(),
      dwell: SURFACE_DWELL,
      advert: null,
      caption: "Ceiling light",
    });
  } else if (room) {
    targets.push({
      kind: "ceiling",
      point: new THREE.Vector3(room.centre.x, ceiling - 0.06, room.centre.z),
      dwell: SURFACE_DWELL,
      advert: null,
      caption: "Ceiling",
    });
  }

  return targets;
}

/**
 * Everything the tour can show, indexed by room.
 *
 * @param {object} options
 * @param {THREE.Object3D} options.products  the products group; its direct
 *        children are the placements, each tagged with its room and advert
 * @param {Array} options.finishes  `{room, kind:'floor'|'wall', advert}` --
 *        the surfaces a finish product was placed on
 * @param {Array} options.fittings  `{room, point}` in WORLD metres
 * @param {Array} options.rooms     from the collision manifest, world metres
 * @param {number} options.ceiling  ceiling height, metres
 * @param {Array} options.doors     `{label, x, y, z}` hinge positions, world
 *        metres -- where a door-hardware advert is aimed
 */
export function createShowcase({
  products = null,
  finishes = [],
  fittings = [],
  rooms = [],
  ceiling = 2.4,
  doors = [],
} = {}) {
  const roomsByName = new Map(rooms.map((room) => [room.room, room]));

  return {
    /**
     * The list for one room, nearest first.
     *
     * Rebuilt on every arrival rather than cached, and that is deliberate:
     * the furniture can have been dragged since the tour started, and the
     * floor and wall targets depend on where the character actually came to
     * rest. A cached list would point at where the sofa used to be.
     */
    forRoom(roomName, from) {
      const room = roomsByName.get(roomName) ?? null;
      const here = from ?? room?.centre ?? new THREE.Vector3();

      // ---- The advertised objects ---------------------------------------
      const box = new THREE.Box3();
      const objects = [];

      if (products) {
        products.updateMatrixWorld(true);
        products.children.forEach((child) => {
          const data = child.userData;
          if (!data?.productId || data.room !== roomName) return;
          if (child.visible === false) return;

          box.setFromObject(child);
          if (box.isEmpty()) return;

          const point = box.getCenter(new THREE.Vector3());
          // Aim at the upper body of the piece, not its volumetric centre --
          // on a rug or a coffee table that centre is at ankle height and the
          // shot becomes a picture of the floor.
          point.y = Math.max(point.y, Math.min(box.max.y - 0.15, 1.1));

          objects.push({
            kind: "product",
            point,
            dwell: PRODUCT_DWELL,
            advert: { ...data },
            caption: data.name ?? "Product",
            distance: (point.x - here.x) ** 2 + (point.z - here.z) ** 2,
          });
        });
      }

      // Nearest first: turning to the closest thing and working outward is
      // how a person looks round a room, and it keeps the total turn short.
      objects.sort((a, b) => a.distance - b.distance);

      const roomFinishes = finishes.filter((f) => f.room === roomName);
      const targets = [
        ...objects,
        ...surfaceTargets(room, here, roomFinishes, fittings, ceiling, doors),
      ];

      // Trim rather than rush. See MAX_STOP_SECONDS.
      let budget = MAX_STOP_SECONDS;
      const kept = [];
      targets.forEach((target) => {
        if (budget - target.dwell < 0) return;
        budget -= target.dwell;
        kept.push(target);
      });

      // A thin list becomes a long look at the room instead of a brief one at
      // the only thing in it. See MIN_STOP_SECONDS.
      const total = kept.reduce((sum, target) => sum + target.dwell, 0);
      if (room && total < MIN_STOP_SECONDS) {
        // Across the room from where the visitor is standing, at eye level:
        // the establishing shot a person takes on walking through a door.
        const across = new THREE.Vector3()
          .subVectors(room.centre, here)
          .setY(0);
        if (across.lengthSq() < 0.04) across.set(0, 0, -1);
        across.setLength(Math.max(2.5, across.length() * 2));

        kept.unshift({
          kind: "room",
          point: new THREE.Vector3(
            here.x + across.x,
            WALL_LOOK_HEIGHT,
            here.z + across.z
          ),
          dwell: MIN_STOP_SECONDS - total,
          advert: null,
          caption: room.label,
        });
      }

      return kept;
    },
  };
}
