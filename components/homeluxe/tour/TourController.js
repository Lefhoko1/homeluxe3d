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
 *  2. WALLS. A short ray fired along the direction of travel stops the
 *     character before it reaches a wall. Because walls were built as piers,
 *     sills and lintels rather than solid panels with holes cut in them,
 *     doorways are REAL GAPS in the geometry -- so walking through a doorway
 *     needs no door logic at all. The ray simply finds nothing.
 *
 *  3. FALLING. If a downward ray finds nothing (off the edge of the site),
 *     the character keeps its previous height instead of dropping forever.
 *
 * Door leaves are deliberately NOT collided with: every door is treated as
 * open. A tour that requires you to work out which doors open is a worse tour.
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
 * How far ahead to check for obstacles.
 *
 * MUST NOT EXCEED THE ROUTE'S CLEARANCE. The solved route keeps 300mm from
 * every wall; a ray reaching 420mm finds a wall the route considers clear, so
 * the character stops short of waypoints in tight rooms, slides, and
 * eventually sticks -- which is why the guided tour appeared to skip rooms.
 * While following a route this drops to the clearance the route was solved
 * with; steering yourself it stays at the wider, safer value.
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
const ARRIVE_RADIUS = 0.22;

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
    fov: 68,            // wide: a narrow lens makes a small room a corridor
    showCharacter: true,
  },
  first: {
    back: -0.05,        // a hair in front of the eyes, so no nose geometry
    up: 1.45,
    lookAhead: 4.0,
    lookHeight: 1.45,
    fov: 74,
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
    // Everything solid: walls, fences, hedges, tree trunks, furniture.
    obstacles = [],
    /**
     * The subset that can MOVE after the route was solved -- in practice the
     * furniture, which an admin can drag anywhere at runtime.
     *
     * While following a solved route the walk collides with these and nothing
     * else. See `blocked`.
     */
    movableObstacles = [],
    // What the CAMERA may not pass through. Structure only -- if the camera
    // dodged every sofa it would jitter constantly in a furnished room.
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
  let dwellLeft = 0;
  let dwellTotal = 0;
  let surveyFrom = 0;
  let onArrive = null;

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
  const lookTarget = new THREE.Vector3();
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
    // WHILE FOLLOWING A SOLVED ROUTE, THE WALLS ARE NOT TESTED.
    //
    // Not laziness -- the opposite. The route is solved against the plan's
    // own walls and openings and then verified, leg by leg, against the true
    // geometry at build time. It is known to be walkable. Testing it again at
    // run time with a different collision model is not a second opinion, it
    // is a disagreement, and the two models cannot be made to agree: one is a
    // ray from a point, the other a padded 2D grid, and every attempt to
    // reconcile them by tuning the reach moved the place where the tour stuck
    // rather than removing it.
    //
    // What the route CANNOT know about is furniture moved since it was
    // solved, because an admin can drag a sofa anywhere at run time. So that
    // is exactly what stays tested.
    const against = route ? movableObstacles : obstacles;
    if (!against.length) return false;

    for (let i = 0; i < PROBE_HEIGHTS.length; i += 1) {
      probe.set(origin.x, lastGroundY + PROBE_HEIGHTS[i], origin.z);
      wallRay.set(probe, direction);
      if (wallRay.intersectObjects(against, true).length > 0) return true;
    }
    return false;
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

  return {
    get active() {
      return active;
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
      camera.lookAt(
        position.x + forward.x * view.lookAhead,
        position.y + view.lookHeight,
        position.z + forward.z * view.lookAhead
      );
    },

    /** Leave walk mode and hand the camera back to OrbitControls. */
    exit() {
      if (!active) return;
      active = false;
      keys.clear();
      route = null;
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
     */
    followRoute(waypoints, arrived = null, { clearance = null } = {}) {
      if (!waypoints?.length) return;
      if (!active) this.enter();

      route = waypoints.map((point) => ({ ...point, done: false }));
      dwellLeft = 0;
      onArrive = arrived;

      // Match the collision reach to the clearance the route was solved with,
      // or the character stops short of its own waypoints. See
      // COLLIDE_DISTANCE.
      //
      // STRICTLY INSIDE the clearance, not equal to it. A ray of exactly the
      // clearance fired straight at a wall the route runs alongside reports a
      // hit -- the route's guarantee is that nothing is CLOSER than the
      // clearance, which a ray of that exact length still touches. The margin
      // is what makes the guarantee usable.
      wallRay.far = clearance
        ? Math.min(COLLIDE_DISTANCE, clearance * 0.8)
        : COLLIDE_DISTANCE;

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
      wallRay.far = COLLIDE_DISTANCE;   // back to the safer manual reach
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
      if (!active) return;

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
            if (dwellLeft > 0) {
              dwellLeft -= step;
              // LOOK AROUND. Standing still facing one way shows a visitor
              // one wall of the room they were brought to see. Sweeping the
              // heading through a slow full cycle -- right, back, left, back
              // -- takes in the whole room in the time the tour was pausing
              // anyway, and leaves the character facing where it came in so
              // the next leg starts pointed sensibly.
              const t = 1 - dwellLeft / Math.max(dwellTotal, 0.001);
              heading = surveyFrom + Math.sin(t * Math.PI * 2) * SURVEY_ARC;
            } else if (target.dwell && dwellLeft === 0 && !target.done) {
              // Reached a stop: pause, and tell whoever is listening so the
              // room lists can follow the visitor through the house.
              target.done = true;
              dwellLeft = target.dwell;
              dwellTotal = target.dwell;
              surveyFrom = heading;
              onArrive?.(target, routeIndex);
            } else {
              routeIndex += 1;
              dwellLeft = 0;
              if (routeIndex >= route.length) {
                // Loop: the route ends where it began.
                routeIndex = 0;
                route.forEach((point) => { point.done = false; });
              }
            }
          } else {
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

        if (!blocked(position, desired) && standable(nextX, nextZ)) {
          position.x = nextX;
          position.z = nextZ;
        } else {
          // Slide along the obstacle rather than sticking to it: try each
          // axis alone, so walking into a wall at an angle still moves you.
          // Each candidate is checked for a standable landing too, or you
          // could slide sideways off a ledge.
          const tryX = desired.clone().setZ(0);
          const tryZ = desired.clone().setX(0);

          if (
            tryX.lengthSq() > 1e-6 &&
            !blocked(position, tryX.normalize()) &&
            standable(nextX, position.z)
          ) {
            position.x = nextX;
          } else if (
            tryZ.lengthSq() > 1e-6 &&
            !blocked(position, tryZ.normalize()) &&
            standable(position.x, nextZ)
          ) {
            position.z = nextZ;
          }
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

      // LOOK AHEAD, NOT AT THE CHARACTER. This is the difference between a
      // walk-through of a house and a video of someone's back.
      lookTarget.set(
        position.x + forward.x * view.lookAhead,
        position.y + view.lookHeight,
        position.z + forward.z * view.lookAhead
      );
      camera.lookAt(lookTarget);
    },
  };
}
