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

/** How far ahead to check for obstacles. Roughly shoulder width. */
const COLLIDE_DISTANCE = 0.42;

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

/** Third-person camera rig. */
const CAMERA_BACK = 4.2;
const CAMERA_UP = 2.4;
const CAMERA_LOOK_AT = 1.3;

/** Closest the camera may sit to the character when pushed in by a wall. */
const CAMERA_MIN = 0.9;

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
    if (!obstacles.length) return false;
    for (let i = 0; i < PROBE_HEIGHTS.length; i += 1) {
      probe.set(origin.x, lastGroundY + PROBE_HEIGHTS[i], origin.z);
      wallRay.set(probe, direction);
      if (wallRay.intersectObjects(obstacles, true).length > 0) return true;
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

      character.visible = true;
      character.position.copy(position);
      character.rotation.y = heading;

      // Snap the camera in rather than sweeping it across the whole site.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      camera.position.set(
        position.x - forward.x * CAMERA_BACK,
        position.y + CAMERA_UP,
        position.z - forward.z * CAMERA_BACK
      );
      camera.lookAt(position.x, position.y + CAMERA_LOOK_AT, position.z);
    },

    /** Leave walk mode and hand the camera back to OrbitControls. */
    exit() {
      if (!active) return;
      active = false;
      keys.clear();
      character.visible = false;
      if (controls) {
        controls.enabled = true;
        controls.target.set(position.x, position.y + 1, position.z);
      }
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
      const turn = held.t + input.turn;
      const drive = held.f + input.forward;

      if (turn) heading += turn * TURN_SPEED * step;

      if (drive) {
        forward.set(Math.sin(heading), 0, -Math.cos(heading));
        const distance = drive * WALK_SPEED * step;
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

      // Chase camera: directly behind the character's heading.
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      head.set(position.x, position.y + CAMERA_LOOK_AT, position.z);
      camTarget.set(
        position.x - forward.x * CAMERA_BACK,
        position.y + CAMERA_UP,
        position.z - forward.z * CAMERA_BACK
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
      lookTarget.copy(head);
      camera.lookAt(lookTarget);
    },
  };
}
