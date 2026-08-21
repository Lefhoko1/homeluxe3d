/**
 * Walk-through tour.
 *
 * Drives a character around the property in third person, so a visitor can
 * arrive at the gate, walk up the drive, go through the front door and stand
 * in front of the furniture at eye level. Orbiting a model tells you the
 * layout; walking it tells you the scale.
 *
 * Three problems have to be solved for that to feel right, and each is solved
 * by a raycast rather than by a physics engine:
 *
 *  1. GROUND FOLLOWING. The lawn is contoured, the slab stands 150mm proud,
 *     the porch is a step up. A ray fired straight down finds whatever is
 *     underfoot, so the character walks up the step without being told the
 *     step exists.
 *
 *  2. WALLS AND FURNITURE. Not a raycast -- a VOLUME. The character is a
 *     circle on the floor plan, and it is pushed out of the solid rectangles
 *     given by `collision.json`. A ray could be stepped over in one long
 *     frame, could thread a doorway the shoulder does not fit through, and
 *     could only ever refuse to move rather than slide; none of those are
 *     true of a circle. See tour/collision.js, which is where the walls now
 *     live.
 *
 *     Because walls were built as piers, sills and lintels rather than solid
 *     panels with holes cut in them, doorways are REAL GAPS -- so walking
 *     through a doorway still needs no door logic at all. At walking height
 *     there is simply no rectangle there.
 *
 *  3. FALLING. If a downward ray finds nothing (off the edge of the site),
 *     the character keeps its previous height instead of dropping forever.
 *
 * Door leaves are deliberately NOT collided with: every door is treated as
 * open. A tour that requires you to work out which doors open is a worse tour.
 *
 * AND THE TOUR STOPS TO SHOW YOU THINGS. Arriving in a room, the character
 * works through a list of what is advertised there -- each piece of furniture,
 * the floor, the walls, the ceiling light -- turning to face each one and
 * holding still while its advert is on screen. That list is read off the
 * scene, not written down here; see tour/showcase.js.
 *
 * THE HOUSE NEVER MOVES. Turning rotates the CHARACTER on the spot and swings
 * the CAMERA to stay behind it. Nothing in here touches the scene or the house
 * group, so the building stays where it was built.
 */

import * as THREE from "three";

/** Metres per second. A relaxed walking pace, not a sprint. */
export const WALK_SPEED = 2.4;

/** Radians per second when turning on the spot. */
export const TURN_SPEED = 2.2;

/**
 * The GUIDED tour moves slower than a person driving themselves.
 *
 * 2.4 m/s is a brisk walk -- right when you are steering, because you already
 * know where you are going. Being driven at it is useless: the whole house
 * goes by in about a minute and you cannot take in a single room. An estate
 * agent walks a client through at closer to 1 m/s and stops talking in each
 * room, which is what these two numbers are for.
 */
export const GUIDED_WALK_SPEED = 1.05;
export const GUIDED_TURN_SPEED = 1.1;

/**
 * How far ahead to check for the things that are NOT in the collision
 * manifest: the yard's fences, hedges and tree trunks.
 *
 * The building is a volume test now, so this no longer has anything to do
 * with walls or with the route's clearance. It is only ever used while the
 * visitor is steering themselves around the garden.
 */
const COLLIDE_DISTANCE = 0.42;

/**
 * How far the character sweeps its heading while paused at a stop.
 *
 * THE RATE IS WHAT MATTERS, and it is this divided by the dwell. The sweep is
 * a full cycle -- centre, right, centre, left, centre -- so the head travels
 * four times this arc in one pause:
 *
 *     4 x 0.55 rad over 10s  =  0.22 rad/s, about 13 degrees a second
 *
 * Two earlier attempts were too fast to watch: 4 x 1.05 over 6s gave 40
 * degrees a second, and 4 x 0.80 over 9s gave 20. Someone scanning a room
 * they have just walked into turns their head slowly; anything quicker reads
 * as the camera being swung rather than a person looking.
 *
 * If this changes, change DWELL in export/tour_json.py with it -- the two
 * only mean something together.
 */
const SURVEY_ARC = 0.55;   // radians, about 32 degrees either side

/**
 * How fast the character turns to face something it is being shown.
 *
 * Slower than steering and faster than the fallback sweep. The showcase sorts
 * a room's items nearest-first, so most turns are small; this only has to
 * cover the occasional half-turn inside the seconds allotted to one item, and
 * 1.6 rad/s crosses a full half-turn in about two.
 */
const SHOWCASE_TURN_SPEED = 1.6;

/**
 * How quickly the camera's aim catches up with where it is being pointed.
 *
 * Two rates, because they are two different jobs. Walking, the aim point is
 * fixed ahead of a moving character and has to keep up or the view lags
 * behind the walk. Being shown something, the whole value is in the slowness:
 * the camera drifts onto the sofa rather than snapping to it.
 */
const AIM_LERP_WALK = 0.25;
const AIM_LERP_SHOW = 0.055;

/**
 * Heights at which the forward ray is fired.
 *
 * One ray at chest height walks straight through a coffee table and a sofa
 * seat, because there is nothing at chest height to hit. Three heights --
 * shin, waist, chest -- catch low furniture, seat backs and walls alike.
 */
const PROBE_HEIGHTS = [0.25, 0.75, 1.35];

/** How far above the character to start the downward ground ray. */
const PROBE_HEIGHT = 4.0;

/**
 * Biggest height change allowed in one step, up or down.
 *
 * This is what stops the character strolling off the pool terrace and
 * standing on the bottom of the pool, or climbing a wall it happened not to
 * hit. A porch step is ~150mm and the slab edge is ~150mm, so 450mm clears
 * everything intended while blocking a 1.9m drop.
 */
const MAX_STEP = 0.45;

/**
 * How close counts as arriving at a waypoint.
 *
 * This is a tighter number than it first appears it should be, and the reason
 * is doorways. Accept 450mm and the character turns for the next waypoint
 * from up to 450mm off the route -- which in a 1m front door is outside the
 * gap, so the new straight line runs into the jamb and it grinds there.
 * Solved routes are kept 300mm clear of walls, so arriving has to be tighter
 * than that or the clearance buys nothing.
 */
export const ARRIVE_RADIUS = 0.22;

/**
 * How long the walk may make no progress before it gives up on a waypoint.
 *
 * THIS IS A BUSINESS REQUIREMENT, not a nicety. The house is an advertising
 * space whose stock rotates from a database with nobody watching: batches go
 * live overnight, a shop uploads a wardrobe and drops it somewhere awkward,
 * a promotion ends and a sofa vanishes. `settleRoute` moves waypoints out of
 * whatever has appeared on top of them, and handles the ordinary case -- but
 * it cannot promise there is still a way THROUGH. Something can be placed
 * across a doorway.
 *
 * Without a guard the tour then stands still for as long as the page is open,
 * which on a showroom site is indistinguishable from the site being broken.
 * With one, the worst case is a tour that takes a slightly odd line through
 * one room. Degraded beats dead.
 *
 * Four seconds is longer than any legitimate manoeuvre: the walk turns before
 * it moves, so a full half-turn on the spot at the guided rate is under three.
 */
const STALL_SECONDS = 4.0;

/** Progress smaller than this, over that time, is not progress. */
const STALL_PROGRESS = 0.05;

/**
 * THE CAMERA RIG, AND WHY THE OLD ONE COULD NOT WORK INDOORS
 *
 * It sat 4.2m behind the character and 2.4m up, looking AT the character's
 * chest. Every one of those three numbers fights a house:
 *
 *  - 4.2m BACK is deeper than most rooms in this plan. Bedroom 2 is 2.97m
 *    deep. So the camera was always outside the room, always dragged back in
 *    by the wall test, and always ended up at its 0.9m minimum -- which is
 *    close enough that a 1.7m character fills the frame.
 *
 *  - 2.4m UP is exactly the ceiling height. The camera sat in the ceiling
 *    plane, and the ceiling was not in the list of things it must not pass
 *    through, so it went above it.
 *
 *  - LOOKING AT THE CHARACTER puts the back of their head in the middle of
 *    the screen and the room in the periphery. For a walk-through of a house
 *    that is exactly backwards: the room is the subject, the character is
 *    there for scale.
 *
 * So the camera now sits close and low, and looks AHEAD of the character
 * rather than at them -- the room the visitor is walking into fills the
 * frame, and the character reads as a figure in the lower third.
 *
 * FIRST PERSON is the same rig with the offsets collapsed and the character
 * hidden. In a 2m bathroom no third-person camera can work at all, and being
 * able to just look is the whole point.
 */
export const VIEWS = {
  third: {
    back: 2.3,          // fits the smallest room in the plan
    up: 1.72,           // above the head, well under the 2.4m ceiling
    lookAhead: 3.4,     // the room, not the character
    lookHeight: 1.35,
    // THE SAME LENS AS OUTSIDE THE TOUR, so stepping into it does not warp
    // the house. This was 68, which is 100 degrees across a 16:9 frame -- an
    // ultra-wide, and ultra-wides bend straight lines. A house is nothing
    // BUT straight lines, so every wall leaned as the camera turned and the
    // building looked like it was flexing. 55 is 86 degrees across, still
    // wide enough to see both sides of the smallest room in the plan.
    fov: 55,
    showCharacter: true,
  },
  first: {
    back: -0.05,        // a hair in front of the eyes, so no nose geometry
    up: 1.45,
    lookAhead: 4.0,
    lookHeight: 1.45,
    // A little wider than third person, because your eyes are at the wall
    // rather than 2.3m back from it -- but nowhere near the old 74, which
    // was 107 degrees across and bowed the corners of every room.
    fov: 62,
    showCharacter: false,
  },
};

/** Closest the camera may sit to the character when pushed in by a wall. */
const CAMERA_MIN = 0.45;

/**
 * How quickly the camera catches up. 1 = instant, lower = smoother.
 *
 * Deliberately high: the camera has to feel bolted behind the character. Too
 * low and turning reads as the world swinging around a stationary viewer,
 * which is the opposite of what a walk-through should feel like.
 */
const CAMERA_LERP = 0.35;

/**
 * @param {object} options
 * @param {THREE.Object3D} options.character  the avatar, feet at its origin
 * @param {THREE.Camera}   options.camera
 * @param {object}         options.controls   OrbitControls, disabled while walking
 * @param {THREE.Object3D[]} options.groundObjects  what to stand on
 * @param {THREE.Object3D[]} options.wallObjects    what to bump into
 * @param {number[]}       options.start      [x, z] start position, metres
 * @param {number}         options.startHeading  radians; 0 faces -Z
 */
export function createTourController(options = {}) {
  const {
    character,
    camera,
    controls,
    groundObjects = [],
    /**
     * THE BUILDING AND ITS CONTENTS, as a volume. Walls from the collision
     * manifest, furniture from its own bounding boxes; see tour/collision.js.
     * This is what stops the character walking through a wall, and it applies
     * whether the visitor is steering or being driven.
     */
    walkVolume = null,
    /**
     * The yard: fences, hedges, tree trunks, the porch. Geometry the plan
     * knows nothing about, so it cannot be in the manifest -- these stay a
     * raycast. Only tested while the visitor is steering, since the guided
     * route never leaves the paved approach.
     */
    obstacles = [],
    // What the CAMERA may not pass through. Structure and ceiling -- if the
    // camera dodged every sofa it would jitter constantly in a furnished room.
    cameraObstacles = [],
    start = [0, 0],
    startHeading = 0,
  } = options;

  const position = new THREE.Vector3(start[0], 0, start[1]);
  let heading = startHeading;
  let active = false;
  let lastGroundY = 0;

  let view = VIEWS.third;
  let viewName = "third";

  // -- Guided route -------------------------------------------------------
  // A solved path through the house, from tour.json. `null` means the
  // visitor is driving.
  let route = null;
  let routeIndex = 0;

  /**
   * Held, but not forgotten.
   *
   * A PAUSE IS NOT A STOP, and the difference is the whole reason this flag
   * exists rather than reusing `stopRoute`. Stopping throws the route away:
   * `route`, `routeIndex`, the dwell timer and the showcase all go, and the
   * only way back is to start again from the driveway. Somebody who broke off
   * the tour to look at a sofa wants to carry on from the sofa's room, not
   * from the front door.
   *
   * So everything is kept exactly as it was and the walk simply stops being
   * stepped. The camera goes back to OrbitControls while this is true, which
   * is what lets the caller fly it somewhere else.
   */
  let routeHeld = false;
  let dwellLeft = 0;
  let dwellTotal = 0;
  let surveyFrom = 0;
  let onArrive = null;

  // -- The showcase -------------------------------------------------------
  // What is being advertised in the room the tour has just walked into, and
  // which of those things the character is looking at right now. Empty
  // whenever the tour is between rooms. See tour/showcase.js.
  let showcase = null;
  let onShow = null;
  let showTargets = [];
  let showIndex = 0;
  let showLeft = 0;

  // -- The stall guard ----------------------------------------------------
  // How long the walk has been failing to get closer to the waypoint it is
  // heading for, and the closest it has managed. See STALL_SECONDS.
  let stallFor = 0;
  let closestSoFar = Infinity;
  let skipped = 0;

  /** Shortest signed angle from a to b. */
  const angleTo = (from, to) => {
    let diff = (to - from) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  };

  const groundRay = new THREE.Raycaster();
  groundRay.far = PROBE_HEIGHT * 2;

  const wallRay = new THREE.Raycaster();
  wallRay.far = COLLIDE_DISTANCE;

  const camRay = new THREE.Raycaster();

  const DOWN = new THREE.Vector3(0, -1, 0);
  const probe = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  // Where the camera is pointed, and where it is being pointed. Two vectors
  // rather than one so the aim can EASE onto a target instead of snapping to
  // it, which is the difference between a person looking at a sofa and a
  // camera being swung at one.
  const aim = new THREE.Vector3();
  const aimTarget = new THREE.Vector3();
  const head = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  // Held input. Keyboard and on-screen buttons write into the same object so
  // they behave identically -- including both at once.
  const input = { forward: 0, turn: 0 };
  const keys = new Set();

  const MOVE_KEYS = {
    ArrowUp: ["forward", 1], KeyW: ["forward", 1],
    ArrowDown: ["forward", -1], KeyS: ["forward", -1],
    ArrowLeft: ["turn", 1], KeyA: ["turn", 1],
    ArrowRight: ["turn", -1], KeyD: ["turn", -1],
  };

  function readKeys() {
    let f = 0;
    let t = 0;
    keys.forEach((code) => {
      const mapped = MOVE_KEYS[code];
      if (!mapped) return;
      if (mapped[0] === "forward") f += mapped[1];
      else t += mapped[1];
    });
    return { f, t };
  }

  function onKeyDown(event) {
    if (!active || !MOVE_KEYS[event.code]) return;
    keys.add(event.code);
    // Stop arrow keys scrolling the page out from under the canvas.
    event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  /**
   * A wider lens while walking.
   *
   * 55 degrees is right for orbiting a building from outside. Inside a 3m
   * bedroom it turns the room into a corridor -- you see a wall and no idea
   * what is either side of you. Restored on exit so the outside view is
   * unaffected.
   */
  let savedFov = null;
  function applyFov() {
    if (!camera?.isPerspectiveCamera) return;
    if (savedFov === null) savedFov = camera.fov;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
  }

  function restoreFov() {
    if (savedFov === null || !camera?.isPerspectiveCamera) return;
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
    savedFov = null;
  }

  /** Height of whatever is directly under (x, z). */
  function groundAt(x, z) {
    probe.set(x, lastGroundY + PROBE_HEIGHT, z);
    groundRay.set(probe, DOWN);
    const hits = groundRay.intersectObjects(groundObjects, true);
    return hits.length ? hits[0].point.y : null;
  }

  /**
   * True if something solid is within reach in this direction.
   *
   * Fires at three heights, because a single chest-height ray walks straight
   * through a coffee table.
   */
  function blocked(origin, direction) {
    // THE WALLS AND THE FURNITURE ARE NOT TESTED HERE. They are a volume now,
    // resolved by `walkVolume` in `update` -- a circle pushed out of solid
    // rectangles, which cannot be stepped over in a long frame and cannot
    // stick. See tour/collision.js for why a ray could never do that job.
    //
    // What is left is the yard: fences, hedges, tree trunks. That geometry is
    // not in the plan, so it cannot be in the manifest, and it is only ever
    // in the way when the visitor is steering -- the guided route walks up
    // the drive and goes indoors.
    if (route || !obstacles.length) return false;

    for (let i = 0; i < PROBE_HEIGHTS.length; i += 1) {
      probe.set(origin.x, lastGroundY + PROBE_HEIGHTS[i], origin.z);
      wallRay.set(probe, direction);
      if (wallRay.intersectObjects(obstacles, true).length > 0) return true;
    }
    return false;
  }

  /**
   * Turn towards a point and point the camera at it.
   *
   * Used by the showcase: the character rotates on the spot to face whatever
   * it is being shown, and the camera aims at the thing itself rather than at
   * the character's eye level -- which is what makes looking UP at a ceiling
   * light or DOWN at a floor tile possible at all.
   */
  function aimAt(point, step) {
    const dx = point.x - position.x;
    const dz = point.z - position.z;

    if (dx * dx + dz * dz > 1e-4) {
      const wanted = Math.atan2(dx, -dz);
      const diff = angleTo(heading, wanted);
      const maxTurn = SHOWCASE_TURN_SPEED * step;
      heading += Math.abs(diff) < maxTurn ? diff : Math.sign(diff) * maxTurn;
    }

    aimTarget.copy(point);
  }

  /** Drop whatever the tour was showing. */
  function clearShowcase() {
    showTargets = [];
    showIndex = 0;
    showLeft = 0;
  }

  /**
   * Move on to the next waypoint, looping at the end.
   *
   * The stall counters reset here and nowhere else, so every way of leaving a
   * waypoint -- arriving at it, or giving up on it -- starts the next one
   * with a clean slate.
   */
  function advance() {
    routeIndex += 1;
    dwellLeft = 0;
    stallFor = 0;
    closestSoFar = Infinity;
    clearShowcase();

    if (routeIndex >= route.length) {
      // Loop: the route ends where it began.
      routeIndex = 0;
      route.forEach((point) => { point.done = false; });
    }
  }

  /**
   * Can the character stand at (x, z)?
   *
   * Rejects anything that would need too big a step up or down. Off the edge
   * of the world -- no ground at all -- is allowed, so walking past the site
   * boundary does not trap you; the height simply stops changing.
   */
  function standable(x, z) {
    const y = groundAt(x, z);
    if (y === null) return true;
    return Math.abs(y - lastGroundY) <= MAX_STEP;
  }

  /**
   * Move to (x, z) if anything solid there allows it.
   *
   * The volume gets first say and answers with the nearest position that is
   * NOT inside a wall or a piece of furniture -- so a walker pressed into a
   * wall is displaced along it rather than stopped. Only the height test can
   * refuse outright, because there is no sensible way to push someone out of
   * a 2m drop.
   *
   * @returns {boolean} whether the character moved
   */
  function moveTo(x, z) {
    let px = x;
    let pz = z;

    if (walkVolume) {
      const solved = walkVolume.resolve(px, pz);
      px = solved.x;
      pz = solved.z;
    }

    if (!standable(px, pz)) return false;

    const moved = Math.abs(px - position.x) > 1e-6 || Math.abs(pz - position.z) > 1e-6;
    position.x = px;
    position.z = pz;
    return moved;
  }

  return {
    get active() {
      return active;
    },

    /** True while the route is held mid-way. See `routeHeld` above. */
    get paused() {
      return routeHeld;
    },

    /**
     * Stop walking, keep the place.
     *
     * The character stays standing where they got to and stays VISIBLE --
     * they are the bookmark, and a tour that resumes from an empty room
     * leaves the visitor wondering where they were. The lens goes back to
     * the one OrbitControls uses, so the view that flies off to a product is
     * not the tour's slightly wider one.
     */
    pauseRoute() {
      if (!active || routeHeld) return false;
      routeHeld = true;
      keys.clear();
      input.forward = 0;
      input.turn = 0;
      restoreFov();
      if (controls) controls.enabled = true;
      return true;
    },

    /** Carry on from exactly where it stopped. */
    resumeRoute() {
      if (!active || !routeHeld) return false;
      routeHeld = false;
      applyFov();
      if (controls) controls.enabled = false;
      return true;
    },

    get position() {
      return position.clone();
    },

    /** Enter walk mode: park the character, take over the camera. */
    enter() {
      if (active) return;
      active = true;
      keys.clear();
      input.forward = 0;
      input.turn = 0;

      if (controls) controls.enabled = false;

      const y = groundAt(position.x, position.z);
      if (y !== null) lastGroundY = y;
      position.y = lastGroundY;

      character.visible = view.showCharacter;
      character.position.copy(position);
      character.rotation.y = heading;

      applyFov();

      // Snap the camera in rather than sweeping it across the whole site.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      camera.position.set(
        position.x - forward.x * view.back,
        position.y + view.up,
        position.z - forward.z * view.back
      );
      // Seed the aim rather than letting it ease in from wherever the orbit
      // camera happened to be pointed, which would start every tour with an
      // unexplained pan across the garden.
      aimTarget.set(
        position.x + forward.x * view.lookAhead,
        position.y + view.lookHeight,
        position.z + forward.z * view.lookAhead
      );
      aim.copy(aimTarget);
      camera.lookAt(aim);
    },

    /** Leave walk mode and hand the camera back to OrbitControls. */
    exit() {
      if (!active) return;
      active = false;
      routeHeld = false;
      keys.clear();
      route = null;
      clearShowcase();
      character.visible = false;
      restoreFov();
      if (controls) {
        controls.enabled = true;
        controls.target.set(position.x, position.y + 1, position.z);
      }
    },

    /** 'third' or 'first'. */
    get view() {
      return viewName;
    },

    setView(name) {
      if (!VIEWS[name]) return;
      viewName = name;
      view = VIEWS[name];
      character.visible = active && view.showCharacter;
      if (active) applyFov();
    },

    toggleView() {
      this.setView(viewName === "third" ? "first" : "third");
    },

    // -- The guided tour --------------------------------------------------

    get touring() {
      return Boolean(route);
    },

    /** Which stop the tour is at, for the UI. */
    get stop() {
      return route ? route[Math.min(routeIndex, route.length - 1)] : null;
    },

    /**
     * Walk a solved route, entering walk mode if needed.
     *
     * @param {Array<{position:[number,number], label?:string, dwell?:number}>} waypoints
     *        WORLD coordinates -- the character lives in the scene, not in the
     *        house group, so the caller adds the house offset.
     * @param {(stop:object, index:number) => void} [arrived] called on reaching
     *        a stop, so the panels can follow the visitor from room to room.
     * @param {object} [options]
     * @param {{forRoom: Function}} [options.showcase] what is advertised in
     *        each room; see tour/showcase.js. Without one the tour falls back
     *        to sweeping its head around each room.
     * @param {(target:object, index:number, total:number) => void} [options.onShow]
     *        called as each advertised thing is turned to, so the advert on
     *        screen is the one being looked at.
     */
    followRoute(waypoints, arrived = null, { showcase: showing = null, onShow: shown = null } = {}) {
      if (!waypoints?.length) return;
      if (!active) this.enter();

      route = waypoints.map((point) => ({ ...point, done: false }));
      dwellLeft = 0;
      clearShowcase();
      onArrive = arrived;
      showcase = showing;
      onShow = shown;

      // ALWAYS START AT THE BEGINNING. Snapping to the nearest waypoint looks
      // like a saving and is a trap: every waypoint is indoors, the visitor
      // starts on the driveway, and the nearest one is on the far side of the
      // front wall -- so the tour would set off diagonally and press itself
      // against the outside of the house forever.
      //
      // The route's first point is in front of the front door precisely so
      // that walking to it is a clear run across the drive.
      routeIndex = 0;
    },

    /** Stop following, but stay in walk mode so the visitor can take over. */
    stopRoute() {
      route = null;
      onArrive = null;
      onShow = null;
      showcase = null;
      clearShowcase();
      wallRay.far = COLLIDE_DISTANCE;
    },

    /** Progress through the stops, for the UI: {at, total}. */
    get progress() {
      if (!route) return null;
      const stops = route.filter((point) => point.label);
      const done = stops.filter((point) => point.done).length;
      return { at: done, total: stops.length };
    },

    toggle() {
      if (active) this.exit();
      else this.enter();
    },

    /** Press or release an on-screen control. `dir` is one of the MOVE keys. */
    setButton(dir, pressed) {
      const amount = pressed ? 1 : 0;
      if (dir === "forward") input.forward = amount;
      else if (dir === "back") input.forward = -amount;
      else if (dir === "left") input.turn = amount;
      else if (dir === "right") input.turn = -amount;
    },

    /** Release everything. Used when the pointer leaves a button mid-press. */
    releaseAll() {
      input.forward = 0;
      input.turn = 0;
      keys.clear();
    },

    attach(target = window) {
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
    },

    detach(target = window) {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    },

    /** Advance the walk. `delta` in seconds. */
    update(delta) {
      // Held means held: nothing steps, nothing turns, nothing dwells, and
      // the camera is somebody else's to move until `resumeRoute`.
      //
      // NOT called `held`: this function already has a local `const held =
      // readKeys()` further down, and a `let held` in the closure would be
      // shadowed by it for the whole body -- so this line read the local one
      // before it existed and threw on the first frame.
      if (!active || routeHeld) return;

      // Clamp: a long frame (tab regains focus) must not teleport anyone
      // through a wall by stepping further than the collision ray reaches.
      const step = Math.min(delta, 0.05);

      const held = readKeys();
      let turn = held.t + input.turn;
      let drive = held.f + input.forward;

      // ---- Guided tour -------------------------------------------------
      // The route steers by writing the SAME two inputs a person would use,
      // so everything below -- collision, sliding, ground following, the
      // step limit -- applies unchanged. A separate "just teleport along the
      // path" mode would have to re-solve all of it and would still walk
      // through a sofa that was moved after the route was solved.
      if (route) {
        if (turn || drive) {
          // Any manual input hands control back. A tour you cannot escape is
          // a cutscene.
          this.stopRoute();
        } else {
          const target = route[routeIndex];
          const dx = target.position[0] - position.x;
          const dz = target.position[1] - position.z;
          const distance = Math.hypot(dx, dz);

          // ARRIVED, OR GONE PAST.
          //
          // Distance alone is not enough. Walking is continuous and turning
          // takes time, so the character can sail past a waypoint by more
          // than the arrival radius -- and then it turns round, comes back,
          // overshoots the other way, and circles it forever. Nothing hits a
          // wall; it simply never arrives. That is what stalled the walk at
          // the laundry, where the route doubles back on itself.
          //
          // So a waypoint also counts as reached once the character is past
          // the far end of the leg leading to it.
          let passed = false;
          if (routeIndex > 0) {
            const prev = route[routeIndex - 1].position;
            const legX = target.position[0] - prev[0];
            const legZ = target.position[1] - prev[1];
            const legLength = Math.hypot(legX, legZ);
            if (legLength > 1e-4) {
              const travelled =
                ((position.x - prev[0]) * legX + (position.z - prev[1]) * legZ) /
                legLength;
              passed = travelled > legLength - ARRIVE_RADIUS * 0.5;
            }
          }

          if (distance < ARRIVE_RADIUS || passed) {
            if (showTargets.length) {
              // BEING SHOWN THE ROOM. The character turns to face each
              // advertised thing in turn and holds still on it while its
              // advert is on screen. This is the reason the tour exists, so
              // it takes precedence over every other way of spending a pause.
              showLeft -= step;
              aimAt(showTargets[showIndex].point, step);

              if (showLeft <= 0) {
                showIndex += 1;
                if (showIndex >= showTargets.length) {
                  clearShowcase();
                  dwellLeft = 0;
                } else {
                  showLeft = showTargets[showIndex].dwell;
                  onShow?.(showTargets[showIndex], showIndex, showTargets.length);
                }
              }
            } else if (dwellLeft > 0) {
              dwellLeft -= step;
              // NOTHING ADVERTISED HERE. A hallway, or a room whose products
              // have all been withdrawn. Sweeping the heading through a slow
              // full cycle -- right, back, left, back -- still takes the room
              // in, and leaves the character facing where it came in so the
              // next leg starts pointed sensibly.
              const t = 1 - dwellLeft / Math.max(dwellTotal, 0.001);
              heading = surveyFrom + Math.sin(t * Math.PI * 2) * SURVEY_ARC;
            } else if (target.dwell && !target.done) {
              // Reached a stop: tell whoever is listening, so the room lists
              // can follow the visitor through the house, then work out what
              // there is to show here.
              target.done = true;
              onArrive?.(target, routeIndex);

              const showing = target.room && showcase
                ? showcase.forRoom(target.room, position)
                : [];

              if (showing.length) {
                showTargets = showing;
                showIndex = 0;
                showLeft = showing[0].dwell;
                onShow?.(showing[0], 0, showing.length);
              } else {
                dwellLeft = target.dwell;
                dwellTotal = target.dwell;
                surveyFrom = heading;
              }
            } else {
              advance();
            }
          } else {
            // STALL GUARD. Something placed since the route was solved can
            // block the way through rather than merely stand on a waypoint,
            // and `settleRoute` cannot move a waypoint past a wardrobe across
            // a doorway. Giving up on the waypoint and trying the next one
            // walks around the obstruction often enough to be worth it, and
            // when it does not, the tour at least keeps moving. See
            // STALL_SECONDS.
            if (distance < closestSoFar - STALL_PROGRESS) {
              closestSoFar = distance;
              stallFor = 0;
            } else {
              stallFor += step;
              if (stallFor >= STALL_SECONDS) {
                skipped += 1;
                if (skipped <= 3 || skipped % 25 === 0) {
                  console.warn(
                    `[tour] cannot reach waypoint ${routeIndex}` +
                    `${target.label ? ` (${target.label})` : ''} -- something is ` +
                    `in the way that was not there when the route was solved. ` +
                    `Skipping it.`
                  );
                }
                advance();
                return;
              }
            }

            const wanted = Math.atan2(dx, -dz);
            const diff = angleTo(heading, wanted);
            const maxTurn = GUIDED_TURN_SPEED * step;

            if (Math.abs(diff) > 0.02) {
              heading += Math.abs(diff) < maxTurn ? diff : Math.sign(diff) * maxTurn;
            }
            // TURN FIRST, THEN WALK. The tolerance here is the whole
            // difference between following the route and grinding along a
            // wall: at anything loose the character walks while still
            // turning, which is an ARC, and the route is a series of straight
            // lines. The arc cuts every corner -- and the corners are door
            // reveals, so it cuts into the jamb and sticks there.
            //
            // Simulated over the solved route, 0.6 rad reached 2 waypoints of
            // 46 before jamming. 0.12 walks the whole house.
            drive = Math.abs(diff) < 0.12 ? 1 : 0;
            turn = 0;
          }
        }
      }

      if (turn) heading += turn * TURN_SPEED * step;

      if (drive) {
        forward.set(Math.sin(heading), 0, -Math.cos(heading));
        const speed = route ? GUIDED_WALK_SPEED : WALK_SPEED;
        const distance = drive * speed * step;
        desired.copy(forward).multiplyScalar(Math.sign(distance));

        const nextX = position.x + forward.x * distance;
        const nextZ = position.z + forward.z * distance;

        if (!blocked(position, desired)) {
          // The building resolves itself: `moveTo` asks the volume where the
          // character may actually stand, which is why walking into a wall at
          // an angle slides along it with no special case for sliding.
          if (!moveTo(nextX, nextZ)) {
            // Refused for HEIGHT, not for a wall -- the pool edge, the slab
            // step. Try each axis alone so a glancing approach still moves.
            if (!moveTo(nextX, position.z)) moveTo(position.x, nextZ);
          }
        } else {
          // A fence or a hedge. The ray can only refuse, so sliding has to be
          // asked for one axis at a time.
          const tryX = desired.clone().setZ(0);
          const tryZ = desired.clone().setX(0);

          if (tryX.lengthSq() > 1e-6 && !blocked(position, tryX.normalize())) {
            moveTo(nextX, position.z);
          } else if (tryZ.lengthSq() > 1e-6 && !blocked(position, tryZ.normalize())) {
            moveTo(position.x, nextZ);
          }
        }
      }

      // RECOVERY. Everything above resolves where the character is GOING; this
      // resolves where it IS. It matters because the world can move while the
      // character stands still -- an admin drags a sofa onto them, a placement
      // loads late -- and because a walk that can only ever test its next step
      // has no way back out of a wall it somehow ended up inside. A position
      // test does.
      if (walkVolume) {
        const freed = walkVolume.resolve(position.x, position.z);
        if (freed.hit && standable(freed.x, freed.z)) {
          position.x = freed.x;
          position.z = freed.z;
        }
      }

      const y = groundAt(position.x, position.z);
      if (y !== null) lastGroundY = y;   // else keep the last known height
      position.y = lastGroundY;

      // THE HOUSE NEVER MOVES. Only these two rotate -- the character turns
      // on the spot and the camera swings to stay behind it. Nothing here
      // touches the scene or the house group.
      character.position.copy(position);
      character.rotation.y = heading;

      // Chase camera: behind the character's heading, looking past them.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      head.set(position.x, position.y + view.lookHeight, position.z);
      camTarget.set(
        position.x - forward.x * view.back,
        position.y + view.up,
        position.z - forward.z * view.back
      );

      // Keep the camera out of the building: cast from the character's head
      // to where the camera wants to be and, if a wall is in the way, pull
      // the camera in front of it. Without this the view ends up outside the
      // room whenever you back up to a wall.
      if (cameraObstacles.length) {
        camDir.copy(camTarget).sub(head);
        const reach = camDir.length();
        if (reach > 1e-4) {
          camDir.divideScalar(reach);
          camRay.set(head, camDir);
          camRay.far = reach;
          const hits = camRay.intersectObjects(cameraObstacles, true);
          if (hits.length) {
            const pulled = Math.max(CAMERA_MIN, hits[0].distance - 0.25);
            camTarget.copy(head).addScaledVector(camDir, pulled);
          }
        }
      }

      camera.position.lerp(camTarget, CAMERA_LERP);

      // WHERE THE CAMERA IS POINTED.
      //
      // Walking, it is AHEAD of the character and not AT them -- the
      // difference between a walk-through of a house and a video of someone's
      // back. Standing in a room being shown something, it is pointed at that
      // thing instead, which is what lets the view tilt down to a floor tile
      // or up to a ceiling light rather than being pinned at eye level.
      const showing = showTargets.length > 0;
      if (!showing) {
        aimTarget.set(
          position.x + forward.x * view.lookAhead,
          position.y + view.lookHeight,
          position.z + forward.z * view.lookAhead
        );
      }
      aim.lerp(aimTarget, showing ? AIM_LERP_SHOW : AIM_LERP_WALK);
      camera.lookAt(aim);
    },
  };
}
